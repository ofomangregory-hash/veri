import TelegramBot from "node-telegram-bot-api";
import { db, usersTable, charactersTable, systemConfigurationsTable, transactionsTable } from "@workspace/db";
import { eq, sql, count, like, ilike } from "drizzle-orm";
import { logger } from "./logger";
import { generateAIReply } from "./openrouter";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Trait { type: string; name: string; description: string }
interface MediaTrigger { keyword: string; url: string; mediaType: "photo" | "video" }

// ── In-memory admin sessions (password-unlocked non-owner admins) ──────────────
const adminSessions = new Set<number>();
const ADMIN_PASSWORD = "ofomangregory";

// ── Pending multi-step states ─────────────────────────────────────────────────
const pendingPhotoFor = new Map<number, string>(); // chatId → characterId (for /setcharphoto)
const pendingBotPhoto = new Set<number>();          // chatIds waiting to set bot photo

interface CreationState { step: "name" | "bio" | "genre"; name?: string; bio?: string }
const pendingCreation = new Map<number, CreationState>(); // chatId → creation wizard state

let bot: TelegramBot | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────
function isAdmin(msg: TelegramBot.Message): boolean {
  const id = msg.from?.id;
  if (!id) return false;
  return String(id) === process.env.ADMIN_TELEGRAM_ID || adminSessions.has(id);
}

async function syncUser(userId: string, username?: string): Promise<void> {
  const referralCode = Math.random().toString(36).slice(2, 8);
  await db.insert(usersTable).values({
    id: userId, username: username ?? null, avatarUrl: null,
    referralCode, referredBy: null, ticketBalance: 50, subscriptionTier: "Free",
  }).onConflictDoUpdate({
    target: usersTable.id,
    set: { lastLoginTimestamp: new Date(), username: sql`COALESCE(EXCLUDED.username, users.username)` },
  });
}

async function upsertConfig(key: string, value: Record<string, unknown>): Promise<void> {
  await db.insert(systemConfigurationsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: systemConfigurationsTable.key, set: { value, updatedAt: new Date() } });
}

async function getConfig(key: string): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(systemConfigurationsTable).where(eq(systemConfigurationsTable.key, key));
  return row ? (row.value as Record<string, unknown>) : null;
}

async function findCharByName(name: string) {
  const [char] = await db.select().from(charactersTable)
    .where(ilike(charactersTable.name, name.trim()));
  return char ?? null;
}

