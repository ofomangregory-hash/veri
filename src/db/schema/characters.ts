import { pgTable, text, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const charactersTable = pgTable("characters", {
  characterId: uuid("character_id").primaryKey().defaultRandom(),
  creatorId: text("creator_id"),
  name: text("name").notNull(),
  visibility: text("visibility").notNull().default("private"),
  systemPrompt: text("system_prompt"),
  avatarUrl: text("avatar_url"),
  teaserDescription: text("teaser_description"),
  initialGreeting: text("initial_greeting"),
  tags: text("tags").array().notNull().default([]),
  genre: text("genre").notNull().default("Modern"),
  age: text("age"),
  triggerMetadataArray: jsonb("trigger_metadata_array"),
  imageSeed: text("image_seed"),

  // ── Appearance columns (40 total, covering 39 UX fields) ─────────────────
  // Required group (fields 1–11)
  hairColor:            text("hair_color"),
  hairLength:           text("hair_length"),
  eyeColor:             text("eye_color"),
  cameraShotType:       text("camera_shot_type"),
  viewDirection:        text("view_direction"),
  genderBaseMesh:       text("gender_base_mesh"),
  environmentSetting:   text("environment_setting"),
  renderingEngine:      text("rendering_engine"),
  imageFocus:           text("image_focus"),
  negativePromptsFilter: text("negative_prompts_filter"),
  species:              text("species"),
  hybridSpecies:        text("hybrid_species"),   // conditional sub-field of species

  // Optional group (fields 12–39)
  height:               text("height"),
  build:                text("build"),
  skinTone:             text("skin_tone"),
  earType:              text("ear_type"),
  distinguishingFeature: text("distinguishing_feature"),
  voiceTone:            text("voice_tone"),
  hairstyle:            text("hairstyle"),
  facialExpressionDefault: text("facial_expression_default"),
  accessory:            text("accessory"),
  tailWings:            text("tail_wings"),
  bodyMarkings:         text("body_markings"),
  posture:              text("posture"),
  colorPalette:         text("color_palette"),
  occupationLook:       text("occupation_look"),
  culturalStyle:        text("cultural_style"),
  assSize:              text("ass_size"),
  chestSize:            text("chest_size"),
  cameraAngle:          text("camera_angle"),
  eyeDetailEnhancer:    text("eye_detail_enhancer"),
  clothingMaterialFinish: text("clothing_material_finish"),
  legwearSocksStyle:    text("legwear_socks_style"),
  lightingStyle:        text("lighting_style"),
  bangsStyle:           text("bangs_style"),
  makeupStyle:          text("makeup_style"),
  outfitFit:            text("outfit_fit"),
  thighHipSize:         text("thigh_hip_size"),
  skinTextureRealism:   text("skin_texture_realism"),
  outfitCleavageCut:    text("outfit_cleavage_cut"),
});

export const insertCharacterSchema = createInsertSchema(charactersTable).omit({ characterId: true });
export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type Character = typeof charactersTable.$inferSelect;
