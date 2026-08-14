import {betterAuth} from 'better-auth';
import { drizzleAdapter} from 'better-auth/adapters/drizzle';
import {drizzle} from 'drizzle-orm/d1';
import {env} from 'cloudflare:workers';
import {user, session, account, verification} from './db/schema';


export function createAuth() {
    const db = drizzle(env.DB);
    return betterAuth({
        database: drizzleAdapter(db, {provider: 'sqlite', schema: {user, session, account, verification}}),
        emailAndPassword: {
            enabled: true,
        }
    })
}

