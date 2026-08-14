import {Hono} from 'hono';
import {drizzle} from 'drizzle-orm/d1';
import {env} from 'cloudflare:workers';
import {notes} from './db/schema';
import {logger} from 'hono/logger';
import {createAuth} from './auth';
import {
    trailingSlash, redirects, sessions, actions, middleware, pages, i18n, cache
} from 'astro/hono';


const app = new Hono();

app.use(logger());

//Astro's Own request pipeline, mounted as Hono middleware. 
app.use(actions());
app.use(middleware());

//Your own API rotues go here before astro's page handler. 
app.get('/api/hello', c => c.json({message: "Hello from Hono!"}));

//New Database related routes
app.post('/api/notes', async c => {
    const auth = createAuth();
    const session = await auth.api.getSession({
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
    const db = drizzle(env.DB);
    const allNotes = await db.select().from(notes).all();
    return c.json(allNotes, 200);
});

app.get('/api/health', async c => {
    return c.json({ok: true, message: "Server is healthy!"}, 200);
});

//Auth Routes
app.on(["GET", "POST"], "/api/auth/**", async (c) => {
    const auth = createAuth();
    return auth.handler(c.req.raw);
});


//Astro's page rendring - must come last as the fallback. 
app.use(trailingSlash());
app.use(redirects());
app.use(sessions());
app.use(i18n());
app.use(cache());
app.use(pages());

export default app;