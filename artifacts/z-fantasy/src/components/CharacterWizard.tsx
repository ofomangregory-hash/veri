import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, User, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Wizard Data ────────────────────────────────────────────────────────────────

export const CHARACTER_NAMES: { name: string; type: string }[] = [
  // Modern
  { name: "Nova", type: "Modern" }, { name: "Jade", type: "Modern" },
  { name: "Riley", type: "Modern" }, { name: "Skyler", type: "Modern" },
  { name: "Ash", type: "Modern" }, { name: "Devon", type: "Modern" },
  { name: "Morgan", type: "Modern" }, { name: "Sage", type: "Modern" },
  { name: "Quinn", type: "Modern" }, { name: "Blake", type: "Modern" },
  { name: "Harlow", type: "Modern" }, { name: "Remy", type: "Modern" },
  { name: "Sloane", type: "Modern" }, { name: "Avery", type: "Modern" },
  { name: "Peyton", type: "Modern" },
  // Gothic
  { name: "Morrigan", type: "Gothic" }, { name: "Raven", type: "Gothic" },
  { name: "Shade", type: "Gothic" }, { name: "Vesper", type: "Gothic" },
  { name: "Theron", type: "Gothic" }, { name: "Cinder", type: "Gothic" },
  { name: "Draven", type: "Gothic" }, { name: "Grimm", type: "Gothic" },
  { name: "Isolde", type: "Gothic" }, { name: "Moira", type: "Gothic" },
  // Elf
  { name: "Aelindra", type: "Elf" }, { name: "Sylvara", type: "Elf" },
  { name: "Thalion", type: "Elf" }, { name: "Elowyn", type: "Elf" },
  { name: "Nimriel", type: "Elf" }, { name: "Lyraniel", type: "Elf" },
  { name: "Arannis", type: "Elf" }, { name: "Caladwen", type: "Elf" },
  { name: "Faendal", type: "Elf" }, { name: "Celebris", type: "Elf" },
  // Vampire
  { name: "Damien", type: "Vampire" }, { name: "Lucrezia", type: "Vampire" },
  { name: "Viktor", type: "Vampire" }, { name: "Mordecai", type: "Vampire" },
  { name: "Alaric", type: "Vampire" }, { name: "Dorian", type: "Vampire" },
  { name: "Carmilla", type: "Vampire" }, { name: "Vladislav", type: "Vampire" },
  { name: "Evangeline", type: "Vampire" }, { name: "Caspian", type: "Vampire" },
  // Succubus
  { name: "Avara", type: "Succubus" }, { name: "Zephyrine", type: "Succubus" },
  { name: "Delara", type: "Succubus" }, { name: "Velvet", type: "Succubus" },
  { name: "Roxane", type: "Succubus" }, { name: "Mystique", type: "Succubus" },
  { name: "Tempest", type: "Succubus" }, { name: "Scarlet", type: "Succubus" },
  // Anime
  { name: "Hikari", type: "Anime" }, { name: "Yuki", type: "Anime" },
  { name: "Ren", type: "Anime" }, { name: "Akira", type: "Anime" },
  { name: "Sora", type: "Anime" }, { name: "Hana", type: "Anime" },
  { name: "Kira", type: "Anime" }, { name: "Ryuu", type: "Anime" },
  { name: "Mika", type: "Anime" }, { name: "Zero", type: "Anime" },
];

export const CHARACTER_TYPES = ["All", "Modern", "Gothic", "Elf", "Vampire", "Succubus", "Anime", "Custom"];

export const SCENES: string[] = [
  "Moonlit Rooftop", "Abandoned Castle", "Neon-lit Tokyo Street",
  "Secret Garden", "Space Station Observation Deck", "Underground Club",
  "Beach at Sunset", "Enchanted Forest", "Corporate Penthouse",
  "Cyberpunk Alley", "Ancient Library", "Volcanic Island",
  "Cozy Coffee Shop", "Haunted Mansion", "Futuristic Lab",
  "Snowy Mountain Cabin", "Mystical Shrine", "Underwater Palace",
  "Desert Oasis", "Dark Carnival",
  // Adult
  "Private Penthouse Suite", "Candlelit Boudoir", "Secret Dungeon Chamber",
  "Luxury Yacht Cabin", "Hot Spring Grotto", "Velvet Lounge After Hours",
  "Forbidden Basement Club", "Mirrored Dressing Room", "Silk-draped Throne Room",
  "Rain-soaked Hotel Room", "Secluded Villa Terrace at Midnight",
  "Opulent Bathhouse", "Private Members' Lounge", "Rooftop Infinity Pool at Night",
  "Shadowy Burlesque Stage",
];

