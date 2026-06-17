import { pgTable, text, uuid, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversationsTable = pgTable("conversations", {
  conversationId: uuid("conversation_id").primaryKey().defaultRandom(),
  telegramId: text("telegram_id").notNull(),
  characterId: uuid("character_id").notNull(),
  affectionPoints: integer("affection_points").notNull().default(0),
  affectionLevel: integer("affection_level").notNull().default(0),
  messageHistory: jsonb("message_history").notNull().default([]),
  messageCount: integer("message_count").notNull().default(0),
  dailyAutoImageCount: integer("daily_auto_image_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("unique_user_character").on(t.telegramId, t.characterId)]);

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ conversationId: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
