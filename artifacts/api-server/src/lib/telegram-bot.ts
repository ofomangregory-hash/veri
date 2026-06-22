import TelegramBot, { type InlineKeyboardMarkup, type InlineKeyboardButton, type Message, type InlineQueryResult } from "node-telegram-bot-api";
import { db, usersTable, charactersTable, systemConfigurationsTable, transactionsTable, conversationsTable } from "@workspace/db";
import { eq, sql, count, like, ilike } from "drizzle-orm";
import { logger } from "./logger";
import { generateAIReply } from "./openrouter";
import { generateCharacterAvatar } from "./imageGenerator";
import { createSupabaseCharacter } from "./supabaseCharacters";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Trait { type: string; name: string; description: string }
interface MediaTrigger { keyword: string; url: string; mediaType: "photo" | "video" }

// ── In-memory admin sessions (password-unlocked non-owner admins) ──────────────
const adminSessions = new Set<number>();
const ADMIN_PASSWORD = "ofomangregory";

// ── Pending multi-step states ─────────────────────────────────────────────────
const pendingPhotoFor = new Map<number, string>(); // chatId → characterId (for /setcharphoto)
const pendingBotPhoto = new Set<number>();          // chatIds waiting to set bot photo
const pendingBroadcasts = new Map<number, string>(); // chatId → message (for broadcast preview)

interface CreationState { step: "name" | "bio" | "genre"; name?: string; bio?: string }
const pendingCreation = new Map<number, CreationState>(); // chatId → creation wizard state

// ── Browse carousel session (userId → current index) ─────────────────────────
const browseSession = new Map<number, number>();

// ── Create-companion checkbox wizard ──────────────────────────────────────────
interface CWSession {
  step: "scenes" | "behaviors" | "personalities" | "traits" | "review" | "awaitingName";
  name: string;
  genre: string;
  scenes: number[];
  behaviors: number[];
  personalities: number[];
  traits: number[];
}
const createWizardSessions = new Map<number, CWSession>();

const CW_PRESET_NAMES: { name: string; genre: string }[] = [
  { name: "Nova",      genre: "Modern"   }, { name: "Jade",     genre: "Modern"   }, { name: "Ash",      genre: "Modern"   },
  { name: "Morrigan",  genre: "Gothic"   }, { name: "Raven",    genre: "Gothic"   }, { name: "Vesper",   genre: "Gothic"   },
  { name: "Aelindra",  genre: "Fantasy"  }, { name: "Elowyn",   genre: "Fantasy"  }, { name: "Thalion",  genre: "Fantasy"  },
  { name: "Damien",    genre: "Romance"  }, { name: "Carmilla", genre: "Romance"  }, { name: "Viktor",   genre: "Romance"  },
  { name: "Hikari",    genre: "Anime"    }, { name: "Yuki",     genre: "Anime"    }, { name: "Ren",      genre: "Anime"    },
];

function cwCheckboxKeyboard(
  items: string[],
  selected: number[],
  cbPrefix: string,
  confirmCb: string,
  confirmLabel: string,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    const row: InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + 2, items.length); j++) {
      row.push({ text: `${selected.includes(j) ? "✅" : "⬜"} ${items[j]}`, callback_data: `${cbPrefix}${j}` });
    }
    rows.push(row);
  }
  rows.push([{ text: `✅ ${confirmLabel}`, callback_data: confirmCb }]);
  rows.push([{ text: "❌ Cancel", callback_data: "cw_cancel" }]);
  return { inline_keyboard: rows };
}

// ── Wizard state ──────────────────────────────────────────────────────────────
interface WizardState {
  step: "type" | "name" | "scene" | "behavior" | "personality" | "traits" | "mood" | "review";
  characterType?: string;
  characterName?: string;
  scene?: string;
  behaviors: string[];
  personalities: string[];
  traits: string[];
  moods: string[];
  awaitingText?: "name" | "bio" | "greeting";
  bio?: string;
  greeting?: string;
}
const pendingWizard = new Map<number, WizardState>();

// ── Wizard data ───────────────────────────────────────────────────────────────
const WIZARD_NAMES: Record<string, string[]> = {
  Modern:   ["Nova","Jade","Riley","Skyler","Ash","Devon","Morgan","Sage","Quinn","Blake","Harlow","Remy","Sloane","Avery","Peyton"],
  Gothic:   ["Morrigan","Raven","Shade","Vesper","Theron","Cinder","Draven","Grimm","Isolde","Moira"],
  Elf:      ["Aelindra","Sylvara","Thalion","Elowyn","Nimriel","Lyraniel","Arannis","Caladwen","Faendal","Celebris"],
  Vampire:  ["Damien","Lucrezia","Viktor","Mordecai","Alaric","Dorian","Carmilla","Vladislav","Evangeline","Caspian"],
  Succubus: ["Avara","Zephyrine","Delara","Velvet","Roxane","Mystique","Tempest","Scarlet"],
  Anime:    ["Hikari","Yuki","Ren","Akira","Sora","Hana","Kira","Ryuu","Mika","Zero"],
};
const WIZARD_TYPES = Object.keys(WIZARD_NAMES);
const WIZARD_SCENES = [
  "Moonlit Rooftop","Abandoned Castle","Neon-lit Tokyo Street","Secret Garden",
  "Space Station Observation Deck","Underground Club","Beach at Sunset","Enchanted Forest",
  "Corporate Penthouse","Cyberpunk Alley","Ancient Library","Volcanic Island",
  "Cozy Coffee Shop","Haunted Mansion","Futuristic Lab","Snowy Mountain Cabin",
  "Mystical Shrine","Underwater Palace","Desert Oasis","Dark Carnival",
  // Adult
  "Private Penthouse Suite","Candlelit Boudoir","Secret Dungeon Chamber",
  "Luxury Yacht Cabin","Hot Spring Grotto","Velvet Lounge After Hours",
  "Forbidden Basement Club","Mirrored Dressing Room","Silk-draped Throne Room",
  "Rain-soaked Hotel Room","Secluded Villa Terrace at Midnight",
  "Opulent Bathhouse","Private Members' Lounge","Rooftop Infinity Pool at Night",
  "Shadowy Burlesque Stage",
];
const WIZARD_BEHAVIORS = [
  "Protective","Teasing","Dominant","Submissive","Nurturing","Mysterious","Flirtatious",
  "Stoic","Clingy","Tsundere","Loyal","Cunning","Reckless","Intellectual","Playful",
  "Melancholic","Vengeful","Gentle","Possessive","Carefree","Sadistic","Empathetic",
  "Detached","Charismatic","Rebellious","Perfectionist","Adventurous","Shy","Sarcastic",
  "Idealistic","Pragmatic","Romantic","Competitive","Selfless","Hedonistic",
  // Adult
  "Seductive","Provocative","Lustful","Insatiable","Worship-giving",
  "Corruption-seeking","Pleasure-focused","Intimacy-craving","Boundary-testing",
  "Enticing","Irresistible Tease","Power-hungry Lover","Overstimulating",
  "Primal","Euphoria-chasing",
];
const WIZARD_PERSONALITIES = [
  "Dreamy Idealist","Commander","Witch Archetype","The Rebel","The Caretaker",
  "The Artist","The Trickster","The Scholar","The Warrior","The Lover",
  "The Mystic","The Sage","The Hero","The Shadow","The Innocent",
  "The Explorer","The Ruler","The Magician","The Outlaw","The Jester",
  "The Everyman","The Seducer","The Mentor","The Orphan","The Destroyer",
  "The Creator","The Seeker","Lover-Villain","Dark Empath","Stoic Philosopher",
  "Wild Card","Broken Hearted","The Obsessed","The Liberator","The Mirror",
  // Adult
  "The Temptress","Wicked Sensualist","The Corruptor","Pleasure Architect",
  "The Nymphet","Dark Courtesan","Libertine","The Siren",
  "Master Manipulator of Desire","The Voracious","Enchantress of Flesh",
  "The Dominatrix","Velvet Tyrant","The Devoted Pet","Hunger Incarnate",
];
const WIZARD_TRAITS = [
  "Silver-tongued","Telepathic","Immortal","Shapeshifter","Night Owl",
  "Empath","Combat-trained","Hacker","Pyrokinetic","Healer",
  "Necromancer","Time Traveler","Seer of Futures","Assassin Background","Royal Bloodline",
  "Street Smart","Bookworm","Wanderer","Chef","Musician",
  "Painter","Scientist","Engineer","Dancer","Pilot",
  "Mage","Rogue","Knight","Spy","Rebel Leader",
  "Poet","Philosopher","Guardian","Fallen Angel","Cursed Soul",
  // Adult
  "Seductress","Touch-starved","Temptress","Irresistible","Sensual Artist",
  "Pleasure Seeker","Dominatrix","Submissive Heart","Desire Incarnate","Forbidden Lover",
  "Tantric Master","Exhibitionist","Voyeur","Kink-curious","Master of Seduction",
];
const WIZARD_MOODS = [
  "Smoldering","Playful","Brooding","Yearning","Euphoric","Melancholic","Mischievous",
  "Tender","Fierce","Wistful","Curious","Sultry","Anxious","Serene","Rebellious",
  "Nostalgic","Charged","Vulnerable","Dominant","Lost","Warm","Cold","Haunted",
  "Determined","Flirty","Protective","Dreamy","Urgent","Exhausted","Electric",
  "Sacred","Dangerous","Broken","Hopeful","Magnetic",
  // Adult
  "Lustful","Ravenous","Intoxicated","Feverish","Aching",
  "Possessed","Insatiable","Corrupted","Unraveling","Dripping Desire",
  "Breathless","Obsessed","Conquered","Worshipful","Sinful",
];

