import {sqliteTable, integer, text} from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    body: text('body').notNull(),
    attachmentKey: text('attachment_key'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at'),
});

export const user = sqliteTable('user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('emailVerified', {mode: 'boolean'}).notNull(),
    image: text('image'),
    createdAt: integer('createdAt', {mode: "timestamp"}).notNull(),
    updatedAt: integer('updatedAt', {mode: "timestamp"}).notNull()
});

export const session = sqliteTable('session', {
    id: text('id').primaryKey(),
    expiresAt: integer('expiresAt', {mode: 'timestamp'}).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('createdAt', {mode: "timestamp"}).notNull(),
    updatedAt: integer('updatedAt', {mode: 'timestamp'}).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId').notNull().references(() => user.id)
})

export const account = sqliteTable('account', {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull().references(() => user.id),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: integer('accessTokenExpires', {mode: 'timestamp'}),
    refreshTokenExpiresAt: integer('refreshTokenExpires', {mode: 'timestamp'}),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('createdAt', {mode: 'timestamp'}).notNull(),
    updatedAt: integer('updatedAt', {mode: 'timestamp'}).notNull(),
});

export const verification = sqliteTable('verification', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expiresAt', {mode: 'timestamp'}).notNull(),
    createdAt: integer('createdAt', {mode: 'timestamp'}).notNull(),
    updatedAt: integer('updatedAt', {mode: 'timestamp'}).notNull(),
});
