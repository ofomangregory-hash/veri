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

// ── Appearance field definitions ──────────────────────────────────────────────
const APPEARANCE_FIELDS = [
  {
    key: "hairColor", label: "Hair Color", required: true,
    presets: ["Black", "Brown", "Blonde", "Red", "White", "Silver", "Blue", "Pink", "Purple", "Green", "Rose gold"],
  },
  {
    key: "hairLength", label: "Hair Length", required: true,
    presets: ["Bald", "Buzzcut", "Short", "Medium", "Long", "Very long", "Waist-length", "Floor-length"],
  },
  {
    key: "eyeColor", label: "Eye Color", required: true,
    presets: ["Brown", "Blue", "Green", "Hazel", "Grey", "Amber", "Red", "Purple", "Gold", "Heterochromia", "Glowing"],
  },
  {
    key: "hairstyle", label: "Hairstyle", required: false,
    presets: ["Straight", "Wavy", "Curly", "Braided", "Twin tails", "Ponytail", "Bob", "Bun", "Wild / messy"],
  },
  {
    key: "skinTone", label: "Skin Tone", required: false,
    presets: ["Pale", "Fair", "Light", "Medium", "Tan", "Dark", "Ebony", "Bronze", "Blue-grey", "Silver"],
  },
  {
    key: "height", label: "Height", required: false,
    presets: ["Petite", "Short", "Average", "Tall", "Very tall"],
  },
  {
    key: "build", label: "Build", required: false,
    presets: ["Slim", "Athletic", "Curvy", "Muscular", "Petite", "Voluptuous", "Lithe"],
  },
  {
    key: "species", label: "Species", required: false,
    presets: ["Human", "Elf", "Demon", "Angel", "Vampire", "Werewolf", "Neko", "Android", "Alien", "Fae", "Undead"],
  },
  {
    key: "hybridSpecies", label: "Hybrid Species", required: false,
    presets: ["None", "Half-human", "Half-demon", "Half-elf", "Half-dragon", "Cyborg"],
  },
  {
    key: "earType", label: "Ear Type", required: false,
    presets: ["Human", "Elf-pointed", "Cat ears", "Fox ears", "Demon horns", "Dragon horns", "Bunny ears"],
  },
  {
    key: "distinguishingFeature", label: "Distinguishing Feature", required: false,
    presets: ["None", "Scar", "Tattoo", "Birthmark", "Freckles", "Heterochromia", "Glowing eyes", "Fangs"],
  },
  {
    key: "voiceTone", label: "Voice Tone", required: false,
    presets: ["Soft", "Deep", "Raspy", "Melodic", "Playful", "Cold", "Sultry", "High-pitched", "Robotic"],
  },
  {
    key: "facialExpressionDefault", label: "Default Expression", required: false,
    presets: ["Smiling", "Serious", "Mysterious", "Playful", "Seductive", "Stoic", "Shy", "Mischievous"],
  },
  {
    key: "accessory", label: "Accessory", required: false,
    presets: ["None", "Glasses", "Choker", "Crown", "Headphones", "Mask", "Earrings", "Horns", "Halo", "Eye patch"],
  },
  {
    key: "tailWings", label: "Tail / Wings", required: false,
    presets: ["None", "Tail", "Fox tail", "Dragon wings", "Demon wings", "Angel wings", "Multiple tails"],
  },
  {
    key: "bodyMarkings", label: "Body Markings", required: false,
    presets: ["None", "Tattoos", "Runes", "Scales", "Scars", "Glowing markings", "Clan marks"],
  },
  {
    key: "posture", label: "Posture", required: false,
    presets: ["Confident", "Relaxed", "Elegant", "Tense", "Slouched", "Warrior stance", "Seductive lean"],
  },
  {
    key: "colorPalette", label: "Color Palette", required: false,
    presets: ["Dark", "Pastel", "Neon", "Monochrome", "Warm", "Cool", "Earthy", "Vibrant", "Muted"],
  },
  {
    key: "occupationLook", label: "Occupation Look", required: false,
    presets: ["Casual", "Formal", "Military", "Mage robes", "Hacker / street", "Noble", "Armor", "Lab coat"],
  },
  {
    key: "culturalStyle", label: "Cultural Style", required: false,
    presets: ["Western", "Japanese", "Gothic", "Cyberpunk", "Victorian", "Fantasy", "Ancient", "Futuristic"],
  },
] as const;

type AppearanceKey = (typeof APPEARANCE_FIELDS)[number]["key"];

// ── ChipField component ───────────────────────────────────────────────────────
interface ChipFieldProps {
  label: string;
  required?: boolean;
  presets: readonly string[];
  value: string;
  onChange: (v: string) => void;
}

function ChipField({ label, required, presets, value, onChange }: ChipFieldProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");

  function applyCustom() {
    const v = customVal.trim();
    if (v) {
      onChange(v);
      setShowCustom(false);
      setCustomVal("");
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-primary ml-1">*</span>}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(value === p ? "" : p)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              value === p
                ? "bg-primary/20 border-primary text-primary"
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
          + Custom
        </button>
      </div>
      {showCustom && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } }}
            placeholder={`Custom ${label.toLowerCase()}…`}
            className="flex-1 h-8 rounded-md border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="h-8 px-2.5 rounded-md bg-primary/20 border border-primary/40 text-primary text-xs font-bold hover:bg-primary/30 transition-colors"
          >
            ✓
          </button>
        </div>
      )}
      {value && (
        <div className="text-[11px] text-primary flex items-center gap-1">
          <span>Selected:</span>
          <span className="font-semibold">{value}</span>
          <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground ml-1 leading-none">×</button>
        </div>
      )}
    </div>
  );
}

