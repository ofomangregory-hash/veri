// Cloudinary removed — all image helpers use picsum placeholders or direct URLs.

export function getGenreDefaultAvatar(genre: string): string {
  const seeds: Record<string, string> = {
    Anime: "anime-girl-1",
    Fantasy: "fantasy-elf-1",
    Modern: "modern-woman-1",
    "Sci-Fi": "scifi-android-1",
    "Dark Goth": "goth-vampire-1",
    Gothic: "gothic-vampire-1",
    Elf: "fantasy-elf-2",
    Vampire: "gothic-vampire-2",
    Succubus: "dark-succubus-1",
    Cyberpunk: "scifi-cyber-1",
  };
  return `https://picsum.photos/seed/${seeds[genre] ?? "default-avatar"}/400/600`;
}

export function getCharacterAssetUrl(
  characterId: string,
  folder: string,
  filename = "1.jpg",
): string {
  return `https://picsum.photos/seed/${characterId}-${folder}/400/600`;
}

export function getAutoLoopImage(characterId: string): string {
  const idx = Math.floor(Math.random() * 10) + 1;
  return `https://picsum.photos/seed/${characterId}-loop-${idx}/400/600`;
}

export function getTriggerPoolImage(characterId: string, keyword: string): string {
  return `https://picsum.photos/seed/${characterId}-${keyword}/400/600`;
}
