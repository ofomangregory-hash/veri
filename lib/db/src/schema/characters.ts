import { pgTable, text, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const charactersTable = pgTable("characters", {
  characterId: uuid("character_id").primaryKey().defaultRandom(),
  creatorId: text("creator_id"),
  name: text("name").notNull(),
  visibility: text("visibility").notNull().default("private"),
  systemPrompt: text("system_prompt"),
  avatarUrl: text("avatar_url"),
  teaserDescription: text("teaser_description"),
  initialGreeting: text("initial_greeting"),
  tags: text("tags").array().notNull().default([]),
  genre: text("genre").notNull().default("Modern"),
  age: text("age"),
  triggerMetadataArray: jsonb("trigger_metadata_array"),
});

export const insertCharacterSchema = createInsertSchema(charactersTable).omit({ characterId: true });
export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type Character = typeof charactersTable.$inferSelect;
