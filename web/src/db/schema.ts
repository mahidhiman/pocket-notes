import {sqliteTable, integer, text} from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
});