import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, ChevronLeft, ChevronRight, Check,
} from "lucide-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";

const PRESET_NAMES = ["Nexus-9", "Lyra", "Vex", "Aria", "Cipher", "Nyx", "Seraph", "Zara"];

const SUB_GENRES = [
  "Fantasy", "Adventure", "Romance", "Horror", "Sci-Fi", "Cyberpunk",
  "Supernatural", "Historical", "Modern", "Isekai", "Slice of Life",
  "Thriller", "Drama", "Action", "Elf", "Vampire", "Demon", "Angel", "Warrior", "Mage",
];
const MAX_SUBGENRES = 2;

// ── Appearance field definitions ───────────────────────────────────────────────

interface AppearanceFieldDef {
  key: string;
  label: string;
  options: string[];
  required: boolean;
}

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
  { key: "negative_prompts_filter", label: "Negative Prompts Filter", required: true, options: ["Low Quality Filter", "Deformed Hands Filter", "Asymmetry Filter", "Text/Watermark Scrub"] },
  { key: "species",               label: "Species / Race",           required: true,  options: ["Human", "Elf", "Demon", "Angel", "Vampire", "Android", "Hybrid"] },
  // Optional (28)
  { key: "height",                label: "Height",                   required: false, options: ["Short", "Average", "Tall"] },
  { key: "build",                 label: "Build",                    required: false, options: ["Slim", "Athletic", "Average", "Curvy"] },
  { key: "skin_tone",             label: "Skin Tone",                required: false, options: ["Fair", "Light", "Medium", "Tan", "Dark"] },
  { key: "ear_type",              label: "Ear Type",                 required: false, options: ["Human", "Pointed", "Animal"] },
  { key: "distinguishing_feature", label: "Distinguishing Feature",  required: false, options: ["Freckles", "Scar", "Tattoo", "Birthmark", "Heterochromia", "None"] },
  { key: "voice_tone",            label: "Voice Tone",               required: false, options: ["Soft", "Husky", "Cheerful", "Stoic", "Playful"] },
  { key: "hairstyle",             label: "Hairstyle",                required: false, options: ["Straight", "Wavy", "Curly", "Braided", "Ponytail", "Twin-tails"] },
  { key: "facial_expression_default", label: "Default Expression",   required: false, options: ["Smiling", "Neutral", "Serious", "Playful", "Shy"] },
  { key: "accessory",             label: "Accessory",                required: false, options: ["Glasses", "Earrings", "Necklace", "Headband", "None"] },
  { key: "tail_wings",            label: "Tail / Wings",             required: false, options: ["Tail", "Wings", "Both", "None"] },
  { key: "body_markings",         label: "Body Markings",            required: false, options: ["Freckles", "Tattoos", "Scars", "Birthmarks", "None"] },
  { key: "posture",               label: "Posture",                  required: false, options: ["Confident", "Reserved", "Energetic", "Calm"] },
  { key: "color_palette",         label: "Color Palette",            required: false, options: ["Warm tones", "Cool tones", "Monochrome", "Pastel", "Neon"] },
  { key: "occupation_look",       label: "Occupation Look",          required: false, options: ["Casual", "Formal", "Uniformed", "Armored", "Streetwear"] },
  { key: "cultural_style",        label: "Cultural Style",           required: false, options: ["Western", "Eastern", "Futuristic", "Medieval", "Tribal"] },
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

