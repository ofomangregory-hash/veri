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

const STEPS = [
  { id: 1, title: "Entity Name",       subtitle: "Choose or type your companion's identity" },
  { id: 2, title: "Visual Form",       subtitle: "Avatar auto-generated from your choices" },
  { id: 3, title: "Origin Genre",      subtitle: "Choose art style and character type" },
  { id: 4, title: "Core Data",         subtitle: "Age & biographical directives" },
  { id: 5, title: "First Contact",     subtitle: "Their opening transmission" },
  { id: 6, title: "Signal Tags",       subtitle: "Classify your entity's attributes" },
];

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

  const [name, setName] = useState("");
  const [usingCustomName, setUsingCustomName] = useState(false);
  const [customNameInput, setCustomNameInput] = useState("");

  const [artStyle, setArtStyle] = useState<"Anime" | "Realistic" | "">("");
  const [subGenres, setSubGenres] = useState<string[]>([]);
  const [customSubGenreInput, setCustomSubGenreInput] = useState("");
  const [showCustomSubGenre, setShowCustomSubGenre] = useState(false);

  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isNsfw, setIsNsfw] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("private");

  const resolvedName = usingCustomName ? customNameInput.trim() : name;

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
    if (step === 3) return artStyle !== "" && subGenres.length >= 1;
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
          genre: artStyle || "Realistic",
          subGenres,
          age: age || undefined,
          bio: bio || undefined,
          initialGreeting: greeting || undefined,
          tags,
          visibility,
          isNsfw,
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
              <span className="text-foreground font-semibold">character type</span>.
            </p>
            <p className="text-xs text-center text-muted-foreground/60">
              You can update it from the admin panel after creation.
            </p>
          </div>
        )}

        {/* ── Step 3: Genre (Art Style + Sub-genre) ── */}
        {step === 3 && (
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

            {/* Step B: Sub-genres (shows after art style is picked) */}
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

        {/* ── Step 4: Age + Bio ── */}
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

        {/* ── Step 5: Greeting ── */}
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

        {/* ── Step 6: Tags ── */}
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
          </div>
        )}

        {/* Step 6 summary — appears inline below tags */}
        {step === 6 && (
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

        {/* Navigation — inside scroll area so it always sits below content */}
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
              Continue <ChevronRight size={18} />
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
