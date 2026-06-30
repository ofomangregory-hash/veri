import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, User, Check, RefreshCw, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Wizard preset data ────────────────────────────────────────────────────────

export const CHARACTER_NAMES: { name: string; type: string }[] = [
  { name: "Nova", type: "Modern" }, { name: "Jade", type: "Modern" },
  { name: "Riley", type: "Modern" }, { name: "Skyler", type: "Modern" },
  { name: "Ash", type: "Modern" }, { name: "Devon", type: "Modern" },
  { name: "Morgan", type: "Modern" }, { name: "Sage", type: "Modern" },
  { name: "Quinn", type: "Modern" }, { name: "Blake", type: "Modern" },
  { name: "Harlow", type: "Modern" }, { name: "Remy", type: "Modern" },
  { name: "Sloane", type: "Modern" }, { name: "Avery", type: "Modern" },
  { name: "Peyton", type: "Modern" },
  { name: "Morrigan", type: "Gothic" }, { name: "Raven", type: "Gothic" },
  { name: "Shade", type: "Gothic" }, { name: "Vesper", type: "Gothic" },
  { name: "Theron", type: "Gothic" }, { name: "Cinder", type: "Gothic" },
  { name: "Draven", type: "Gothic" }, { name: "Grimm", type: "Gothic" },
  { name: "Isolde", type: "Gothic" }, { name: "Moira", type: "Gothic" },
  { name: "Aelindra", type: "Elf" }, { name: "Sylvara", type: "Elf" },
  { name: "Thalion", type: "Elf" }, { name: "Elowyn", type: "Elf" },
  { name: "Nimriel", type: "Elf" }, { name: "Lyraniel", type: "Elf" },
  { name: "Arannis", type: "Elf" }, { name: "Caladwen", type: "Elf" },
  { name: "Faendal", type: "Elf" }, { name: "Celebris", type: "Elf" },
  { name: "Damien", type: "Vampire" }, { name: "Lucrezia", type: "Vampire" },
  { name: "Viktor", type: "Vampire" }, { name: "Mordecai", type: "Vampire" },
  { name: "Alaric", type: "Vampire" }, { name: "Dorian", type: "Vampire" },
  { name: "Carmilla", type: "Vampire" }, { name: "Vladislav", type: "Vampire" },
  { name: "Evangeline", type: "Vampire" }, { name: "Caspian", type: "Vampire" },
  { name: "Avara", type: "Succubus" }, { name: "Zephyrine", type: "Succubus" },
  { name: "Delara", type: "Succubus" }, { name: "Velvet", type: "Succubus" },
  { name: "Roxane", type: "Succubus" }, { name: "Mystique", type: "Succubus" },
  { name: "Tempest", type: "Succubus" }, { name: "Scarlet", type: "Succubus" },
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
  "Lustful", "Ravenous", "Intoxicated", "Feverish", "Aching",
  "Possessed", "Insatiable", "Corrupted", "Unraveling", "Dripping Desire",
  "Breathless", "Obsessed", "Conquered", "Worshipful", "Sinful",
];