const STEPS = [
  { id: 1, title: "Entity Name",         subtitle: "Choose or type your companion's identity" },
  { id: 2, title: "Visual Form",         subtitle: "Avatar auto-generated from your choices" },
  { id: 3, title: "Appearance Details",  subtitle: "Define the look that shapes every image" },
  { id: 4, title: "Origin Genre",        subtitle: "Choose art style and character type" },
  { id: 5, title: "Core Data",           subtitle: "Age & biographical directives" },
  { id: 6, title: "First Contact",       subtitle: "Their opening transmission" },
  { id: 7, title: "Signal Tags",         subtitle: "Classify your entity's attributes" },
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

export function Create() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1: Name ──
  const [name, setName] = useState("");
  const [usingCustomName, setUsingCustomName] = useState(false);
  const [customNameInput, setCustomNameInput] = useState("");

  // ── Step 3: Appearance ──
  const [appearance, setAppearance] = useState<Record<string, string>>({});
  const [hybridSpecies, setHybridSpecies] = useState("");
  const [customInputVal, setCustomInputVal] = useState<Record<string, string>>({});
  const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});

  // ── Step 4: Genre ──
  const [artStyle, setArtStyle] = useState<"Anime" | "Realistic" | "">("");
  const [subGenres, setSubGenres] = useState<string[]>([]);
  const [customSubGenreInput, setCustomSubGenreInput] = useState("");
  const [showCustomSubGenre, setShowCustomSubGenre] = useState(false);

  // ── Steps 5-7 ──
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isNsfw, setIsNsfw] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("private");

  const resolvedName = usingCustomName ? customNameInput.trim() : name;

  function setAppearanceField(key: string, value: string) {
    setAppearance(prev => ({ ...prev, [key]: value }));
  }

  function addCustomForField(key: string) {
    const val = (customInputVal[key] ?? "").trim();
    if (!val) return;
    setAppearanceField(key, val);
    setCustomInputVal(prev => ({ ...prev, [key]: "" }));
    setShowCustom(prev => ({ ...prev, [key]: false }));
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

  function canAdvance(): boolean {
    if (step === 1) return resolvedName.length > 0;
    if (step === 3) return REQUIRED_APPEARANCE_KEYS.every(k => !!appearance[k]);
    if (step === 4) return artStyle !== "" && subGenres.length >= 1;
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    if (step < STEPS.length) setStep(s => s + 1);
  }

  function prev() {
    if (step > 1) setStep(s => s - 1);
  }

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
          visibility,
          isNsfw,
          appearance,
          hybridSpecies: hybridSpecies || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Creation failed");
      }

      const char = await res.json() as { characterId: string };
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "✨ Entity Manifested!", description: `${resolvedName} is now live.` });
      setLocation(`/chat/${char.characterId}`);
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

  const progressPct = (step / STEPS.length) * 100;
  const currentStep = STEPS[step - 1];
  const allSubGenreOptions = [...SUB_GENRES, ...subGenres.filter(s => !SUB_GENRES.includes(s))];

  // Count required vs filled for step 3 progress hint
  const requiredFilled = REQUIRED_APPEARANCE_KEYS.filter(k => !!appearance[k]).length;
  const requiredTotal = REQUIRED_APPEARANCE_KEYS.length;

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
          {STEPS.map(s => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                s.id < step ? "bg-primary" : s.id === step ? "bg-primary/60" : "bg-border"
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Step {step} of {STEPS.length}</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
      </div>

      {/* Step content + nav buttons in one scrollable area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[120px]">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white">{currentStep.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{currentStep.subtitle}</p>
          {step === 3 && (
            <p className="text-[10px] text-primary/80 mt-1 font-semibold">
              Required: {requiredFilled}/{requiredTotal} · Optional fields can be skipped
            </p>
          )}
        </div>

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

        {/* ── Step 2: Visual Form ── */}
        {step === 2 && (
          <div className="flex flex-col items-center gap-6 py-6">
            <div className="w-24 h-24 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-4xl">
              🎨
            </div>
            <p className="text-sm text-center text-muted-foreground leading-relaxed max-w-xs">
              Your character's avatar will be generated automatically based on your{" "}
              <span className="text-foreground font-semibold">name</span>,{" "}
              <span className="text-foreground font-semibold">art style</span>, and{" "}
              <span className="text-foreground font-semibold">appearance details</span>.
            </p>
            <p className="text-xs text-center text-muted-foreground/60">
              You can update it from the admin panel after creation.
            </p>
          </div>
        )}

        {/* ── Step 3: Appearance Details ── */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Required section */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-4">
                Required Fields <span className="text-primary/60">({requiredFilled}/{requiredTotal})</span>
              </p>
              <div className="space-y-5">
                {APPEARANCE_FIELDS.filter(f => f.required).map(field => (
                  <div key={field.key}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {field.label} <span className="text-primary">*</span>
                      </label>
                      {appearance[field.key] && (
                        <span className="text-[10px] text-primary font-semibold truncate max-w-[120px]">
                          ✓ {appearance[field.key]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {field.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setAppearanceField(field.key, opt)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            appearance[field.key] === opt
                              ? "bg-primary/30 text-primary border-primary/60 box-glow-pink"
                              : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30"
                          }`}
                        >
                          {appearance[field.key] === opt && <Check size={9} className="inline mr-1" />}{opt}
                        </button>
                      ))}
                    </div>
                    {/* Special: Hybrid follow-up */}
                    {field.key === "species" && (appearance[field.key] === "Hybrid" || hybridSpecies) && (
                      <input
                        autoFocus
                        value={hybridSpecies}
                        onChange={e => setHybridSpecies(e.target.value)}
                        placeholder="Hybrid of which species? e.g. Elf-Demon"
                        maxLength={64}
                        className="mt-2 w-full h-9 rounded-lg border border-accent/50 bg-card px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
                      />
                    )}
                    {/* Add Custom */}
                    {showCustom[field.key] ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          autoFocus
                          value={customInputVal[field.key] ?? ""}
                          onChange={e => setCustomInputVal(prev => ({ ...prev, [field.key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") addCustomForField(field.key); }}
                          placeholder="Type custom value..."
                          maxLength={48}
                          className="flex-1 h-8 rounded-lg border border-accent/50 bg-card px-3 text-xs text-white focus:outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => addCustomForField(field.key)}
                          disabled={!(customInputVal[field.key] ?? "").trim()}
                          className="px-3 h-8 rounded-lg bg-accent/20 text-accent text-xs font-bold border border-accent/40 hover:bg-accent/30 transition-colors disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCustom(prev => ({ ...prev, [field.key]: true }))}
                        className="mt-2 text-[10px] text-accent/70 hover:text-accent transition-colors font-semibold"
                      >
                        ➕ Add Custom
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Optional section */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-4 border-t border-border pt-4">
                Optional Fields <span className="text-muted-foreground/40">(skip any)</span>
              </p>
              <div className="space-y-5">
                {APPEARANCE_FIELDS.filter(f => !f.required).map(field => (
                  <div key={field.key} className="opacity-85">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {field.label}
                      </label>
                      <div className="flex items-center gap-2">
                        {appearance[field.key] && (
                          <span className="text-[10px] text-accent font-semibold truncate max-w-[100px]">
                            {appearance[field.key]}
                          </span>
                        )}
                        {appearance[field.key] && (
                          <button
                            onClick={() => setAppearance(prev => { const n = { ...prev }; delete n[field.key]; return n; })}
                            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          >
                            Skip
                          </button>
                        )}
                        {!appearance[field.key] && (
                          <span className="text-[10px] text-muted-foreground/40 italic">optional</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {field.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setAppearanceField(field.key, opt)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            appearance[field.key] === opt
                              ? "bg-accent/25 text-accent border-accent/60"
                              : "bg-card/60 text-muted-foreground/70 border-border/60 hover:text-foreground hover:border-accent/30"
                          }`}
                        >
                          {appearance[field.key] === opt && <Check size={9} className="inline mr-1" />}{opt}
                        </button>
                      ))}
                    </div>
                    {showCustom[field.key] ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          autoFocus
                          value={customInputVal[field.key] ?? ""}
                          onChange={e => setCustomInputVal(prev => ({ ...prev, [field.key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") addCustomForField(field.key); }}
                          placeholder="Type custom value..."
                          maxLength={48}
                          className="flex-1 h-8 rounded-lg border border-accent/40 bg-card px-3 text-xs text-white focus:outline-none focus:border-accent/60"
                        />
                        <button
                          onClick={() => addCustomForField(field.key)}
                          disabled={!(customInputVal[field.key] ?? "").trim()}
                          className="px-3 h-8 rounded-lg bg-accent/15 text-accent/80 text-xs font-bold border border-accent/30 hover:bg-accent/25 transition-colors disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCustom(prev => ({ ...prev, [field.key]: true }))}
                        className="mt-1.5 text-[10px] text-muted-foreground/50 hover:text-accent/70 transition-colors font-semibold"
                      >
                        ➕ Add Custom
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Genre (Art Style + Sub-genre) ── */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Step A: Art Style */}
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

            {/* Step B: Sub-genres */}
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

        {/* ── Step 5: Age + Bio ── */}
        {step === 5 && (
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

        {/* ── Step 6: Greeting ── */}
        {step === 6 && (
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

        {/* ── Step 7: Tags ── */}
        {step === 7 && (
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
          </div>
        )}

        {/* Step 7 summary */}
        {step === 7 && (
          <div className="mt-6 p-4 rounded-xl bg-card border border-border space-y-2">
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

          {step < STEPS.length ? (
            <button
              onClick={next}
              disabled={!canAdvance()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-wider box-glow-pink hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 3 && !canAdvance()
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
                <>
                  <Sparkles size={18} /> <Check size={16} /> Awaken
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