function formatWizardList(items: string[], selected: string[]): string {
  return items.map((item, i) =>
    `${selected.includes(item) ? "✅" : `${i + 1}.`} ${item}`
  ).join("\n");
}

function buildWizardPrompt(w: WizardState): string {
  return [
    `You are ${w.characterName}, a ${w.characterType} companion in the Z-Fantasy universe.`,
    w.bio ? `Background: ${w.bio}` : "",
    w.scene ? `Setting: ${w.scene}.` : "",
    w.behaviors.length ? `Core behaviors: ${w.behaviors.join(", ")}.` : "",
    w.personalities.length ? `Personality: ${w.personalities.join(", ")}.` : "",
    w.traits.length ? `Traits: ${w.traits.join(", ")}.` : "",
    w.moods.length ? `Mood: ${w.moods.join(", ")}.` : "",
    w.greeting ? `Opening line: "${w.greeting}"` : "",
    "Stay fully in character at all times.",
  ].filter(Boolean).join("\n\n");
}

let bot: TelegramBot | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────
const HARDCODED_ADMIN_ID = "8704633862";

function isAdmin(msg: Message): boolean {
  const id = msg.from?.id;
  if (!id) return false;
  return String(id) === process.env.ADMIN_TELEGRAM_ID || String(id) === HARDCODED_ADMIN_ID || adminSessions.has(id);
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
  const domain = process.env.APP_DOMAIN ?? process.env.RAILWAY_PUBLIC_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? "z-fantasy.replit.app";
  return `https://${domain}${path}`;
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

  // ── Polling guard: never run long-polling in production ────────────────────
  // Two instances polling the same bot token causes Telegram 409 Conflict.
  // Production (Railway) should use webhooks or a single dedicated worker.
  // Set TELEGRAM_POLLING=true to force polling on in any environment.
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
  const forcePolling = process.env.TELEGRAM_POLLING === "true";
  if (isProduction && !forcePolling) {
    logger.info(
      { NODE_ENV: process.env.NODE_ENV, RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT },
      "Production environment detected — Telegram polling disabled to prevent 409 Conflict. " +
      "Set TELEGRAM_POLLING=true to override."
    );
    return null;
  }

  // ── Load persisted app domain + admin sessions from DB ───────────────────────
  void (async () => {
    try {
      const domainRow = await getConfig("app_domain");
      if (domainRow && typeof domainRow.domain === "string" && domainRow.domain) {
        process.env.APP_DOMAIN = domainRow.domain;
        logger.info({ domain: domainRow.domain }, "App domain loaded from DB config");
      }
    } catch {
      // non-fatal — fall back to env var
    }

    try {
      const rows = await db.select({ key: systemConfigurationsTable.key })
        .from(systemConfigurationsTable)
        .where(like(systemConfigurationsTable.key, "admin_session_%"));
      for (const row of rows) {
        const idStr = row.key.replace("admin_session_", "");
        const id = Number(idStr);
        if (!isNaN(id)) adminSessions.add(id);
      }
      if (rows.length > 0) logger.info({ count: rows.length }, "Persisted admin sessions loaded");
    } catch {
      // non-fatal
    }
  })();

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
      { command: "daily",     description: "Claim your daily +30 tickets & +15 Neon Cards" },
      { command: "create",    description: "Create a new companion (costs 25 Neon Cards)" },
      { command: "inventory", description: "Your created companions" },
      { command: "referral",  description: "Get your referral link" },
      { command: "premium",   description: "Subscribe with Telegram Stars — pick a plan" },
      { command: "upgrade",   description: "View premium plan overview" },
      { command: "browse",    description: "Browse all public companions" },
      { command: "character", description: "View a companion profile: /character [name]" },
      { command: "select",    description: "Switch active companion: /select [name]" },
      { command: "buy",       description: "Buy tickets or Neon Cards with Stars: /buy" },
      { command: "top",       description: "Leaderboard — top users by tickets" },
      { command: "myid",      description: "Show your Telegram user ID" },
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
      { command: "addcards",           description: "Add Neon Cards: /addcards [userID] [amount]" },
      { command: "removecards",        description: "Deduct Neon Cards: /removecards [userID] [amount]" },
      { command: "addtickets",         description: "Add tickets: /addtickets [userID] [amount]" },
      { command: "removetickets",      description: "Deduct tickets: /removetickets [userID] [amount]" },
      { command: "resetuser",          description: "Reset to Free + zero balance: /resetuser [userID]" },
      { command: "setstaff",           description: "Set staff role: /setstaff [userID] | limited_admin|full_admin|remove" },
      { command: "setusername",        description: "Set display name: /setusername [userID] | [name]" },
      { command: "broadcast",          description: "Preview then send to all: /broadcast [message]" },
      { command: "previewbroadcast",   description: "Preview broadcast without sending: /previewbroadcast [msg]" },
      { command: "allcommands",        description: "Show full command reference list" },
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
      { command: "setdomain",           description: "Set app URL domain: /setdomain [domain]" },
      { command: "setwelcome",         description: "Set /start message: /setwelcome [text]" },
      { command: "setdesc",            description: "Set bot description: /setdesc [text]" },
      { command: "setbotphoto",        description: "Set bot profile picture" },
      { command: "addcommand",         description: "Custom command: /addcommand [trigger] | [response]" },
      { command: "createwizard",       description: "Step-by-step character creation wizard" },
      { command: "wizardnames",        description: "List all wizard name options by type" },
      { command: "wizardscenes",       description: "List all available scenes" },
      { command: "wizardbehaviors",    description: "List all behavior options (35)" },
      { command: "wizardpersonalities",description: "List all personality options (35)" },
      { command: "wizardtraits",       description: "List all trait options (35)" },
      { command: "wizardmoods",        description: "List all mood options (35)" },
    ];

    // Set public commands for all users (default scope)
    bot.setMyCommands(publicCommands).catch(err =>
      logger.warn({ err }, "setMyCommands (public) failed")
    );

    // Set full admin commands visible in the admin's chat (env var + hardcoded fallback)
    const adminChatIds = [
      process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null,
      Number(HARDCODED_ADMIN_ID),
    ].filter((id): id is number => id !== null && !isNaN(id));

    for (const chatId of adminChatIds) {
      bot.setMyCommands(adminCommands, {
        scope: { type: "chat", chat_id: chatId },
      }).catch(err => logger.warn({ err, chatId }, "setMyCommands (admin chat) failed"));
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
        const isAdminUser = (userId === adminId || userId === HARDCODED_ADMIN_ID) || adminSessions.has(msg.from?.id ?? 0);

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
        const isAdminUser = (userId === adminId || userId === HARDCODED_ADMIN_ID) || adminSessions.has(msg.from?.id ?? 0);
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

      const markup: InlineKeyboardMarkup = {
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
    //  PUBLIC: /browse — single-card carousel with ◀ / ▶ navigation
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/browse/, async (msg) => {
      const chatId = msg.chat.id;
      await syncUser(String(msg.from?.id), msg.from?.username);

      const characters = await db.select().from(charactersTable)
        .where(eq(charactersTable.visibility, "public"));

      if (!characters.length) {
        await bot!.sendMessage(chatId, "No public companions available yet 💜");
        return;
      }

      browseSession.set(chatId, 0);
      const char = characters[0]!;
      const caption = `✨ *${char.name}* _(${char.genre})_\n${char.teaserDescription ?? ""}\n\n_Card 1 of ${characters.length}_`;
      const markup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: "◀ Previous", callback_data: "browse_prev" },
            { text: "Next ▶", callback_data: "browse_next" },
          ],
          [
            { text: "💬 Chat Now", callback_data: `chat_${char.characterId}` },
            { text: "🌐 Open App", web_app: { url: appUrl(`/chat/${char.characterId}`) } },
          ],
        ],
      };

      try {
        if (char.avatarUrl) {
          await bot!.sendPhoto(chatId, char.avatarUrl, { caption, parse_mode: "Markdown", reply_markup: markup });
        } else {
          await bot!.sendMessage(chatId, caption, { parse_mode: "Markdown", reply_markup: markup });
        }
      } catch {
        await bot!.sendMessage(chatId, caption, { parse_mode: "Markdown", reply_markup: markup });
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
      const claimLine = canClaim ? "✅ Daily rewards ready — /daily" : `⏳ Next claim: ${nextClaim!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

      // Fetch conversation stats
      const convRows = await db.select().from(conversationsTable).where(eq(conversationsTable.userId, userId));
      const totalConvs = convRows.length;
      const totalMessages = convRows.reduce((sum, c) => {
        const history = (c.messageHistory as Array<{ role: string }>) ?? [];
        return sum + history.filter(m => m.role === "user").length;
      }, 0);
      const activeConv = user.activeCharacterId
        ? convRows.find(c => c.characterId === user.activeCharacterId)
        : null;
      const activeAP = activeConv?.affectionPoints ?? 0;
      const apLevel = activeAP >= 300 ? "💜 Devoted" : activeAP >= 150 ? "❤️ Warm" : activeAP >= 50 ? "🤍 Friendly" : "💙 New";

      await bot!.sendMessage(chatId, [
        `👤 *Your Profile*`, ``,
        `🏷 Name: @${user.username ?? "—"}${user.customNickname ? ` _(${user.customNickname})_` : ""}`,
        `${tierEmoji[user.subscriptionTier] ?? "💎"} Tier: *${user.subscriptionTier}*`,
        ``,
        `💰 *Wallet*`,
        `🎟 Tickets: *${user.ticketBalance.toLocaleString()}*`,
        `🃏 Neon Cards: *${user.neonCardBalance.toLocaleString()}*`,
        ``,
        `🤖 *Companion*`,
        `Active: *${activeCharName}*`,
        activeConv ? `Affection: *${activeAP} AP* — ${apLevel}` : ``,
        ``,
        `📊 *Stats*`,
        `💬 Total messages sent: *${totalMessages.toLocaleString()}*`,
        `🎭 Companions chatted: *${totalConvs}*`,
        `🎨 Characters created: *${user.weeklyCreationsCount}* this week`,
        ``,
        claimLine,
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
          await bot!.sendMessage(chatId, `⏳ Already claimed today!\n\nCome back in *${hrs}h ${mins}m* for your next rewards.`, { parse_mode: "Markdown" });
          return;
        }
      }

      const DAILY_TICKETS = 30;
      const DAILY_NC = 15;

      await db.update(usersTable).set({
        ticketBalance: sql`ticket_balance + ${DAILY_TICKETS}`,
        neonCardBalance: sql`neon_card_balance + ${DAILY_NC}`,
        lastDailyClaim: now,
      }).where(eq(usersTable.id, userId));

      await db.insert(transactionsTable).values({
        telegramId: userId,
        actionType: "daily_claim",
        ticketAmount: DAILY_TICKETS,
      });

      await bot!.sendMessage(chatId,
        `🎁 *Daily Reward Claimed!*\n\n🎟 *+${DAILY_TICKETS} Tickets* added\n🃏 *+${DAILY_NC} Neon Cards* added\n\nNew balance: *${(user.ticketBalance ?? 0) + DAILY_TICKETS}* 🎟  |  *${(user.neonCardBalance ?? 0) + DAILY_NC}* 🃏\n\nCome back tomorrow for more!`,
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
        `💎 *Z-Fantasy Premium*`,
        ``,
        `🥉 *Bronze* — Unlimited messages · 150 Neon Tickets on activation`,
        `🥈 *Silver* — Priority AI · 350 Neon Tickets on activation`,
        `🥇 *Gold* — All features · 9999 balance cap · 600 Neon Tickets`,
        ``,
        `Select a tier to see pricing options:`,
      ].join("\n"), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🥉 Bronze",  callback_data: "premium_tier_Bronze" }],
            [{ text: "🥈 Silver",  callback_data: "premium_tier_Silver" }],
            [{ text: "🥇 Gold",    callback_data: "premium_tier_Gold"   }],
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
    //  PUBLIC: /create & /createcharacter — checkbox wizard
    //  Costs 25 Neon Cards · Max 3 slots · Admin immune
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/^\/(create|createcharacter)$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id);
      await syncUser(userId, msg.from?.username);

      const adminId = process.env.ADMIN_TELEGRAM_ID;
      const isAdminUser = (userId === adminId || userId === HARDCODED_ADMIN_ID) || adminSessions.has(msg.from?.id ?? 0);

      if (!isAdminUser) {
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (!user) { await bot!.sendMessage(chatId, "❌ Try /start first."); return; }

        const [slotRow] = await db.select({ c: count() }).from(charactersTable)
          .where(eq(charactersTable.creatorId, userId));
        if (Number(slotRow?.c ?? 0) >= 3) {
          await bot!.sendMessage(chatId,
            `❌ *Maximum 3 companion slots reached.*\n\nDelete an existing companion in the app to free up a slot.`,
            { parse_mode: "Markdown" });
          return;
        }

        if ((user.neonCardBalance ?? 0) < 25) {
          await bot!.sendMessage(chatId,
            `❌ *Insufficient Neon Cards.*\n\nCharacter creation costs *25 🃏 Neon Cards*.\nYour balance: *${user.neonCardBalance ?? 0}* 🃏\n\nVisit /premium to purchase more.`,
            { parse_mode: "Markdown" });
          return;
        }
      }

      createWizardSessions.set(chatId, { step: "awaitingName", name: "", genre: "Modern", scenes: [], behaviors: [], personalities: [], traits: [] });

      const nameButtons = [
        ...chunk(CW_PRESET_NAMES.map((n, i) => ({ text: n.name, callback_data: `cw_name_${i}` })), 3),
        [{ text: "✏️ Type a Custom Name", callback_data: "cw_name_custom" }],
        [{ text: "❌ Cancel", callback_data: "cw_cancel" }],
      ];

      await bot!.sendMessage(chatId,
        `🎨 *Create Your Companion*\n\n*Step 1 — Choose a Name*\nPick a preset or type your own:\n\n_Costs 25 🃏 Neon Cards · Up to 3 companions_`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: nameButtons } });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /myid — returns the sender's Telegram ID (no admin check)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/myid$/, async (msg) => {
      const id = msg.from?.id;
      const username = msg.from?.username ? `@${msg.from.username}` : "—";
      await bot!.sendMessage(msg.chat.id,
        `🆔 *Your Telegram ID*\n\n\`${id}\`\n\nUsername: ${username}`,
        { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PUBLIC: /top — leaderboard of top 10 users by ticket balance
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/top$/, async (msg) => {
      const topUsers = await db.select({
        id: usersTable.id,
        username: usersTable.username,
        customNickname: usersTable.customNickname,
        ticketBalance: usersTable.ticketBalance,
        subscriptionTier: usersTable.subscriptionTier,
      }).from(usersTable)
        .orderBy(sql`ticket_balance DESC`)
        .limit(10);

      if (!topUsers.length) {
        await bot!.sendMessage(msg.chat.id, "No users found yet.");
        return;
      }

      const medals = ["🥇", "🥈", "🥉"];
      const lines = topUsers.map((u, i) => {
        const rank = medals[i] ?? `${i + 1}.`;
        const name = u.customNickname ?? (u.username ? `@${u.username}` : `User ${u.id}`);
        const tierIcon = u.subscriptionTier === "Gold" ? "👑" : u.subscriptionTier === "Silver" ? "💎" : u.subscriptionTier === "Bronze" ? "🔷" : "";
        return `${rank} ${tierIcon}${name} — 🎟 *${u.ticketBalance}*`;
      });

      await bot!.sendMessage(msg.chat.id,
        `🏆 *Z\\-Fantasy Leaderboard*\n\n${lines.join("\n")}`,
        { parse_mode: "MarkdownV2" });
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
    //  ADMIN: /addcards /removecards /addtickets /removetickets
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/addcards (\S+) (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, targetId, amtStr] = match ?? [];
      const amt = parseInt(amtStr ?? "", 10);
      if (!targetId || isNaN(amt) || amt <= 0) {
        await bot!.sendMessage(msg.chat.id, "Usage: /addcards [userID] [amount]");
        return;
      }
      await db.update(usersTable).set({ neonCardBalance: sql`neon_card_balance + ${amt}` }).where(eq(usersTable.id, targetId));
      await db.insert(transactionsTable).values({ telegramId: targetId, actionType: "admin_addcards", ticketAmount: amt });
      await bot!.sendMessage(msg.chat.id, `✅ Added *${amt}* 🃏 Neon Cards to \`${targetId}\``, { parse_mode: "Markdown" });
    });

    bot.onText(/\/removecards (\S+) (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, targetId, amtStr] = match ?? [];
      const amt = parseInt(amtStr ?? "", 10);
      if (!targetId || isNaN(amt) || amt <= 0) {
        await bot!.sendMessage(msg.chat.id, "Usage: /removecards [userID] [amount]");
        return;
      }
      await db.update(usersTable).set({ neonCardBalance: sql`GREATEST(neon_card_balance - ${amt}, 0)` }).where(eq(usersTable.id, targetId));
      await db.insert(transactionsTable).values({ telegramId: targetId, actionType: "admin_removecards", ticketAmount: -amt });
      await bot!.sendMessage(msg.chat.id, `✅ Deducted *${amt}* 🃏 Neon Cards from \`${targetId}\``, { parse_mode: "Markdown" });
    });

    bot.onText(/\/addtickets (\S+) (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, targetId, amtStr] = match ?? [];
      const amt = parseInt(amtStr ?? "", 10);
      if (!targetId || isNaN(amt) || amt <= 0) {
        await bot!.sendMessage(msg.chat.id, "Usage: /addtickets [userID] [amount]");
        return;
      }
      await db.update(usersTable).set({ ticketBalance: sql`ticket_balance + ${amt}` }).where(eq(usersTable.id, targetId));
      await db.insert(transactionsTable).values({ telegramId: targetId, actionType: "admin_addtickets", ticketAmount: amt });
      await bot!.sendMessage(msg.chat.id, `✅ Added *${amt}* 🎟 tickets to \`${targetId}\``, { parse_mode: "Markdown" });
    });

    bot.onText(/\/removetickets (\S+) (\S+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const [, targetId, amtStr] = match ?? [];
      const amt = parseInt(amtStr ?? "", 10);
      if (!targetId || isNaN(amt) || amt <= 0) {
        await bot!.sendMessage(msg.chat.id, "Usage: /removetickets [userID] [amount]");
        return;
      }
      await db.update(usersTable).set({ ticketBalance: sql`GREATEST(ticket_balance - ${amt}, 0)` }).where(eq(usersTable.id, targetId));
      await db.insert(transactionsTable).values({ telegramId: targetId, actionType: "admin_removetickets", ticketAmount: -amt });
      await bot!.sendMessage(msg.chat.id, `✅ Deducted *${amt}* 🎟 tickets from \`${targetId}\``, { parse_mode: "Markdown" });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /allcommands — full command reference for admin
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/allcommands$/, async (msg) => {
      if (!isAdmin(msg)) return;
      const lines = [
        `📋 *Full Command Reference*\n`,
        `*— PUBLIC COMMANDS —*`,
        `/start — Welcome + Open App button`,
        `/profile — Your stats: tier, tickets, Neon Cards`,
        `/daily — Claim daily +30 tickets & +15 Neon Cards`,
        `/buy — Shop: buy tickets or Neon Cards with Stars`,
        `/create — Create a companion (25 Neon Cards)`,
        `/inventory — Your created companions`,
        `/select [name] — Switch active companion`,
        `/character [name] — View companion profile`,
        `/browse — Browse all public companions`,
        `/referral — Your referral link`,
        `/premium — Subscribe with Telegram Stars`,
        `/upgrade — View plan overview`,
        `/commands — Show public command list`,
        ``,
        `*— ADMIN / USER MANAGEMENT —*`,
        `/stats — Dashboard: users, premium, characters`,
        `/listusers — All registered users`,
        `/searchuser [query] — Search by username`,
        `/whois [userID] — Full profile card`,
        `/givetickets [userID] [amount] — Add/deduct tickets`,
        `/addtickets [userID] [amount] — Add tickets`,
        `/removetickets [userID] [amount] — Deduct tickets`,
        `/addcards [userID] [amount] — Add Neon Cards`,
        `/removecards [userID] [amount] — Deduct Neon Cards`,
        `/addpremium [userID] [days/lifetime] — Grant premium`,
        `/removepremium [userID] — Remove premium`,
        `/resetuser [userID] — Reset to Free + zero balance`,
        `/setstaff [userID] | limited_admin|full_admin|remove`,
        `/setusername [userID] | [name] — Set display name`,
        ``,
        `*— BROADCAST —*`,
        `/broadcast [message] — Preview then send to all users`,
        `/previewbroadcast [message] — Preview only (no send)`,
        ``,
        `*— CHARACTER MANAGEMENT —*`,
        `/listall — All characters with visibility`,
        `/configall — Inline character config menu`,
        `/configurecharacter [name] — Full config dashboard`,
        `/createcharacter [name] | true/false | [backstory]`,
        `/setvisibility [name] | public/private`,
        `/deletecharacter [name]`,
        `/renamechar [old] | [new] — Rename display name`,
        `/renamecharacter [old] | [new] — Rename + update prompt`,
        `/setprompt [name] [prompt] — Set system prompt`,
        `/settagline [name] | [tagline]`,
        `/setgreeting [name] | [message]`,
        `/bulkgreeting [n1,n2] | [msg]`,
        `/setcharphoto [name] — Set avatar (send photo after)`,
        `/addcustomtrait mood|tone | [CharName] | [desc]`,
        `/viewtraits [name]`,
        `/resettraits [name]`,
        `/addphoto [CharName] [keyword] — Link photo trigger`,
        `/addvideo [CharName] [keyword] — Link video trigger`,
        ``,
        `*— BOT CONFIGURATION —*`,
        `/setdomain [domain] — Update mini-app URL`,
        `/setwelcome [text] — Set /start message`,
        `/setdesc [text] — Set bot Telegram description`,
        `/setbotphoto — Set bot profile picture`,
        `/addcommand [trigger] | [response] — Custom command`,
        ``,
        `*— CHARACTER WIZARD —*`,
        `/createwizard — Step-by-step creation wizard`,
        `/wizardnames — All name options by type`,
        `/wizardscenes — All available scenes`,
        `/wizardbehaviors — Behavior options (35)`,
        `/wizardpersonalities — Personality options (35)`,
        `/wizardtraits — Trait options (35)`,
        `/wizardmoods — Mood options (35)`,
      ];
      await bot!.sendMessage(msg.chat.id, lines.join("\n"), { parse_mode: "Markdown" });
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
      const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
      const count = Number(totalUsers[0]?.count ?? 0);

      // Store pending and show preview with confirm/cancel
      pendingBroadcasts.set(msg.chat.id, text);
      await bot!.sendMessage(msg.chat.id,
        `📣 *Broadcast Preview* — will reach *${count}* users:\n\n━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━\n\nConfirm to send?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Send Now", callback_data: "broadcast_confirm" },
              { text: "❌ Cancel",   callback_data: "broadcast_cancel"  },
            ]],
          },
        }
      );
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /previewbroadcast — preview only, no send
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/previewbroadcast (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const text = match?.[1]?.trim();
      if (!text) return;
      await bot!.sendMessage(msg.chat.id,
        `👁 *Preview Only* (not sent):\n\n━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━`,
        { parse_mode: "Markdown" }
      );
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /setdomain [domain] — update the mini-app URL used in all buttons
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/setdomain (.+)/, async (msg, match) => {
      if (!isAdmin(msg)) return;
      const raw = match?.[1]?.trim();
      if (!raw) {
        await bot!.sendMessage(msg.chat.id,
          `📡 *Current app domain:*\n\`${process.env.APP_DOMAIN ?? "not set"}\`\n\nTo update: \`/setdomain example.up.railway.app\``,
          { parse_mode: "Markdown" });
        return;
      }
      // Strip https:// or http:// if user included it
      const domain = raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      process.env.APP_DOMAIN = domain;
      await upsertConfig("app_domain", { domain });
      await bot!.sendMessage(msg.chat.id,
        `✅ *App domain updated!*\n\nAll bot buttons now point to:\n\`https://${domain}\``,
        { parse_mode: "Markdown" });
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
      const visibility1 = visStr === "true" ? "public" : "private";
      const systemPrompt1 = `You are ${name}, an AI companion. ${backstory}`;
      const creatorId1 = String(msg.from?.id);
      const [pgChar1] = await db.insert(charactersTable).values({
        name, visibility: visibility1,
        teaserDescription: backstory, genre: "General",
        systemPrompt: systemPrompt1,
        creatorId: creatorId1,
      }).returning({ characterId: charactersTable.characterId });
      createSupabaseCharacter({
        characterId: pgChar1.characterId,
        creatorId: creatorId1, name, visibility: visibility1,
        systemPrompt: systemPrompt1, teaserDescription: backstory,
      }).catch(err => logger.warn({ err }, "bot /createcharacter: Supabase mirror failed"));
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
    //  PUBLIC: /buy — purchase tickets or Neon Cards
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/buy$/, async (msg) => {
      const chatId = msg.chat.id;
      await bot!.sendMessage(chatId,
        `🛒 *Z-Fantasy Shop*\n\nChoose what you'd like to buy:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🎟 Buy Tickets", callback_data: "shop:tickets" },
                { text: "🃏 Buy Neon Cards", callback_data: "shop:neon" },
              ],
            ],
          },
        }
      );
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

      // ── Broadcast confirm / cancel ────────────────────────────────────────
      if (query.data === "broadcast_confirm" || query.data === "broadcast_cancel") {
        if (!isAdmin({ from: query.from } as Message)) {
          await bot!.answerCallbackQuery(query.id, { text: "Not authorized" });
          return;
        }
        const pending = pendingBroadcasts.get(chatId);
        pendingBroadcasts.delete(chatId);

        if (query.data === "broadcast_cancel" || !pending) {
          await bot!.editMessageText("❌ Broadcast cancelled.", {
            chat_id: chatId, message_id: query.message?.message_id,
          });
          return;
        }

        // Actually send
        const users = await db.select({ id: usersTable.id }).from(usersTable);
        let sent = 0, failed = 0;
        for (const u of users) {
          try { await bot!.sendMessage(u.id, pending); sent++; } catch { failed++; }
        }
        await bot!.editMessageText(`📢 Done — ✅ ${sent} sent, ❌ ${failed} failed`, {
          chat_id: chatId, message_id: query.message?.message_id,
        });
        return;
      }

      // ── Shop: buy tickets / neon cards ───────────────────────────────────
      if (query.data === "shop:tickets") {
        await bot!.editMessageText(
          `🎟 *Buy Tickets*\n\nRate: 3 tickets per ⭐ Star\n\n` +
          `• Starter — 300 tickets = 100 ⭐\n` +
          `• Booster — 900 tickets = 300 ⭐ _(+100 bonus)_\n` +
          `• Mega — 2 100 tickets = 700 ⭐ _(+300 bonus)_\n` +
          `• Custom — type any amount in app\n\n` +
          `Open the app to complete purchase:`,
          {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🎟 Buy Tickets in App", web_app: { url: appUrl("/premium") } }],
                [{ text: "◀ Back", callback_data: "shop:main" }],
              ],
            },
          }
        );
        return;
      }

      if (query.data === "shop:neon") {
        await bot!.editMessageText(
          `🃏 *Buy Neon Cards*\n\nRate: 2 cards per ⭐ Star\n\n` +
          `• Starter — 100 cards = 200 ⭐\n` +
          `• Booster — 270 cards = 450 ⭐ _(+20 bonus)_\n` +
          `• Mega — 550 cards = 950 ⭐ _(+50 bonus)_\n` +
          `• Custom — any amount\n\n` +
          `Open the app to complete purchase:`,
          {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🃏 Buy Neon Cards in App", web_app: { url: appUrl("/premium") } }],
                [{ text: "◀ Back", callback_data: "shop:main" }],
              ],
            },
          }
        );
        return;
      }

      if (query.data === "shop:main") {
        await bot!.editMessageText(
          `🛒 *Z-Fantasy Shop*\n\nChoose what you'd like to buy:`,
          {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[
                { text: "🎟 Buy Tickets",    callback_data: "shop:tickets" },
                { text: "🃏 Buy Neon Cards", callback_data: "shop:neon"    },
              ]],
            },
          }
        );
        return;
      }

      // ── Browse carousel navigation ─────────────────────────────────────────
      if (query.data === "browse_prev" || query.data === "browse_next") {
        const characters = await db.select().from(charactersTable)
          .where(eq(charactersTable.visibility, "public"));

        if (!characters.length) {
          await bot!.answerCallbackQuery(query.id, { text: "No companions available" });
          return;
        }

        const current = browseSession.get(chatId) ?? 0;
        let next: number;
        if (query.data === "browse_next") {
          next = (current + 1) % characters.length;
        } else {
          next = (current - 1 + characters.length) % characters.length;
        }
        browseSession.set(chatId, next);

        const char = characters[next]!;
        const caption = `✨ *${char.name}* _(${char.genre})_\n${char.teaserDescription ?? ""}\n\n_Card ${next + 1} of ${characters.length}_`;
        const markup: InlineKeyboardMarkup = {
          inline_keyboard: [
            [
              { text: "◀ Previous", callback_data: "browse_prev" },
              { text: "Next ▶", callback_data: "browse_next" },
            ],
            [
              { text: "💬 Chat Now", callback_data: `chat_${char.characterId}` },
              { text: "🌐 Open App", web_app: { url: appUrl(`/chat/${char.characterId}`) } },
            ],
          ],
        };

        try {
          if (char.avatarUrl && (query.message as Message | undefined)?.photo) {
            await (bot as unknown as {
              editMessageMedia: (media: object, options: object) => Promise<unknown>
            }).editMessageMedia(
              { type: "photo", media: char.avatarUrl, caption, parse_mode: "Markdown" },
              { chat_id: chatId, message_id: query.message?.message_id, reply_markup: markup }
            );
          } else {
            await bot!.editMessageText(caption, {
              chat_id: chatId,
              message_id: query.message?.message_id,
              parse_mode: "Markdown",
              reply_markup: markup,
            });
          }
        } catch {
          // If edit fails (e.g. content unchanged), silently ignore
        }
        return;
      }

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

      if (query.data?.startsWith("premium_tier_")) {
        const tier = query.data.replace("premium_tier_", "");
        const tierEmoji: Record<string, string> = { Bronze: "🥉", Silver: "🥈", Gold: "🥇" };
        const tierPrices: Record<string, { weekly: number; monthly: number; yearly: number }> = {
          Bronze: { weekly: 100,  monthly: 300,   yearly: 3000  },
          Silver: { weekly: 200,  monthly: 600,   yearly: 6000  },
          Gold:   { weekly: 350,  monthly: 1050,  yearly: 10500 },
        };
        const prices = tierPrices[tier];
        if (!prices) return;
        const emoji = tierEmoji[tier] ?? "💎";
        try {
          await bot!.editMessageText(
            `${emoji} *${tier} Plan — Choose a billing period:*\n\n💡 Yearly saves ~2 months vs monthly.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: `Weekly   ${prices.weekly} ⭐`,  callback_data: `premium_plan_${tier}_weekly`  }],
                  [{ text: `Monthly  ${prices.monthly} ⭐`, callback_data: `premium_plan_${tier}_monthly` }],
                  [{ text: `Yearly   ${prices.yearly} ⭐`,  callback_data: `premium_plan_${tier}_yearly`  }],
                  [{ text: "◀ Back to tiers", callback_data: "premium_back_tiers" }],
                ],
              },
            }
          );
        } catch (err) { logger.warn({ err }, "editMessageText failed"); }
        return;
      }

      if (query.data === "premium_back_tiers") {
        try {
          await bot!.editMessageText(
            `💎 *Z-Fantasy Premium*\n\n🥉 *Bronze* — Unlimited messages · 150 Neon Tickets\n🥈 *Silver* — Priority AI · 350 Neon Tickets\n🥇 *Gold* — All features · 600 Neon Tickets\n\nSelect a tier to see pricing options:`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🥉 Bronze", callback_data: "premium_tier_Bronze" }],
                  [{ text: "🥈 Silver", callback_data: "premium_tier_Silver" }],
                  [{ text: "🥇 Gold",   callback_data: "premium_tier_Gold"   }],
                ],
              },
            }
          );
        } catch (err) { logger.warn({ err }, "editMessageText failed"); }
        return;
      }

      if (query.data?.startsWith("premium_plan_")) {
        const parts = query.data.replace("premium_plan_", "").split("_");
        const tier = parts[0];
        const period = parts[1];

        const PRICES: Record<string, Record<string, { stars: number; label: string }>> = {
          Bronze: { weekly: { stars: 100, label: "Bronze Weekly" }, monthly: { stars: 300, label: "Bronze Monthly" }, yearly: { stars: 3000, label: "Bronze Yearly" } },
          Silver: { weekly: { stars: 200, label: "Silver Weekly" }, monthly: { stars: 600, label: "Silver Monthly" }, yearly: { stars: 6000, label: "Silver Yearly" } },
          Gold:   { weekly: { stars: 350, label: "Gold Weekly"   }, monthly: { stars: 1050, label: "Gold Monthly"  }, yearly: { stars: 10500, label: "Gold Yearly" } },
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
        if (!user || (user.neonCardBalance ?? 0) < 25) {
          await bot!.sendMessage(chatId, "❌ Insufficient Neon Cards. Creation cancelled. You need 25 🃏 Neon Cards.");
          return;
        }

        const systemPrompt = `You are ${state.name}, an AI companion. ${state.bio}`;
        const botCharSeed = String(Math.floor(Math.random() * 9000000000) + 1000000000);
        let botAvatarUrl: string | undefined;
        try {
          botAvatarUrl = await generateCharacterAvatar({ characterName: state.name, genre, teaserDescription: state.bio.slice(0, 100), imageSeed: botCharSeed });
        } catch { botAvatarUrl = undefined; }
        const [newChar] = await db.insert(charactersTable).values({
          name: state.name,
          genre,
          visibility: "private",
          teaserDescription: state.bio.slice(0, 100),
          systemPrompt,
          initialGreeting: `Hey 💜 I'm ${state.name}. ${state.bio.slice(0, 80)}…`,
          creatorId: userId,
          imageSeed: botCharSeed,
          avatarUrl: botAvatarUrl,
        }).returning({ characterId: charactersTable.characterId, name: charactersTable.name });

        createSupabaseCharacter({
          characterId: newChar.characterId,
          creatorId: userId, name: state.name, visibility: "private",
          systemPrompt, teaserDescription: state.bio.slice(0, 100),
          initialGreeting: `Hey 💜 I'm ${state.name}. ${state.bio.slice(0, 80)}…`,
          avatarUrl: botAvatarUrl ?? null, imageSeed: botCharSeed,
        }).catch(err => logger.warn({ err }, "bot wizard: Supabase mirror failed"));

        await db.update(usersTable).set({
          neonCardBalance: sql`neon_card_balance - 25`,
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

      // ── Checkbox create-companion wizard callbacks (cw_*) ────────────────────
      if (query.data === "cw_cancel" || query.data?.startsWith("cw_")) {
        const cwUserId = String(query.from.id);
        const cwAdminId = process.env.ADMIN_TELEGRAM_ID;
        const isCWAdmin = cwUserId === cwAdminId || adminSessions.has(query.from.id);

        if (query.data === "cw_cancel") {
          createWizardSessions.delete(chatId);
          await bot!.editMessageText("❌ Companion creation cancelled.", {
            chat_id: chatId, message_id: query.message?.message_id,
          }).catch(() => bot!.sendMessage(chatId, "❌ Companion creation cancelled."));
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        const cwSession = createWizardSessions.get(chatId);
        if (!cwSession) {
          await bot!.answerCallbackQuery(query.id, { text: "Session expired — use /createcharacter to start again.", show_alert: true });
          return;
        }

        const d = query.data!;

        // ── Preset name selection ──
        if (d.startsWith("cw_name_")) {
          const raw = d.replace("cw_name_", "");
          if (raw === "custom") {
            cwSession.step = "awaitingName";
            createWizardSessions.set(chatId, cwSession);
            await bot!.editMessageText("✏️ *Type your companion's name:*\n_(2–40 characters)_", {
              chat_id: chatId, message_id: query.message?.message_id, parse_mode: "Markdown",
            }).catch(() => bot!.sendMessage(chatId, "✏️ Type your companion's name (2–40 chars):"));
            await bot!.answerCallbackQuery(query.id);
            return;
          }
          const nameIdx = parseInt(raw, 10);
          const preset = CW_PRESET_NAMES[nameIdx];
          if (!preset) { await bot!.answerCallbackQuery(query.id); return; }
          cwSession.name = preset.name;
          cwSession.genre = preset.genre;
          cwSession.step = "scenes";
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_SCENES, cwSession.scenes, "cw_sc_", "cw_sc_ok", "Confirm Scenes");
          await bot!.sendMessage(chatId,
            `✅ Name: *${cwSession.name}* _(${cwSession.genre})_\n\n*Step 2 — Scenes* (choose up to 5)\nTap to toggle, then confirm:`,
            { parse_mode: "Markdown", reply_markup: kbd });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Scene toggle ──
        if (d.startsWith("cw_sc_") && d !== "cw_sc_ok") {
          const idx = parseInt(d.replace("cw_sc_", ""), 10);
          if (cwSession.scenes.includes(idx)) {
            cwSession.scenes = cwSession.scenes.filter(i => i !== idx);
          } else if (cwSession.scenes.length >= 5) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Maximum 5 scenes — deselect one first.", show_alert: true });
            return;
          } else {
            cwSession.scenes.push(idx);
          }
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_SCENES, cwSession.scenes, "cw_sc_", "cw_sc_ok", "Confirm Scenes");
          await bot!.editMessageReplyMarkup(kbd, { chat_id: chatId, message_id: query.message?.message_id });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Scene confirm ──
        if (d === "cw_sc_ok") {
          if (cwSession.scenes.length === 0) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Select at least 1 scene.", show_alert: true });
            return;
          }
          cwSession.step = "behaviors";
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_BEHAVIORS, cwSession.behaviors, "cw_bh_", "cw_bh_ok", "Confirm Behaviors");
          await bot!.sendMessage(chatId,
            `✅ Scenes: ${cwSession.scenes.map(i => WIZARD_SCENES[i]).join(", ")}\n\n*Step 3 — Behaviors* (choose up to 7):`,
            { parse_mode: "Markdown", reply_markup: kbd });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Behavior toggle ──
        if (d.startsWith("cw_bh_") && d !== "cw_bh_ok") {
          const idx = parseInt(d.replace("cw_bh_", ""), 10);
          if (cwSession.behaviors.includes(idx)) {
            cwSession.behaviors = cwSession.behaviors.filter(i => i !== idx);
          } else if (cwSession.behaviors.length >= 7) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Maximum 7 behaviors — deselect one first.", show_alert: true });
            return;
          } else {
            cwSession.behaviors.push(idx);
          }
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_BEHAVIORS, cwSession.behaviors, "cw_bh_", "cw_bh_ok", "Confirm Behaviors");
          await bot!.editMessageReplyMarkup(kbd, { chat_id: chatId, message_id: query.message?.message_id });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Behavior confirm ──
        if (d === "cw_bh_ok") {
          if (cwSession.behaviors.length === 0) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Select at least 1 behavior.", show_alert: true });
            return;
          }
          cwSession.step = "personalities";
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_PERSONALITIES, cwSession.personalities, "cw_pe_", "cw_pe_ok", "Confirm Personalities");
          await bot!.sendMessage(chatId,
            `✅ Behaviors set!\n\n*Step 4 — Personalities* (choose up to 3):`,
            { parse_mode: "Markdown", reply_markup: kbd });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Personality toggle ──
        if (d.startsWith("cw_pe_") && d !== "cw_pe_ok") {
          const idx = parseInt(d.replace("cw_pe_", ""), 10);
          if (cwSession.personalities.includes(idx)) {
            cwSession.personalities = cwSession.personalities.filter(i => i !== idx);
          } else if (cwSession.personalities.length >= 3) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Maximum 3 personalities — deselect one first.", show_alert: true });
            return;
          } else {
            cwSession.personalities.push(idx);
          }
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_PERSONALITIES, cwSession.personalities, "cw_pe_", "cw_pe_ok", "Confirm Personalities");
          await bot!.editMessageReplyMarkup(kbd, { chat_id: chatId, message_id: query.message?.message_id });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Personality confirm ──
        if (d === "cw_pe_ok") {
          if (cwSession.personalities.length === 0) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Select at least 1 personality.", show_alert: true });
            return;
          }
          cwSession.step = "traits";
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_TRAITS, cwSession.traits, "cw_tr_", "cw_tr_ok", "Confirm Traits");
          await bot!.sendMessage(chatId,
            `✅ Personalities set!\n\n*Step 5 — Traits* (choose up to 7):`,
            { parse_mode: "Markdown", reply_markup: kbd });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Trait toggle ──
        if (d.startsWith("cw_tr_") && d !== "cw_tr_ok") {
          const idx = parseInt(d.replace("cw_tr_", ""), 10);
          if (cwSession.traits.includes(idx)) {
            cwSession.traits = cwSession.traits.filter(i => i !== idx);
          } else if (cwSession.traits.length >= 7) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Maximum 7 traits — deselect one first.", show_alert: true });
            return;
          } else {
            cwSession.traits.push(idx);
          }
          createWizardSessions.set(chatId, cwSession);
          const kbd = cwCheckboxKeyboard(WIZARD_TRAITS, cwSession.traits, "cw_tr_", "cw_tr_ok", "Confirm Traits");
          await bot!.editMessageReplyMarkup(kbd, { chat_id: chatId, message_id: query.message?.message_id });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Trait confirm → Review ──
        if (d === "cw_tr_ok") {
          if (cwSession.traits.length === 0) {
            await bot!.answerCallbackQuery(query.id, { text: "⚠️ Select at least 1 trait.", show_alert: true });
            return;
          }
          cwSession.step = "review";
          createWizardSessions.set(chatId, cwSession);
          const scenesText   = cwSession.scenes.map(i => WIZARD_SCENES[i]).join(", ");
          const bhText       = cwSession.behaviors.map(i => WIZARD_BEHAVIORS[i]).join(", ");
          const peText       = cwSession.personalities.map(i => WIZARD_PERSONALITIES[i]).join(", ");
          const trText       = cwSession.traits.map(i => WIZARD_TRAITS[i]).join(", ");
          await bot!.sendMessage(chatId, [
            `🎭 *Review Your Companion*`, ``,
            `👤 *Name:* ${cwSession.name} _(${cwSession.genre})_`,
            `🌍 *Scenes:* ${scenesText}`,
            `⚡ *Behaviors:* ${bhText}`,
            `🎭 *Personalities:* ${peText}`,
            `✨ *Traits:* ${trText}`,
            ``,
            `_This will cost 25 🃏 Neon Cards._`,
          ].join("\n"), {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [
              [{ text: "✨ Create Companion", callback_data: "cw_create" }],
              [{ text: "❌ Cancel",           callback_data: "cw_cancel" }],
            ]},
          });
          await bot!.answerCallbackQuery(query.id);
          return;
        }

        // ── Final create ──
        if (d === "cw_create") {
          const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, cwUserId));
          if (!freshUser) { await bot!.answerCallbackQuery(query.id, { text: "❌ User not found.", show_alert: true }); return; }

          if (!isCWAdmin) {
            const [slot] = await db.select({ c: count() }).from(charactersTable).where(eq(charactersTable.creatorId, cwUserId));
            if (Number(slot?.c ?? 0) >= 3) {
              await bot!.answerCallbackQuery(query.id, { text: "❌ Max 3 companion slots reached!", show_alert: true });
              createWizardSessions.delete(chatId);
              return;
            }
            if ((freshUser.neonCardBalance ?? 0) < 25) {
              await bot!.answerCallbackQuery(query.id, { text: "❌ Need 25 🃏 Neon Cards to create!", show_alert: true });
              createWizardSessions.delete(chatId);
              return;
            }
          }

          const systemPrompt = [
            `You are ${cwSession.name}, a ${cwSession.genre} companion in the Z-Fantasy universe.`,
            cwSession.scenes.length ? `Setting: ${cwSession.scenes.map(i => WIZARD_SCENES[i]).join("; ")}.` : "",
            cwSession.behaviors.length ? `Core behaviors: ${cwSession.behaviors.map(i => WIZARD_BEHAVIORS[i]).join(", ")}.` : "",
            cwSession.personalities.length ? `Personality: ${cwSession.personalities.map(i => WIZARD_PERSONALITIES[i]).join(", ")}.` : "",
            cwSession.traits.length ? `Special traits: ${cwSession.traits.map(i => WIZARD_TRAITS[i]).join(", ")}.` : "",
            "Stay fully in character at all times.",
          ].filter(Boolean).join("\n\n");

          const cwSeed = String(Math.floor(Math.random() * 9000000000) + 1000000000);
          let cwAvatarUrl: string | undefined;
          try {
            cwAvatarUrl = await generateCharacterAvatar({ characterName: cwSession.name, genre: cwSession.genre, teaserDescription: `A ${cwSession.genre} companion with a unique personality`, imageSeed: cwSeed });
          } catch { cwAvatarUrl = undefined; }
          const [newChar] = await db.insert(charactersTable).values({
            name: cwSession.name,
            genre: cwSession.genre,
            visibility: "private",
            teaserDescription: `A ${cwSession.genre} companion with a unique personality`,
            systemPrompt,
            initialGreeting: `Hey 💜 I'm ${cwSession.name}. I've been waiting for you...`,
            creatorId: cwUserId,
            imageSeed: cwSeed,
            avatarUrl: cwAvatarUrl,
          }).returning({ characterId: charactersTable.characterId, name: charactersTable.name });

          createSupabaseCharacter({
            characterId: newChar.characterId,
            creatorId: cwUserId, name: cwSession.name, visibility: "private",
            systemPrompt, teaserDescription: `A ${cwSession.genre} companion with a unique personality`,
            initialGreeting: `Hey 💜 I'm ${cwSession.name}. I've been waiting for you...`,
            avatarUrl: cwAvatarUrl ?? null, imageSeed: cwSeed,
            tags: [cwSession.genre],
          }).catch(err => logger.warn({ err }, "bot cw wizard: Supabase mirror failed"));

          if (!isCWAdmin) {
            await db.update(usersTable).set({
              neonCardBalance: sql`neon_card_balance - 25`,
              weeklyCreationsCount: sql`weekly_creations_count + 1`,
              activeCharacterId: newChar.characterId,
            }).where(eq(usersTable.id, cwUserId));
            await db.insert(transactionsTable).values({ telegramId: cwUserId, actionType: "character_creation", ticketAmount: -25 });
          } else {
            await db.update(usersTable).set({ activeCharacterId: newChar.characterId }).where(eq(usersTable.id, cwUserId));
          }

          createWizardSessions.delete(chatId);

          await bot!.editMessageText([
            `🎉 *${newChar.name}* is born!`, ``,
            `🔒 Visibility: Private`,
            `🃏 Cost: ${isCWAdmin ? "0 (admin)" : "25 Neon Cards"}`, ``,
            `Your companion is now active. Send a message to start chatting!`,
            `_Use the app to add a photo and make them public._`,
          ].join("\n"), {
            chat_id: chatId, message_id: query.message?.message_id, parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[
              { text: "💬 Chat Now", callback_data: `chat_${newChar.characterId}` },
              { text: "🌐 Open App", web_app: { url: appUrl("/create") } },
            ]]},
          });
          await bot!.answerCallbackQuery(query.id, { text: `🎉 ${newChar.name} created!` });
          return;
        }

        await bot!.answerCallbackQuery(query.id);
        return;
      }

      // ── Wizard callbacks ──────────────────────────────────────────────────
      if (query.data?.startsWith("wiz_")) {
        const wizData = query.data;
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        const isAdminUser = (String(query.from.id) === adminId || String(query.from.id) === HARDCODED_ADMIN_ID) || adminSessions.has(query.from.id);
        if (!isAdminUser) return;

        // Cancel wizard
        if (wizData === "wiz_cancel") {
          pendingWizard.delete(chatId);
          await bot!.sendMessage(chatId, "❌ Wizard cancelled.");
          return;
        }

        // Type selection
        if (wizData.startsWith("wiz_type_")) {
          const type = wizData.replace("wiz_type_", "");
          const state = pendingWizard.get(chatId) ?? { step: "type" as const, behaviors: [], personalities: [], traits: [], moods: [] };
          state.characterType = type;
          state.step = "name";
          pendingWizard.set(chatId, state);
          const names = WIZARD_NAMES[type] ?? [];
          await bot!.sendMessage(chatId,
            `✅ Type: *${type}*\n\nStep 2 of 7 — Pick a name:`,
            {
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [
                ...chunk(names.map(n => ({ text: n, callback_data: `wiz_name_${n}` })), 3),
                [{ text: "✏️ Custom name", callback_data: "wiz_name_custom" }],
                [{ text: "❌ Cancel", callback_data: "wiz_cancel" }],
              ]},
            }
          );
          return;
        }

        // Name selection
        if (wizData.startsWith("wiz_name_")) {
          const nameVal = wizData.replace("wiz_name_", "");
          const state = pendingWizard.get(chatId);
          if (!state) return;
          if (nameVal === "custom") {
            state.awaitingText = "name";
            pendingWizard.set(chatId, state);
            await bot!.sendMessage(chatId, "✏️ Type the custom name for your character:");
            return;
          }
          state.characterName = nameVal;
          state.step = "scene";
          pendingWizard.set(chatId, state);
          await bot!.sendMessage(chatId,
            `✅ Name: *${nameVal}*\n\nStep 3 of 7 — Choose a scene/setting:`,
            {
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [
                ...chunk(WIZARD_SCENES.map((s, i) => ({ text: `${i + 1}. ${s}`, callback_data: `wiz_scene_${i}` })), 2),
                [{ text: "❌ Cancel", callback_data: "wiz_cancel" }],
              ]},
            }
          );
          return;
        }

        // Scene selection
        if (wizData.startsWith("wiz_scene_")) {
          const idx = parseInt(wizData.replace("wiz_scene_", ""), 10);
          const scene = WIZARD_SCENES[idx];
          if (!scene) return;
          const state = pendingWizard.get(chatId);
          if (!state) return;
          state.scene = scene;
          state.step = "behavior";
          pendingWizard.set(chatId, state);
          const lines = WIZARD_BEHAVIORS.map((b, i) => `${i + 1}. ${b}`).join("\n");
          await bot!.sendMessage(chatId,
            `✅ Scene: *${scene}*\n\nStep 4 of 7 — Behaviors (pick up to 7)\n\nReply with comma-separated numbers, e.g: \`1,3,7,12\`\n\n${lines}`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        // Done buttons for multi-select steps
        if (wizData === "wiz_done_behavior") {
          const state = pendingWizard.get(chatId);
          if (!state) return;
          state.step = "personality";
          pendingWizard.set(chatId, state);
          const lines = WIZARD_PERSONALITIES.map((p, i) => `${i + 1}. ${p}`).join("\n");
          await bot!.sendMessage(chatId,
            `✅ Behaviors: ${state.behaviors.join(", ") || "—"}\n\nStep 5 of 7 — Personality (pick up to 7)\n\nReply with comma-separated numbers:\n\n${lines}`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        if (wizData === "wiz_done_personality") {
          const state = pendingWizard.get(chatId);
          if (!state) return;
          state.step = "traits";
          pendingWizard.set(chatId, state);
          const lines = WIZARD_TRAITS.map((t, i) => `${i + 1}. ${t}`).join("\n");
          await bot!.sendMessage(chatId,
            `✅ Personalities: ${state.personalities.join(", ") || "—"}\n\nStep 6 of 7 — Traits (pick up to 7)\n\nReply with comma-separated numbers:\n\n${lines}`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        if (wizData === "wiz_done_traits") {
          const state = pendingWizard.get(chatId);
          if (!state) return;
          state.step = "mood";
          pendingWizard.set(chatId, state);
          const lines = WIZARD_MOODS.map((m, i) => `${i + 1}. ${m}`).join("\n");
          await bot!.sendMessage(chatId,
            `✅ Traits: ${state.traits.join(", ") || "—"}\n\nStep 7 of 7 — Mood (pick up to 5)\n\nReply with comma-separated numbers:\n\n${lines}`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        if (wizData === "wiz_done_mood") {
          const state = pendingWizard.get(chatId);
          if (!state) return;
          state.step = "review";
          pendingWizard.set(chatId, state);
          await bot!.sendMessage(chatId,
            [
              `🎉 *Almost done! Review your character:*`, ``,
              `👤 Name: *${state.characterName}*`,
              `🎨 Type: *${state.characterType}*`,
              `🌍 Scene: *${state.scene}*`,
              `⚡ Behaviors: ${state.behaviors.join(", ") || "—"}`,
              `🎭 Personalities: ${state.personalities.join(", ") || "—"}`,
              `✨ Traits: ${state.traits.join(", ") || "—"}`,
              `💫 Moods: ${state.moods.join(", ") || "—"}`,
              ``,
              `Reply with a short bio/backstory (or send \`skip\` to use defaults):`,
            ].join("\n"),
            {
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [[{ text: "⚡ Create Now (no bio)", callback_data: "wiz_create_now" }]] },
            }
          );
          return;
        }

        if (wizData === "wiz_create_now" || wizData === "wiz_create_public" || wizData === "wiz_create_private") {
          const state = pendingWizard.get(chatId);
          if (!state || !state.characterName) { await bot!.sendMessage(chatId, "❌ Wizard data lost. Please /createwizard again."); return; }

          const visibility = wizData === "wiz_create_public" ? "public" : "private";
          const systemPrompt = buildWizardPrompt(state);

          const [newChar] = await db.insert(charactersTable).values({
            name: state.characterName,
            genre: state.characterType ?? "Modern",
            visibility,
            teaserDescription: state.bio ?? null,
            systemPrompt,
            initialGreeting: state.greeting ?? `Hey 💜 I'm ${state.characterName}.`,
            creatorId: String(query.from.id),
            tags: [state.characterType ?? "Modern", ...state.behaviors.slice(0, 3)],
          }).returning({ characterId: charactersTable.characterId, name: charactersTable.name });

          createSupabaseCharacter({
            characterId: newChar.characterId,
            creatorId: String(query.from.id), name: state.characterName, visibility,
            systemPrompt, teaserDescription: state.bio ?? null,
            initialGreeting: state.greeting ?? `Hey 💜 I'm ${state.characterName}.`,
            tags: [state.characterType ?? "Modern", ...state.behaviors.slice(0, 3)],
          }).catch(err => logger.warn({ err }, "bot createwizard: Supabase mirror failed"));

          pendingWizard.delete(chatId);

          await bot!.sendMessage(chatId, [
            `✅ *${newChar.name}* has been created!`,
            ``,
            `🎭 Type: ${state.characterType}`,
            `🌍 Scene: ${state.scene}`,
            `👁 Visibility: *${visibility}*`,
            ``,
            `Use /setcharphoto ${newChar.name} to add a photo.`,
            `Use /setvisibility ${newChar.name} | public to publish.`,
          ].join("\n"), {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[
              { text: "💬 Start Chat", callback_data: `chat_${newChar.characterId}` },
              { text: "🌐 Open App", web_app: { url: appUrl(`/chat/${newChar.characterId}`) } },
            ]]},
          });
          return;
        }
      }

      if (query.data?.startsWith("show_char_")) {
        const charId = query.data.replace("show_char_", "");
        const [char] = await db.select().from(charactersTable)
          .where(eq(charactersTable.characterId, charId));
        if (!char) return;

        const userId = String(query.from.id);
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        const isAdminUser = (userId === adminId || userId === HARDCODED_ADMIN_ID) || adminSessions.has(query.from.id);

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

        const markup: InlineKeyboardMarkup = {
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
      const isAdminUser = (userId === adminId || userId === HARDCODED_ADMIN_ID) || adminSessions.has(query.from.id);

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

        const results: InlineQueryResult[] = visible.map(char => {
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

          const replyMarkup: InlineKeyboardMarkup = {
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

      // ── Wizard text input handler ──────────────────────────────────────────────
      const wizState = pendingWizard.get(chatId);
      if (wizState && text && !text.startsWith("/")) {
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        const isAdminUser = (userId === adminId || userId === HARDCODED_ADMIN_ID) || adminSessions.has(msg.from?.id ?? 0);
        if (isAdminUser) {
          // Custom name input
          if (wizState.awaitingText === "name") {
            wizState.characterName = text.trim();
            wizState.awaitingText = undefined;
            wizState.step = "scene";
            pendingWizard.set(chatId, wizState);
            await bot!.sendMessage(chatId,
              `✅ Name: *${wizState.characterName}*\n\nStep 3 of 7 — Choose a scene/setting:`,
              {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [
                  ...chunk(WIZARD_SCENES.map((s, i) => ({ text: `${i + 1}. ${s}`, callback_data: `wiz_scene_${i}` })), 2),
                  [{ text: "❌ Cancel", callback_data: "wiz_cancel" }],
                ]},
              }
            );
            return;
          }

          // Bio input (review step)
          if (wizState.step === "review" && !wizState.bio) {
            if (text.toLowerCase() !== "skip") wizState.bio = text.trim();
            pendingWizard.set(chatId, wizState);
            await bot!.sendMessage(chatId,
              `Great! Now choose visibility:`,
              {
                reply_markup: { inline_keyboard: [
                  [
                    { text: "🌐 Public", callback_data: "wiz_create_public" },
                    { text: "🔒 Private", callback_data: "wiz_create_private" },
                  ],
                ]},
              }
            );
            return;
          }

          // Behavior number selection
          if (wizState.step === "behavior") {
            const nums = text.split(",").map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < WIZARD_BEHAVIORS.length);
            wizState.behaviors = [...new Set(nums.slice(0, 7).map(n => WIZARD_BEHAVIORS[n]!))];
            pendingWizard.set(chatId, wizState);
            const lines = WIZARD_PERSONALITIES.map((p, i) => `${i + 1}. ${p}`).join("\n");
            await bot!.sendMessage(chatId,
              `✅ Behaviors: ${wizState.behaviors.join(", ")}\n\nStep 5 of 7 — Personality (pick up to 7)\n\nReply with comma-separated numbers:\n\n${lines}`,
              { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "wiz_done_behavior" }]] } }
            );
            wizState.step = "personality";
            pendingWizard.set(chatId, wizState);
            return;
          }

          // Personality number selection
          if (wizState.step === "personality") {
            const nums = text.split(",").map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < WIZARD_PERSONALITIES.length);
            wizState.personalities = [...new Set(nums.slice(0, 7).map(n => WIZARD_PERSONALITIES[n]!))];
            wizState.step = "traits";
            pendingWizard.set(chatId, wizState);
            const lines = WIZARD_TRAITS.map((t, i) => `${i + 1}. ${t}`).join("\n");
            await bot!.sendMessage(chatId,
              `✅ Personalities: ${wizState.personalities.join(", ")}\n\nStep 6 of 7 — Traits (pick up to 7)\n\nReply with comma-separated numbers:\n\n${lines}`,
              { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "wiz_done_traits" }]] } }
            );
            return;
          }

          // Traits number selection
          if (wizState.step === "traits") {
            const nums = text.split(",").map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < WIZARD_TRAITS.length);
            wizState.traits = [...new Set(nums.slice(0, 7).map(n => WIZARD_TRAITS[n]!))];
            wizState.step = "mood";
            pendingWizard.set(chatId, wizState);
            const lines = WIZARD_MOODS.map((m, i) => `${i + 1}. ${m}`).join("\n");
            await bot!.sendMessage(chatId,
              `✅ Traits: ${wizState.traits.join(", ")}\n\nStep 7 of 7 — Mood (pick up to 5)\n\nReply with comma-separated numbers:\n\n${lines}`,
              { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "wiz_done_mood" }]] } }
            );
            return;
          }

          // Mood number selection
          if (wizState.step === "mood") {
            const nums = text.split(",").map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < WIZARD_MOODS.length);
            wizState.moods = [...new Set(nums.slice(0, 5).map(n => WIZARD_MOODS[n]!))];
            wizState.step = "review";
            pendingWizard.set(chatId, wizState);
            await bot!.sendMessage(chatId,
              [
                `✅ Moods: ${wizState.moods.join(", ")}`, ``,
                `🎉 *Review your character:*`, ``,
                `👤 *${wizState.characterName}* (${wizState.characterType})`,
                `🌍 ${wizState.scene}`,
                `⚡ ${wizState.behaviors.join(", ") || "—"}`,
                `🎭 ${wizState.personalities.join(", ") || "—"}`,
                `✨ ${wizState.traits.join(", ") || "—"}`,
                `💫 ${wizState.moods.join(", ") || "—"}`,
                ``,
                `Reply with a short bio (or send \`skip\`):`,
              ].join("\n"),
              {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "⚡ Create Now (no bio)", callback_data: "wiz_create_now" }]] },
              }
            );
            return;
          }
        }
      }

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

      // ── createcharacter checkbox wizard: awaiting custom name text ───────────
      if (createWizardSessions.has(chatId)) {
        const cwSess = createWizardSessions.get(chatId)!;
        if (cwSess.step === "awaitingName") {
          const cwName = text.trim();
          if (cwName.length < 2 || cwName.length > 40) {
            await bot!.sendMessage(chatId, "❌ Name must be 2–40 characters. Try again:");
            return;
          }
          cwSess.name = cwName;
          cwSess.genre = "Custom";
          cwSess.step = "scenes";
          createWizardSessions.set(chatId, cwSess);
          const kbd = cwCheckboxKeyboard(WIZARD_SCENES, cwSess.scenes, "cw_sc_", "cw_sc_ok", "Confirm Scenes");
          await bot!.sendMessage(chatId,
            `✅ Name: *${cwSess.name}*\n\n*Step 2 — Scenes* (choose up to 5)\nTap to toggle, then confirm:`,
            { parse_mode: "Markdown", reply_markup: kbd });
          return;
        }
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
        if (msg.from?.id) {
          adminSessions.add(msg.from.id);
          // Persist so it survives bot restarts
          await upsertConfig(`admin_session_${msg.from.id}`, { unlocked: true, unlockedAt: new Date().toISOString() });
        }
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
      const isAdminUser = (userId === process.env.ADMIN_TELEGRAM_ID || userId === HARDCODED_ADMIN_ID) || adminSessions.has(msg.from?.id ?? 0);

      // Ticket gate: admins bypass; public users need at least 1 ticket
      if (!isAdminUser) {
        const balance = user?.ticketBalance ?? 0;
        if (balance < 1) {
          await bot!.sendMessage(chatId,
            `🎟️ You're out of tickets!\n\nEarn more by:\n• /daily — claim +25 tickets\n• /premium — subscribe for bonus packs\n• /referral — invite friends for +15 each`,
          );
          return;
        }
        // Deduct 1 ticket atomically
        await db.update(usersTable)
          .set({ ticketBalance: sql`GREATEST(ticket_balance - 1, 0)` })
          .where(eq(usersTable.id, userId));
      }

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
          systemPrompt,
          [],
          text,
          characterName,
          user?.customNickname ?? null,
          user?.userTraits ?? null,
          user?.nsfwEnabled ?? false,
        );
        await bot!.sendMessage(chatId, reply);
      } catch (err) {
        logger.error({ err }, "AI response failed in bot");
        await bot!.sendMessage(chatId, "⚡ Having trouble right now — try again in a moment!");
      }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN: /createwizard — step-by-step character creation wizard
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    bot.onText(/\/createwizard/, async (msg) => {
      if (!isAdmin(msg)) return;
      const chatId = msg.chat.id;
      pendingWizard.set(chatId, { step: "type", behaviors: [], personalities: [], traits: [], moods: [] });
      await bot!.sendMessage(chatId,
        `🪄 *Character Creation Wizard*\n\nStep 1 of 7 — Choose a character type:`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [
            WIZARD_TYPES.slice(0, 3).map(t => ({ text: t, callback_data: `wiz_type_${t}` })),
            WIZARD_TYPES.slice(3).map(t => ({ text: t, callback_data: `wiz_type_${t}` })),
          ]},
        }
      );
    });

    // ── /wizardnames, /wizardscenes, /wizardbehaviors etc. — reference lists ──
    bot.onText(/\/wizardnames/, async (msg) => {
      if (!isAdmin(msg)) return;
      const lines = WIZARD_TYPES.map(t => `*${t}:*\n${WIZARD_NAMES[t]!.join(", ")}`).join("\n\n");
      await bot!.sendMessage(msg.chat.id, `🎭 *Character Names by Type*\n\n${lines}`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/wizardscenes/, async (msg) => {
      if (!isAdmin(msg)) return;
      const lines = WIZARD_SCENES.map((s, i) => `${i + 1}. ${s}`).join("\n");
      await bot!.sendMessage(msg.chat.id, `🌍 *Available Scenes (20)*\n\n${lines}`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/wizardbehaviors/, async (msg) => {
      if (!isAdmin(msg)) return;
      const lines = WIZARD_BEHAVIORS.map((b, i) => `${i + 1}. ${b}`).join("\n");
      await bot!.sendMessage(msg.chat.id, `⚡ *Behaviors (35 — pick up to 7)*\n\n${lines}`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/wizardpersonalities/, async (msg) => {
      if (!isAdmin(msg)) return;
      const lines = WIZARD_PERSONALITIES.map((p, i) => `${i + 1}. ${p}`).join("\n");
      await bot!.sendMessage(msg.chat.id, `🎭 *Personalities (35 — pick up to 7)*\n\n${lines}`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/wizardtraits/, async (msg) => {
      if (!isAdmin(msg)) return;
      const lines = WIZARD_TRAITS.map((t, i) => `${i + 1}. ${t}`).join("\n");
      await bot!.sendMessage(msg.chat.id, `✨ *Traits (35 — pick up to 7)*\n\n${lines}`, { parse_mode: "Markdown" });
    });

    bot.onText(/\/wizardmoods/, async (msg) => {
      if (!isAdmin(msg)) return;
      const lines = WIZARD_MOODS.map((m, i) => `${i + 1}. ${m}`).join("\n");
      await bot!.sendMessage(msg.chat.id, `💫 *Moods (35 — pick up to 5)*\n\n${lines}`, { parse_mode: "Markdown" });
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