function appUrl(path = "") {
  return `https://${process.env.REPLIT_DEV_DOMAIN ?? "z-fantasy.replit.app"}${path}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Bot startup ────────────────────────────────────────────────────────────────
export function startTelegramBot(): TelegramBot | null {
  if (process.env.DISABLE_TELEGRAM_BOT === "true") {
    logger.info("Telegram bot disabled via DISABLE_TELEGRAM_BOT — skipping polling");
    return null;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled"); return null; }

  try {
    bot = new TelegramBot(token, { polling: true });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  COMMAND VISIBILITY — setMyCommands
    //  Public users see only 4 commands; admin commands are fully hidden from
    //  Telegram's slash (/) popup for regular users.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const publicCommands = [
      { command: "start",     description: "Welcome message + Open App button" },
      { command: "profile",   description: "Your stats — balance, tier, active companion" },
      { command: "daily",     description: "Claim your daily +10 tickets" },
      { command: "create",    description: "Create a new companion (costs 25 tickets)" },
      { command: "inventory", description: "Your created companions" },
      { command: "referral",  description: "Get your referral link" },
      { command: "premium",   description: "Subscribe with Telegram Stars — pick a plan" },
      { command: "upgrade",   description: "View premium plan overview" },
      { command: "browse",    description: "Browse all public companions" },
      { command: "character", description: "View a companion profile: /character [name]" },
      { command: "select",    description: "Switch active companion: /select [name]" },
      { command: "commands",  description: "Show available commands" },
    ];

    const adminCommands = [
      ...publicCommands,
      { command: "stats",              description: "Dashboard — users, premium, characters" },
      { command: "listusers",          description: "View all registered users" },
      { command: "searchuser",         description: "Search user by username: /searchuser [query]" },
      { command: "whois",              description: "Full profile card: /whois [userID]" },
      { command: "givetickets",        description: "Give/deduct tickets: /givetickets [userID] [amount]" },
      { command: "addpremium",         description: "Grant premium: /addpremium [userID] [days/lifetime]" },
      { command: "removepremium",      description: "Remove premium: /removepremium [userID]" },
      { command: "resetuser",          description: "Reset to Free + zero balance: /resetuser [userID]" },
      { command: "setstaff",           description: "Set staff role: /setstaff [userID] | limited_admin|full_admin|remove" },
      { command: "setusername",        description: "Set display name: /setusername [userID] | [name]" },
      { command: "broadcast",          description: "Send to all users: /broadcast [message]" },
      { command: "listall",            description: "All characters with visibility" },
      { command: "configall",          description: "Inline character config menu" },
      { command: "configurecharacter", description: "Full config dashboard: /configurecharacter [name]" },
      { command: "createcharacter",    description: "Create: /createcharacter [name] | true/false | [backstory]" },
      { command: "setvisibility",      description: "Toggle visibility: /setvisibility [name] | public/private" },
      { command: "deletecharacter",    description: "Delete: /deletecharacter [name]" },
      { command: "renamechar",         description: "Rename display: /renamechar [old] | [new]" },
      { command: "renamecharacter",    description: "Rename + update prompt: /renamecharacter [old] | [new]" },
      { command: "setprompt",          description: "Set system prompt: /setprompt [name] [prompt]" },
      { command: "settagline",         description: "Set tagline: /settagline [name] | [tagline]" },
      { command: "setgreeting",        description: "Set greeting: /setgreeting [name] | [message]" },
      { command: "bulkgreeting",       description: "Bulk greeting: /bulkgreeting [n1,n2] | [msg]" },
      { command: "setcharphoto",       description: "Set character avatar: /setcharphoto [name]" },
      { command: "addcustomtrait",     description: "Add trait: /addcustomtrait mood|tone | [CharName] | [desc]" },
      { command: "viewtraits",         description: "View traits: /viewtraits [name]" },
      { command: "resettraits",        description: "Clear all traits: /resettraits [name]" },
      { command: "addphoto",           description: "Link photo: /addphoto [CharName] [keyword]" },
      { command: "addvideo",           description: "Link video: /addvideo [CharName] [keyword]" },
      { command: "setwelcome",         description: "Set /start message: /setwelcome [text]" },
      { command: "setdesc",            description: "Set bot description: /setdesc [text]" },
      { command: "setbotphoto",        description: "Set bot profile picture" },
      { command: "addcommand",         description: "Custom command: /addcommand [trigger] | [response]" },
    ];

    // Set public commands for all users (default scope)
    bot.setMyCommands(publicCommands).catch(err =>
      logger.warn({ err }, "setMyCommands (public) failed")
    );

    // Set full admin commands visible only to the master admin chat
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (adminId) {
      bot.setMyCommands(adminCommands, {
        scope: { type: "chat", chat_id: Number(adminId) },
      }).catch(err => logger.warn({ err }, "setMyCommands (admin chat) failed"));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  /start
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/start(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      const startParam = match?.[1]?.trim();
      await syncUser(userId, msg.from?.username);

      let referralBonus = "";
      if (startParam?.startsWith("ref_")) {
        const code = startParam.replace("ref_", "");
        const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, code));
        if (referrer && referrer.id !== userId) {
          await db.update(usersTable).set({ ticketBalance: sql`ticket_balance + 15` })
            .where(eq(usersTable.referralCode, code));
          referralBonus = "\n🎟️ +15 bonus tickets for using a referral!";
        }
      }

      const welcomeRow = await getConfig("welcome_message");
      const welcomeText = (welcomeRow?.text as string) ??
        `⚡ Welcome to Z-Fantasy!\n\nYour portal to AI companions is ready.${referralBonus}\n\nOpen the app to start chatting 💜`;

      await bot!.sendMessage(chatId, welcomeText, {
        reply_markup: { inline_keyboard: [[{ text: "🚀 Open Z-Fantasy", web_app: { url: appUrl() } }]] },
      });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /character [name] — view a character card with photo
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/character(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const name = match?.[1]?.trim();

      await syncUser(String(msg.from?.id), msg.from?.username);

      if (!name) {
        const userId = String(msg.from?.id);
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        const isAdminUser = userId === adminId || adminSessions.has(msg.from?.id ?? 0);

        const allChars = await db.select({
          characterId: charactersTable.characterId,
          name: charactersTable.name,
          visibility: charactersTable.visibility,
        }).from(charactersTable).orderBy(charactersTable.name);

        const visible = allChars.filter(c => c.visibility === "public" || isAdminUser);

        if (!visible.length) {
          await bot!.sendMessage(chatId, "No companions available yet. Check back soon! 💜");
          return;
        }

        const buttons = chunk(
          visible.map(c => ({
            text: c.visibility === "private" ? `🔒 ${c.name}` : `💜 ${c.name}`,
            callback_data: `show_char_${c.characterId}`,
          })),
          2
        );

        await bot!.sendMessage(chatId,
          `🎭 *Choose a companion to view their profile:*\n\nTap any name below — I'll show you their card with photo and details.`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } }
        );
        return;
      }

      const char = await findCharByName(name);
      if (!char) {
        await bot!.sendMessage(chatId,
          `❌ No companion named *${name}* found.\n\nUse /browse to see all available companions.`,
          { parse_mode: "Markdown" });
        return;
      }

      if (char.visibility === "private") {
        const userId = String(msg.from?.id);
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        const isAdminUser = userId === adminId || adminSessions.has(msg.from?.id ?? 0);
        if (!isAdminUser) {
          await bot!.sendMessage(chatId,
            `🔒 *${char.name}* is a premium companion.\n\nUpgrade your subscription to unlock access.`,
            { parse_mode: "Markdown" });
          return;
        }
      }

      const traitsRow = await getConfig(`traits_${char.name}`);
      const traits: Trait[] = (traitsRow?.traits as Trait[]) ?? [];
      const traitLine = traits.length
        ? `\n✨ *Traits:* ${traits.map(t => t.description).join(" · ")}`
        : "";

      const caption = [
        `💜 *${char.name}*`,
        char.teaserDescription ? `_${char.teaserDescription}_` : "",
        ``,
        char.genre ? `🎭 Genre: ${char.genre}` : "",
        traitLine,
        ``,
        char.initialGreeting ? `💬 _"${char.initialGreeting.slice(0, 120)}${char.initialGreeting.length > 120 ? "…" : ""}"_` : "",
      ].filter(Boolean).join("\n");

      const markup: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [[
          { text: "💬 Chat Now", callback_data: `chat_${char.characterId}` },
          { text: "🌐 Open App", web_app: { url: appUrl(`/chat/${char.characterId}`) } },
        ]],
      };

      try {
        if (char.avatarUrl) {
          await bot!.sendPhoto(chatId, char.avatarUrl, {
            caption,
            parse_mode: "Markdown",
            reply_markup: markup,
          });
        } else {
          await bot!.sendMessage(chatId, caption, {
            parse_mode: "Markdown",
            reply_markup: markup,
          });
        }
      } catch {
        await bot!.sendMessage(chatId, caption, {
          parse_mode: "Markdown",
          reply_markup: markup,
        });
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /browse — paginated character carousel
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/browse/, async (msg) => {
      const chatId = msg.chat.id;
      await syncUser(String(msg.from?.id), msg.from?.username);

      const characters = await db.select().from(charactersTable)
        .where(eq(charactersTable.visibility, "public")).limit(10);

      if (!characters.length) {
        await bot!.sendMessage(chatId, "No public companions available yet 💜");
        return;
      }
      for (const char of characters) {
        const caption = `*${char.name}*\n_${char.teaserDescription ?? char.genre}_\n\n${(char.systemPrompt ?? "").slice(0, 100)}…`;
        const markup: TelegramBot.InlineKeyboardMarkup = {
          inline_keyboard: [[
            { text: "💬 Start Chat", callback_data: `chat_${char.characterId}` },
            { text: "🌐 Launch App", web_app: { url: appUrl(`/chat/${char.characterId}`) } },
          ]],
        };
        try {
          if (char.avatarUrl) {
            await bot!.sendPhoto(chatId, char.avatarUrl, { caption, parse_mode: "Markdown", reply_markup: markup });
          } else {
            await bot!.sendMessage(chatId, caption, { parse_mode: "Markdown", reply_markup: markup });
          }
        } catch { /* skip broken image */ }
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /select [name] — switch active character
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/select (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const name = match?.[1]?.trim();
      if (!name) return;
      const char = await findCharByName(name);
      if (!char) {
        await bot!.sendMessage(chatId, `❌ No character found named *${name}*.`, { parse_mode: "Markdown" });
        return;
      }
      await db.update(usersTable).set({ activeCharacterId: char.characterId })
        .where(eq(usersTable.id, String(msg.from!.id)));

      const greeting = char.initialGreeting ?? `Hey 💜 I'm ${char.name}. ${char.teaserDescription ?? ""}`;
      await bot!.sendMessage(chatId, greeting);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /profile — user's own stats card
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/profile$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      await syncUser(userId, msg.from?.username);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!user) { await bot!.sendMessage(chatId, "❌ Profile not found. Try /start first."); return; }

      let activeCharName = "None";
      if (user.activeCharacterId) {
        const [char] = await db.select({ name: charactersTable.name })
          .from(charactersTable).where(eq(charactersTable.characterId, user.activeCharacterId));
        if (char) activeCharName = char.name;
      }

      const tierEmoji: Record<string, string> = { Free: "🆓", Bronze: "🥉", Silver: "🥈", Gold: "🥇" };
      const nextClaim = user.lastDailyClaim
        ? new Date(user.lastDailyClaim.getTime() + 24 * 60 * 60 * 1000)
        : null;
      const canClaim = !nextClaim || nextClaim <= new Date();
      const claimLine = canClaim ? "✅ Daily tickets available — /daily" : `⏳ Next claim: ${nextClaim!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

      await bot!.sendMessage(chatId, [
        `👤 *Your Profile*`, ``,
        `🏷 Name: @${user.username ?? "—"}${user.customNickname ? ` _(${user.customNickname})_` : ""}`,
        `${tierEmoji[user.subscriptionTier] ?? "💎"} Tier: *${user.subscriptionTier}*`,
        `🎟 Tickets: *${user.ticketBalance}*`,
        `🤖 Active Companion: *${activeCharName}*`,
        ``,
        `📊 *Activity*`,
        `🎭 Characters Created: *${user.weeklyCreationsCount}* this week`,
        `${claimLine}`,
        `🔗 Referral Code: \`${user.referralCode ?? "—"}\``,
        ``,
        user.subscriptionTier === "Free"
          ? `⚡ Upgrade for more tickets & companions — /upgrade`
          : ``,
      ].filter(s => s !== "").join("\n"), { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /daily — claim daily +10 tickets
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/daily$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      await syncUser(userId, msg.from?.username);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!user) { await bot!.sendMessage(chatId, "❌ Try /start first."); return; }

      const now = new Date();
      if (user.lastDailyClaim) {
        const hours = (now.getTime() - user.lastDailyClaim.getTime()) / (1000 * 60 * 60);
        if (hours < 24) {
          const next = new Date(user.lastDailyClaim.getTime() + 24 * 60 * 60 * 1000);
          const hrs = Math.floor((next.getTime() - now.getTime()) / (1000 * 60 * 60));
          const mins = Math.floor(((next.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60));
          await bot!.sendMessage(chatId, `⏳ Already claimed today!\n\nCome back in *${hrs}h ${mins}m* for your next +10 tickets.`, { parse_mode: "Markdown" });
          return;
        }
      }

      await db.update(usersTable).set({
        ticketBalance: sql`ticket_balance + 10`,
        lastDailyClaim: now,
      }).where(eq(usersTable.id, userId));

      await db.insert(transactionsTable).values({
        telegramId: userId,
        actionType: "daily_claim",
        ticketAmount: 10,
      });

      await bot!.sendMessage(chatId,
        `🎟 *+10 Tickets!*\n\nYour daily reward has been added.\nNew balance: *${(user.ticketBalance ?? 0) + 10}* tickets\n\nCome back tomorrow for more!`,
        { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /referral — get referral link + count
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/referral$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      await syncUser(userId, msg.from?.username);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!user?.referralCode) { await bot!.sendMessage(chatId, "❌ Try /start first."); return; }

      const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "z_fantasy_bot";
      const link = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

      const [countResult] = await db.select({ c: sql<number>`count(*)` })
        .from(usersTable).where(eq(usersTable.referredBy, user.referralCode));
      const referred = Number(countResult?.c ?? 0);

      await bot!.sendMessage(chatId, [
        `🔗 *Your Referral Link*`, ``,
        `\`${link}\``,
        ``,
        `👥 Friends referred: *${referred}*`,
        `🎁 Each friend gives you *+15 tickets* when they join!`,
        ``,
        `Share this link and earn more tickets every time someone signs up.`,
      ].join("\n"), { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /upgrade — show premium plans with Open App button
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/upgrade$/, async (msg) => {
      const chatId = msg.chat.id;
      await bot!.sendMessage(chatId, [
        `⚡ *Z-Fantasy Premium*`, ``,
        `🥉 *Bronze* — 300 ⭐/mo`,
        `  • 100 Tickets/cycle · Basic avatars`,
        ``,
        `🥈 *Silver* — 600 ⭐/mo`,
        `  • 300 Tickets/cycle · Priority generation · Voice messages`,
        ``,
        `🥇 *Gold* — 1050 ⭐/mo`,
        `  • 1000 Tickets/cycle · All features · Instant generation`,
        ``,
        `Tap the button below to open the full checkout inside Z-Fantasy.`,
      ].join("\n"), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "💎 View Plans & Subscribe", web_app: { url: appUrl("/premium") } }]],
        },
      });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /premium — plan picker → sends native Telegram Stars invoice
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/premium$/, async (msg) => {
      const chatId = msg.chat.id;
      await syncUser(String(msg.from?.id), msg.from?.username);

      await bot!.sendMessage(chatId, [
        `💎 *Choose your Z-Fantasy plan*`,
        ``,
        `🥉 *Bronze* — Character creation · 100 tickets/month`,
        `🥈 *Silver* — Priority AI · Voice messages · 300 tickets/month`,
        `🥇 *Gold* — Unlimited access · 1000 tickets/month`,
        ``,
        `Payment is processed securely via Telegram Stars ⭐`,
      ].join("\n"), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🥉 Bronze  300 ⭐/mo",  callback_data: "premium_plan_Bronze_monthly" },
              { text: "🥉 Bronze  3000 ⭐/yr", callback_data: "premium_plan_Bronze_yearly" },
            ],
            [
              { text: "🥈 Silver  600 ⭐/mo",  callback_data: "premium_plan_Silver_monthly" },
              { text: "🥈 Silver  6000 ⭐/yr", callback_data: "premium_plan_Silver_yearly" },
            ],
            [
              { text: "🥇 Gold  1050 ⭐/mo",   callback_data: "premium_plan_Gold_monthly" },
              { text: "🥇 Gold  10500 ⭐/yr",  callback_data: "premium_plan_Gold_yearly" },
            ],
          ],
        },
      });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /inventory — list user's created characters
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/inventory$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      await syncUser(userId, msg.from?.username);

      const chars = await db.select({
        characterId: charactersTable.characterId,
        name: charactersTable.name,
        visibility: charactersTable.visibility,
        genre: charactersTable.genre,
      }).from(charactersTable).where(eq(charactersTable.creatorId, userId));

      if (!chars.length) {
        await bot!.sendMessage(chatId,
          `🎭 You haven't created any companions yet.\n\nUse /create to build your first one! (costs 25 tickets)`,
          { reply_markup: { inline_keyboard: [[{ text: "🌐 Create in App", web_app: { url: appUrl("/create") } }]] } });
        return;
      }

      const lines = chars.map((c, i) =>
        `${i + 1}. *${c.name}* — ${c.genre ?? "General"} ${c.visibility === "private" ? "🔒" : "🌐"}`
      );

      await bot!.sendMessage(chatId,
        `🎭 *Your Companions (${chars.length})*\n\n${lines.join("\n")}\n\n🔒 Private  🌐 Public`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "🌐 Manage in App", web_app: { url: appUrl("/create") } }]],
          },
        });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /create — guided character creation wizard
    //  Free tier blocked. Costs 25 tickets. Steps: name → bio → genre (button)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/create$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      await syncUser(userId, msg.from?.username);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!user) { await bot!.sendMessage(chatId, "❌ Try /start first."); return; }

      if (user.subscriptionTier === "Free") {
        await bot!.sendMessage(chatId,
          `🔒 *Character creation requires a premium subscription.*\n\nFree users can browse and chat — but creating your own companion needs Bronze tier or above.\n\nUse /upgrade to unlock full access.`,
          {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "⚡ View Plans", web_app: { url: appUrl("/premium") } }]] },
          });
        return;
      }

      if ((user.ticketBalance ?? 0) < 25) {
        await bot!.sendMessage(chatId,
          `❌ *Insufficient tickets.*\n\nCharacter creation costs *25 tickets*.\nYour balance: *${user.ticketBalance}* tickets.\n\nClaim your /daily or /upgrade for more.`,
          { parse_mode: "Markdown" });
        return;
      }

      pendingCreation.set(chatId, { step: "name" });
      await bot!.sendMessage(chatId,
        `🎨 *Let's create your companion!*\n\n*Step 1/3 — Name*\nWhat's your companion's name?\n\n_(Type /cancel at any time to abort)_`,
        { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /stats
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/stats$/, async (msg) => {
      if (!isAdmin(msg)) return;
      const [users] = await db.select({ c: count() }).from(usersTable);
      const [chars] = await db.select({ c: count() }).from(charactersTable);
      const [premium] = await db.select({ c: count() }).from(usersTable).where(sql`subscription_tier != 'Free'`);
      const [today] = await db.select({ c: count() }).from(usersTable)
        .where(sql`DATE(last_login_timestamp) = CURRENT_DATE`);

      await bot!.sendMessage(msg.chat.id, [
        `📊 *Z-Fantasy Dashboard*`, ``,
        `👤 Total Users: *${users?.c ?? 0}*`,
        `🟢 Active Today: *${today?.c ?? 0}*`,
        `💎 Premium: *${premium?.c ?? 0}*`,
        `🤖 Characters: *${chars?.c ?? 0}*`,
      ].join("\n"), { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /listall — paginated character list
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/listall$/, async (msg) => {
      if (!isAdmin(msg)) return;
      const characters = await db.select().from(charactersTable).orderBy(charactersTable.name);
      if (!characters.length) {
        await bot!.sendMessage(msg.chat.id, "No characters in the database yet.");
        return;
      }
      const pages = chunk(characters, 5);
      for (let i = 0; i < pages.length; i++) {
        const lines = pages[i].map((c, n) =>
          `${i * 5 + n + 1}. *${c.name}* [${c.visibility}]\n   _${c.teaserDescription?.slice(0, 60) ?? "No tagline"}_`
        );
        await bot!.sendMessage(msg.chat.id,
          `📋 Characters (${i * 5 + 1}–${i * 5 + pages[i].length} of ${characters.length})\n\n${lines.join("\n\n")}`,
          { parse_mode: "Markdown" });
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /listusers — paginated user list
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/listusers$/, async (msg) => {
      if (!isAdmin(msg)) return;
      const users = await db.select({
        id: usersTable.id, username: usersTable.username,
        tier: usersTable.subscriptionTier, balance: usersTable.ticketBalance,
      }).from(usersTable).limit(50);

      if (!users.length) { await bot!.sendMessage(msg.chat.id, "No users yet."); return; }
      const pages = chunk(users, 10);
      for (const page of pages) {
        const lines = page.map(u =>
          `• \`${u.id}\` @${u.username ?? "—"} | ${u.tier} | 🎟 ${u.balance}`
        );
        await bot!.sendMessage(msg.chat.id, lines.join("\n"), { parse_mode: "Markdown" });
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /configall — interactive per-character config menu
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/configall$/, async (msg) => {
      if (!isAdmin(msg)) return;
      const characters = await db.select({ name: charactersTable.name, id: charactersTable.characterId })
        .from(charactersTable).orderBy(charactersTable.name).limit(30);
      if (!characters.length) { await bot!.sendMessage(msg.chat.id, "No characters yet."); return; }

      const buttons = chunk(
        characters.map(c => ({ text: c.name, callback_data: `cfg_${c.id}` })),
        2
      );
      await bot!.sendMessage(msg.chat.id, "🎭 *Select a character to configure:*", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons },
      });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /configurecharacter [name] — trait dashboard
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/configurecharacter (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const name = match?.[1]?.trim();
      if (!name) return;
      const char = await findCharByName(name);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ Character *${name}* not found.`, { parse_mode: "Markdown" }); return; }

      const traitsRow = await getConfig(`traits_${char.name}`);
      const traits: Trait[] = (traitsRow?.traits as Trait[]) ?? [];
      const mediaRow = await getConfig(`media_${char.name}`);
      const triggers: MediaTrigger[] = (mediaRow?.triggers as MediaTrigger[]) ?? [];

      await bot!.sendMessage(msg.chat.id, [
        `🎨 *${char.name} — Config Panel*`, ``,
        `📝 Prompt: ${char.systemPrompt ? "✅ Set" : "❌ Not set"}`,
        `💬 Greeting: ${char.initialGreeting ? "✅ Set" : "❌ Not set"}`,
        `🏷 Tagline: ${char.teaserDescription ?? "—"}`,
        `🖼 Avatar: ${char.avatarUrl ? "✅ Set" : "❌ Not set"}`,
        `👁 Visibility: *${char.visibility}*`,
        `✨ Traits: *${traits.length}* active`,
        `📸 Media Triggers: *${triggers.length}* linked`,
        ``,
        `Use /viewtraits ${char.name}, /addcustomtrait, /addphoto, /addvideo to manage.`,
      ].join("\n"), { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /addpremium /removepremium
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/addpremium (\S+) (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, targetId, period] = match ?? [];
      if (!targetId || !period) return;
      const tier = period === "lifetime" ? "Gold" : Number(period) >= 365 ? "Gold" : Number(period) >= 30 ? "Silver" : "Bronze";
      await db.update(usersTable).set({ subscriptionTier: tier }).where(eq(usersTable.id, targetId));
      await bot!.sendMessage(msg.chat.id, `✅ User \`${targetId}\` → *${tier}* (${period})`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/removepremium (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const targetId = match?.[1];
      if (!targetId) return;
      await db.update(usersTable).set({ subscriptionTier: "Free" }).where(eq(usersTable.id, targetId));
      await bot!.sendMessage(msg.chat.id, `✅ User \`${targetId}\` → *Free*`, { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /setstaff [userID] | limited_admin|full_admin|remove
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/setstaff (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) {
        await bot!.sendMessage(msg.chat.id,
          "Usage: /setstaff userID | limited_admin|full_admin|remove\n\n• limited_admin — Stats + Characters only\n• full_admin — Full god-mode access\n• remove — Revoke staff access");
        return;
      }
      const [targetId, role] = parts;
      const staffPrivileges = role === "remove" ? null : role === "limited_admin" ? "limited_admin" : role === "full_admin" ? "full_admin" : null;
      if (role !== "remove" && !staffPrivileges) {
        await bot!.sendMessage(msg.chat.id, "❌ Invalid role. Use: limited_admin, full_admin, or remove");
        return;
      }
      await db.update(usersTable).set({ staffPrivileges }).where(eq(usersTable.id, targetId));
      const label = role === "remove" ? "staff access revoked" : `promoted to *${role}*`;
      await bot!.sendMessage(msg.chat.id, `✅ User \`${targetId}\` — ${label}`, { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /setusername [userID] | [name]
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/setusername (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) {
        await bot!.sendMessage(msg.chat.id, "Usage: /setusername userID | DisplayName");
        return;
      }
      const [targetId, newName] = parts;
      await db.update(usersTable).set({ customNickname: newName }).where(eq(usersTable.id, targetId));
      await bot!.sendMessage(msg.chat.id, `✅ User \`${targetId}\` display name → *${newName}*`, { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /broadcast
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/broadcast (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const text = match?.[1]?.trim();
      if (!text) return;
      const users = await db.select({ id: usersTable.id }).from(usersTable);
      let sent = 0, failed = 0;
      for (const u of users) {
        try { await bot!.sendMessage(u.id, text); sent++; } catch { failed++; }
      }
      await bot!.sendMessage(msg.chat.id, `📢 Done — ✅ ${sent} sent, ❌ ${failed} failed`);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /setwelcome
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/setwelcome (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const text = match?.[1]?.trim();
      if (!text) return;
      await upsertConfig("welcome_message", { text });
      await bot!.sendMessage(msg.chat.id, "✅ Welcome message updated.");
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /setdesc [text] — set bot Telegram description
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/setdesc (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const text = match?.[1]?.trim();
      if (!text) return;
      try {
        await (bot as unknown as { request: (method: string, params: Record<string, string>) => Promise<unknown> })
          .request("setMyDescription", { description: text });
        await bot!.sendMessage(msg.chat.id, "✅ Bot description updated.");
      } catch (err) {
        await bot!.sendMessage(msg.chat.id, `❌ Failed: ${String(err)}`);
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /setbotphoto — reply with a photo to set bot profile picture
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/setbotphoto$/, async (msg) => {
      if (!isAdmin(msg)) return;
      pendingBotPhoto.add(msg.chat.id);
      await bot!.sendMessage(msg.chat.id, "📸 Send me the photo you want to use as the bot profile picture.");
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  CHARACTER MANAGEMENT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/createcharacter (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 3) {
        await bot!.sendMessage(msg.chat.id, "Usage: /createcharacter Name | true/false | Backstory");
        return;
      }
      const [name, visStr, backstory] = parts;
      await db.insert(charactersTable).values({
        name, visibility: visStr === "true" ? "public" : "private",
        teaserDescription: backstory, genre: "General",
        systemPrompt: `You are ${name}, an AI companion. ${backstory}`,
        creatorId: String(msg.from?.id),
      });
      await bot!.sendMessage(msg.chat.id, `✅ *${name}* created.`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/setprompt (\S+) (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, name, prompt] = match ?? [];
      if (!name || !prompt) return;
      await db.update(charactersTable).set({ systemPrompt: prompt }).where(ilike(charactersTable.name, name));
      await bot!.sendMessage(msg.chat.id, `✅ Prompt updated for *${name}*.`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/settagline (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) { await bot!.sendMessage(msg.chat.id, "Usage: /settagline Name | Tagline"); return; }
      await db.update(charactersTable).set({ teaserDescription: parts[1] }).where(ilike(charactersTable.name, parts[0]));
      await bot!.sendMessage(msg.chat.id, `✅ Tagline updated for *${parts[0]}*.`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/setgreeting (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) { await bot!.sendMessage(msg.chat.id, "Usage: /setgreeting Name | Message"); return; }
      await db.update(charactersTable).set({ initialGreeting: parts[1] }).where(ilike(charactersTable.name, parts[0]));
      await bot!.sendMessage(msg.chat.id, `✅ Greeting updated for *${parts[0]}*.`, { parse_mode: "Markdown" });
    });

    // /bulkgreeting name1, name2 | message
    bot.onText(/\/bulkgreeting (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const raw = match?.[1];
      if (!raw) return;
      const pipeIdx = raw.indexOf("|");
      if (pipeIdx === -1) { await bot!.sendMessage(msg.chat.id, "Usage: /bulkgreeting Name1, Name2 | Greeting"); return; }
      const names = raw.slice(0, pipeIdx).split(",").map(s => s.trim()).filter(Boolean);
      const greeting = raw.slice(pipeIdx + 1).trim();
      let updated = 0;
      for (const name of names) {
        const res = await db.update(charactersTable).set({ initialGreeting: greeting })
          .where(ilike(charactersTable.name, name)).returning({ id: charactersTable.characterId });
        if (res.length) updated++;
      }
      await bot!.sendMessage(msg.chat.id, `✅ Greeting applied to *${updated}/${names.length}* characters.`, { parse_mode: "Markdown" });
    });

    // /renamechar current | new  (display name only)
    bot.onText(/\/renamechar (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) { await bot!.sendMessage(msg.chat.id, "Usage: /renamechar OldName | NewName"); return; }
      await db.update(charactersTable).set({ name: parts[1] }).where(ilike(charactersTable.name, parts[0]));
      await bot!.sendMessage(msg.chat.id, `✅ *${parts[0]}* renamed to *${parts[1]}*.`, { parse_mode: "Markdown" });
    });

    // /renamecharacter old | new  (name + updates system prompt reference)
    bot.onText(/\/renamecharacter (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) { await bot!.sendMessage(msg.chat.id, "Usage: /renamecharacter OldName | NewName"); return; }
      const [oldName, newName] = parts;
      const char = await findCharByName(oldName);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ *${oldName}* not found.`, { parse_mode: "Markdown" }); return; }
      const updatedPrompt = (char.systemPrompt ?? "").replace(new RegExp(oldName, "gi"), newName);
      await db.update(charactersTable).set({ name: newName, systemPrompt: updatedPrompt })
        .where(eq(charactersTable.characterId, char.characterId));
      await bot!.sendMessage(msg.chat.id, `✅ Renamed *${oldName}* → *${newName}* (prompt updated).`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/deletecharacter (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const name = match?.[1];
      if (!name) return;
      await db.delete(charactersTable).where(ilike(charactersTable.name, name));
      await bot!.sendMessage(msg.chat.id, `✅ *${name}* permanently deleted.`, { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  TRAITS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // /addcustomtrait mood|tone | CharName | AI description
    bot.onText(/\/addcustomtrait (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 3) {
        await bot!.sendMessage(msg.chat.id, "Usage: /addcustomtrait mood|tone | CharName | AI description");
        return;
      }
      const [traitType, charName, description] = parts;
      const char = await findCharByName(charName);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ *${charName}* not found.`, { parse_mode: "Markdown" }); return; }

      const existing = await getConfig(`traits_${char.name}`);
      const traits: Trait[] = (existing?.traits as Trait[]) ?? [];
      traits.push({ type: traitType, name: charName, description });
      await upsertConfig(`traits_${char.name}`, { traits });
      await bot!.sendMessage(msg.chat.id, `✅ Trait [${traitType}] added to *${char.name}*.`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/viewtraits (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const name = match?.[1]?.trim();
      if (!name) return;
      const char = await findCharByName(name);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ Not found.`); return; }
      const row = await getConfig(`traits_${char.name}`);
      const traits: Trait[] = (row?.traits as Trait[]) ?? [];
      if (!traits.length) { await bot!.sendMessage(msg.chat.id, `No traits for *${char.name}* yet.`, { parse_mode: "Markdown" }); return; }
      const lines = traits.map((t, i) => `${i + 1}. [${t.type}] ${t.description}`);
      await bot!.sendMessage(msg.chat.id, `✨ *${char.name} Traits:*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/resettraits (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const name = match?.[1]?.trim();
      if (!name) return;
      const char = await findCharByName(name);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ Not found.`); return; }
      await upsertConfig(`traits_${char.name}`, { traits: [] });
      await bot!.sendMessage(msg.chat.id, `✅ All traits cleared for *${char.name}*.`, { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  MEDIA TRIGGERS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // /addphoto CharName keyword   — attach photo in same message
    bot.onText(/\/addphoto (\S+) (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, charName, keyword] = match ?? [];
      if (!charName || !keyword) return;
      const char = await findCharByName(charName);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ *${charName}* not found.`, { parse_mode: "Markdown" }); return; }

      let url = "";
      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const file = await bot!.getFile(fileId);
        url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      } else {
        await bot!.sendMessage(msg.chat.id, `📸 Send the photo in the same message as the command, or use a URL as the keyword.`);
        return;
      }

      const existing = await getConfig(`media_${char.name}`);
      const triggers: MediaTrigger[] = (existing?.triggers as MediaTrigger[]) ?? [];
      triggers.push({ keyword, url, mediaType: "photo" });
      await upsertConfig(`media_${char.name}`, { triggers });
      await bot!.sendMessage(msg.chat.id, `✅ Photo linked to keyword *${keyword}* for *${char.name}*.`, { parse_mode: "Markdown" });
    });

    // /addvideo CharName keyword   — attach video in same message
    bot.onText(/\/addvideo (\S+) (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, charName, keyword] = match ?? [];
      if (!charName || !keyword) return;
      const char = await findCharByName(charName);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ *${charName}* not found.`, { parse_mode: "Markdown" }); return; }

      let url = "";
      if (msg.video) {
        const file = await bot!.getFile(msg.video.file_id);
        url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      } else {
        await bot!.sendMessage(msg.chat.id, `🎥 Send the video in the same message as the command.`);
        return;
      }

      const existing = await getConfig(`media_${char.name}`);
      const triggers: MediaTrigger[] = (existing?.triggers as MediaTrigger[]) ?? [];
      triggers.push({ keyword, url, mediaType: "video" });
      await upsertConfig(`media_${char.name}`, { triggers });
      await bot!.sendMessage(msg.chat.id, `✅ Video linked to keyword *${keyword}* for *${char.name}*.`, { parse_mode: "Markdown" });
    });

    // /setcharphoto CharName   — then send a photo in next message
    bot.onText(/\/setcharphoto (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const name = match?.[1]?.trim();
      if (!name) return;
      const char = await findCharByName(name);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ *${name}* not found.`, { parse_mode: "Markdown" }); return; }

      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const file = await bot!.getFile(fileId);
        const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        await db.update(charactersTable).set({ avatarUrl: url }).where(eq(charactersTable.characterId, char.characterId));
        await bot!.sendMessage(msg.chat.id, `✅ Profile picture updated for *${char.name}*.`, { parse_mode: "Markdown" });
      } else {
        pendingPhotoFor.set(msg.chat.id, char.characterId);
        await bot!.sendMessage(msg.chat.id, `📸 Send the photo now for *${char.name}*.`, { parse_mode: "Markdown" });
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  CUSTOM COMMANDS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/addcommand (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) {
        await bot!.sendMessage(msg.chat.id, "Usage: /addcommand trigger | Response text");
        return;
      }
      const [trigger, response] = parts;
      await upsertConfig(`customcmd_${trigger.toLowerCase()}`, { response });
      await bot!.sendMessage(msg.chat.id, `✅ Custom command *${trigger}* saved.`, { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /whois [userID] — full user profile card
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/whois (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const targetId = match?.[1]?.trim();
      if (!targetId) return;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
      if (!user) {
        await bot!.sendMessage(msg.chat.id, `❌ No user found with ID \`${targetId}\``, { parse_mode: "Markdown" });
        return;
      }
      let activeCharName = "None";
      if (user.activeCharacterId) {
        const [char] = await db.select({ name: charactersTable.name })
          .from(charactersTable).where(eq(charactersTable.characterId, user.activeCharacterId));
        if (char) activeCharName = char.name;
      }
      const staffLabel = user.staffPrivileges === "full_admin" ? "⚡ Full Admin (God-Mode)"
        : user.staffPrivileges === "limited_admin" ? "🔰 Limited Admin"
        : "👤 Regular User";
      const joined = user.createdAt ? new Date(user.createdAt).toDateString() : "Unknown";
      const lastLogin = user.lastLoginTimestamp ? new Date(user.lastLoginTimestamp).toDateString() : "Never";
      await bot!.sendMessage(msg.chat.id, [
        `👤 *User Profile*`,
        ``,
        `🆔 ID: \`${user.id}\``,
        `🏷 Username: @${user.username ?? "—"}`,
        `📛 Display Name: ${user.customNickname ?? "—"}`,
        ``,
        `💎 Tier: *${user.subscriptionTier}*`,
        `🎟 Tickets: *${user.ticketBalance}*`,
        `🤖 Active Character: *${activeCharName}*`,
        ``,
        `🛡 Staff Role: ${staffLabel}`,
        ``,
        `📅 Joined: ${joined}`,
        `🕐 Last Login: ${lastLogin}`,
        `🔗 Referral Code: \`${user.referralCode ?? "—"}\``,
      ].join("\n"), { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /givetickets [userID] [amount]  (use negative to deduct)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/givetickets (\S+) (-?\d+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, targetId, amountStr] = match ?? [];
      const amount = Number(amountStr);
      if (!targetId || isNaN(amount)) {
        await bot!.sendMessage(msg.chat.id, "Usage: /givetickets userID amount\nUse negative number to deduct.");
        return;
      }
      const [user] = await db.select({ id: usersTable.id, ticketBalance: usersTable.ticketBalance })
        .from(usersTable).where(eq(usersTable.id, targetId));
      if (!user) {
        await bot!.sendMessage(msg.chat.id, `❌ User \`${targetId}\` not found.`, { parse_mode: "Markdown" });
        return;
      }
      await db.update(usersTable)
        .set({ ticketBalance: sql`ticket_balance + ${amount}` })
        .where(eq(usersTable.id, targetId));
      await db.insert(transactionsTable).values({
        telegramId: targetId,
        actionType: amount >= 0 ? "admin_grant" : "admin_deduct",
        ticketAmount: amount,
      });
      const verb = amount >= 0 ? `+${amount}` : String(amount);
      await bot!.sendMessage(msg.chat.id,
        `✅ User \`${targetId}\` — tickets *${verb}*\nNew balance: *${(user.ticketBalance ?? 0) + amount}*`,
        { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /resetuser [userID] — reset to Free + zero ticket balance
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/resetuser (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const targetId = match?.[1];
      if (!targetId) return;
      await db.update(usersTable)
        .set({ subscriptionTier: "Free", ticketBalance: 0, weeklyCreationsCount: 0 })
        .where(eq(usersTable.id, targetId));
      await bot!.sendMessage(msg.chat.id,
        `✅ User \`${targetId}\` reset — Free tier, 0 tickets, 0 weekly creations.`,
        { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /setvisibility [name] | public/private
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/setvisibility (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const parts = match?.[1]?.split("|").map(s => s.trim());
      if (!parts || parts.length < 2) {
        await bot!.sendMessage(msg.chat.id, "Usage: /setvisibility CharName | public/private");
        return;
      }
      const [name, vis] = parts;
      if (vis !== "public" && vis !== "private") {
        await bot!.sendMessage(msg.chat.id, "❌ Visibility must be `public` or `private`.", { parse_mode: "Markdown" });
        return;
      }
      const char = await findCharByName(name);
      if (!char) { await bot!.sendMessage(msg.chat.id, `❌ *${name}* not found.`, { parse_mode: "Markdown" }); return; }
      await db.update(charactersTable).set({ visibility: vis }).where(eq(charactersTable.characterId, char.characterId));
      const icon = vis === "public" ? "🌐" : "🔒";
      await bot!.sendMessage(msg.chat.id,
        `✅ *${char.name}* is now ${icon} *${vis}*.`,
        { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /searchuser [query] — search by username or ID
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/searchuser (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const query = match?.[1]?.trim();
      if (!query) return;
      const results = await db.select({
        id: usersTable.id, username: usersTable.username,
        tier: usersTable.subscriptionTier, balance: usersTable.ticketBalance,
      }).from(usersTable)
        .where(sql`id ILIKE ${'%' + query + '%'} OR username ILIKE ${'%' + query + '%'}`)
        .limit(10);
      if (!results.length) {
        await bot!.sendMessage(msg.chat.id, `❌ No users matching \`${query}\`.`, { parse_mode: "Markdown" });
        return;
      }
      const lines = results.map(u =>
        `• \`${u.id}\` @${u.username ?? "—"} | ${u.tier} | 🎟 ${u.balance}`
      );
      await bot!.sendMessage(msg.chat.id,
        `🔍 *Search results for "${query}":*\n\n${lines.join("\n")}`,
        { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  /commands — full command reference (public + admin sections)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/commands$/, async (msg) => {
      const admin = isAdmin(msg);
      const publicCmds = [
        `🌐 *Public Commands*`,
        `/start — Welcome message \\+ Open App button`,
        `/profile — Your stats, balance & active companion`,
        `/daily — Claim your daily \\+10 tickets`,
        `/create — Create a new companion \\(25 tickets\\)`,
        `/inventory — Your created companions`,
        `/referral — Your referral link \\(\\+15 tickets per friend\\)`,
        `/upgrade — View premium plans`,
        `/browse — Browse all public companions`,
        `/character \\[name\\] — View a companion card`,
        `/select \\[name\\] — Switch your active companion`,
        `/commands — Show this list`,
      ];
      const adminCmds = [
        ``,
        `🔑 *Admin Commands*`,
        ``,
        `📊 *Users*`,
        `/stats — Dashboard`,
        `/listusers — List all users`,
        `/searchuser \\[query\\] — Search user by name or ID`,
        `/whois \\[userID\\] — Full profile card`,
        `/givetickets \\[userID\\] \\[amount\\] — Give or deduct tickets`,
        `/addpremium \\[userID\\] \\[days/lifetime\\]`,
        `/removepremium \\[userID\\]`,
        `/resetuser \\[userID\\] — Reset to Free \\+ 0 tickets`,
        `/setstaff \\[userID\\] | limited\\_admin|full\\_admin|remove`,
        `/setusername \\[userID\\] | \\[name\\]`,
        `/broadcast \\[message\\]`,
        ``,
        `🤖 *Characters*`,
        `/listall — List all characters`,
        `/configall — Interactive config menu`,
        `/configurecharacter \\[name\\]`,
        `/createcharacter \\[name\\] | true/false | \\[backstory\\]`,
        `/setvisibility \\[name\\] | public/private`,
        `/deletecharacter \\[name\\]`,
        `/renamechar \\[old\\] | \\[new\\]`,
        `/renamecharacter \\[old\\] | \\[new\\]`,
        `/setprompt \\[name\\] \\[prompt\\]`,
        `/settagline \\[name\\] | \\[tagline\\]`,
        `/setgreeting \\[name\\] | \\[message\\]`,
        `/bulkgreeting \\[n1,n2\\] | \\[greeting\\]`,
        `/setcharphoto \\[name\\]`,
        ``,
        `✨ *Traits & Media*`,
        `/addcustomtrait mood|tone | \\[CharName\\] | \\[desc\\]`,
        `/viewtraits \\[name\\]`,
        `/resettraits \\[name\\]`,
        `/addphoto \\[CharName\\] \\[keyword\\]`,
        `/addvideo \\[CharName\\] \\[keyword\\]`,
        ``,
        `⚙️ *Bot Settings*`,
        `/setwelcome \\[text\\]`,
        `/setdesc \\[text\\]`,
        `/setbotphoto`,
        `/addcommand \\[trigger\\] | \\[response\\]`,
      ];

      const lines = admin ? [...publicCmds, ...adminCmds] : publicCmds;
      await bot!.sendMessage(msg.chat.id, lines.join("\n"), { parse_mode: "MarkdownV2" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  CALLBACK QUERIES (inline keyboard buttons from /configall)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.on("callback_query", async (query) => {
      const chatId = query.message?.chat.id;
      if (!chatId) return;
      await bot!.answerCallbackQuery(query.id);

      if (query.data?.startsWith("cfg_")) {
        const charId = query.data.replace("cfg_", "");
        const [char] = await db.select().from(charactersTable).where(eq(charactersTable.characterId, charId));
        if (!char) return;
        const traitsRow = await getConfig(`traits_${char.name}`);
        const traits: Trait[] = (traitsRow?.traits as Trait[]) ?? [];
        const mediaRow = await getConfig(`media_${char.name}`);
        const triggers: MediaTrigger[] = (mediaRow?.triggers as MediaTrigger[]) ?? [];

        await bot!.sendMessage(chatId, [
          `🎨 *${char.name}*`, ``,
          `Prompt: ${char.systemPrompt ? "✅" : "❌"}  |  Greeting: ${char.initialGreeting ? "✅" : "❌"}`,
          `Visibility: *${char.visibility}*  |  Avatar: ${char.avatarUrl ? "✅" : "❌"}`,
          `Traits: *${traits.length}*  |  Media: *${triggers.length}*`,
          ``,
          `Commands:`,
          `/setprompt ${char.name} [text]`,
          `/setgreeting ${char.name} | [text]`,
          `/settagline ${char.name} | [text]`,
          `/addcustomtrait mood | ${char.name} | [description]`,
          `/addphoto ${char.name} [keyword]`,
          `/setcharphoto ${char.name}`,
        ].join("\n"), { parse_mode: "Markdown" });
      }

      if (query.data?.startsWith("chat_")) {
        const charId = query.data.replace("chat_", "");
        await db.update(usersTable).set({ activeCharacterId: charId })
          .where(eq(usersTable.id, String(query.from.id)));
        await bot!.sendMessage(chatId, "✅ Character selected! Send me a message to start chatting 💜");
      }

      if (query.data?.startsWith("premium_plan_")) {
        const parts = query.data.replace("premium_plan_", "").split("_");
        const tier = parts[0];
        const period = parts[1];

        const PRICES: Record<string, Record<string, { stars: number; label: string }>> = {
          Bronze: { monthly: { stars: 300,   label: "Bronze Monthly" }, yearly: { stars: 3000,  label: "Bronze Yearly" } },
          Silver: { monthly: { stars: 600,   label: "Silver Monthly" }, yearly: { stars: 6000,  label: "Silver Yearly" } },
          Gold:   { monthly: { stars: 1050,  label: "Gold Monthly"   }, yearly: { stars: 10500, label: "Gold Yearly"   } },
        };

        const plan = PRICES[tier]?.[period];
        if (!plan) { await bot!.sendMessage(chatId, "❌ Invalid plan selected."); return; }

        const userId = String(query.from.id);
        const periodLabel = period === "yearly" ? "1 Year" : "1 Month";

        try {
          await (bot as unknown as {
            sendInvoice: (
              chatId: number, title: string, description: string,
              payload: string, providerToken: string, currency: string,
              prices: { label: string; amount: number }[],
              options?: Record<string, unknown>
            ) => Promise<unknown>
          }).sendInvoice(
            chatId,
            `Z-Fantasy ${plan.label}`,
            `${tier} tier subscription — ${periodLabel}\nUnlock all ${tier} benefits instantly.`,
            JSON.stringify({ tier, period, userId }),
            "",
            "XTR",
            [{ label: plan.label, amount: plan.stars }],
            {
              protect_content: false,
              reply_markup: { inline_keyboard: [[{ text: `Pay ${plan.stars} ⭐`, pay: true }]] },
            }
          );
        } catch (err) {
          logger.error({ err }, "sendInvoice failed");
          await bot!.sendMessage(chatId,
            `❌ Could not open payment. Please try the in-app checkout instead.`,
            { reply_markup: { inline_keyboard: [[{ text: "🌐 Open Premium Page", web_app: { url: appUrl("/premium") } }]] } });
        }
        return;
      }

      if (query.data?.startsWith("createchar_genre_")) {
        const genre = query.data.replace("createchar_genre_", "");
        const state = pendingCreation.get(chatId);
        if (!state || state.step !== "genre" || !state.name || !state.bio) {
          await bot!.sendMessage(chatId, "❌ Something went wrong. Please try /create again.");
          pendingCreation.delete(chatId);
          return;
        }
        pendingCreation.delete(chatId);

        const userId = String(query.from.id);
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (!user || (user.ticketBalance ?? 0) < 25) {
          await bot!.sendMessage(chatId, "❌ Insufficient tickets. Creation cancelled.");
          return;
        }

        const systemPrompt = `You are ${state.name}, an AI companion. ${state.bio}`;
        const [newChar] = await db.insert(charactersTable).values({
          name: state.name,
          genre,
          visibility: "private",
          teaserDescription: state.bio.slice(0, 100),
          systemPrompt,
          initialGreeting: `Hey 💜 I'm ${state.name}. ${state.bio.slice(0, 80)}…`,
          creatorId: userId,
        }).returning({ characterId: charactersTable.characterId, name: charactersTable.name });

        await db.update(usersTable).set({
          ticketBalance: sql`ticket_balance - 25`,
          weeklyCreationsCount: sql`weekly_creations_count + 1`,
          activeCharacterId: newChar.characterId,
        }).where(eq(usersTable.id, userId));

        await db.insert(transactionsTable).values({
          telegramId: userId,
          actionType: "character_creation",
          ticketAmount: -25,
        });

        await bot!.sendMessage(chatId, [
          `🎉 *${newChar.name}* is born!`,
          ``,
          `🎭 Genre: ${genre}`,
          `🔒 Visibility: Private (only you can see them)`,
          `🎟 Tickets used: 25`,
          ``,
          `Your companion is now active. Send a message to start chatting, or use /profile to see your balance.`,
          ``,
          `_Tip: Use the app to set a photo and make them public._`,
        ].join("\n"), {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "💬 Chat Now", callback_data: `chat_${newChar.characterId}` },
              { text: "🌐 Manage in App", web_app: { url: appUrl("/create") } },
            ]],
          },
        });
        return;
      }

      if (query.data?.startsWith("show_char_")) {
        const charId = query.data.replace("show_char_", "");
        const [char] = await db.select().from(charactersTable)
          .where(eq(charactersTable.characterId, charId));
        if (!char) return;

        const userId = String(query.from.id);
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        const isAdminUser = userId === adminId || adminSessions.has(query.from.id);

        if (char.visibility === "private" && !isAdminUser) {
          await bot!.sendMessage(chatId,
            `🔒 *${char.name}* is a premium companion.\n\nUpgrade your subscription to unlock access.`,
            { parse_mode: "Markdown" });
          return;
        }

        const traitsRow = await getConfig(`traits_${char.name}`);
        const traits: Trait[] = (traitsRow?.traits as Trait[]) ?? [];
        const traitLine = traits.length
          ? `\n✨ *Traits:* ${traits.map(t => t.description).join(" · ")}`
          : "";

        const caption = [
          `💜 *${char.name}*`,
          char.teaserDescription ? `_${char.teaserDescription}_` : "",
          ``,
          char.genre ? `🎭 Genre: ${char.genre}` : "",
          traitLine,
          ``,
          char.initialGreeting
            ? `💬 _"${char.initialGreeting.slice(0, 120)}${char.initialGreeting.length > 120 ? "…" : ""}"_`
            : "",
        ].filter(Boolean).join("\n");

        const markup: TelegramBot.InlineKeyboardMarkup = {
          inline_keyboard: [[
            { text: "💬 Chat Now", callback_data: `chat_${char.characterId}` },
            { text: "🌐 Open App", web_app: { url: appUrl(`/chat/${char.characterId}`) } },
          ]],
        };

        try {
          if (char.avatarUrl) {
            await bot!.sendPhoto(chatId, char.avatarUrl, {
              caption, parse_mode: "Markdown", reply_markup: markup,
            });
          } else {
            await bot!.sendMessage(chatId, caption, {
              parse_mode: "Markdown", reply_markup: markup,
            });
          }
        } catch {
          await bot!.sendMessage(chatId, caption, {
            parse_mode: "Markdown", reply_markup: markup,
          });
        }
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  INLINE QUERY — @BotUsername [search]
    //  Works in any Telegram chat. Searches characters live from DB.
    //  New characters show up automatically — no code changes needed.
    //  Requires inline mode ON in BotFather (/setinline on the bot).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.on("inline_query", async (query) => {
      const searchTerm = query.query.trim();
      const userId = String(query.from.id);
      const adminId = process.env.ADMIN_TELEGRAM_ID;
      const isAdminUser = userId === adminId || adminSessions.has(query.from.id);

      try {
        let characters;
        if (searchTerm) {
          characters = await db.select().from(charactersTable)
            .where(ilike(charactersTable.name, `%${searchTerm}%`))
            .orderBy(charactersTable.name)
            .limit(20);
        } else {
          characters = await db.select().from(charactersTable)
            .orderBy(charactersTable.name)
            .limit(20);
        }

        const visible = characters.filter(c => c.visibility === "public" || isAdminUser);

        const results: TelegramBot.InlineQueryResult[] = visible.map(char => {
          const traitsLine = "";
          const caption = [
            `💜 *${char.name}*`,
            char.teaserDescription ? `_${char.teaserDescription}_` : "",
            char.genre ? `🎭 ${char.genre}` : "",
            char.initialGreeting
              ? `\n💬 _"${char.initialGreeting.slice(0, 100)}${char.initialGreeting.length > 100 ? "…" : ""}"_`
              : "",
            traitsLine,
          ].filter(Boolean).join("\n");

          const replyMarkup: TelegramBot.InlineKeyboardMarkup = {
            inline_keyboard: [[
              { text: "💬 Chat in Bot", url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME ?? "z_fantasy_bot"}?start=char_${char.characterId}` },
              { text: "🌐 Open App", web_app: { url: appUrl(`/chat/${char.characterId}`) } },
            ]],
          };

          if (char.avatarUrl) {
            return {
              type: "photo" as const,
              id: char.characterId,
              photo_url: char.avatarUrl,
              thumbnail_url: char.avatarUrl,
              title: char.name,
              description: char.teaserDescription ?? char.genre ?? "AI Companion",
              caption,
              parse_mode: "Markdown" as const,
              reply_markup: replyMarkup,
            };
          }

          return {
            type: "article" as const,
            id: char.characterId,
            title: `💜 ${char.name}`,
            description: char.teaserDescription ?? char.genre ?? "AI Companion",
            input_message_content: {
              message_text: caption,
              parse_mode: "Markdown" as const,
            },
            reply_markup: replyMarkup,
            thumb_url: "",
          };
        });

        await bot!.answerInlineQuery(query.id, results, {
          cache_time: 30,
          is_personal: false,
        });
      } catch (err) {
        logger.error({ err }, "Inline query error");
        await bot!.answerInlineQuery(query.id, [], { cache_time: 5 });
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  GENERAL MESSAGE HANDLER
    //  (password auth, pending photo flows, custom commands, AI routing)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      const text = msg.text ?? "";

      // ── Successful Stars payment ───────────────────────────────────────────────
      if (msg.successful_payment) {
        try {
          const payload = JSON.parse(msg.successful_payment.invoice_payload) as { tier: string; period: string; userId: string };
          const payUserId = String(msg.from?.id ?? payload.userId);

          // Grant ticket bonus by tier
          const TICKET_BONUS: Record<string, number> = { Bronze: 100, Silver: 300, Gold: 1000 };
          const bonus = TICKET_BONUS[payload.tier] ?? 0;

          await db.update(usersTable)
            .set({
              subscriptionTier: payload.tier,
              ticketBalance: sql`ticket_balance + ${bonus}`,
            })
            .where(eq(usersTable.id, payUserId));

          await db.insert(transactionsTable).values({
            telegramId: payUserId,
            actionType: `subscription_${payload.tier}_${payload.period}`,
            ticketAmount: bonus,
          });

          const periodLabel = payload.period === "yearly" ? "1 year" : "1 month";
          const tierEmoji: Record<string, string> = { Bronze: "🥉", Silver: "🥈", Gold: "🥇" };
          await bot!.sendMessage(chatId, [
            `${tierEmoji[payload.tier] ?? "💎"} *${payload.tier} activated!*`,
            ``,
            `Your subscription is now live for ${periodLabel}.`,
            `🎟 *+${bonus} tickets* added to your balance.`,
            ``,
            `Use /profile to see your updated balance, or tap below to start chatting.`,
          ].join("\n"), {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[
                { text: "🌐 Open Z-Fantasy", web_app: { url: appUrl("/") } },
              ]],
            },
          });
        } catch (err) {
          logger.error({ err }, "Failed to process successful_payment");
        }
        return;
      }

      // Skip slash commands (handled by onText above)
      if (text.startsWith("/")) return;

      // ── /cancel — abort any pending wizard ───────────────────────────────────
      if (text.trim().toLowerCase() === "/cancel") {
        if (pendingCreation.has(chatId)) {
          pendingCreation.delete(chatId);
          await bot!.sendMessage(chatId, "❌ Character creation cancelled.");
        }
        return;
      }

      // ── Creation wizard steps ─────────────────────────────────────────────────
      if (pendingCreation.has(chatId)) {
        const state = pendingCreation.get(chatId)!;

        if (state.step === "name") {
          const name = text.trim();
          if (name.length < 2 || name.length > 40) {
            await bot!.sendMessage(chatId, "❌ Name must be 2–40 characters. Try again:");
            return;
          }
          const existing = await db.select({ id: charactersTable.characterId })
            .from(charactersTable).where(ilike(charactersTable.name, name)).limit(1);
          if (existing.length) {
            await bot!.sendMessage(chatId, `❌ A companion named *${name}* already exists. Try a different name:`, { parse_mode: "Markdown" });
            return;
          }
          state.name = name;
          state.step = "bio";
          pendingCreation.set(chatId, state);
          await bot!.sendMessage(chatId,
            `✨ Great name! Now...\n\n*Step 2/3 — Personality & Backstory*\nDescribe your companion's personality, backstory, and how they talk. Be as detailed as you like!\n\n_(e.g. "Aria is a sarcastic elf with a warm heart. She's witty, sarcastic, but fiercely loyal to her friends.")_`,
            { parse_mode: "Markdown" });
          return;
        }

        if (state.step === "bio") {
          const bio = text.trim();
          if (bio.length < 10) {
            await bot!.sendMessage(chatId, "❌ Please write at least a short description (10+ characters).");
            return;
          }
          state.bio = bio;
          state.step = "genre";
          pendingCreation.set(chatId, state);
          await bot!.sendMessage(chatId,
            `🎭 *Step 3/3 — Genre*\nWhat genre best fits *${state.name}*?`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "🗡 Fantasy",   callback_data: `createchar_genre_Fantasy` },
                    { text: "💕 Romance",   callback_data: `createchar_genre_Romance` },
                    { text: "🚀 Sci-Fi",    callback_data: `createchar_genre_SciFi` },
                  ],
                  [
                    { text: "🌸 Anime",     callback_data: `createchar_genre_Anime` },
                    { text: "😂 Comedy",    callback_data: `createchar_genre_Comedy` },
                    { text: "👻 Horror",    callback_data: `createchar_genre_Horror` },
                  ],
                  [
                    { text: "🏛 Historical", callback_data: `createchar_genre_Historical` },
                    { text: "✨ General",   callback_data: `createchar_genre_General` },
                  ],
                ],
              },
            });
          return;
        }
      }

      // ── Password unlock ──────────────────────────────────────────────────────
      if (text.trim() === ADMIN_PASSWORD) {
        if (msg.from?.id) adminSessions.add(msg.from.id);
        await bot!.sendMessage(chatId,
          "🔑 *Admin session unlocked.*\n\nYou now have access to all admin commands.\nType /listall to see the character database.",
          { parse_mode: "Markdown" });
        return;
      }

      // ── Pending: bot profile photo ────────────────────────────────────────────
      if (pendingBotPhoto.has(chatId) && msg.photo) {
        pendingBotPhoto.delete(chatId);
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        try {
          await (bot as unknown as { request: (m: string, p: Record<string, unknown>) => Promise<unknown> })
            .request("setMyPhoto", { photo: fileId });
          await bot!.sendMessage(chatId, "✅ Bot profile picture updated.");
        } catch (err) {
          await bot!.sendMessage(chatId, `❌ Failed: ${String(err)}`);
        }
        return;
      }

      // ── Pending: character avatar photo ───────────────────────────────────────
      if (pendingPhotoFor.has(chatId) && msg.photo) {
        const charId = pendingPhotoFor.get(chatId)!;
        pendingPhotoFor.delete(chatId);
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const file = await bot!.getFile(fileId);
        const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        await db.update(charactersTable).set({ avatarUrl: url }).where(eq(charactersTable.characterId, charId));
        await bot!.sendMessage(chatId, "✅ Character avatar updated.");
        return;
      }

      await syncUser(userId, msg.from?.username);

      // ── Custom command shortcut check ─────────────────────────────────────────
      const cmdRow = await getConfig(`customcmd_${text.trim().toLowerCase()}`);
      if (cmdRow?.response) {
        await bot!.sendMessage(chatId, cmdRow.response as string);
        return;
      }

      // ── AI routing ────────────────────────────────────────────────────────────
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      let systemPrompt = "You are a helpful AI companion in the Z-Fantasy universe.";
      let characterName = "Companion";

      if (user?.activeCharacterId) {
        const [char] = await db.select().from(charactersTable)
          .where(eq(charactersTable.characterId, user.activeCharacterId));
        if (char) {
          systemPrompt = char.systemPrompt ?? systemPrompt;
          characterName = char.name;

          // Inject active traits into the prompt
          const traitsRow = await getConfig(`traits_${char.name}`);
          const traits: Trait[] = (traitsRow?.traits as Trait[]) ?? [];
          if (traits.length) {
            const traitBlock = traits.map(t => `[${t.type}] ${t.description}`).join("; ");
            systemPrompt += `\n\nActive personality traits: ${traitBlock}`;
          }
        }
      }

      try {
        const reply = await generateAIReply(
          systemPrompt, [], text, characterName,
          user?.customNickname ?? null,
          user?.userTraits ?? null,
          user?.nsfwEnabled ?? false,
        );
        await bot!.sendMessage(chatId, reply);
      } catch (err) {
        logger.error({ err }, "AI response failed");
        await bot!.sendMessage(chatId, "⚡ Having trouble right now — try again in a moment!");
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PRE-CHECKOUT — Telegram requires answering within 10 s
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.on("pre_checkout_query", async (query) => {
      try {
        await bot!.answerPreCheckoutQuery(query.id, true);
      } catch (err) {
        logger.error({ err }, "pre_checkout_query answer failed");
      }
    });

    bot.on("polling_error", (err) => logger.error({ err }, "Telegram polling error"));

    logger.info("Telegram bot started (polling)");
    return bot;
  } catch (err) {
    logger.error({ err }, "Failed to start Telegram bot");
    return null;
  }
}

export function getBot(): TelegramBot | null { return bot; }