export const BEHAVIORS: string[] = [
  "Protective", "Teasing", "Dominant", "Submissive", "Nurturing",
  "Mysterious", "Flirtatious", "Stoic", "Clingy", "Tsundere",
  "Loyal", "Cunning", "Reckless", "Intellectual", "Playful",
  "Melancholic", "Vengeful", "Gentle", "Possessive", "Carefree",
  "Sadistic", "Empathetic", "Detached", "Charismatic", "Rebellious",
  "Perfectionist", "Adventurous", "Shy", "Sarcastic", "Idealistic",
  "Pragmatic", "Romantic", "Competitive", "Selfless", "Hedonistic",
  // Adult
  "Seductive", "Provocative", "Lustful", "Insatiable", "Worship-giving",
  "Corruption-seeking", "Pleasure-focused", "Intimacy-craving", "Boundary-testing",
  "Enticing", "Irresistible Tease", "Power-hungry Lover", "Overstimulating",
  "Primal", "Euphoria-chasing",
];

export const PERSONALITIES: string[] = [
  "Dreamy Idealist", "Commander", "Witch Archetype", "The Rebel", "The Caretaker",
  "The Artist", "The Trickster", "The Scholar", "The Warrior", "The Lover",
  "The Mystic", "The Sage", "The Hero", "The Shadow", "The Innocent",
  "The Explorer", "The Ruler", "The Magician", "The Outlaw", "The Jester",
  "The Everyman", "The Seducer", "The Mentor", "The Orphan", "The Destroyer",
  "The Creator", "The Seeker", "Lover-Villain", "Dark Empath", "Stoic Philosopher",
  "Wild Card", "Broken Hearted", "The Obsessed", "The Liberator", "The Mirror",
  // Adult
  "The Temptress", "Wicked Sensualist", "The Corruptor", "Pleasure Architect",
  "The Nymphet", "Dark Courtesan", "Libertine", "The Siren",
  "Master Manipulator of Desire", "The Voracious", "Enchantress of Flesh",
  "The Dominatrix", "Velvet Tyrant", "The Devoted Pet", "Hunger Incarnate",
];

export const TRAITS: string[] = [
  "Silver-tongued", "Telepathic", "Immortal", "Shapeshifter", "Night Owl",
  "Empath", "Combat-trained", "Hacker", "Pyrokinetic", "Healer",
  "Necromancer", "Time Traveler", "Seer of Futures", "Assassin Background", "Royal Bloodline",
  "Street Smart", "Bookworm", "Wanderer", "Chef", "Musician",
  "Painter", "Scientist", "Engineer", "Dancer", "Pilot",
  "Mage", "Rogue", "Knight", "Spy", "Rebel Leader",
  "Poet", "Philosopher", "Guardian", "Fallen Angel", "Cursed Soul",
  // Adult
  "Seductress", "Touch-starved", "Temptress", "Irresistible", "Sensual Artist",
  "Pleasure Seeker", "Dominatrix", "Submissive Heart", "Desire Incarnate", "Forbidden Lover",
  "Tantric Master", "Exhibitionist", "Voyeur", "Kink-curious", "Master of Seduction",
];

export const MOODS: string[] = [
  "Smoldering", "Playful", "Brooding", "Yearning", "Euphoric",
  "Melancholic", "Mischievous", "Tender", "Fierce", "Wistful",
  "Curious", "Sultry", "Anxious", "Serene", "Rebellious",
  "Nostalgic", "Charged", "Vulnerable", "Dominant", "Lost",
  "Warm", "Cold", "Haunted", "Determined", "Flirty",
  "Protective", "Dreamy", "Urgent", "Exhausted", "Electric",
  "Sacred", "Dangerous", "Broken", "Hopeful", "Magnetic",
  // Adult
  "Lustful", "Ravenous", "Intoxicated", "Feverish", "Aching",
  "Possessed", "Insatiable", "Corrupted", "Unraveling", "Dripping Desire",
  "Breathless", "Obsessed", "Conquered", "Worshipful", "Sinful",
];

