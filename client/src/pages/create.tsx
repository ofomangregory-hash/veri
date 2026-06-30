import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCharacter, CharacterInputGenre } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Upload, X, ChevronLeft, ChevronRight } from "lucide-react";

// ── Appearance field type ─────────────────────────────────────────────────────
interface AppearanceField {
  key: string;
  label: string;
  required: boolean;
  presets: string[];
  hybridConditional?: boolean; // species field triggers hybridSpecies sub-input
}

// ── 39 appearance fields (11 required + 28 optional) ─────────────────────────
const REQUIRED_FIELDS: AppearanceField[] = [
  { key: "hairColor",   label: "Hair Color",   required: true, presets: ["Black","Brown","Blonde","Red","White","Pink","Blue","Purple"] },
  { key: "hairLength",  label: "Hair Length",  required: true, presets: ["Short","Medium","Long"] },
  { key: "eyeColor",    label: "Eye Color",    required: true, presets: ["Brown","Blue","Green","Hazel","Gray","Violet"] },
  { key: "cameraShotType",   label: "Camera Shot Type",   required: true, presets: ["Avatar Portrait (Close-up)","Bust Shot","Upper Body","Full Body Portrait"] },
  { key: "viewDirection",    label: "View Direction",     required: true, presets: ["Looking at viewer","Looking away","Profile side-view","Looking over shoulder"] },
  { key: "genderBaseMesh",   label: "Gender Base Mesh",   required: true, presets: ["Female","Male","Non-binary","Androgynous"] },
  { key: "environmentSetting", label: "Environment Setting", required: true, presets: ["Studio Room","Blurred Indoor Bokeh","Outdoor Nature","Cyberpunk Cityscape","Abstract Gradient"] },
  { key: "renderingEngine",  label: "Rendering Engine",   required: true, presets: ["Clean Digital Line Art","Soft Cell Shading","Photorealistic Vector","Hyper-Detailed 2D"] },
  { key: "imageFocus",       label: "Image Focus",        required: true, presets: ["Face Focus","Upper Body Focus","Outfit Focus","Atmospheric/Background Focus"] },
  { key: "negativePromptsFilter", label: "Negative Prompts Filter", required: true, presets: ["Low Quality Filter","Deformed Hands Filter","Asymmetry Filter","Text/Watermark Scrub"] },
  { key: "species", label: "Species / Race", required: true, hybridConditional: true,
    presets: ["Human","Elf","Demon","Angel","Vampire","Android","Hybrid"] },
];

