import {Hono} from 'hono';
import {drizzle} from 'drizzle-orm/d1';
import {and, desc, eq} from 'drizzle-orm';
import {env} from 'cloudflare:workers';
import {notes} from './db/schema';
import {logger} from 'hono/logger';
import {createAuth} from './auth';
import {
    trailingSlash, redirects, sessions, actions, middleware, pages, i18n, cache
} from 'astro/hono';


const app = new Hono<{
    Variables: {auth: ReturnType<typeof createAuth>}
}>();

app.use(logger());

//Build the auth object once per request, not once per route.
app.use('*', async (c, next) => {
    c.set('auth', createAuth());
    await next();
});

//Astro's Own request pipeline, mounted as Hono middleware.
app.use(actions());
app.use(middleware());

//Every /api/notes and /api/uploads route needs the same session check.
async function requireUser(c: any) {
    const session = await c.get('auth').api.getSession({
        headers: c.req.raw.headers
    });
    return session?.user?.id ?? null;
}

//Your own API rotues go here before astro's page handler.
app.get('/api/hello', c => c.json({message: "Hello from Hono!"}));

//New Database related routes
app.post('/api/notes', async c => {
    const userId = await requireUser(c);
    if(!userId){
        return c.json({error: 'Please log in first'}, 401);
    }

    const db = drizzle(env.DB);
    const body = await c.req.json();

    if(typeof body.text !== 'string' || body.text.trim() === ''){
        return c.json({error: 'A note needs some text'}, 400);
    }

    if(body.attachmentKey && !String(body.attachmentKey).startsWith(`${userId}/`)){
        return c.json({error: 'Not your file'}, 403);
    }

    const [note] = await db.insert(notes).values({
        id: crypto.randomUUID(),
        userId,
        body: body.text,
        attachmentKey: body.attachmentKey ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }).returning();

    return c.json(note, 201);
});

app.get('/api/notes', async c => {
    const userId = await requireUser(c);
    if(!userId){
        return c.json({error: 'Please log in first'}, 401);
    }

    const db = drizzle(env.DB);
    const myNotes = await db.select().from(notes)
        .where(eq(notes.userId, userId))
        .orderBy(desc(notes.createdAt)).all();
    return c.json(myNotes, 200);
});

app.get('/api/notes/:id', async c => {
    const userId = await requireUser(c);
    if(!userId){
        return c.json({error: 'Please log in first'}, 401);
    }

    const db = drizzle(env.DB);
    //Both halves of the where matter: the id finds the row, the userId
    //makes sure it's yours. Drop either one and this becomes a hole.
    const note = await db.select().from(notes)
        .where(and(eq(notes.id, c.req.param('id')), eq(notes.userId, userId))).get();

    if(!note){
        return c.json({error: 'Note not found'}, 404);
    }
    return c.json(note, 200);
});

app.patch('/api/notes/:id', async c => {
    const userId = await requireUser(c);
    if(!userId){
        return c.json({error: 'Please log in first'}, 401);
    }

    const body = await c.req.json();
    const changes: {body?: string, attachmentKey?: string | null, updatedAt: number} = {
        updatedAt: Date.now(),
    };

    if(typeof body.text === 'string'){
        if(body.text.trim() === ''){
            return c.json({error: 'A note needs some text'}, 400);
        }
        changes.body = body.text;
    }
    if('attachmentKey' in body){
        if(body.attachmentKey && !String(body.attachmentKey).startsWith(`${userId}/`)){
            return c.json({error: 'Not your file'}, 403);
        }
        changes.attachmentKey = body.attachmentKey ?? null;
    }

    const db = drizzle(env.DB);
    const [note] = await db.update(notes).set(changes)
        .where(and(eq(notes.id, c.req.param('id')), eq(notes.userId, userId)))
        .returning();

    if(!note){
        return c.json({error: 'Note not found'}, 404);
    }
    return c.json(note, 200);
});

app.delete('/api/notes/:id', async c => {
    const userId = await requireUser(c);
    if(!userId){
        return c.json({error: 'Please log in first'}, 401);
    }

    const db = drizzle(env.DB);
    const [note] = await db.delete(notes)
        .where(and(eq(notes.id, c.req.param('id')), eq(notes.userId, userId)))
        .returning();

    if(!note){
        return c.json({error: 'Note not found'}, 404);
    }

    //First real use of the R2 binding: the row is gone, so the file
    //behind it would be an orphan.
    if(note.attachmentKey){
        await env.UPLOADS.delete(note.attachmentKey);
    }

    return c.json({deleted: note.id}, 200);
});

app.get('/api/health', async c => {
    return c.json({ok: true, message: "Server is healthy!"}, 200);
});

//Uploads go through the Worker, using the UPLOADS binding. Same origin,
//so the browser never has to negotiate CORS with R2 directly.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

app.post('/api/uploads', async c => {
    const userId = await requireUser(c);
    if(!userId){
        return c.json({error: "Please log in first"}, 401);
    }

    const filename = c.req.query('filename');
    if(!filename){
        return c.json({error: "Missing filename"}, 400);
    }

    const size = Number(c.req.header('content-length') ?? 0);
    if(size > MAX_UPLOAD_BYTES){
        return c.json({error: "File is too big. 25MB is the limit."}, 413);
    }
    if(!c.req.raw.body){
        return c.json({error: "Empty upload"}, 400);
    }

    //The user id prefix is what makes ownership checkable on the way back.
    const key = `${userId}/${crypto.randomUUID()}-${filename}`;
    await env.UPLOADS.put(key, c.req.raw.body, {
        httpMetadata: {contentType: c.req.header('content-type') ?? 'application/octet-stream'},
    });

    // ponytail: two ways to orphan a file here. An upload whose note is
    // never saved, and a replaced attachment, since PATCH overwrites the
    // key without deleting the old object. A sweep over keys with no
    // matching row covers both, when storage cost shows up.
    return c.json({key}, 201);
});

//Reading an attachment back. A plain URL, so it works as a link.
app.get('/api/uploads/*', async c => {
    const userId = await requireUser(c);
    if(!userId){
        return c.json({error: "Please log in first"}, 401);
    }

    const key = decodeURIComponent(c.req.path.replace('/api/uploads/', ''));
    //Key format is public knowledge, so the prefix is the ownership check.
    if(!key.startsWith(`${userId}/`)){
        return c.json({error: "Not your file"}, 403);
    }

    const object = await env.UPLOADS.get(key);
    if(!object){
        return c.json({error: "File not found"}, 404);
    }

    return new Response(object.body, {
        headers: {
            'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
            'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
        },
    });
});

//Auth Routes
app.on(["GET", "POST"], "/api/auth/**", async (c) => {
    return c.get('auth').handler(c.req.raw);
});


//Astro's page rendring - must come last as the fallback.
app.use(trailingSlash());
app.use(redirects());
app.use(sessions());
app.use(i18n());
app.use(cache());
app.use(pages());

export default app;
