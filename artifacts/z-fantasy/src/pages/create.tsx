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
import { Sparkles, Upload, X, Lock, Globe } from "lucide-react";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.string().optional(),
  bio: z.string().optional(),
  initialGreeting: z.string().optional(),
  genre: z.nativeEnum(CharacterInputGenre),
  tags: z.string().optional(),
  visibility: z.enum(["public", "private"]).default("private"),
});

export function Create() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateCharacter();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      age: "",
      bio: "",
      initialGreeting: "",
      genre: "Modern",
      tags: "",
      visibility: "private",
    }
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  }

  function clearAvatar() {
    setAvatarFile(null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const onSubmit = async (data: z.infer<typeof createSchema>) => {
    const tagsArray = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

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

    createMutation.mutate({
      data: {
        ...data,
        tags: tagsArray,
        avatarUrl,
        visibility: data.visibility,
      }
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
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="p-4 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase tracking-widest text-glow-pink">Manifest</h1>
        <div className="px-3 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/40 text-cyan-400 font-bold flex items-center gap-1 text-sm">
          -25 🃏
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                  onClick={(e) => { e.stopPropagation(); clearAvatar(); }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
                >
                  <X size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
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
                <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Entity Name</FormLabel>
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

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Core Directives (Bio)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Define their personality, history, and desires..." className="bg-card border-secondary/50 resize-none h-24" {...field} />
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
                  <Textarea placeholder="What do they say when you first meet?" className="bg-card border-secondary/50 resize-none h-20" {...field} />
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

          {/* Visibility Toggle */}
          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Visibility</FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => field.onChange("private")}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-sm transition-all ${
                      field.value === "private"
                        ? "border-primary/60 bg-primary/15 text-primary box-glow-pink"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`}>
                    <Lock size={14} /> Private
                  </button>
                  <button type="button"
                    onClick={() => field.onChange("public")}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-sm transition-all ${
                      field.value === "public"
                        ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300"
                        : "border-border bg-card text-muted-foreground hover:border-cyan-400/30"
                    }`}>
                    <Globe size={14} /> Public
                  </button>
                </div>
              </FormItem>
            )}
          />

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full py-4 mt-4 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
          >
            {createMutation.isPending ? "Manifesting..." : <><Sparkles size={20} /> Awaken</>}
          </button>
        </form>
      </Form>
    </div>
  );
}
