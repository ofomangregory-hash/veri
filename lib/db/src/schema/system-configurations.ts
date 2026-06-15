import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const systemConfigurationsTable = pgTable("system_configurations", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SystemConfiguration = typeof systemConfigurationsTable.$inferSelect;
