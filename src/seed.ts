import { db, charactersTable } from "./db";
import { eq } from "drizzle-orm";

const characters = [
];

async function seed() {
  for (const char of characters) {
    const existing = await db
      .select({ id: charactersTable.characterId })
      .from(charactersTable)
      .where(eq(charactersTable.name, char.name));
    if (existing.length > 0) {
      console.log("Skip:", char.name);
      continue;
    }
    await db.insert(charactersTable).values(char);
    console.log("Seeded:", char.name);
  }
  console.log("Done!");
}

seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
