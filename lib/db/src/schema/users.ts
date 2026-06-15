import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username"),
  customNickname: text("custom_nickname"),
  userTraits: text("user_traits"),
  activeCharacterId: text("active_character_id"),
  ticketBalance: integer("ticket_balance").notNull().default(50),
  subscriptionTier: text("subscription_tier").notNull().default("Free"),
  lastLoginTimestamp: timestamp("last_login_timestamp", { withTimezone: true }).defaultNow(),
  weeklyCreationsCount: integer("weekly_creations_count").notNull().default(0),
  dailyTriggerRequestsCount: integer("daily_trigger_requests_count").notNull().default(0),
  unlockedMediaArray: text("unlocked_media_array").array().notNull().default([]),
  nsfwEnabled: boolean("nsfw_enabled").notNull().default(false),
  avatarUrl: text("avatar_url"),
  referralCode: text("referral_code"),
  referredBy: text("referred_by"),
  dailyMessageCount: integer("daily_message_count").notNull().default(0),
  lastDailyClaim: timestamp("last_daily_claim", { withTimezone: true }),
  staffPrivileges: text("staff_privileges"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
