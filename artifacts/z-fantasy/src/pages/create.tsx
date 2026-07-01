import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, ChevronLeft, ChevronRight, Check, RefreshCw, Save, MessageCircle, Pencil,
} from "lucide-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";

const PRESET_NAMES = ["Nexus-9", "Lyra", "Vex", "Aria", "Cipher", "Nyx", "Seraph", "Zara"];

const SUB_GENRES = [
  "Fantasy", "Adventure", "Romance", "Horror", "Sci-Fi", "Cyberpunk",
  "Supernatural", "Historical", "Modern", "Isekai", "Slice of Life",
  "Thriller", "Drama", "Action", "Elf", "Vampire", "Demon", "Angel", "Warrior", "Mage",
];
const MAX_SUBGENRES = 2;

interface AppearanceFieldDef {
  key: string;
  label: string;
  options: string[];
  required: boolean;
  multiSelect?: boolean;
}

// Keys that allow picking multiple options (stored as comma-separated string)
const MULTI_SELECT_APPEARANCE_KEYS = new Set([
  "distinguishing_feature",
  "accessory",
  "body_markings",
  "color_palette",
  "cultural_style",
  "negative_prompts_filter",
]);

const APPEARANCE_FIELDS: AppearanceFieldDef[] = [
  // Required (11)
  { key: "hair_color",            label: "Hair Color",               required: true,  options: ["Black", "Brown", "Blonde", "Red", "White", "Pink", "Blue", "Purple"] },
  { key: "hair_length",           label: "Hair Length",              required: true,  options: ["Short", "Medium", "Long"] },
  { key: "eye_color",             label: "Eye Color",                required: true,  options: ["Brown", "Blue", "Green", "Hazel", "Gray", "Violet"] },
  { key: "camera_shot_type",      label: "Camera Shot Type",         required: true,  options: ["Avatar Portrait (Close-up)", "Bust Shot", "Upper Body", "Full Body Portrait"] },
  { key: "view_direction",        label: "View Direction",           required: true,  options: ["Looking at viewer", "Looking away", "Profile side-view", "Looking over shoulder"] },
  { key: "gender_base_mesh",      label: "Gender / Base Mesh",       required: true,  options: ["Female", "Male", "Non-binary", "Androgynous"] },
  { key: "environment_setting",   label: "Environment Setting",      required: true,  options: ["Studio Room", "Blurred Indoor Bokeh", "Outdoor Nature", "Cyberpunk Cityscape", "Abstract Gradient"] },
  { key: "rendering_engine",      label: "Rendering Engine",         required: true,  options: ["Clean Digital Line Art", "Soft Cell Shading", "Photorealistic Vector", "Hyper-Detailed 2D"] },
  { key: "image_focus",           label: "Image Focus",              required: true,  options: ["Face Focus", "Upper Body Focus", "Outfit Focus", "Atmospheric/Background Focus"] },
  {
    key: "negative_prompts_filter", label: "Negative Prompts Filter", required: true,
    multiSelect: true,
    options: ["Low Quality Filter", "Deformed Hands Filter", "Asymmetry Filter", "Text/Watermark Scrub"],
  },
  { key: "species",               label: "Species / Race",           required: true,  options: ["Human", "Elf", "Demon", "Angel", "Vampire", "Android", "Hybrid"] },
  // Optional (29)
  { key: "height",                label: "Height",                   required: false, options: ["Short", "Average", "Tall"] },
  { key: "build",                 label: "Build",                    required: false, options: ["Slim", "Athletic", "Average", "Curvy"] },
  { key: "skin_tone",             label: "Skin Tone",                required: false, options: ["Fair", "Light", "Medium", "Tan", "Dark"] },
  { key: "ear_type",              label: "Ear Type",                 required: false, options: ["Human", "Pointed", "Animal"] },
  {
    key: "distinguishing_feature", label: "Distinguishing Feature",  required: false,
    multiSelect: true,
    options: ["Freckles", "Scar", "Tattoo", "Birthmark", "Heterochromia", "None"],
  },
  { key: "voice_tone",            label: "Voice Tone",               required: false, options: ["Soft", "Husky", "Cheerful", "Stoic", "Playful"] },
  { key: "hairstyle",             label: "Hairstyle",                required: false, options: ["Straight", "Wavy", "Curly", "Braided", "Ponytail", "Twin-tails"] },
  { key: "facial_expression_default", label: "Default Expression",   required: false, options: ["Smiling", "Neutral", "Serious", "Playful", "Shy"] },
  {
    key: "accessory",             label: "Accessory",                required: false,
    multiSelect: true,
    options: ["Glasses", "Earrings", "Necklace", "Headband", "None"],
  },
  { key: "tail_wings",            label: "Tail / Wings",             required: false, options: ["Tail", "Wings", "Both", "None"] },
  {
    key: "body_markings",         label: "Body Markings",            required: false,
    multiSelect: true,
    options: ["Freckles", "Tattoos", "Scars", "Birthmarks", "None"],
  },
  { key: "posture",               label: "Posture",                  required: false, options: ["Confident", "Reserved", "Energetic", "Calm"] },
  {
    key: "color_palette",         label: "Color Palette",            required: false,
    multiSelect: true,
    options: ["Warm tones", "Cool tones", "Monochrome", "Pastel", "Neon"],
  },
  { key: "occupation_look",       label: "Occupation Look",          required: false, options: ["Casual", "Formal", "Uniformed", "Armored", "Streetwear"] },
  {
    key: "cultural_style",        label: "Cultural Style",           required: false,
    multiSelect: true,
    options: ["Western", "Eastern", "Futuristic", "Medieval", "Tribal"],
  },
  { key: "ass_size",              label: "Ass Size",                 required: false, options: ["Subtle", "Balanced", "Well-rounded", "Voluptuous", "Exaggerated"] },
  { key: "chest_size",            label: "Chest Size",               required: false, options: ["Small", "Medium", "Large", "Ample", "Voluptuous", "Exaggerated"] },
  { key: "camera_angle",          label: "Camera Angle",             required: false, options: ["Eye Level", "Low Angle", "High Angle", "Cinematic Dutch Angle"] },
  { key: "eye_detail_enhancer",   label: "Eye Detail Enhancer",      required: false, options: ["Sparkling", "Glowing", "Sharp", "Droopy", "Pupilless"] },
  { key: "clothing_material_finish", label: "Clothing Material / Finish", required: false, options: ["Matte Fabric", "Leather", "Silk/Satin", "Glossy Latex", "Denim", "Lace", "Metallic Plate"] },
  { key: "legwear_socks_style",   label: "Legwear / Socks Style",    required: false, options: ["Thigh-high stockings", "Fishnets", "Crew socks", "Barefoot", "Tights", "None"] },
  { key: "lighting_style",        label: "Lighting Style",           required: false, options: ["Studio Lighting", "Cinematic Soft Glow", "Dramatic Shadows", "Neon Rim Lighting", "Golden Hour"] },
  { key: "bangs_style",           label: "Bangs Style",              required: false, options: ["Blunt Bangs", "Side-swept Bangs", "Curtain Bangs", "See-through Bangs", "Forehead Exposed"] },
  { key: "makeup_style",          label: "Makeup Style",             required: false, options: ["Natural", "Gothic", "Glamour", "Cosplay/Alt", "None"] },
  { key: "outfit_fit",            label: "Outfit Fit",               required: false, options: ["Skin-tight", "Form-fitting", "Regular Fit", "Loose", "Oversized"] },
  { key: "thigh_hip_size",        label: "Thigh / Hip Size",         required: false, options: ["Slim", "Proportional", "Wide", "Thick", "Hourglass"] },
  { key: "skin_texture_realism",  label: "Skin Texture Realism",     required: false, options: ["Smooth 2D", "Textured Matt", "Pore Detail (Realistic Mode)", "Flawless Satin"] },
  { key: "outfit_cleavage_cut",   label: "Outfit Cleavage / Cut",    required: false, options: ["High Neck", "V-Neck", "Plunging", "Off-shoulder", "Backless", "Covered"] },
];