const OPTIONAL_FIELDS: AppearanceField[] = [
  { key: "height",   label: "Height",   required: false, presets: ["Short","Average","Tall"] },
  { key: "build",    label: "Build",    required: false, presets: ["Slim","Athletic","Average","Curvy"] },
  { key: "skinTone", label: "Skin Tone",required: false, presets: ["Fair","Light","Medium","Tan","Dark"] },
  { key: "earType",  label: "Ear Type", required: false, presets: ["Human","Pointed","Animal"] },
  { key: "distinguishingFeature", label: "Distinguishing Feature", required: false, presets: ["Freckles","Scar","Tattoo","Birthmark","Heterochromia","None"] },
  { key: "voiceTone",              label: "Voice Tone",             required: false, presets: ["Soft","Husky","Cheerful","Stoic","Playful"] },
  { key: "hairstyle",              label: "Hairstyle",              required: false, presets: ["Straight","Wavy","Curly","Braided","Ponytail","Twin-tails"] },
  { key: "facialExpressionDefault",label: "Default Facial Expression",required:false,presets:["Smiling","Neutral","Serious","Playful","Shy"] },
  { key: "accessory",              label: "Accessory",              required: false, presets: ["Glasses","Earrings","Necklace","Headband","None"] },
  { key: "tailWings",              label: "Tail / Wings",           required: false, presets: ["Tail","Wings","Both","None"] },
  { key: "bodyMarkings",           label: "Body Markings",          required: false, presets: ["Freckles","Tattoos","Scars","Birthmarks","None"] },
  { key: "posture",                label: "Posture",                required: false, presets: ["Confident","Reserved","Energetic","Calm"] },
  { key: "colorPalette",           label: "Color Palette",          required: false, presets: ["Warm tones","Cool tones","Monochrome","Pastel","Neon"] },
  { key: "occupationLook",         label: "Occupation Look",        required: false, presets: ["Casual","Formal","Uniformed","Armored","Streetwear"] },
  { key: "culturalStyle",          label: "Cultural Style",         required: false, presets: ["Western","Eastern","Futuristic","Medieval","Tribal"] },
  { key: "assSize",                label: "Ass Size",               required: false, presets: ["Subtle","Balanced","Well-rounded","Voluptuous","Exaggerated"] },
  { key: "chestSize",              label: "Chest Size",             required: false, presets: ["Small","Medium","Large","Ample","Voluptuous","Exaggerated"] },
  { key: "cameraAngle",            label: "Camera Angle",           required: false, presets: ["Eye Level","Low Angle","High Angle","Cinematic Dutch Angle"] },
  { key: "eyeDetailEnhancer",      label: "Eye Detail",             required: false, presets: ["Sparkling","Glowing","Sharp","Droopy","Pupilless"] },
  { key: "clothingMaterialFinish", label: "Clothing Material",      required: false, presets: ["Matte Fabric","Leather","Silk/Satin","Glossy Latex","Denim","Lace","Metallic Plate"] },
  { key: "legwearSocksStyle",      label: "Legwear / Socks",        required: false, presets: ["Thigh-high stockings","Fishnets","Crew socks","Barefoot","Tights","None"] },
  { key: "lightingStyle",          label: "Lighting Style",         required: false, presets: ["Studio Lighting","Cinematic Soft Glow","Dramatic Shadows","Neon Rim Lighting","Golden Hour"] },
  { key: "bangsStyle",             label: "Bangs Style",            required: false, presets: ["Blunt Bangs","Side-swept Bangs","Curtain Bangs","See-through Bangs","Forehead Exposed"] },
  { key: "makeupStyle",            label: "Makeup Style",           required: false, presets: ["Natural","Gothic","Glamour","Cosplay/Alt","None"] },
  { key: "outfitFit",              label: "Outfit Fit",             required: false, presets: ["Skin-tight","Form-fitting","Regular Fit","Loose","Oversized"] },
  { key: "thighHipSize",           label: "Thigh / Hip Size",       required: false, presets: ["Slim","Proportional","Wide","Thick","Hourglass"] },
  { key: "skinTextureRealism",     label: "Skin Texture",           required: false, presets: ["Smooth 2D","Textured Matt","Pore Detail (Realistic Mode)","Flawless Satin"] },
  { key: "outfitCleavageCut",      label: "Outfit Cleavage / Cut",  required: false, presets: ["High Neck","V-Neck","Plunging","Off-shoulder","Backless","Covered"] },
];

const ALL_APPEARANCE_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

// Blank state for all 40 keys (39 UX fields + hybridSpecies sub-field)
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

// ── ChipField component ───────────────────────────────────────────────────────
interface ChipFieldProps {
  field: AppearanceField;
  value: string;
  onChange: (v: string) => void;
}

function ChipField({ field, value, onChange }: ChipFieldProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");

  function applyCustom() {
    const v = customVal.trim();
    if (v) { onChange(v); setShowCustom(false); setCustomVal(""); }
  }

  return (
    <div className={`space-y-1.5 p-3 rounded-xl border transition-colors ${
      field.required
        ? "border-primary/30 bg-card"
        : "border-border/50 bg-muted/10"
    }`}>
      <div className="flex items-center justify-between">
        <label className={`text-xs font-bold uppercase tracking-wider ${
          field.required ? "text-foreground" : "text-muted-foreground"
        }`}>
          {field.label}
          {field.required
            ? <span className="text-primary ml-1">*</span>
            : <span className="text-muted-foreground/50 ml-1 font-normal normal-case tracking-normal">(optional)</span>
          }
        </label>
        {!field.required && value && (
          <button type="button" onClick={() => onChange("")}
            className="text-[10px] text-muted-foreground hover:text-foreground border border-border/40 px-1.5 py-0.5 rounded-full transition-colors">
            Skip →
          </button>
        )}
        {!field.required && !value && (
          <span className="text-[10px] text-muted-foreground/40 italic">Skip →</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {field.presets.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(value === p ? "" : p)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              value === p
                ? field.required
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-accent/20 border-accent text-accent"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(s => !s)}
          className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-primary/40 text-primary/70 hover:border-primary hover:text-primary transition-all"
        >
          + Add Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } }}
            placeholder={`Custom ${field.label.toLowerCase()}…`}
            className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
          />
          <button type="button" onClick={applyCustom}
            className="h-8 px-2.5 rounded-md bg-primary/20 border border-primary/40 text-primary text-xs font-bold hover:bg-primary/30 transition-colors">
            ✓
          </button>
          <button type="button" onClick={() => setShowCustom(false)}
            className="h-8 px-2 rounded-md border border-border text-muted-foreground text-xs hover:text-foreground transition-colors">
            ✕
          </button>
        </div>
      )}

      {value && (
        <div className="text-[11px] flex items-center gap-1" style={{ color: field.required ? "hsl(var(--primary))" : "hsl(var(--accent))" }}>
          <span>Selected: <span className="font-semibold">{value}</span></span>
          <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground ml-1">×</button>
        </div>
      )}
    </div>
  );
}

