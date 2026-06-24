import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transaction_logs", {
  transactionId: uuid("transaction_id").primaryKey().defaultRandom(),
  telegramId: text("telegram_id").notNull(),
  actionType: text("action_type").notNull(),
  ticketAmount: integer("ticket_amount").notNull(),
  neonCardAmount: integer("neon_card_amount"),
  starAmount: integer("star_amount"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ transactionId: true, timestamp: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
