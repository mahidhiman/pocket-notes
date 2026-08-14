import {Hono} from 'hono';
import {drizzle} from 'drizzle-orm/d1';
import {eq} from 'drizzle-orm';
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

//Your own API rotues go here before astro's page handler. 
app.get('/api/hello', c => c.json({message: "Hello from Hono!"}));

//New Database related routes
app.post('/api/notes', async c => {
    const session = await c.get('auth').api.getSession({
        headers: c.req.raw.headers
    })

    if(!session){
        return c.json({error: 'Please login again'}, 401);
    }

    const db = drizzle(env.DB);
    const body = await c.req.json();

    const [note] = await db.insert(notes).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        body: body.text,
        createdAt: Date.now(),
    }).returning();

    return c.json(note, 201);
});

app.get('/api/notes', async c => {
    const session = await c.get('auth').api.getSession({
        headers: c.req.raw.headers
    })

    if(!session){
        return c.json({error: 'Please login again'}, 401);
    }

    const db = drizzle(env.DB);
    const myNotes = await db.select().from(notes)
        .where(eq(notes.userId, session.user.id)).all();
    return c.json(myNotes, 200);
});

app.get('/api/health', async c => {
    return c.json({ok: true, message: "Server is healthy!"}, 200);
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