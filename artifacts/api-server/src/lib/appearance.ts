import { charactersTable } from "@workspace/db";

/**
 * Builds a compact visual appearance description string from the local DB
 * character row's appearance columns.  Used to anchor image generation prompts
 * so every generated image (chat auto-images, selfies, AND admin avatar
 * regeneration) reflects the character's saved physical traits.
 *
 * Output example:
 *   "Long Black hair, Blue eyes, Slim build, Cat hybrid, Cat ears, Large chest,
 *    Long wavy hairstyle, Natural makeup, Tail"
 */
export function buildLocalAppearanceDesc(
  row: typeof charactersTable.$inferSelect | undefined | null,
): string {
  if (!row) return "";
  const parts: string[] = [];
  const hairParts = [row.hairColor, row.hairLength].filter(Boolean);
  if (hairParts.length) parts.push(`${hairParts.join(" ")} hair`);
  if (row.eyeColor) parts.push(`${row.eyeColor} eyes`);
  if (row.build) parts.push(`${row.build} build`);
  if (row.height) parts.push(`${row.height} height`);
  if (row.species) {
    const speciesLabel =
      row.species === "Hybrid" && row.hybridSpecies
        ? row.hybridSpecies
        : row.species;
    parts.push(speciesLabel);
  }
  if (row.earType) parts.push(`${row.earType} ears`);
  if (row.chestSize) parts.push(`${row.chestSize} chest`);
  if (row.assSize) parts.push(`${row.assSize} ass`);
  if (row.thighHipSize) parts.push(`${row.thighHipSize} hips`);
  if (row.hairstyle) parts.push(`${row.hairstyle} hairstyle`);
  if (row.bangsStyle) parts.push(row.bangsStyle);
  if (row.makeupStyle) parts.push(`${row.makeupStyle} makeup`);
  if (row.posture) parts.push(`${row.posture} posture`);
  if (row.tailWings) parts.push(row.tailWings);
  if (row.distinguishingFeature) parts.push(row.distinguishingFeature);
  if (row.accessory) parts.push(row.accessory);
  if (row.outfitFit) parts.push(`${row.outfitFit} outfit`);
  if (row.outfitCleavageCut) parts.push(`${row.outfitCleavageCut} cut`);
  if (row.legwearSocksStyle) parts.push(row.legwearSocksStyle);
  if (row.environmentSetting) parts.push(row.environmentSetting);
  if (row.genderBaseMesh) parts.push(row.genderBaseMesh);
  return parts.filter(Boolean).join(", ");
}
