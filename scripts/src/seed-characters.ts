import { db, charactersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const characters = [
];

async function seed() {
  console.log("Seeding characters...");

  for (const char of characters) {
    const existing = await db.select({ characterId: charactersTable.characterId })
      .from(charactersTable)
      .where(eq(charactersTable.name, char.name));

    if (existing.length > 0) {
      console.log(`Skipping ${char.name} — already exists`);
      continue;
    }

    await db.insert(charactersTable).values({
      ...char,
      creatorId: "0",
    });
    console.log(`Seeded: ${char.name}`);
  }

  console.log("Done!");
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
