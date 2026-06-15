import { useState } from "react";
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
import { Sparkles, Image as ImageIcon } from "lucide-react";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.string().optional(),
  bio: z.string().optional(),
  initialGreeting: z.string().optional(),
  genre: z.nativeEnum(CharacterInputGenre),
  tags: z.string().optional(),
});

export function Create() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateCharacter();

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      age: "",
      bio: "",
      initialGreeting: "",
      genre: "Modern",
      tags: "",
    }
  });

  const onSubmit = (data: z.infer<typeof createSchema>) => {
    const tagsArray = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    
    createMutation.mutate({
      data: {
        ...data,
        tags: tagsArray,
      }
    }, {
      onSuccess: (char) => {
        toast({ title: "Character Created!" });
        setLocation(`/chat/${char.characterId}`);
      },
      onError: (err: any) => {
        toast({ 
          title: "Creation Failed", 
          description: err?.message || "Not enough tickets or validation error.",
          variant: "destructive" 
        });
      }
    });
  };

  return (
    <div className="p-4 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase tracking-widest text-glow-pink">Manifest</h1>
        <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary text-primary font-bold flex items-center gap-1 text-sm box-glow-pink">
          -25 🎟️
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="w-full aspect-video bg-muted rounded-xl border-2 border-dashed border-border flex items-center justify-center flex-col gap-2 text-muted-foreground hover:border-primary transition-colors cursor-pointer relative overflow-hidden group">
            <ImageIcon size={32} className="group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium">Tap to upload avatar</span>
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
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