// ── Main form schema ──────────────────────────────────────────────────────────
const createSchema = z.object({
  name:            z.string().min(1, "Name is required"),
  age:             z.string().optional(),
  bio:             z.string().optional(),
  initialGreeting: z.string().optional(),
  genre:           z.nativeEnum(CharacterInputGenre),
  tags:            z.string().optional(),
});

const STEPS = ["Basic", "Personality", "Appearance"] as const;

// ── Create page ───────────────────────────────────────────────────────────────
export function Create() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateCharacter();

  const [step, setStep] = useState(0);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // All 40 appearance keys (39 fields + hybridSpecies)
  const [appearance, setAppearance] = useState<Record<string, string>>({ ...BLANK_APPEARANCE });
  const [hybridSpeciesInput, setHybridSpeciesInput] = useState("");

  function setField(key: string, value: string) {
    setAppearance(prev => ({ ...prev, [key]: value }));
  }

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", age: "", bio: "", initialGreeting: "", genre: "Modern", tags: "" },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please select an image file", variant: "destructive" }); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function clearAvatar() {
    setAvatarFile(null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleNext() {
    if (step === 0) {
      const ok = await form.trigger(["name", "genre"]);
      if (!ok) return;
    }
    // Step 2 = Appearance → validate required fields then submit
    if (step === 2) {
      const missing = REQUIRED_FIELDS
        .filter(f => !appearance[f.key])
        .map(f => f.label);
      if (missing.length > 0) {
        toast({
          title: "Required appearance fields missing",
          description: `Please select: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ` +${missing.length - 4} more` : ""}`,
          variant: "destructive",
        });
        return;
      }
      await form.handleSubmit(onSubmit)();
      return;
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  const onSubmit = async (data: z.infer<typeof createSchema>) => {
    const tagsArray = data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [];

    let avatarUrl: string | undefined;
    if (avatarFile) {
      const formData = new FormData();
      formData.append("file", avatarFile);
      const token = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || "mock_init_data_for_dev";
      try {
        const res = await fetch("/api/media/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) {
          const json = await res.json() as { url?: string };
          avatarUrl = json.url;
        }
      } catch { /* continue without avatar */ }
    }

    // Include hybridSpecies if species is Hybrid
    const hybridSpeciesValue = (appearance.species === "Hybrid" || appearance.species?.toLowerCase().includes("hybrid"))
      ? (hybridSpeciesInput.trim() || appearance.hybridSpecies)
      : "";

    const appearancePayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(appearance)) {
      if (v) appearancePayload[k] = v;
    }
    if (hybridSpeciesValue) appearancePayload.hybridSpecies = hybridSpeciesValue;

    createMutation.mutate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...data, tags: tagsArray, avatarUrl, ...appearancePayload } as any,
    }, {
      onSuccess: (char) => {
        toast({ title: "Character Created!" });
        setLocation(`/chat/${char.characterId}`);
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        toast({ title: "Creation Failed", description: message, variant: "destructive" });
      },
    });
  };

  // ── Step renderers ────────────────────────────────────────────────────────
  function renderStep0() {
    return (
      <div className="space-y-5">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <div
          onClick={() => !avatarPreview && fileInputRef.current?.click()}
          className={`w-full aspect-video rounded-xl border-2 border-dashed flex items-center justify-center flex-col gap-2 transition-colors relative overflow-hidden ${
            avatarPreview ? "border-primary/60 cursor-default" : "border-border hover:border-primary cursor-pointer group"
          }`}
        >
          {avatarPreview ? (
            <>
              <img src={avatarPreview} alt="Avatar preview" className="absolute inset-0 w-full h-full object-cover" />
              <button type="button" onClick={e => { e.stopPropagation(); clearAvatar(); }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 z-10">
                <X size={14} />
              </button>
              <button type="button" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="absolute bottom-2 right-2 px-3 py-1 rounded-lg bg-black/60 text-white text-xs font-semibold hover:bg-black/80 z-10 flex items-center gap-1">
                <Upload size={12} /> Change
              </button>
            </>
          ) : (
            <>
              <Upload size={32} className="text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">Tap to upload avatar</span>
            </>
          )}
        </div>

        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Entity Name *</FormLabel>
            <FormControl><Input placeholder="e.g. Nexus-9" className="bg-card border-secondary/50 focus-visible:ring-primary h-12" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="genre" render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Genre</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-card border-secondary/50 h-12">
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(CharacterInputGenre).map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="age" render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Apparent Age</FormLabel>
              <FormControl><Input placeholder="e.g. 24" className="bg-card border-secondary/50 h-12" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
      </div>
    );
  }

  function renderStep1() {
    return (
      <div className="space-y-5">
        <FormField control={form.control} name="bio" render={({ field }) => (
          <FormItem>
            <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Core Directives (Bio)</FormLabel>
            <FormControl>
              <Textarea placeholder="Define their personality, history, and desires..." className="bg-card border-secondary/50 resize-none h-28" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="initialGreeting" render={({ field }) => (
          <FormItem>
            <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">First Contact</FormLabel>
            <FormControl>
              <Textarea placeholder="What do they say when you first meet?" className="bg-card border-secondary/50 resize-none h-20" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="tags" render={({ field }) => (
          <FormItem>
            <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Tags (comma separated)</FormLabel>
            <FormControl><Input placeholder="Tsundere, Hacker, Boss..." className="bg-card border-secondary/50 h-12" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-4">
        {/* Required section */}
        <div className="space-y-1 mb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> Required Details
          </h3>
          <p className="text-[11px] text-muted-foreground">All 11 fields below must be selected to proceed.</p>
        </div>

        {REQUIRED_FIELDS.map(f => (
          <div key={f.key}>
            <ChipField field={f} value={appearance[f.key]} onChange={v => setField(f.key, v)} />
            {/* Hybrid conditional sub-input */}
            {f.hybridConditional && (appearance[f.key] === "Hybrid" || (appearance[f.key] && appearance[f.key].toLowerCase().includes("hybrid"))) && (
              <div className="mt-2 ml-3 flex gap-2 items-center">
                <span className="text-[11px] text-muted-foreground shrink-0">Hybrid of which species?</span>
                <input
                  type="text"
                  value={hybridSpeciesInput}
                  onChange={e => setHybridSpeciesInput(e.target.value)}
                  placeholder="e.g. Half-elf, Half-demon…"
                  className="flex-1 h-8 rounded-md border border-primary/40 bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                />
              </div>
            )}
          </div>
        ))}

        {/* Optional section */}
        <div className="space-y-1 mt-6 mb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" /> Optional Details
          </h3>
          <p className="text-[11px] text-muted-foreground">These fields enrich the avatar and AI personality. Skip any you don't want to set.</p>
        </div>

        {OPTIONAL_FIELDS.map(f => (
          <ChipField key={f.key} field={f} value={appearance[f.key]} onChange={v => setField(f.key, v)} />
        ))}
      </div>
    );
  }

  const stepRenderers = [renderStep0, renderStep1, renderStep2];

  // Count required fields filled for appearance step progress hint
  const requiredFilled = step === 2 ? REQUIRED_FIELDS.filter(f => appearance[f.key]).length : 0;

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase tracking-widest text-glow-pink">Manifest</h1>
        <div className="px-3 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/40 text-cyan-400 font-bold flex items-center gap-1 text-sm">
          -25 🃏
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-1.5 ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all ${
                i < step ? "bg-primary border-primary text-primary-foreground"
                : i === step ? "border-primary text-primary"
                : "border-border text-muted-foreground"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 transition-all ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Required fields counter on appearance step */}
      {step === 2 && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
          requiredFilled === REQUIRED_FIELDS.length
            ? "bg-green-500/10 border-green-500/30 text-green-400"
            : "bg-primary/5 border-primary/20 text-primary"
        }`}>
          <span>{requiredFilled}/{REQUIRED_FIELDS.length} required fields selected</span>
          {requiredFilled === REQUIRED_FIELDS.length && <span>✓ Ready to awaken</span>}
        </div>
      )}

      <Form {...form}>
        <form onSubmit={e => e.preventDefault()} className="space-y-5">
          {stepRenderers[step]?.()}

          <div className="flex gap-3 pt-2 sticky bottom-4">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all font-semibold text-sm">
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button type="button" onClick={handleNext} disabled={createMutation.isPending}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50">
              {createMutation.isPending ? "Manifesting…"
                : step === STEPS.length - 1 ? <><Sparkles size={18} /> Awaken</>
                : <>Next <ChevronRight size={16} /></>}
            </button>
          </div>
        </form>
      </Form>
    </div>
  );
}
