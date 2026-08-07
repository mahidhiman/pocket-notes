import {Hono} from 'hono';
import {logger} from 'hono/logger';
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

//Signup - /api/signup
app.post('/api/signup', async (c) => {
    const body = await c.req.parseBody();
    const email = body.email as String;

    //TODO: Saving this string in chapter 10 of the book.
    console.log('Signup attempt for email: ', email);

    return c.json({ok: true, message: `Welcome, ${email}`}, 200);
});

//Astro's page rendring - must come last as the fallback. 
app.use(trailingSlash());
app.use(redirects());
app.use(sessions());
app.use(i18n());
app.use(cache());
app.use(pages());

export default app;