const REQUIRED_APPEARANCE_KEYS = APPEARANCE_FIELDS.filter(f => f.required).map(f => f.key);

// 6-step wizard + Step 7 is post-creation preview
const WIZARD_STEPS = [
  { id: 1, title: "Entity Name",         subtitle: "Choose or type your companion's identity" },
  { id: 2, title: "Appearance Details",  subtitle: "Define the look that shapes every image" },
  { id: 3, title: "Origin Genre",        subtitle: "Choose art style and character type" },
  { id: 4, title: "Core Data",           subtitle: "Age & biographical directives" },
  { id: 5, title: "First Contact",       subtitle: "Their opening transmission" },
  { id: 6, title: "Signal Tags",         subtitle: "Classify your entity's attributes" },
];

const VALID_GENRES = ["Anime", "Fantasy", "Modern", "Sci-Fi", "Dark Goth"] as const;
type ValidGenre = typeof VALID_GENRES[number];

function resolveGenre(artStyle: "Anime" | "Realistic" | "", subGenres: string[]): ValidGenre {
  if (artStyle === "Anime") return "Anime";
  const lower = subGenres.map(s => s.toLowerCase());
  if (lower.some(s => ["fantasy", "elf", "mage", "witch", "warrior", "angel", "demon", "vampire"].includes(s))) return "Fantasy";
  if (lower.some(s => ["sci-fi", "cyberpunk", "android", "isekai"].includes(s))) return "Sci-Fi";
  if (lower.some(s => ["horror", "dark", "goth", "supernatural", "thriller"].includes(s))) return "Dark Goth";
  return "Modern";
}