const VALID_GENRES = ["Anime", "Fantasy", "Modern", "Sci-Fi", "Dark Goth"] as const;
const ART_STYLES = ["Anime", "Realistic", "Semi-Realistic", "Cartoon", "Painterly", "Dark Fantasy", "Retro"];
const SUB_GENRES = [
  "Tsundere", "Yandere", "Kuudere", "Deredere", "Dandere",
  "Villain", "Boss", "Mentor", "Rival", "Childhood Friend",
  "Idol", "Hacker", "Warrior", "Mage", "Rogue",
  "Assassin", "Healer", "Knight", "Rebel", "Scholar",
  "Succubus", "Vampire", "Elf", "Android", "Demon",
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

// ── Appearance fields (39 UX fields, same as admin Quick Create) ──────────────

const BLANK_APPEARANCE: Record<string, string> = {
  hairColor:"", hairLength:"", eyeColor:"", cameraShotType:"", viewDirection:"",
  genderBaseMesh:"", environmentSetting:"", renderingEngine:"", imageFocus:"",
  negativePromptsFilter:"", species:"", hybridSpecies:"",
  height:"", build:"", skinTone:"", earType:"", distinguishingFeature:"",
  voiceTone:"", hairstyle:"", facialExpressionDefault:"", accessory:"",
  tailWings:"", bodyMarkings:"", posture:"", colorPalette:"", occupationLook:"",
  culturalStyle:"", assSize:"", chestSize:"", cameraAngle:"", eyeDetailEnhancer:"",
  clothingMaterialFinish:"", legwearSocksStyle:"", lightingStyle:"", bangsStyle:"",
  makeupStyle:"", outfitFit:"", thighHipSize:"", skinTextureRealism:"", outfitCleavageCut:"",
};

interface AppearanceFieldDef { key: string; label: string; presets: string[]; hybridConditional?: boolean }

const APPEARANCE_FIELDS: AppearanceFieldDef[] = [
  { key:"hairColor",   label:"Hair Color",   presets:["Black","Brown","Blonde","Red","White","Pink","Blue","Purple"] },
  { key:"hairLength",  label:"Hair Length",  presets:["Short","Medium","Long"] },
  { key:"eyeColor",    label:"Eye Color",    presets:["Brown","Blue","Green","Hazel","Gray","Violet"] },
  { key:"cameraShotType",    label:"Camera Shot Type",    presets:["Avatar Portrait (Close-up)","Bust Shot","Upper Body","Full Body Portrait"] },
  { key:"viewDirection",     label:"View Direction",      presets:["Looking at viewer","Looking away","Profile side-view","Looking over shoulder"] },
  { key:"genderBaseMesh",    label:"Gender Base Mesh",    presets:["Female","Male","Non-binary","Androgynous"] },
  { key:"environmentSetting",label:"Environment Setting", presets:["Studio Room","Blurred Indoor Bokeh","Outdoor Nature","Cyberpunk Cityscape","Abstract Gradient"] },
  { key:"renderingEngine",   label:"Rendering Engine",    presets:["Clean Digital Line Art","Soft Cell Shading","Photorealistic Vector","Hyper-Detailed 2D"] },
  { key:"imageFocus",        label:"Image Focus",         presets:["Face Focus","Upper Body Focus","Outfit Focus","Atmospheric/Background Focus"] },
  { key:"negativePromptsFilter",label:"Negative Prompts Filter",presets:["Low Quality Filter","Deformed Hands Filter","Asymmetry Filter","Text/Watermark Scrub"] },
  { key:"species", label:"Species / Race", hybridConditional:true, presets:["Human","Elf","Demon","Angel","Vampire","Android","Hybrid"] },
  { key:"height",   label:"Height",   presets:["Short","Average","Tall"] },
  { key:"build",    label:"Build",    presets:["Slim","Athletic","Average","Curvy"] },
  { key:"skinTone", label:"Skin Tone",presets:["Fair","Light","Medium","Tan","Dark"] },
  { key:"earType",  label:"Ear Type", presets:["Human","Pointed","Animal"] },
  { key:"distinguishingFeature",  label:"Distinguishing Feature",    presets:["Freckles","Scar","Tattoo","Birthmark","Heterochromia","None"] },
  { key:"voiceTone",               label:"Voice Tone",                presets:["Soft","Husky","Cheerful","Stoic","Playful"] },
  { key:"hairstyle",               label:"Hairstyle",                 presets:["Straight","Wavy","Curly","Braided","Ponytail","Twin-tails"] },
  { key:"facialExpressionDefault", label:"Default Facial Expression", presets:["Smiling","Neutral","Serious","Playful","Shy"] },
  { key:"accessory",               label:"Accessory",                 presets:["Glasses","Earrings","Necklace","Headband","None"] },
  { key:"tailWings",               label:"Tail / Wings",              presets:["Tail","Wings","Both","None"] },
  { key:"bodyMarkings",            label:"Body Markings",             presets:["Freckles","Tattoos","Scars","Birthmarks","None"] },
  { key:"posture",                 label:"Posture",                   presets:["Confident","Reserved","Energetic","Calm"] },
  { key:"colorPalette",            label:"Color Palette",             presets:["Warm tones","Cool tones","Monochrome","Pastel","Neon"] },
  { key:"occupationLook",          label:"Occupation Look",           presets:["Casual","Formal","Uniformed","Armored","Streetwear"] },
  { key:"culturalStyle",           label:"Cultural Style",            presets:["Western","Eastern","Futuristic","Medieval","Tribal"] },
  { key:"assSize",                 label:"Ass Size",                  presets:["Subtle","Balanced","Well-rounded","Voluptuous","Exaggerated"] },
  { key:"chestSize",               label:"Chest Size",                presets:["Small","Medium","Large","Ample","Voluptuous","Exaggerated"] },
  { key:"cameraAngle",             label:"Camera Angle",              presets:["Eye Level","Low Angle","High Angle","Cinematic Dutch Angle"] },
  { key:"eyeDetailEnhancer",       label:"Eye Detail",                presets:["Sparkling","Glowing","Sharp","Droopy","Pupilless"] },
  { key:"clothingMaterialFinish",  label:"Clothing Material",         presets:["Matte Fabric","Leather","Silk/Satin","Glossy Latex","Denim","Lace","Metallic Plate"] },
  { key:"legwearSocksStyle",       label:"Legwear / Socks",           presets:["Thigh-high stockings","Fishnets","Crew socks","Barefoot","Tights","None"] },
  { key:"lightingStyle",           label:"Lighting Style",            presets:["Studio Lighting","Cinematic Soft Glow","Dramatic Shadows","Neon Rim Lighting","Golden Hour"] },
  { key:"bangsStyle",              label:"Bangs Style",               presets:["Blunt Bangs","Side-swept Bangs","Curtain Bangs","See-through Bangs","Forehead Exposed"] },
  { key:"makeupStyle",             label:"Makeup Style",              presets:["Natural","Gothic","Glamour","Cosplay/Alt","None"] },
  { key:"outfitFit",               label:"Outfit Fit",                presets:["Skin-tight","Form-fitting","Regular Fit","Loose","Oversized"] },
  { key:"thighHipSize",            label:"Thigh / Hip Size",          presets:["Slim","Proportional","Wide","Thick","Hourglass"] },
  { key:"skinTextureRealism",      label:"Skin Texture",              presets:["Smooth 2D","Textured Matt","Pore Detail (Realistic Mode)","Flawless Satin"] },
  { key:"outfitCleavageCut",       label:"Outfit Cleavage / Cut",     presets:["High Neck","V-Neck","Plunging","Off-shoulder","Backless","Covered"] },
];

// ── Appearance ChipField ──────────────────────────────────────────────────────

interface AppChipProps { fieldDef: AppearanceFieldDef; value: string; onChange: (v: string) => void }

function AppChipField({ fieldDef, value, onChange }: AppChipProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  function applyCustom() {
    const v = customVal.trim();
    if (v) { onChange(v); setShowCustom(false); setCustomVal(""); }
  }
  return (
    <div className="space-y-1.5 p-2.5 rounded-lg border border-border/60 bg-background/40">
      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{fieldDef.label}</label>
      <div className="flex flex-wrap gap-1.5">
        {fieldDef.presets.map(p => (
          <button key={p} type="button" onClick={() => onChange(value === p ? "" : p)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
              value === p ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}>
            {p}
          </button>
        ))}
        <button type="button" onClick={() => setShowCustom(s => !s)}
          className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-dashed border-primary/40 text-primary/70 hover:border-primary hover:text-primary transition-all">
          + Custom
        </button>
      </div>
      {showCustom && (
        <div className="flex gap-2 items-center">
          <input type="text" value={customVal} onChange={e => setCustomVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } }}
            placeholder={`Custom…`}
            className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
          <button type="button" onClick={applyCustom}
            className="h-7 px-2 rounded-md bg-primary/20 border border-primary/40 text-primary text-xs font-bold hover:bg-primary/30">✓</button>
        </div>
      )}
      {value && (
        <div className="text-[10px] text-primary flex items-center gap-1">
          ✓ <span className="font-semibold">{value}</span>
          <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground ml-1">×</button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function buildAppearanceText(app: Record<string, string>): string {
  const segments: string[] = [];
  const t = (v: string | undefined) => v ?? "";
  const hair = [t(app.hairColor), t(app.hairLength)].filter(Boolean);
  if (hair.length) segments.push(`${hair.join(" ")} hair`);
  if (app.eyeColor) segments.push(`${app.eyeColor} eyes`);
  const outfitParts: string[] = [];
  if (app.occupationLook) outfitParts.push(`wearing ${app.occupationLook}`);
  if (app.outfitFit) outfitParts.push(`in ${app.outfitFit} style`);
  if (app.outfitCleavageCut) outfitParts.push(`with ${app.outfitCleavageCut} cut`);
  if (outfitParts.length) segments.push(outfitParts.join(" "));
  if (app.clothingMaterialFinish) segments.push(`made of ${app.clothingMaterialFinish}`);
  if (app.legwearSocksStyle) segments.push(`styled with ${app.legwearSocksStyle}`);
  const bodyParts: string[] = [];
  if (app.build || app.height) bodyParts.push([app.build ? `body build is ${app.build}` : "", app.height ? `${app.height} height` : ""].filter(Boolean).join(" with "));
  if (app.chestSize) bodyParts.push(`${app.chestSize} chest`);
  if (app.assSize) bodyParts.push(`${app.assSize} ass`);
  if (app.thighHipSize) bodyParts.push(`${app.thighHipSize} hips`);
  if (bodyParts.length) segments.push(bodyParts.join(", "));
  if (app.skinTone || app.skinTextureRealism) segments.push([app.skinTone, "skin tone", app.skinTextureRealism ? `with ${app.skinTextureRealism} finish` : ""].filter(Boolean).join(" "));
  if (app.species) segments.push(app.hybridSpecies ? `${app.species} race (hybrid origin: ${app.hybridSpecies})` : `${app.species} race`);
  if (app.earType) segments.push(`${app.earType} ears`);
  if (app.hairstyle || app.bangsStyle) segments.push([app.hairstyle ? `${app.hairstyle} hair` : "", app.bangsStyle ? `with ${app.bangsStyle} bangs` : ""].filter(Boolean).join(" "));
  if (app.makeupStyle) segments.push(`${app.makeupStyle} makeup`);
  if (app.facialExpressionDefault || app.eyeDetailEnhancer) segments.push([app.facialExpressionDefault ? `${app.facialExpressionDefault} expression` : "", app.eyeDetailEnhancer ? `${app.eyeDetailEnhancer} eye detail` : ""].filter(Boolean).join(", "));
  if (app.posture) segments.push(`${app.posture} posture`);
  if (app.distinguishingFeature) segments.push(app.distinguishingFeature);
  if (app.bodyMarkings) segments.push(app.bodyMarkings);
  if (app.accessory) segments.push(`wearing ${app.accessory}`);
  if (app.colorPalette) segments.push(`${app.colorPalette} color palette`);
  const camParts: string[] = [];
  if (app.environmentSetting) camParts.push(app.environmentSetting);
  if (app.cameraAngle) camParts.push(`${app.cameraAngle} angle`);
  if (app.cameraShotType) camParts.push(`${app.cameraShotType} shot`);
  if (camParts.length) segments.push(camParts.join(", "));
  if (app.viewDirection) segments.push(`looking ${app.viewDirection}`);
  if (app.imageFocus) segments.push(`${app.imageFocus}`);
  if (app.lightingStyle) segments.push(`${app.lightingStyle} lighting`);
  if (app.renderingEngine) segments.push(`rendered as ${app.renderingEngine}`);
  return segments.filter(Boolean).join(", ");
}

function buildSystemPrompt(data: WizardData): string {
  const { name, characterType, genre, artStyle, subGenres, scenes, behaviors, personalities, traits, moods, bio, initialGreeting, appearance } = data;
  const appearanceText = buildAppearanceText(appearance);
  const parts = [
    `You are ${name}, a ${characterType} companion in the Z-Fantasy universe.`,
    genre ? `Genre: ${genre}.` : "",
    artStyle ? `Art style: ${artStyle}.` : "",
    subGenres.length ? `Character type: ${subGenres.join(", ")}.` : "",
    bio ? `Background: ${bio}` : "",
    appearanceText ? `Appearance: ${appearanceText}.` : "",
    appearance.voiceTone ? `Voice tone: ${appearance.voiceTone}.` : "",
    scenes.length ? `Your world and setting: ${scenes.join(", ")}.` : "",
    behaviors.length ? `Your core behaviors: ${behaviors.join(", ")}.` : "",
    personalities.length ? `Your personality archetype: ${personalities.join(", ")}.` : "",
    traits.length ? `Your special traits: ${traits.join(", ")}.` : "",
    moods.length ? `Your prevailing mood and energy: ${moods.join(", ")}.` : "",
    initialGreeting ? `Your opening line is: "${initialGreeting}"` : "",
    appearance.negativePromptsFilter ? `[Image quality filter: ${appearance.negativePromptsFilter}]` : "",
    "Stay fully in character at all times. Never break the fourth wall. Let your personality shine through every response.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WizardData {
  name: string;
  characterType: string;
  genre: string;
  artStyle: string;
  subGenres: string[];
  scenes: string[];
  behaviors: string[];
  personalities: string[];
  traits: string[];
  moods: string[];
  bio: string;
  age: string;
  tags: string;
  initialGreeting: string;
  avatarUrl: string;
  visibility: "public" | "private";
  nsfwEnabled: boolean;
  appearance: Record<string, string>;
}

export interface CharacterForEdit {
  characterId: string;
  name: string;
  genre: string;
  visibility: string;
  avatarUrl?: string | null;
  teaserDescription?: string | null;
  initialGreeting?: string | null;
  tags: string[];
  systemPrompt?: string | null;
}

type Step = "name" | "details" | "scene" | "behavior" | "personality" | "traits" | "mood" | "appearance" | "nsfw" | "visibility" | "review";
const BASE_STEPS: Step[] = ["name", "details", "scene", "behavior", "personality", "traits", "mood", "appearance", "visibility", "review"];
const SUPREME_STEPS: Step[] = ["name", "details", "scene", "behavior", "personality", "traits", "mood", "appearance", "nsfw", "visibility", "review"];

const STEP_LABELS: Record<Step, string> = {
  name: "Name", details: "Details", scene: "Scene", behavior: "Behavior",
  personality: "Personality", traits: "Traits", mood: "Mood",
  appearance: "Appearance", nsfw: "NSFW", visibility: "Visibility", review: "Review",
};

const MAX_PERSONALITIES = 3;
const MAX_SCENES = 5;
const MAX_BEHAVIORS = 7;
const MAX_TRAITS = 7;
const MAX_MOODS = 5;
const MAX_SUB_GENRES = 2;

// ── Multi-select Chip ─────────────────────────────────────────────────────────

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all select-none ${
        selected
          ? "bg-primary/30 text-primary border-primary/60 box-glow-pink"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30"
      }`}>
      {selected && <Check size={10} className="inline mr-1" />}{label}
    </button>
  );
}

// ── Main Props ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: () => void;
  isSupremeAdmin?: boolean;
  character?: CharacterForEdit;
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export function CharacterWizard({ onClose, onCreated, isSupremeAdmin = false, character }: Props) {
  const { toast } = useToast();
  const isEditMode = Boolean(character);
  const STEPS = isSupremeAdmin ? SUPREME_STEPS : BASE_STEPS;

  // Pre-fill from character if editing
  const inferGenre = (g: string) => (VALID_GENRES as readonly string[]).includes(g) ? g : "Modern";
  const inferNsfw = (tags: string[]) => tags.includes("#NSFW");
  const inferTags = (tags: string[]) =>
    tags.filter(t => !(VALID_GENRES as readonly string[]).includes(t) && t !== "#NSFW").join(", ");

  const defaultData: WizardData = character ? {
    name: character.name,
    characterType: character.genre || "Modern",
    genre: inferGenre(character.genre),
    artStyle: "",
    subGenres: [],
    scenes: [],
    behaviors: [],
    personalities: [],
    traits: [],
    moods: [],
    bio: character.teaserDescription || "",
    age: "",
    tags: inferTags(character.tags),
    initialGreeting: character.initialGreeting || "",
    avatarUrl: character.avatarUrl || "",
    visibility: (character.visibility as "public" | "private") || "private",
    nsfwEnabled: inferNsfw(character.tags),
    appearance: { ...BLANK_APPEARANCE },
  } : {
    name: "", characterType: "Modern", genre: "Modern", artStyle: "",
    subGenres: [], scenes: [], behaviors: [], personalities: [],
    traits: [], moods: [], bio: "", age: "", tags: "",
    initialGreeting: "", avatarUrl: "", visibility: "private", nsfwEnabled: false,
    appearance: { ...BLANK_APPEARANCE },
  };

  const [step, setStep] = useState<Step>("name");
  const [typeFilter, setTypeFilter] = useState("All");
  const [saving, setSaving] = useState(false);
  const [customName, setCustomName] = useState("");
  const [hybridSpeciesInput, setHybridSpeciesInput] = useState("");

  type ListStep = "scenes" | "behaviors" | "personalities" | "traits" | "moods";
  const [customText, setCustomText] = useState<Record<ListStep | "subGenres", string>>({
    scenes: "", behaviors: "", personalities: "", traits: "", moods: "", subGenres: "",
  });
  const [showCustom, setShowCustom] = useState<Record<ListStep | "subGenres", boolean>>({
    scenes: false, behaviors: false, personalities: false, traits: false, moods: false, subGenres: false,
  });

  const [data, setData] = useState<WizardData>(defaultData);

  const stepIndex = STEPS.indexOf(step);

  function goNext() { const next = STEPS[stepIndex + 1]; if (next) setStep(next); }
  function goBack() { const prev = STEPS[stepIndex - 1]; if (prev) setStep(prev); }

  function submitCustom(key: ListStep, max: number) {
    const val = customText[key].trim();
    if (val) toggle(key, val, max);
    setCustomText(p => ({ ...p, [key]: "" }));
    setShowCustom(p => ({ ...p, [key]: false }));
  }

  function submitCustomSubGenre() {
    const val = customText.subGenres.trim();
    if (val) toggleSubGenre(val);
    setCustomText(p => ({ ...p, subGenres: "" }));
    setShowCustom(p => ({ ...p, subGenres: false }));
  }

  function toggle<K extends "behaviors" | "personalities" | "traits" | "moods" | "scenes">(key: K, value: string, max: number) {
    setData(d => {
      const arr = d[key] as string[];
      if (arr.includes(value)) return { ...d, [key]: arr.filter(x => x !== value) };
      if (arr.length >= max) { toast({ title: `Max ${max} selections`, variant: "destructive" }); return d; }
      return { ...d, [key]: [...arr, value] };
    });
  }

  function toggleSubGenre(value: string) {
    setData(d => {
      if (d.subGenres.includes(value)) return { ...d, subGenres: d.subGenres.filter(x => x !== value) };
      if (d.subGenres.length >= MAX_SUB_GENRES) { toast({ title: `Max ${MAX_SUB_GENRES} sub-genres`, variant: "destructive" }); return d; }
      return { ...d, subGenres: [...d.subGenres, value] };
    });
  }

  function setAppearanceField(key: string, value: string) {
    setData(d => ({ ...d, appearance: { ...d.appearance, [key]: value } }));
  }

  const canProceed = (): boolean => {
    if (step === "name") return data.name.length > 0;
    if (step === "details") return true; // all optional
    if (step === "scene") return isEditMode || data.scenes.length > 0;
    if (step === "behavior") return isEditMode || data.behaviors.length > 0;
    if (step === "personality") return isEditMode || data.personalities.length > 0;
    if (step === "traits") return isEditMode || data.traits.length > 0;
    if (step === "mood") return isEditMode || data.moods.length > 0;
    if (step === "appearance") return true; // all optional
    return true;
  };

  const filteredNames = typeFilter === "All"
    ? CHARACTER_NAMES
    : typeFilter === "Custom"
    ? []
    : CHARACTER_NAMES.filter(n => n.type === typeFilter);

  async function save() {
    if (!data.name.trim()) return;
    setSaving(true);
    try {
      const systemPrompt = buildSystemPrompt(data);
      const allTags = [
        data.genre || data.characterType,
        ...data.subGenres,
        ...data.tags.split(",").map((t: string) => t.trim()).filter(Boolean),
        ...(data.nsfwEnabled ? ["#NSFW"] : []),
      ].filter(Boolean);

      // Appearance payload (non-empty fields → injected into systemPrompt above)
      const appearancePayload: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.appearance)) {
        if (v) appearancePayload[k] = v;
      }

      if (isEditMode && character) {
        // EDIT: PATCH existing character via standard characters endpoint (admin has access)
        await adminApi("PATCH", `/api/characters/${character.characterId}`, {
          name: data.name.trim(),
          bio: data.bio || undefined,
          initialGreeting: data.initialGreeting || undefined,
          visibility: data.visibility,
          tags: allTags,
          avatarUrl: data.avatarUrl || undefined,
          systemPrompt,
        });
        toast({ title: `✅ ${data.name} saved!` });
      } else {
        // CREATE: POST new character via admin endpoint
        await adminApi("POST", "/admin/characters/create", {
          name: data.name.trim(),
          bio: data.bio || undefined,
          age: data.age || undefined,
          genre: data.genre || data.characterType,
          tags: allTags,
          avatarUrl: data.avatarUrl || undefined,
          initialGreeting: data.initialGreeting || undefined,
          visibility: data.visibility,
          systemPrompt,
          nsfwEnabled: data.nsfwEnabled,
          ...appearancePayload,
        });
        toast({ title: `✅ ${data.name} created!` });
      }

      onCreated();
      onClose();
    } catch (e) {
      toast({ title: isEditMode ? "Save failed" : "Create failed", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors">
          <X size={18} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-sm uppercase tracking-widest text-glow-blue flex items-center gap-2">
            <Wand2 size={14} />
            {isEditMode ? `Editing: ${character?.name}` : "Character Wizard"}
          </h2>
          {data.name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{data.name}{data.genre ? ` · ${data.genre}` : ""}{data.artStyle ? ` · ${data.artStyle}` : ""}</p>}
        </div>
        <div className="text-xs text-muted-foreground font-mono shrink-0">{stepIndex + 1}/{STEPS.length} · {STEP_LABELS[step]}</div>
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
        {step === "scene" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_SCENES} · {data.scenes.length}/{MAX_SCENES}</span>}
        {step === "behavior" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_BEHAVIORS} · {data.behaviors.length}/{MAX_BEHAVIORS}</span>}
        {step === "personality" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_PERSONALITIES} · {data.personalities.length}/{MAX_PERSONALITIES}</span>}
        {step === "traits" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_TRAITS} · {data.traits.length}/{MAX_TRAITS}</span>}
        {step === "mood" && <span className="text-xs text-muted-foreground ml-2">pick up to {MAX_MOODS} · {data.moods.length}/{MAX_MOODS}</span>}
        {step === "details" && <span className="text-xs text-muted-foreground ml-2">genre, art style, sub-genres, age, tags — all optional</span>}
        {step === "appearance" && <span className="text-xs text-muted-foreground ml-2">all 40 fields optional — chip or custom</span>}
        {isEditMode && step !== "review" && <span className="text-xs text-yellow-400/60 ml-2">(editing)</span>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">

        {/* ── Step: Name ── */}
        {step === "name" && (
          <div className="space-y-3">
            {/* In edit mode, show a simple text input at top */}
            {isEditMode && (
              <div className="space-y-1.5 mb-3">
                <label className="text-xs text-muted-foreground font-semibold">Character Name</label>
                <input value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {CHARACTER_TYPES.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                    typeFilter === t ? "bg-accent text-background border-accent" : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}>{t}</button>
              ))}
            </div>

            {typeFilter === "Custom" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Enter a custom name</label>
                <input
                  value={customName}
                  onChange={e => {
                    setCustomName(e.target.value);
                    setData(d => ({ ...d, name: e.target.value, characterType: "Custom" }));
                  }}
                  placeholder="e.g. Seraphina..."
                  className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {filteredNames.map(({ name, type }) => (
                  <button key={name} onClick={() => setData(d => ({ ...d, name, characterType: type }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      data.name === name
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
            )}
          </div>
        )}

        {/* ── Step: Details (Genre, Art Style, Sub-genres, Age, Tags, Bio, Greeting, Avatar) ── */}
        {step === "details" && (
          <div className="space-y-4">
            {/* Genre */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Genre</label>
              <div className="flex flex-wrap gap-2">
                {VALID_GENRES.map(g => (
                  <button key={g} onClick={() => setData(d => ({ ...d, genre: g }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      data.genre === g ? "bg-accent/20 border-accent text-accent" : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground"
                    }`}>{g}</button>
                ))}
              </div>
            </div>

            {/* Art Style */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Art Style</label>
              <div className="flex flex-wrap gap-2">
                {ART_STYLES.map(s => (
                  <button key={s} onClick={() => setData(d => ({ ...d, artStyle: d.artStyle === s ? "" : s }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      data.artStyle === s ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}>{s}</button>
                ))}
              </div>
            </div>

            {/* Sub-genres (max 2) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Sub-genres / Character Type
                <span className="text-muted-foreground/50 ml-1 font-normal">(max 2 · {data.subGenres.length}/{MAX_SUB_GENRES})</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SUB_GENRES.map(sg => (
                  <button key={sg} onClick={() => toggleSubGenre(sg)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      data.subGenres.includes(sg) ? "bg-secondary/30 border-secondary text-secondary" : "border-border text-muted-foreground hover:border-secondary/40 hover:text-foreground"
                    }`}>
                    {data.subGenres.includes(sg) && <Check size={9} className="inline mr-0.5" />}{sg}
                  </button>
                ))}
                <button onClick={() => setShowCustom(p => ({ ...p, subGenres: true }))}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-secondary/40 text-secondary/70 hover:border-secondary hover:text-secondary transition-all">
                  + Custom
                </button>
              </div>
              {showCustom.subGenres && (
                <div className="flex gap-2">
                  <input autoFocus value={customText.subGenres} onChange={e => setCustomText(p => ({ ...p, subGenres: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && submitCustomSubGenre()}
                    placeholder="Custom sub-genre..."
                    className="flex-1 h-8 rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:border-secondary" />
                  <button onClick={submitCustomSubGenre} className="px-3 h-8 rounded-lg bg-secondary/20 text-secondary text-xs font-bold border border-secondary/40 hover:bg-secondary/30">Add</button>
                </div>
              )}
              {data.subGenres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.subGenres.map(sg => (
                    <span key={sg} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/20 border border-secondary/40 text-secondary text-[11px] font-semibold">
                      {sg}
                      <button onClick={() => setData(d => ({ ...d, subGenres: d.subGenres.filter(x => x !== sg) }))} className="hover:text-white">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Apparent Age */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Apparent Age</label>
              <input value={data.age} onChange={e => setData(d => ({ ...d, age: e.target.value }))}
                placeholder="e.g. 22"
                className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags <span className="font-normal text-muted-foreground/50">(comma-separated)</span></label>
              <input value={data.tags} onChange={e => setData(d => ({ ...d, tags: e.target.value }))}
                placeholder="Tsundere, Boss, Hacker..."
                className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>

            {/* Bio */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bio / Core Directives</label>
              <textarea value={data.bio} onChange={e => setData(d => ({ ...d, bio: e.target.value }))}
                rows={3} placeholder="A short backstory or personality description..."
                className="w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60" />
            </div>

            {/* Initial Greeting */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Initial Greeting</label>
              <input value={data.initialGreeting} onChange={e => setData(d => ({ ...d, initialGreeting: e.target.value }))}
                placeholder="Hey, I've been expecting you..."
                className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>

            {/* Avatar URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Avatar URL</label>
              <input value={data.avatarUrl} onChange={e => setData(d => ({ ...d, avatarUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>
          </div>
        )}

        {/* ── Step: Scene ── */}
        {step === "scene" && (
          <div className="space-y-3">
            {isEditMode && <p className="text-xs text-muted-foreground">Scenes from the original creation can't be recovered — pick new ones or skip this step.</p>}
            <div className="grid grid-cols-2 gap-2">
              {SCENES.map(scene => (
                <button key={scene} onClick={() => toggle("scenes", scene, MAX_SCENES)}
                  className={`p-3 rounded-xl border text-left text-sm font-semibold transition-all ${
                    data.scenes.includes(scene)
                      ? "border-primary/60 bg-primary/15 text-primary box-glow-pink"
                      : "border-border bg-card text-foreground hover:border-primary/30 hover:text-primary"
                  }`}>
                  {data.scenes.includes(scene) && <Check size={10} className="inline mr-1" />}
                  {scene}
                </button>
              ))}
            </div>
            {showCustom.scenes ? (
              <div className="flex gap-2">
                <input autoFocus value={customText.scenes} onChange={e => setCustomText(p => ({ ...p, scenes: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("scenes", MAX_SCENES)}
                  placeholder="Type a custom scene..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent" />
                <button onClick={() => submitCustom("scenes", MAX_SCENES)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30">Add</button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, scenes: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5">
                ➕ Add Custom
              </button>
            )}
          </div>
        )}

        {/* ── Step: Behavior ── */}
        {step === "behavior" && (
          <div className="space-y-3">
            {isEditMode && <p className="text-xs text-muted-foreground">Select behaviors to add — these will be merged into the updated system prompt.</p>}
            <div className="flex flex-wrap gap-2">
              {BEHAVIORS.map(b => (
                <Chip key={b} label={b} selected={data.behaviors.includes(b)}
                  onClick={() => toggle("behaviors", b, MAX_BEHAVIORS)} />
              ))}
            </div>
            {showCustom.behaviors ? (
              <div className="flex gap-2">
                <input autoFocus value={customText.behaviors} onChange={e => setCustomText(p => ({ ...p, behaviors: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("behaviors", MAX_BEHAVIORS)}
                  placeholder="Type a custom behavior..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent" />
                <button onClick={() => submitCustom("behaviors", MAX_BEHAVIORS)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30">Add</button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, behaviors: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5">
                ➕ Add Custom
              </button>
            )}
          </div>
        )}

        {/* ── Step: Personality ── */}
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
                <input autoFocus value={customText.personalities} onChange={e => setCustomText(p => ({ ...p, personalities: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("personalities", MAX_PERSONALITIES)}
                  placeholder="Type a custom personality..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent" />
                <button onClick={() => submitCustom("personalities", MAX_PERSONALITIES)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30">Add</button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, personalities: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5">
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
                <input autoFocus value={customText.traits} onChange={e => setCustomText(p => ({ ...p, traits: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("traits", MAX_TRAITS)}
                  placeholder="Type a custom trait..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent" />
                <button onClick={() => submitCustom("traits", MAX_TRAITS)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30">Add</button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, traits: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5">
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
                <input autoFocus value={customText.moods} onChange={e => setCustomText(p => ({ ...p, moods: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitCustom("moods", MAX_MOODS)}
                  placeholder="Type a custom mood..."
                  className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:border-accent" />
                <button onClick={() => submitCustom("moods", MAX_MOODS)}
                  className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30">Add</button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(p => ({ ...p, moods: true }))}
                className="w-full py-2 rounded-lg border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5">
                ➕ Add Custom
              </button>
            )}
          </div>
        )}

        {/* ── Step: Appearance (40 fields, all optional) ── */}
        {step === "appearance" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground pb-1">
              All 40 appearance fields are optional. Filled fields are embedded into the character's system prompt and image generation pipeline.
              {isEditMode && " Blank fields will not overwrite existing appearance data."}
            </p>
            {APPEARANCE_FIELDS.map(f => (
              <div key={f.key}>
                <AppChipField fieldDef={f} value={data.appearance[f.key] ?? ""} onChange={v => setAppearanceField(f.key, v)} />
                {/* Hybrid species conditional sub-input */}
                {f.hybridConditional && data.appearance[f.key] && data.appearance[f.key].toLowerCase().includes("hybrid") && (
                  <div className="mt-2 ml-2 flex gap-2 items-center">
                    <span className="text-[11px] text-muted-foreground shrink-0">Hybrid of which species?</span>
                    <input type="text" value={hybridSpeciesInput} onChange={e => {
                      setHybridSpeciesInput(e.target.value);
                      setAppearanceField("hybridSpecies", e.target.value);
                    }}
                      placeholder="e.g. Half-elf, Half-demon…"
                      className="flex-1 h-7 rounded-md border border-primary/40 bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Step: NSFW (supreme admin only) ── */}
        {step === "nsfw" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/30 space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <span className="text-lg">🔞</span>
                <span className="font-bold text-sm uppercase tracking-wider">NSFW Content</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enabling NSFW allows this character to engage in explicit adult conversations and generate mature content.
                This tag will add <strong className="text-red-400">#NSFW</strong> to the character's tags.
              </p>
              <p className="text-xs text-red-400/70 font-medium">⚠️ Only Supreme Admins can set NSFW characters. Use responsibly.</p>
            </div>
            <button onClick={() => setData(d => ({ ...d, nsfwEnabled: !d.nsfwEnabled }))}
              className={`w-full p-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${
                data.nsfwEnabled ? "border-red-500/60 bg-red-950/40 box-glow-pink" : "border-border bg-card hover:border-red-500/30"
              }`}>
              <span className="text-4xl">{data.nsfwEnabled ? "🔞" : "🔒"}</span>
              <div className="text-center">
                <div className={`font-bold text-base ${data.nsfwEnabled ? "text-red-400" : "text-muted-foreground"}`}>
                  {data.nsfwEnabled ? "NSFW Enabled" : "NSFW Disabled"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.nsfwEnabled ? "Character will have explicit capabilities" : "Character will stay tasteful & PG-13"}
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded-full text-xs font-bold border ${
                data.nsfwEnabled ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-card text-muted-foreground border-border"
              }`}>
                {data.nsfwEnabled ? "NSFW ON" : "NSFW OFF"}
              </div>
            </button>
          </div>
        )}

        {/* ── Step: Visibility ── */}
        {step === "visibility" && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground leading-relaxed px-1">
              Set who can discover this character on the Explore page. Public characters appear for all users; private characters are only accessible to you.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {(["public", "private"] as const).map(v => (
                <button key={v} onClick={() => setData(d => ({ ...d, visibility: v }))}
                  className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                    data.visibility === v
                      ? v === "public" ? "border-green-500/60 bg-green-950/40 box-glow-blue" : "border-purple-500/60 bg-purple-950/40"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}>
                  <span className="text-3xl">{v === "public" ? "🌐" : "🔒"}</span>
                  <div className="text-center">
                    <div className={`font-bold text-sm ${data.visibility === v ? v === "public" ? "text-green-400" : "text-purple-300" : "text-muted-foreground"}`}>
                      {v === "public" ? "Public" : "Private"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {v === "public" ? "Visible on Explore" : "Only visible to you"}
                    </div>
                  </div>
                  {data.visibility === v && (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${v === "public" ? "bg-green-500/20 text-green-400" : "bg-purple-500/20 text-purple-400"}`}>
                      <Check size={12} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Review ── */}
        {step === "review" && (
          <div className="space-y-4">
            {!isEditMode && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-xs text-cyan-300">
                <span>🃏</span>
                <span>Creation costs <strong>25 Neon Cards</strong>. Max <strong>3 character slots</strong> per account.</span>
              </div>
            )}
            {isEditMode && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent">
                <span>✏️</span>
                <span>Editing <strong>{character?.name}</strong> — all changes will update the character's system prompt and Supabase record.</span>
              </div>
            )}

            <div className="p-4 rounded-xl bg-card border border-primary/30 space-y-3 box-glow-blue">
              <div className="flex items-center gap-2 flex-wrap">
                <User size={14} className="text-accent" />
                <span className="font-bold text-sm">{data.name}</span>
                {data.genre && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TYPE_COLORS[data.genre] ?? "text-muted-foreground border-border"}`}>{data.genre}</span>}
                {data.artStyle && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-secondary/40 text-secondary">{data.artStyle}</span>}
              </div>
              {data.subGenres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.subGenres.map(sg => <span key={sg} className="text-[10px] px-1.5 py-0.5 rounded-full border border-secondary/40 text-secondary bg-secondary/10">{sg}</span>)}
                </div>
              )}
              <div className="text-xs text-muted-foreground space-y-1">
                {data.scenes.length > 0 && <div>🌍 <span className="text-foreground">{data.scenes.join(", ")}</span></div>}
                {data.behaviors.length > 0 && <div>⚡ {data.behaviors.join(", ")}</div>}
                {data.personalities.length > 0 && <div>🎭 {data.personalities.join(", ")}</div>}
                {data.traits.length > 0 && <div>✨ {data.traits.join(", ")}</div>}
                {data.moods.length > 0 && <div>💫 {data.moods.join(", ")}</div>}
                {data.bio && <div>📖 {data.bio.slice(0, 80)}{data.bio.length > 80 ? "…" : ""}</div>}
              </div>

              {/* Appearance summary */}
              {(() => {
                const filled = Object.entries(data.appearance).filter(([k, v]) => v && k !== "hybridSpecies").length;
                return filled > 0 ? (
                  <div className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-2">
                    ✨ <span className="text-foreground font-semibold">{filled}</span> appearance fields set
                  </div>
                ) : null;
              })()}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                data.visibility === "public" ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-border text-muted-foreground bg-muted"
              }`}>
                {data.visibility === "public" ? "🌐 Public" : "🔒 Private"}
              </span>
              {data.nsfwEnabled && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-red-500/50 text-red-400 bg-red-500/10 font-bold">🔞 NSFW</span>
              )}
              {data.tags && data.tags.split(",").filter(Boolean).slice(0, 3).map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{t.trim()}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="px-4 py-3 border-t border-border flex gap-3 shrink-0">
        {stepIndex > 0 && (
          <button onClick={goBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft size={16} /> Back
          </button>
        )}

        {step !== "review" ? (
          <button onClick={goNext} disabled={!canProceed()}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 transition-all ${
              step === "nsfw" && data.nsfwEnabled
                ? "bg-red-600 text-white box-glow-pink"
                : "bg-accent text-background box-glow-blue"
            }`}>
            Continue <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={save} disabled={saving || !data.name.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-40 transition-all box-glow-pink">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : isEditMode ? <Wand2 size={14} /> : <Sparkles size={14} />}
            {saving
              ? (isEditMode ? "Saving…" : "Creating…")
              : isEditMode
              ? `Save Changes to ${data.name}`
              : `Create ${data.name} (25 🃏)`}
          </button>
        )}
      </div>
    </div>
  );
}
