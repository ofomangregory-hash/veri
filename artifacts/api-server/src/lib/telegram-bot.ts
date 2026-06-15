import TelegramBot from "node-telegram-bot-api";
import { db, usersTable, charactersTable, systemConfigurationsTable } from "@workspace/db";
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
      { command: "browse",    description: "Browse all public companions" },
      { command: "character", description: "View a companion profile: /character [name]" },
      { command: "commands",  description: "Show available commands" },
    ];

    const adminCommands = [
      ...publicCommands,
      { command: "stats",              description: "Dashboard — users, premium, characters" },
      { command: "listusers",          description: "View all registered users" },
      { command: "whois",              description: "Full profile card: /whois [userID]" },
      { command: "addpremium",         description: "Grant premium: /addpremium [userID] [days/lifetime]" },
      { command: "removepremium",      description: "Remove premium: /removepremium [userID]" },
      { command: "setstaff",           description: "Set staff role: /setstaff [userID] | limited_admin|full_admin|remove" },
      { command: "setusername",        description: "Set display name: /setusername [userID] | [name]" },
      { command: "broadcast",          description: "Send to all users: /broadcast [message]" },
      { command: "listall",            description: "All characters with visibility" },
      { command: "configall",          description: "Inline character config menu" },
      { command: "configurecharacter", description: "Full config dashboard: /configurecharacter [name]" },
      { command: "createcharacter",    description: "Create: /createcharacter [name] | true/false | [backstory]" },
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
    //  /commands — full command reference (public + admin sections)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/commands$/, async (msg) => {
      const admin = isAdmin(msg);
      const publicCmds = [
        `🌐 *Public Commands*`,
        `/start — Open Z\\-Fantasy with welcome message`,
        `/browse — Browse all public companions`,
        `/select \\[name\\] — Switch your active companion`,
        `/commands — Show this command list`,
      ];
      const adminCmds = [
        ``,
        `🔑 *Admin Commands* \\(unlock with password\\)`,
        ``,
        `📊 *Stats & Users*`,
        `/stats — Dashboard \\(users, premium, characters\\)`,
        `/listusers — List all registered users`,
        `/whois \\[userID\\] — Full profile card for a user`,
        `/addpremium \\[userID\\] \\[days/lifetime\\] — Grant premium`,
        `/removepremium \\[userID\\] — Remove premium`,
        `/setstaff \\[userID\\] | limited\\_admin|full\\_admin|remove`,
        `/setusername \\[userID\\] | \\[name\\] — Set display name`,
        `/broadcast \\[message\\] — Send to all users`,
        ``,
        `🤖 *Characters*`,
        `/listall — List all characters`,
        `/configall — Interactive character config menu`,
        `/configurecharacter \\[name\\] — Config dashboard`,
        `/createcharacter \\[name\\] | true/false | \\[backstory\\]`,
        `/deletecharacter \\[name\\] — Permanently delete`,
        `/renamechar \\[old\\] | \\[new\\] — Rename \\(display only\\)`,
        `/renamecharacter \\[old\\] | \\[new\\] — Rename \\+ update prompt`,
        `/setprompt \\[name\\] \\[prompt\\] — Set system prompt`,
        `/settagline \\[name\\] | \\[tagline\\]`,
        `/setgreeting \\[name\\] | \\[message\\]`,
        `/bulkgreeting \\[name1,name2\\] | \\[greeting\\]`,
        `/setcharphoto \\[name\\] — Set character avatar`,
        ``,
        `✨ *Traits & Media*`,
        `/addcustomtrait mood|tone | \\[CharName\\] | \\[desc\\]`,
        `/viewtraits \\[name\\] — View active traits`,
        `/resettraits \\[name\\] — Clear all traits`,
        `/addphoto \\[CharName\\] \\[keyword\\] — Link photo`,
        `/addvideo \\[CharName\\] \\[keyword\\] — Link video`,
        ``,
        `⚙️ *Bot Settings*`,
        `/setwelcome \\[text\\] — Set /start message`,
        `/setdesc \\[text\\] — Set bot Telegram description`,
        `/setbotphoto — Set bot profile picture`,
        `/addcommand \\[trigger\\] | \\[response\\] — Custom command`,
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

      // Skip slash commands (handled by onText above)
      if (text.startsWith("/")) return;

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

    bot.on("polling_error", (err) => logger.error({ err }, "Telegram polling error"));

    logger.info("Telegram bot started (polling)");
    return bot;
  } catch (err) {
    logger.error({ err }, "Failed to start Telegram bot");
    return null;
  }
}

export function getBot(): TelegramBot | null { return bot; }