function getToken() {
  return (window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
}

// ── Helpers for multi-select CSV values ─────────────────────────────────────────
function parseMultiVal(val: string): string[] {
  return val.split(",").map(v => v.trim()).filter(Boolean);
}
function toggleMultiVal(current: string, opt: string): string {
  const vals = parseMultiVal(current);
  const idx = vals.indexOf(opt);
  if (idx >= 0) vals.splice(idx, 1); else vals.push(opt);
  return vals.join(", ");
}
function addCustomMultiVal(current: string, custom: string): string {
  const vals = parseMultiVal(current);
  if (!vals.includes(custom)) vals.push(custom);
  return vals.join(", ");
}

// ── Appearance chip field ────────────────────────────────────────────────────────
function AppearanceChipSection({
  field,
  value,
  hybridSpeciesValue,
  customInputVal,
  showCustom,
  onSelect,
  onHybridChange,
  onCustomInputChange,
  onAddCustom,
  onToggleCustom,
  onClear,
}: {
  field: AppearanceFieldDef;
  value: string;
  hybridSpeciesValue?: string;
  customInputVal: string;
  showCustom: boolean;
  onSelect: (val: string) => void;
  onHybridChange?: (val: string) => void;
  onCustomInputChange: (val: string) => void;
  onAddCustom: () => void;
  onToggleCustom: () => void;
  onClear?: () => void;
}) {
  const isMulti = !!field.multiSelect;
  const selectedSet = isMulti ? new Set(parseMultiVal(value)) : null;

  function handleChipClick(opt: string) {
    if (!isMulti) {
      onSelect(value === opt ? "" : opt);
    } else {
      onSelect(toggleMultiVal(value, opt));
    }
  }

  function handleAddCustomClick() {
    const trimmed = customInputVal.trim();
    if (!trimmed) return;
    if (isMulti) {
      onSelect(addCustomMultiVal(value, trimmed));
      onCustomInputChange("");
      // Keep input open so user can add more
    } else {
      onAddCustom();
    }
  }

  const isChipSelected = (opt: string) =>
    isMulti ? selectedSet!.has(opt) : value === opt;

  const displayLabel = isMulti
    ? (selectedSet!.size > 0 ? `${selectedSet!.size} selected` : "")
    : value;

  return (
    <div className={field.required ? "" : "opacity-85"}>
      <div className="flex items-center justify-between mb-2">
        <label className={`text-xs font-bold uppercase tracking-wider ${field.required ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
          {field.label} {field.required && <span className="text-primary">*</span>}
          {isMulti && <span className="text-[10px] font-normal text-accent/70 ml-1">(multi)</span>}
        </label>
        <div className="flex items-center gap-2">
          {displayLabel && (
            <span className={`text-[10px] font-semibold truncate max-w-[120px] ${field.required ? "text-primary" : "text-accent"}`}>
              {field.required && !isMulti && "✓ "}{displayLabel}
            </span>
          )}
          {value && !field.required && onClear && (
            <button onClick={onClear} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              Clear
            </button>
          )}
          {!value && !field.required && (
            <span className="text-[10px] text-muted-foreground/40 italic">optional</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {field.options.map(opt => {
          const sel = isChipSelected(opt);
          return (
            <button
              key={opt}
              onClick={() => handleChipClick(opt)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                sel
                  ? field.required
                    ? "bg-primary/30 text-primary border-primary/60 box-glow-pink"
                    : "bg-accent/25 text-accent border-accent/60"
                  : field.required
                  ? "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30"
                  : "bg-card/60 text-muted-foreground/70 border-border/60 hover:text-foreground hover:border-accent/30"
              }`}
            >
              {sel && <Check size={9} className="inline mr-1" />}{opt}
            </button>
          );
        })}
      </div>
      {/* Multi-select: show selected badges */}
      {isMulti && selectedSet!.size > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {[...selectedSet!].map(sel => (
            <span
              key={sel}
              onClick={() => onSelect(toggleMultiVal(value, sel))}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/15 text-accent border border-accent/40 cursor-pointer hover:bg-accent/25 transition-colors"
            >
              {sel} ✕
            </span>
          ))}
        </div>
      )}
      {field.key === "species" && (value === "Hybrid" || hybridSpeciesValue) && onHybridChange && (
        <input
          value={hybridSpeciesValue ?? ""}
          onChange={e => onHybridChange(e.target.value)}
          placeholder="Hybrid of which species? e.g. Elf-Demon"
          maxLength={64}
          className="mt-2 w-full h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
        />
      )}
      {showCustom ? (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={customInputVal}
            onChange={e => onCustomInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAddCustomClick(); }}
            placeholder="Type custom value..."
            maxLength={48}
            className="flex-1 h-8 rounded-lg border border-accent/50 bg-card px-3 text-xs text-white focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleAddCustomClick}
            disabled={!customInputVal.trim()}
            className="px-3 h-8 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors disabled:opacity-40"
          >
            Add
          </button>
          {isMulti && (
            <button
              onClick={onToggleCustom}
              className="px-3 h-8 rounded-lg bg-muted/20 text-muted-foreground text-xs border border-border hover:text-white transition-colors"
            >
              Done
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={onToggleCustom}
          className="mt-2 text-[10px] text-accent/70 hover:text-accent transition-colors font-semibold"
        >
          ➕ Add Custom
        </button>
      )}
    </div>
  );
}