// ── Main form schema ──────────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.string().optional(),
  bio: z.string().optional(),
  initialGreeting: z.string().optional(),
  genre: z.nativeEnum(CharacterInputGenre),
  tags: z.string().optional(),
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

  // Appearance state — one string per field key
  const [appearance, setAppearance] = useState<Record<AppearanceKey, string>>({
    hairColor: "", hairLength: "", eyeColor: "", hairstyle: "", skinTone: "",
    height: "", build: "", species: "", hybridSpecies: "", earType: "",
    distinguishingFeature: "", voiceTone: "", facialExpressionDefault: "",
    accessory: "", tailWings: "", bodyMarkings: "", posture: "",
    colorPalette: "", occupationLook: "", culturalStyle: "",
  });

  function setAppearanceField(key: AppearanceKey, value: string) {
    setAppearance(prev => ({ ...prev, [key]: value }));
  }

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      age: "",
      bio: "",
      initialGreeting: "",
      genre: "Modern",
      tags: "",
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function clearAvatar() {
    setAvatarFile(null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Validate current step before advancing
  async function handleNext() {
    if (step === 0) {
      const ok = await form.trigger(["name", "genre"]);
      if (!ok) return;
    }
    if (step === 1) {
      // No required fields on personality step
    }
    if (step === 2) {
      // Validate required appearance fields
      const required: AppearanceKey[] = ["hairColor", "hairLength", "eyeColor"];
      const missing = required.filter(k => !appearance[k]);
      if (missing.length > 0) {
        toast({
          title: "Missing required appearance fields",
          description: `Please select: ${missing.map(k => APPEARANCE_FIELDS.find(f => f.key === k)?.label).join(", ")}`,
          variant: "destructive",
        });
        return;
      }
      // Step 2 is the last step — submit
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
        } else {
          toast({ title: "Image upload failed, continuing without avatar", variant: "destructive" });
        }
      } catch {
        toast({ title: "Image upload failed, continuing without avatar", variant: "destructive" });
      }
    }

    // Spread appearance fields into the request — server reads them via AppearanceSchema
    const appearancePayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(appearance)) {
      if (v) appearancePayload[k] = v;
    }

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
        toast({
          title: "Creation Failed",
          description: message || "Not enough Neon Cards or validation error.",
          variant: "destructive",
        });
      },
    });
  };

  // ── Step content renderers ────────────────────────────────────────────────
  function renderStep0() {
    return (
      <div className="space-y-5">
        {/* Avatar Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div
          onClick={() => !avatarPreview && fileInputRef.current?.click()}
          className={`w-full aspect-video rounded-xl border-2 border-dashed flex items-center justify-center flex-col gap-2 transition-colors relative overflow-hidden ${
            avatarPreview
              ? "border-primary/60 cursor-default"
              : "border-border hover:border-primary cursor-pointer group"
          }`}
        >
          {avatarPreview ? (
            <>
              <img src={avatarPreview} alt="Avatar preview" className="absolute inset-0 w-full h-full object-cover" />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); clearAvatar(); }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="absolute bottom-2 right-2 px-3 py-1 rounded-lg bg-black/60 text-white text-xs font-semibold hover:bg-black/80 transition-colors z-10 flex items-center gap-1"
              >
                <Upload size={12} /> Change
              </button>
            </>
          ) : (
            <>
              <Upload size={32} className="text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                Tap to upload avatar
              </span>
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </>
          )}
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Entity Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Nexus-9" className="bg-card border-secondary/50 focus-visible:ring-primary h-12" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="genre"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Genre</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-card border-secondary/50 h-12">
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(CharacterInputGenre).map(g => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Apparent Age</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 24" className="bg-card border-secondary/50 h-12" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    );
  }

  function renderStep1() {
    return (
      <div className="space-y-5">
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Core Directives (Bio)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Define their personality, history, and desires..."
                  className="bg-card border-secondary/50 resize-none h-28"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="initialGreeting"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">First Contact</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="What do they say when you first meet?"
                  className="bg-card border-secondary/50 resize-none h-20"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Tags (comma separated)</FormLabel>
              <FormControl>
                <Input placeholder="Tsundere, Hacker, Boss..." className="bg-card border-secondary/50 h-12" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-5">
        <p className="text-xs text-muted-foreground">
          These details shape the avatar image and the AI's self-description. <span className="text-primary">* Required</span>
        </p>

        {APPEARANCE_FIELDS.map(field => (
          <ChipField
            key={field.key}
            label={field.label}
            required={field.required}
            presets={field.presets}
            value={appearance[field.key as AppearanceKey]}
            onChange={v => setAppearanceField(field.key as AppearanceKey, v)}
          />
        ))}
      </div>
    );
  }

  const stepRenderers = [renderStep0, renderStep1, renderStep2];

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase tracking-widest text-glow-pink">Manifest</h1>
        <div className="px-3 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/40 text-cyan-400 font-bold flex items-center gap-1 text-sm">
          -25 🃏
        </div>
      </div>

      {/* Step progress bar */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-1.5 ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all ${
                i < step
                  ? "bg-primary border-primary text-primary-foreground"
                  : i === step
                  ? "border-primary text-primary"
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

      <Form {...form}>
        <form onSubmit={e => e.preventDefault()} className="space-y-5">
          {stepRenderers[step]?.()}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all font-semibold text-sm"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={createMutation.isPending}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                "Manifesting…"
              ) : step === STEPS.length - 1 ? (
                <><Sparkles size={18} /> Awaken</>
              ) : (
                <>Next <ChevronRight size={16} /></>
              )}
            </button>
          </div>
        </form>
      </Form>
    </div>
  );
}