const TYPE_COLORS: Record<string, string> = {
  Modern:   "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Gothic:   "bg-purple-900/40 text-purple-300 border-purple-700/50",
  Elf:      "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Vampire:  "bg-red-900/40 text-red-300 border-red-700/50",
  Succubus: "bg-pink-600/20 text-pink-300 border-pink-500/40",
  Anime:    "bg-yellow-400/10 text-yellow-300 border-yellow-500/40",
  Custom:   "bg-accent/10 text-accent border-accent/40",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(data: WizardData): string {
  const { name, artStyle, subGenres, behaviors, personalities, traits, moods, bio, initialGreeting } = data;
  const typeDesc = subGenres.length ? subGenres.join("/") : artStyle || "companion";
  const parts = [
    `You are ${name}, a ${typeDesc} companion in the Z-Fantasy universe.`,
    bio ? `Background: ${bio}` : "",
    behaviors.length ? `Your core behaviors: ${behaviors.join(", ")}.` : "",
    personalities.length ? `Your personality archetype: ${personalities.join(", ")}.` : "",
    traits.length ? `Your special traits: ${traits.join(", ")}.` : "",
    moods.length ? `Your prevailing mood and energy: ${moods.join(", ")}.` : "",
    initialGreeting ? `Your opening line is: "${initialGreeting}"` : "",
    "Stay fully in character at all times. Never break the fourth wall. Let your personality shine through every response.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WizardData {
  name: string;
  artStyle: "Anime" | "Realistic" | "";
  subGenres: string[];
  behaviors: string[];
  personalities: string[];
  traits: string[];
  moods: string[];
  bio: string;
  age: string;
  initialGreeting: string;
  avatarUrl: string;
  visibility: "public" | "private";
  nsfwEnabled: boolean;
}

type Step = "name" | "genre" | "behavior" | "personality" | "traits" | "mood" | "nsfw" | "visibility" | "review";
const BASE_STEPS: Step[] = ["name", "genre", "behavior", "personality", "traits", "mood", "visibility", "review"];
const SUPREME_STEPS: Step[] = ["name", "genre", "behavior", "personality", "traits", "mood", "nsfw", "visibility", "review"];
const STEP_LABELS: Record<Step, string> = {
  name:        "Choose a Name",
  genre:       "Art Style & Character Type",
  behavior:    "Choose Behaviors",
  personality: "Choose Personality",
  traits:      "Choose Traits",
  mood:        "Choose Mood & Energy",
  nsfw:        "Content Settings",
  visibility:  "Visibility",
  review:      "Review & Create",
};

const SUB_GENRES = [
  "Fantasy", "Adventure", "Romance", "Horror", "Sci-Fi", "Cyberpunk",
  "Supernatural", "Historical", "Modern", "Isekai", "Slice of Life",
  "Thriller", "Drama", "Action", "Elf", "Vampire", "Demon", "Angel", "Warrior", "Mage",
];
const MAX_SUBGENRES = 2;
const MAX_PERSONALITIES = 3;
const MAX_BEHAVIORS = 7;
const MAX_TRAITS = 7;
const MAX_MOODS = 5;

function getToken() {
  return (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || "mock_init_data_for_dev";
}

async function adminApi<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Multi-select chip ─────────────────────────────────────────────────────────

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all select-none ${
        selected
          ? "bg-primary/30 text-primary border-primary/60 box-glow-pink"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30"
      }`}
    >
      {selected && <Check size={10} className="inline mr-1" />}{label}
    </button>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: () => void;
  isSupremeAdmin?: boolean;
}

export function CharacterWizard({ onClose, onCreated, isSupremeAdmin = false }: Props) {
  const { toast } = useToast();
  const STEPS = isSupremeAdmin ? SUPREME_STEPS : BASE_STEPS;
  const [step, setStep] = useState<Step>("name");
  const [creating, setCreating] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customSubGenreInput, setCustomSubGenreInput] = useState("");
  const [showCustomSubGenre, setShowCustomSubGenre] = useState(false);

  type ListStep = "behaviors" | "personalities" | "traits" | "moods";
  const [customText, setCustomText] = useState<Record<ListStep, string>>({
    behaviors: "", personalities: "", traits: "", moods: "",
  });
  const [showCustom, setShowCustom] = useState<Record<ListStep, boolean>>({
    behaviors: false, personalities: false, traits: false, moods: false,
  });

  function submitCustom(key: ListStep, max: number) {
    const val = customText[key].trim();
    if (val) toggle(key, val, max);
    setCustomText(p => ({ ...p, [key]: "" }));
    setShowCustom(p => ({ ...p, [key]: false }));
  }

  const [data, setData] = useState<WizardData>({
    name: "", artStyle: "", subGenres: [], behaviors: [],
    personalities: [], traits: [], moods: [], bio: "",
    age: "", initialGreeting: "", avatarUrl: "", visibility: "private",
    nsfwEnabled: false,
  });

  const stepIndex = STEPS.indexOf(step);

  function goNext() {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  }
  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function toggle<K extends "behaviors" | "personalities" | "traits" | "moods">(
    key: K, value: string, max: number
  ) {
    setData(d => {
      const arr = d[key] as string[];
      if (arr.includes(value)) return { ...d, [key]: arr.filter(x => x !== value) };
      if (arr.length >= max) { toast({ title: `Max ${max} selections`, variant: "destructive" }); return d; }
      return { ...d, [key]: [...arr, value] };
    });
  }

  const canProceed = (): boolean => {
    if (step === "name") return data.name.length > 0;
    if (step === "genre") return data.artStyle !== "" && data.subGenres.length >= 1;
    if (step === "behavior") return data.behaviors.length >= 1;
    return true;
  };

  async function create() {
    if (!data.name.trim()) return;
    setCreating(true);
    try {
      const systemPrompt = buildSystemPrompt(data);
      const tags = [...data.subGenres, ...data.behaviors.slice(0, 3)];
      if (data.nsfwEnabled) tags.push("#NSFW");
      await adminApi("POST", "/admin/characters/create", {
        name: data.name.trim(),
        bio: data.bio || undefined,
        age: data.age || undefined,
        genre: data.artStyle || "Realistic",
        tags,
        avatarUrl: data.avatarUrl || undefined,
        initialGreeting: data.initialGreeting || undefined,
        visibility: data.visibility,
        systemPrompt,
      });
      toast({ title: `✅ ${data.name} created!` });
      onCreated();
      onClose();
    } catch (e) {
      toast({ title: "Create failed", description: String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors">
          <X size={18} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-sm uppercase tracking-widest text-glow-blue">Character Wizard</h2>
          {data.name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{data.name}{data.artStyle ? ` · ${data.artStyle}` : ""}</p>}
        </div>
        <div className="text-xs text-muted-foreground font-mono">{stepIndex + 1}/{STEPS.length}</div>
      </div>

      {/* Step Progress */}
      <div className="flex px-4 pt-3 pb-2 gap-1 shrink-0">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1 rounded-full flex-1 transition-all ${
            i < stepIndex ? "bg-primary" : i === stepIndex ? "bg-accent" : "bg-border"
          }`} />
        ))}
      </div>
      <div className="px-4 pb-3 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-accent">{STEP_LABELS[step]}</span>
        {step === "genre" && data.artStyle && <span className="text-xs text-muted-foreground ml-2">{data.subGenres.length}/{MAX_SUBGENRES} types selected</span>}
        {step === "behavior" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_BEHAVIORS} · {data.behaviors.length}/{MAX_BEHAVIORS}</span>}
        {step === "personality" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_PERSONALITIES} · {data.personalities.length}/{MAX_PERSONALITIES}</span>}
        {step === "traits" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_TRAITS} · {data.traits.length}/{MAX_TRAITS}</span>}
        {step === "mood" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_MOODS} · {data.moods.length}/{MAX_MOODS}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 no-scrollbar" style={{ paddingBottom: "140px" }}>

        {/* ── Step: Name ── */}
        {step === "name" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {CHARACTER_NAMES.map(({ name, type }) => (
                <button key={name} onClick={() => {
                  setCustomName("");
                  setData(d => ({ ...d, name }));
                  setTimeout(goNext, 120);
                }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    data.name === name && !customName
                      ? "border-primary/60 bg-primary/15 box-glow-pink"
                      : "border-border bg-card hover:border-primary/30"
                  }`}>
                  <div className="text-sm font-bold truncate">{name}</div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded-full border inline-block mt-1 ${TYPE_COLORS[type] ?? "text-muted-foreground border-border"}`}>
                    {type}
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-3 space-y-2 border-t border-border mt-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                ✏️ Or type your own name
              </label>
              <div className="flex gap-2">
                <input
                  value={customName}
                  onChange={e => {
                    const val = e.target.value;
                    setCustomName(val);
                    setData(d => ({ ...d, name: val.trim() }));
                  }}
                  placeholder="e.g. Seraphina..."
                  className={`flex-1 h-10 rounded-lg border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors ${
                    customName.trim().length > 0
                      ? "border-accent focus:border-accent"
                      : "border-border focus:border-primary/60"
                  }`}
                />
                {customName.trim().length >= 2 && (
                  <button onClick={goNext}
                    className="px-3 h-10 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/50 hover:bg-accent/30 transition-colors whitespace-nowrap">
                    Use →
                  </button>
                )}
              </div>
              {customName.trim().length >= 2 && (
                <p className="text-[10px] text-accent">
                  Using custom name: <strong>{customName.trim()}</strong> · Click "Use →" or "Continue" below
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step: Genre ── */}
        {step === "genre" && (
          <div className="space-y-5">
            {/* Step A: Art Style */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Step A — Art Style <span className="text-primary">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["Anime", "Realistic"] as const).map(style => (
                  <button
                    key={style}
                    onClick={() => setData(d => ({ ...d, artStyle: style }))}
                    className={`py-5 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-2 ${
                      data.artStyle === style
                        ? "border-primary/60 bg-primary/15 text-primary box-glow-pink"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <span className="text-3xl">{style === "Anime" ? "🌸" : "📷"}</span>
                    {style}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {style === "Anime" ? "2D illustration style" : "Photo-realistic style"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step B: Sub-genres (appears after art style is picked) */}
            {data.artStyle && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Step B — Character Type
                  </p>
                  <span className="text-xs font-semibold text-muted-foreground">{data.subGenres.length}/{MAX_SUBGENRES}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[...SUB_GENRES, ...data.subGenres.filter(s => !SUB_GENRES.includes(s))].map(sg => {
                    const selected = data.subGenres.includes(sg);
                    const maxed = data.subGenres.length >= MAX_SUBGENRES && !selected;
                    return (
                      <button
                        key={sg}
                        disabled={maxed}
                        onClick={() => {
                          setData(d => ({
                            ...d,
                            subGenres: d.subGenres.includes(sg)
                              ? d.subGenres.filter(x => x !== sg)
                              : d.subGenres.length < MAX_SUBGENRES
                                ? [...d.subGenres, sg]
                                : d.subGenres,
                          }));
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          selected
                            ? "bg-primary/30 text-primary border-primary/60 box-glow-pink"
                            : maxed
                            ? "bg-card/40 text-muted-foreground/40 border-border/40 cursor-not-allowed"
                            : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30"
                        }`}
                      >
                        {selected && <Check size={10} className="inline mr-1" />}{sg}
                      </button>
                    );
                  })}
                </div>
                {showCustomSubGenre ? (
                  <div className="flex gap-2 mt-3">
                    <input
                      autoFocus
                      value={customSubGenreInput}
                      onChange={e => setCustomSubGenreInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && customSubGenreInput.trim() && data.subGenres.length < MAX_SUBGENRES) {
                          setData(d => ({ ...d, subGenres: [...d.subGenres, customSubGenreInput.trim()] }));
                          setCustomSubGenreInput("");
                          setShowCustomSubGenre(false);
                        }
                      }}
                      placeholder="Type a custom type..."
                      className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => {
                        if (customSubGenreInput.trim() && data.subGenres.length < MAX_SUBGENRES) {
                          setData(d => ({ ...d, subGenres: [...d.subGenres, customSubGenreInput.trim()] }));
                          setCustomSubGenreInput("");
                          setShowCustomSubGenre(false);
                        }
                      }}
                      className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCustomSubGenre(true)}
                    className="w-full mt-3 py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5 transition-colors"
                  >
                    ➕ Add Custom
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Behavior ── */}
        {step === "behavior" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {BEHAVIORS.map(b => (
                <Chip key={b} label={b} selected={data.behaviors.includes(b)}
                  onClick={() => toggle("behaviors", b, MAX_BEHAVIORS)} />
              ))}
            </div>
            {showCustom.behaviors ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={customText.behaviors}
                  onChange={e => setCustomText(p => ({ ...p, behaviors: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("behaviors", MAX_BEHAVIORS)}
                  placeholder="Type a custom behavior..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent"
                />
                <button onClick={() => submitCustom("behaviors", MAX_BEHAVIORS)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors">
                  Add
                </button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, behaviors: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5 transition-colors">
                ➕ Add Custom
              </button>
            )}
          </div>
        )}

        {/* ── Step: Personality (max 3) ── */}
        {step === "personality" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PERSONALITIES.map(p => (
                <Chip key={p} label={p} selected={data.personalities.includes(p)}
                  onClick={() => toggle("personalities", p, MAX_PERSONALITIES)} />
              ))}
            </div>
            {showCustom.personalities ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={customText.personalities}
                  onChange={e => setCustomText(p => ({ ...p, personalities: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("personalities", MAX_PERSONALITIES)}
                  placeholder="Type a custom personality..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent"
                />
                <button onClick={() => submitCustom("personalities", MAX_PERSONALITIES)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors">
                  Add
                </button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, personalities: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5 transition-colors">
                ➕ Add Custom
              </button>
            )}
          </div>
        )}

        {/* ── Step: Traits ── */}
        {step === "traits" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TRAITS.map(t => (
                <Chip key={t} label={t} selected={data.traits.includes(t)}
                  onClick={() => toggle("traits", t, MAX_TRAITS)} />
              ))}
            </div>
            {showCustom.traits ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={customText.traits}
                  onChange={e => setCustomText(p => ({ ...p, traits: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("traits", MAX_TRAITS)}
                  placeholder="Type a custom trait..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent"
                />
                <button onClick={() => submitCustom("traits", MAX_TRAITS)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors">
                  Add
                </button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, traits: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5 transition-colors">
                ➕ Add Custom
              </button>
            )}
          </div>
        )}

        {/* ── Step: Mood ── */}
        {step === "mood" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {MOODS.map(m => (
                <Chip key={m} label={m} selected={data.moods.includes(m)}
                  onClick={() => toggle("moods", m, MAX_MOODS)} />
              ))}
            </div>
            {showCustom.moods ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={customText.moods}
                  onChange={e => setCustomText(p => ({ ...p, moods: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("moods", MAX_MOODS)}
                  placeholder="Type a custom mood..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent"
                />
                <button onClick={() => submitCustom("moods", MAX_MOODS)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors">
                  Add
                </button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, moods: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5 transition-colors">
                ➕ Add Custom
              </button>
            )}
          </div>
        )}

        {/* ── Step: NSFW (supreme admin only) ── */}
        {step === "nsfw" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-yellow-300 text-xs">
              ⚠️ <strong>Supreme Admin Only</strong> — Enable explicit adult content for this character. Users will see an adult-content disclaimer before chatting.
            </div>
            <div className="flex flex-col gap-3">
              {[
                { value: false, label: "SFW — Safe For Work", desc: "Romantic and flirtatious but not explicit", icon: "💫" },
                { value: true, label: "NSFW — Adult Content", desc: "Explicit adult content enabled for this character", icon: "🔞" },
              ].map(opt => (
                <button key={String(opt.value)}
                  onClick={() => setData(d => ({ ...d, nsfwEnabled: opt.value }))}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    data.nsfwEnabled === opt.value
                      ? "border-primary/60 bg-primary/15 box-glow-pink"
                      : "border-border bg-card hover:border-primary/30"
                  }`}>
                  <div className="text-lg mb-1">{opt.icon}</div>
                  <div className="font-bold text-sm text-foreground">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Visibility ── */}
        {step === "visibility" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Control who can discover this character on the Explore page.</p>
            <div className="flex flex-col gap-3">
              {[
                { value: "private" as const, label: "Private", desc: "Only you can see and chat with this character", icon: "🔒" },
                { value: "public" as const, label: "Public", desc: "Anyone can discover this character on Explore", icon: "🌐" },
              ].map(opt => (
                <button key={opt.value}
                  onClick={() => setData(d => ({ ...d, visibility: opt.value }))}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    data.visibility === opt.value
                      ? "border-primary/60 bg-primary/15 box-glow-pink"
                      : "border-border bg-card hover:border-primary/30"
                  }`}>
                  <div className="text-lg mb-1">{opt.icon}</div>
                  <div className="font-bold text-sm text-foreground">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Review ── */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Slot limit notice */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-xs text-cyan-300">
              <span>🃏</span>
              <span>Creation costs <strong>25 Neon Cards</strong>. Max <strong>3 character slots</strong> per account.</span>
            </div>

            {/* Summary card */}
            <div className="p-4 rounded-xl bg-card border border-primary/30 space-y-3 box-glow-blue">
              <div className="flex items-center gap-2 flex-wrap">
                <User size={14} className="text-accent" />
                <span className="font-bold text-sm">{data.name}</span>
                {data.artStyle && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-primary/40 text-primary">{data.artStyle}</span>
                )}
                {data.subGenres.map(sg => (
                  <span key={sg} className="text-[10px] px-1.5 py-0.5 rounded-full border border-accent/40 text-accent">{sg}</span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>⚡ {data.behaviors.join(", ") || "—"}</div>
                <div>🎭 {data.personalities.join(", ") || "—"}</div>
                <div>✨ {data.traits.join(", ") || "—"}</div>
                <div>💫 {data.moods.join(", ") || "—"}</div>
              </div>
            </div>

            {/* Extra fields */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Age</label>
                <input value={data.age} onChange={e => setData(d => ({ ...d, age: e.target.value }))}
                  placeholder="e.g. 22" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary/60" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Visibility</label>
                <div className="flex h-9 rounded-lg border border-border overflow-hidden">
                  {(["private", "public"] as const).map(v => (
                    <button key={v} onClick={() => setData(d => ({ ...d, visibility: v }))}
                      className={`flex-1 text-xs font-bold uppercase tracking-wide transition-all ${
                        data.visibility === v
                          ? v === "public" ? "bg-green-500/20 text-green-400" : "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}>
                      {v === "public" ? "🌐" : "🔒"} {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bio / Backstory (optional)</label>
              <textarea value={data.bio} onChange={e => setData(d => ({ ...d, bio: e.target.value }))}
                rows={2} placeholder="A short backstory or description..."
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Opening Line (optional)</label>
              <input value={data.initialGreeting} onChange={e => setData(d => ({ ...d, initialGreeting: e.target.value }))}
                placeholder="Hey, I've been expecting you..."
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Avatar URL (optional)</label>
              <input value={data.avatarUrl} onChange={e => setData(d => ({ ...d, avatarUrl: e.target.value }))}
                placeholder="https://..." className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            </div>
          </div>
        )}

        {/* ── Navigation buttons (inside scroll so they're never hidden) ── */}
        <div className="flex gap-3 pt-5 mt-2">
          {stepIndex > 0 ? (
            <button onClick={goBack}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}
          {step !== "review" ? (
            <button onClick={goNext} disabled={!canProceed()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-background font-bold text-sm disabled:opacity-40 transition-all box-glow-blue">
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={create} disabled={creating || !data.name.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-40 transition-all box-glow-pink">
              {creating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {creating ? "Creating..." : `Create ${data.name} (25 🃏)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