export function Create() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1: Name ──────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [usingCustomName, setUsingCustomName] = useState(false);
  const [customNameInput, setCustomNameInput] = useState("");

  // ── Step 2: Appearance ────────────────────────────────────────────────────────
  const [appearance, setAppearance] = useState<Record<string, string>>({});
  const [hybridSpecies, setHybridSpecies] = useState("");
  const [customInputVal, setCustomInputVal] = useState<Record<string, string>>({});
  const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});

  // ── Step 3: Genre ─────────────────────────────────────────────────────────────
  const [artStyle, setArtStyle] = useState<"Anime" | "Realistic" | "">("");
  const [subGenres, setSubGenres] = useState<string[]>([]);
  const [customSubGenreInput, setCustomSubGenreInput] = useState("");
  const [showCustomSubGenre, setShowCustomSubGenre] = useState(false);

  // ── Steps 4-6 ────────────────────────────────────────────────────────────────
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isNsfw] = useState(false);

  // ── Step 7: Post-creation state ───────────────────────────────────────────────
  const [createdCharId, setCreatedCharId] = useState<string | null>(null);
  const [createdAvatarUrl, setCreatedAvatarUrl] = useState("");
  const [createdRegenCount, setCreatedRegenCount] = useState(0);

  const [regenDescription, setRegenDescription] = useState("");
  const [showRegenInput, setShowRegenInput] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Edit fields on step 7
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editGreeting, setEditGreeting] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editAppearance, setEditAppearance] = useState<Record<string, string>>({});
  const [editHybridSpecies, setEditHybridSpecies] = useState("");
  const [editSubGenres, setEditSubGenres] = useState<string[]>([]);
  const [editArtStyle, setEditArtStyle] = useState<"Anime" | "Realistic" | "">("");
  const [editCustomInputVal, setEditCustomInputVal] = useState<Record<string, string>>({});
  const [editShowCustom, setEditShowCustom] = useState<Record<string, boolean>>({});
  const [editShowCustomSubGenre, setEditShowCustomSubGenre] = useState(false);
  const [editCustomSubGenreInput, setEditCustomSubGenreInput] = useState("");
  const [isSavingEdits, setIsSavingEdits] = useState(false);

  // ── Avatar polling after creation ─────────────────────────────────────────────
  useEffect(() => {
    if (step !== 7 || !createdCharId) return;
    let cancelled = false;
    const checkAvatar = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/characters/${createdCharId}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) return;
        const data = await res.json() as { avatarUrl?: string };
        if (data.avatarUrl && !data.avatarUrl.includes("picsum.photos")) {
          setCreatedAvatarUrl(data.avatarUrl);
        }
      } catch { /* silent */ }
    };
    const t1 = setTimeout(checkAvatar, 10000);
    const t2 = setTimeout(checkAvatar, 30000);
    const t3 = setTimeout(checkAvatar, 75000);
    return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [step, createdCharId]);

  const resolvedName = usingCustomName ? customNameInput.trim() : name;

  // ── Wizard helpers ────────────────────────────────────────────────────────────
  function setAppearanceField(key: string, value: string) {
    setAppearance(prev => ({ ...prev, [key]: value }));
  }
  function addCustomForField(key: string) {
    const val = (customInputVal[key] ?? "").trim();
    if (!val) return;
    // Multi-select: append; Single-select: replace
    if (MULTI_SELECT_APPEARANCE_KEYS.has(key)) {
      setAppearanceField(key, addCustomMultiVal(appearance[key] ?? "", val));
      setCustomInputVal(prev => ({ ...prev, [key]: "" }));
      // Keep input open for multi-select
    } else {
      setAppearanceField(key, val);
      setCustomInputVal(prev => ({ ...prev, [key]: "" }));
      setShowCustom(prev => ({ ...prev, [key]: false }));
    }
  }
  function addCustomSubGenre() {
    const val = customSubGenreInput.trim();
    if (!val || subGenres.length >= MAX_SUBGENRES) return;
    setSubGenres(prev => [...prev, val]);
    setCustomSubGenreInput("");
    setShowCustomSubGenre(false);
  }
  function toggleSubGenre(sg: string) {
    setSubGenres(prev => {
      if (prev.includes(sg)) return prev.filter(x => x !== sg);
      if (prev.length >= MAX_SUBGENRES) return prev;
      return [...prev, sg];
    });
  }

  // ── Edit helpers (step 7) ─────────────────────────────────────────────────────
  function setEditAppearanceField(key: string, value: string) {
    setEditAppearance(prev => ({ ...prev, [key]: value }));
  }
  function addEditCustomForField(key: string) {
    const val = (editCustomInputVal[key] ?? "").trim();
    if (!val) return;
    if (MULTI_SELECT_APPEARANCE_KEYS.has(key)) {
      setEditAppearanceField(key, addCustomMultiVal(editAppearance[key] ?? "", val));
      setEditCustomInputVal(prev => ({ ...prev, [key]: "" }));
    } else {
      setEditAppearanceField(key, val);
      setEditCustomInputVal(prev => ({ ...prev, [key]: "" }));
      setEditShowCustom(prev => ({ ...prev, [key]: false }));
    }
  }
  function addEditCustomSubGenre() {
    const val = editCustomSubGenreInput.trim();
    if (!val || editSubGenres.length >= MAX_SUBGENRES) return;
    setEditSubGenres(prev => [...prev, val]);
    setEditCustomSubGenreInput("");
    setEditShowCustomSubGenre(false);
  }
  function toggleEditSubGenre(sg: string) {
    setEditSubGenres(prev => {
      if (prev.includes(sg)) return prev.filter(x => x !== sg);
      if (prev.length >= MAX_SUBGENRES) return prev;
      return [...prev, sg];
    });
  }

  // ── canAdvance ────────────────────────────────────────────────────────────────
  function canAdvance(): boolean {
    if (step === 1) return resolvedName.length > 0;
    if (step === 2) return REQUIRED_APPEARANCE_KEYS.every(k => {
      const v = appearance[k] ?? "";
      if (MULTI_SELECT_APPEARANCE_KEYS.has(k)) return parseMultiVal(v).length > 0;
      return v.length > 0;
    });
    if (step === 3) return artStyle !== "" && subGenres.length >= 1;
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    if (step < WIZARD_STEPS.length) setStep(s => s + 1);
  }
  function prev() {
    if (step > 1) setStep(s => s - 1);
  }

  // ── Submit (Awaken) ───────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!resolvedName) {
      toast({ title: "Name is required", variant: "destructive" });
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const extraTags = tagsInput
        ? tagsInput.split(",").map(t => t.trim()).filter(Boolean)
        : [];
      const tags = [...subGenres, ...extraTags];

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          name: resolvedName,
          genre: resolveGenre(artStyle, subGenres),
          subGenres,
          age: age || undefined,
          bio: bio || undefined,
          initialGreeting: greeting || undefined,
          tags,
          visibility: "private",
          isNsfw,
          appearance,
          hybridSpecies: hybridSpecies || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Creation failed");
      }

      const char = await res.json() as { characterId: string; avatarUrl?: string };
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });

      setCreatedCharId(char.characterId);
      setCreatedAvatarUrl(char.avatarUrl ?? "");
      setCreatedRegenCount(0);
      setEditName(resolvedName);
      setEditBio(bio);
      setEditGreeting(greeting);
      setEditTagsInput(tagsInput);
      setEditAppearance({ ...appearance });
      setEditHybridSpecies(hybridSpecies);
      setEditSubGenres([...subGenres]);
      setEditArtStyle(artStyle);

      toast({ title: "✨ Entity Manifested!", description: `${resolvedName} is now live.` });
      setStep(7);
    } catch (err) {
      toast({
        title: "Manifestation Failed",
        description: err instanceof Error ? err.message : "Not enough Neon Cards or validation error.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Save edits (step 7) ───────────────────────────────────────────────────────
  async function handleSaveEdits() {
    if (!createdCharId) return;
    setIsSavingEdits(true);
    try {
      const extraTags = editTagsInput
        ? editTagsInput.split(",").map(t => t.trim()).filter(Boolean)
        : [];
      const tags = [...editSubGenres, ...extraTags];

      const res = await fetch(`/api/characters/${createdCharId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          name: editName,
          bio: editBio,
          initialGreeting: editGreeting,
          tags,
          subGenres: editSubGenres,
          genre: resolveGenre(editArtStyle, editSubGenres),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Save failed");
      }
      toast({ title: "✅ Changes saved!" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingEdits(false);
    }
  }

  // ── Regenerate avatar (step 7) ────────────────────────────────────────────────
  async function handleRegenerate() {
    if (!createdCharId) return;
    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/characters/${createdCharId}/regenerate-avatar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ changeDescription: regenDescription }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Regeneration failed");
      }
      const data = await res.json() as { avatarUrl: string; regenerateCount: number };
      setCreatedAvatarUrl(data.avatarUrl);
      setCreatedRegenCount(data.regenerateCount);
      setRegenDescription("");
      setShowRegenInput(false);
      toast({ title: "🎨 New avatar generated!" });
    } catch (err) {
      toast({
        title: "Regeneration failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────────
  const progressPct = (step / WIZARD_STEPS.length) * 100;
  const currentStep = step <= WIZARD_STEPS.length ? WIZARD_STEPS[step - 1] : null;
  const allSubGenreOptions = [...SUB_GENRES, ...subGenres.filter(s => !SUB_GENRES.includes(s))];
  const allEditSubGenreOptions = [...SUB_GENRES, ...editSubGenres.filter(s => !SUB_GENRES.includes(s))];
  const requiredFilled = REQUIRED_APPEARANCE_KEYS.filter(k => {
    const v = appearance[k] ?? "";
    return MULTI_SELECT_APPEARANCE_KEYS.has(k) ? parseMultiVal(v).length > 0 : v.length > 0;
  }).length;
  const requiredTotal = REQUIRED_APPEARANCE_KEYS.length;
  const regenIsFree = createdRegenCount < 3;
  const isPlaceholderAvatar = !createdAvatarUrl || createdAvatarUrl.includes("picsum.photos");

  // ── Step 7: Preview & Confirm ─────────────────────────────────────────────────
  if (step === 7) {
    return (
      <div className="flex flex-col h-[100dvh] bg-background overflow-y-auto pb-[200px]">
        {/* Step 7 Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold uppercase tracking-widest text-glow-pink">Entity Manifested</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Review, edit & refine before chatting</p>
            </div>
            <button
              onClick={() => setLocation(`/chat/${createdCharId}`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider box-glow-pink hover:bg-primary/90 transition-all active:scale-95"
            >
              <MessageCircle size={14} /> Chat
            </button>
          </div>
        </div>

        <div className="px-4 py-5 space-y-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {createdAvatarUrl ? (
                <img
                  src={createdAvatarUrl}
                  alt={editName}
                  className="w-40 h-40 rounded-2xl object-cover border-2 border-primary/40 box-glow-pink"
                />
              ) : (
                <div className="w-40 h-40 rounded-2xl bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-5xl">
                  🎨
                </div>
              )}
              {isPlaceholderAvatar && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full px-2 py-0.5 text-[9px] text-muted-foreground whitespace-nowrap">
                  ⏳ Generating…
                </div>
              )}
            </div>
            <p className="text-xl font-bold text-white">{editName}</p>

            {/* Regenerate avatar section */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setShowRegenInput(v => !v)}
                  disabled={isRegenerating}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-secondary/50 text-secondary font-bold text-xs hover:border-secondary hover:bg-secondary/10 transition-all disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isRegenerating ? "animate-spin" : ""} />
                  {isRegenerating ? "Generating…" : "Regenerate Avatar"}
                </button>
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${
                  regenIsFree
                    ? "text-green-400 border-green-400/40 bg-green-400/10"
                    : "text-cyan-400 border-cyan-400/40 bg-cyan-400/10"
                }`}>
                  {regenIsFree ? `Free (${3 - createdRegenCount} left)` : "5 🃏"}
                </span>
              </div>

              {showRegenInput && (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={regenDescription}
                    onChange={e => setRegenDescription(e.target.value)}
                    placeholder="Describe what to change… e.g. 'make hair longer, add wings'"
                    maxLength={200}
                    className="w-full h-11 rounded-xl border border-secondary/50 bg-card px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-secondary transition-colors"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRegenInput(false)}
                      className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs font-semibold hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-secondary text-secondary-foreground font-bold text-xs uppercase tracking-wider hover:bg-secondary/90 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isRegenerating ? (
                        <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating…</>
                      ) : (
                        <><RefreshCw size={13} /> Regenerate {!regenIsFree && "(-5 🃏)"}</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Edit Section ─────────────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                <Pencil size={10} /> Entity Name
              </label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                maxLength={48}
                className="w-full h-11 rounded-xl border border-border bg-card px-4 text-sm font-bold text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-all"
              />
            </div>

            {/* Art Style + Sub-genres */}
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Art Style</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["Anime", "Realistic"] as const).map(style => (
                    <button
                      key={style}
                      onClick={() => setEditArtStyle(style)}
                      className={`py-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                        editArtStyle === style
                          ? "border-primary/60 bg-primary/15 text-primary box-glow-pink"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <span className="text-xl">{style === "Anime" ? "🌸" : "📷"}</span>
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Character Types</p>
                  <span className="text-xs text-muted-foreground">{editSubGenres.length}/{MAX_SUBGENRES}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allEditSubGenreOptions.map(sg => {
                    const selected = editSubGenres.includes(sg);
                    const maxed = editSubGenres.length >= MAX_SUBGENRES && !selected;
                    return (
                      <button key={sg} disabled={maxed} onClick={() => toggleEditSubGenre(sg)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          selected ? "bg-primary/30 text-primary border-primary/60 box-glow-pink"
                            : maxed ? "bg-card/40 text-muted-foreground/40 border-border/40 cursor-not-allowed"
                            : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30"
                        }`}>
                        {selected && <Check size={10} className="inline mr-1" />}{sg}
                      </button>
                    );
                  })}
                </div>
                {editShowCustomSubGenre ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      autoFocus
                      value={editCustomSubGenreInput}
                      onChange={e => setEditCustomSubGenreInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addEditCustomSubGenre(); }}
                      placeholder="Type a custom type..."
                      maxLength={32}
                      className="flex-1 h-8 rounded-lg border border-accent/50 bg-card px-3 text-xs text-white focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={addEditCustomSubGenre}
                      disabled={!editCustomSubGenreInput.trim() || editSubGenres.length >= MAX_SUBGENRES}
                      className="px-3 h-8 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditShowCustomSubGenre(true)}
                    className="mt-2 text-[10px] text-accent/70 hover:text-accent font-semibold transition-colors"
                  >
                    ➕ Add Custom
                  </button>
                )}
              </div>
            </div>

            {/* Appearance Details */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Appearance Details</p>
              <div className="space-y-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Required</p>
                {APPEARANCE_FIELDS.filter(f => f.required).map(field => (
                  <AppearanceChipSection
                    key={field.key}
                    field={field}
                    value={editAppearance[field.key] ?? ""}
                    hybridSpeciesValue={editHybridSpecies}
                    customInputVal={editCustomInputVal[field.key] ?? ""}
                    showCustom={!!editShowCustom[field.key]}
                    onSelect={val => setEditAppearanceField(field.key, val)}
                    onHybridChange={val => setEditHybridSpecies(val)}
                    onCustomInputChange={val => setEditCustomInputVal(prev => ({ ...prev, [field.key]: val }))}
                    onAddCustom={() => addEditCustomForField(field.key)}
                    onToggleCustom={() => setEditShowCustom(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  />
                ))}
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pt-4 border-t border-border">Optional</p>
                {APPEARANCE_FIELDS.filter(f => !f.required).map(field => (
                  <AppearanceChipSection
                    key={field.key}
                    field={field}
                    value={editAppearance[field.key] ?? ""}
                    customInputVal={editCustomInputVal[field.key] ?? ""}
                    showCustom={!!editShowCustom[field.key]}
                    onSelect={val => setEditAppearanceField(field.key, val)}
                    onCustomInputChange={val => setEditCustomInputVal(prev => ({ ...prev, [field.key]: val }))}
                    onAddCustom={() => addEditCustomForField(field.key)}
                    onToggleCustom={() => setEditShowCustom(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    onClear={() => setEditAppearance(prev => { const n = { ...prev }; delete n[field.key]; return n; })}
                  />
                ))}
              </div>
            </div>

            {/* Age + Bio */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Apparent Age</label>
                <input
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="e.g. 24, Ancient, Unknown"
                  className="w-full h-11 rounded-xl border border-border bg-card px-4 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Core Directives (Bio)</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  placeholder="Define their personality, history, and desires..."
                  rows={4}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 resize-none transition-all"
                />
              </div>
            </div>

            {/* Greeting */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">First Contact</label>
              <textarea
                value={editGreeting}
                onChange={e => setEditGreeting(e.target.value)}
                placeholder={`"I've been waiting for you... longer than you know."`}
                rows={4}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 resize-none transition-all"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Signal Tags</label>
              <input
                value={editTagsInput}
                onChange={e => setEditTagsInput(e.target.value)}
                placeholder="Tsundere, Hacker, Boss, Stoic…"
                className="w-full h-11 rounded-xl border border-border bg-card px-4 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-all"
              />
              {editTagsInput && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {editTagsInput.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/15 border border-primary/40 text-primary text-xs font-semibold">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sticky bottom action bar — z-[60] sits ABOVE the app nav bar (z-50) ── */}
        <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 bg-background/95 backdrop-blur border-t border-border flex gap-3"
          style={{ paddingBottom: "max(16px, calc(16px + env(safe-area-inset-bottom)))" }}>
          <button
            onClick={handleSaveEdits}
            disabled={isSavingEdits}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-secondary/50 text-secondary font-bold text-sm uppercase tracking-wider hover:bg-secondary/10 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSavingEdits ? (
              <><div className="w-4 h-4 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin" /> Saving…</>
            ) : (
              <><Save size={16} /> Save Changes</>
            )}
          </button>
          <button
            onClick={() => setLocation(`/chat/${createdCharId}`)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider box-glow-pink hover:bg-primary/90 transition-all active:scale-95"
          >
            <MessageCircle size={16} /> Go to Chat
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard (Steps 1–6) ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold uppercase tracking-widest text-glow-pink">Manifest</h1>
          <div className="px-3 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/40 text-cyan-400 font-bold flex items-center gap-1 text-sm">
            -25 🃏
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-1">
          {WIZARD_STEPS.map(s => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                s.id < step ? "bg-primary" : s.id === step ? "bg-primary/60" : "bg-border"
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Step {step} of {WIZARD_STEPS.length}</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[120px]">
        {currentStep && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white">{currentStep.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{currentStep.subtitle}</p>
            {step === 2 && (
              <p className="text-[10px] text-primary/80 mt-1 font-semibold">
                Required: {requiredFilled}/{requiredTotal} · Optional fields can be skipped
              </p>
            )}
          </div>
        )}

        {/* ── Step 1: Name ── */}
        {step === 1 && (
          <div className="space-y-4">
            {!usingCustomName ? (
              <>
                <p className="text-xs text-muted-foreground">Select a preset or enter your own</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_NAMES.map(n => (
                    <button
                      key={n}
                      onClick={() => setName(n)}
                      className={`py-3 px-4 rounded-xl border font-bold text-sm transition-all ${
                        name === n
                          ? "border-primary/60 bg-primary/15 text-primary box-glow-pink"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setUsingCustomName(true); setName(""); }}
                  className="w-full py-3 rounded-xl border border-dashed border-secondary/50 text-secondary font-bold text-sm hover:border-secondary hover:bg-secondary/10 transition-all"
                >
                  ✏️ Enter Custom Name
                </button>
              </>
            ) : (
              <>
                <input
                  autoFocus
                  value={customNameInput}
                  onChange={e => setCustomNameInput(e.target.value)}
                  placeholder="Type your entity's name..."
                  maxLength={48}
                  className="w-full h-14 rounded-xl border border-primary/50 bg-card px-4 text-base font-bold text-white placeholder:text-muted-foreground outline-none focus:border-primary focus:shadow-[0_0_16px_rgba(255,0,240,0.2)] transition-all"
                />
                <button
                  onClick={() => { setUsingCustomName(false); setCustomNameInput(""); }}
                  className="text-xs text-muted-foreground hover:text-white transition-colors"
                >
                  ← Back to presets
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Appearance Details ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">
                Required Fields <span className="text-primary/60">({requiredFilled}/{requiredTotal})</span>
              </p>
              <div className="space-y-5">
                {APPEARANCE_FIELDS.filter(f => f.required).map(field => (
                  <AppearanceChipSection
                    key={field.key}
                    field={field}
                    value={appearance[field.key] ?? ""}
                    hybridSpeciesValue={hybridSpecies}
                    customInputVal={customInputVal[field.key] ?? ""}
                    showCustom={!!showCustom[field.key]}
                    onSelect={val => setAppearanceField(field.key, val)}
                    onHybridChange={val => setHybridSpecies(val)}
                    onCustomInputChange={val => setCustomInputVal(prev => ({ ...prev, [field.key]: val }))}
                    onAddCustom={() => addCustomForField(field.key)}
                    onToggleCustom={() => setShowCustom(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-4 border-t border-border pt-4">
                Optional Fields <span className="text-muted-foreground/40">(skip any)</span>
              </p>
              <div className="space-y-5">
                {APPEARANCE_FIELDS.filter(f => !f.required).map(field => (
                  <AppearanceChipSection
                    key={field.key}
                    field={field}
                    value={appearance[field.key] ?? ""}
                    customInputVal={customInputVal[field.key] ?? ""}
                    showCustom={!!showCustom[field.key]}
                    onSelect={val => setAppearanceField(field.key, val)}
                    onCustomInputChange={val => setCustomInputVal(prev => ({ ...prev, [field.key]: val }))}
                    onAddCustom={() => addCustomForField(field.key)}
                    onToggleCustom={() => setShowCustom(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    onClear={() => setAppearance(prev => { const n = { ...prev }; delete n[field.key]; return n; })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Origin Genre ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Step A — Art Style <span className="text-primary">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["Anime", "Realistic"] as const).map(style => (
                  <button
                    key={style}
                    onClick={() => setArtStyle(style)}
                    className={`py-5 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-2 ${
                      artStyle === style
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

            {artStyle && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Step B — Character Type
                  </p>
                  <span className="text-xs font-semibold text-muted-foreground">{subGenres.length}/{MAX_SUBGENRES}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allSubGenreOptions.map(sg => {
                    const selected = subGenres.includes(sg);
                    const maxed = subGenres.length >= MAX_SUBGENRES && !selected;
                    return (
                      <button
                        key={sg}
                        disabled={maxed}
                        onClick={() => toggleSubGenre(sg)}
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
                      onKeyDown={e => { if (e.key === "Enter") addCustomSubGenre(); }}
                      placeholder="Type a custom type..."
                      maxLength={32}
                      className="flex-1 h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-white focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={addCustomSubGenre}
                      disabled={!customSubGenreInput.trim() || subGenres.length >= MAX_SUBGENRES}
                      className="px-3 h-9 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCustomSubGenre(true)}
                    className="w-full mt-3 py-2 rounded-xl border border-dashed border-accent/40 text-accent text-xs font-semibold hover:bg-accent/5 transition-colors"
                  >
                    ➕ Add Custom
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Core Data ── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Apparent Age
              </label>
              <input
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="e.g. 24, Ancient, Unknown"
                className="w-full h-12 rounded-xl border border-border bg-card px-4 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Core Directives (Bio)
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Define their personality, history, and desires..."
                rows={5}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 resize-none transition-all"
              />
            </div>
          </div>
        )}

        {/* ── Step 5: First Contact ── */}
        {step === 5 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">What do they say the first time you meet?</p>
            <textarea
              value={greeting}
              onChange={e => setGreeting(e.target.value)}
              placeholder={`"I've been waiting for you... longer than you know."`}
              rows={6}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 resize-none transition-all"
            />
          </div>
        )}

        {/* ── Step 6: Signal Tags + Summary ── */}
        {step === 6 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Add comma-separated tags to help others discover this entity</p>
            <input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="Tsundere, Hacker, Boss, Stoic..."
              className="w-full h-12 rounded-xl border border-border bg-card px-4 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-all"
            />
            {tagsInput && (
              <div className="flex flex-wrap gap-2">
                {tagsInput.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-primary text-xs font-semibold">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Summary */}
            <div className="mt-4 p-4 rounded-xl bg-card border border-border space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Summary</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-bold text-white">{resolvedName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Art Style</span>
                <span className="font-semibold text-white">{artStyle || "—"}</span>
              </div>
              {subGenres.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Types</span>
                  <span className="font-semibold text-white">{subGenres.join(", ")}</span>
                </div>
              )}
              {appearance.species && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Species</span>
                  <span className="font-semibold text-white">{appearance.species}{hybridSpecies ? ` (${hybridSpecies})` : ""}</span>
                </div>
              )}
              {(appearance.hair_color || appearance.hair_length) && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Hair</span>
                  <span className="font-semibold text-white">{[appearance.hair_color, appearance.hair_length].filter(Boolean).join(", ")}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Visibility</span>
                <span className="font-semibold text-white">🔒 Private</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-bold text-cyan-400">-25 🃏 Neon Cards</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              onClick={prev}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-muted-foreground hover:text-white hover:border-border/80 transition-all font-semibold"
            >
              <ChevronLeft size={18} />
              Back
            </button>
          )}

          {step < WIZARD_STEPS.length ? (
            <button
              onClick={next}
              disabled={!canAdvance()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-wider box-glow-pink hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 2 && !canAdvance()
                ? `Fill required fields (${requiredFilled}/${requiredTotal})`
                : <>Continue <ChevronRight size={18} /></>
              }
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-wider box-glow-pink hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Manifesting...
                </>
              ) : (
                <><Sparkles size={18} /> <Check size={16} /> Awaken</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
