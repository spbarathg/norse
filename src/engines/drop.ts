import seedrandom from "seedrandom";
import { z } from "zod";
import { getPrisma } from "../lib/db.js";
import { getCurrentInGameTimestamp } from "./time.js";
import { generateRelicId } from "../lib/relicId.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let characters: any[];
try {
  characters = require("../../data/allgodschars.json");
} catch {
  characters = require("../../allgodschars.json");
}
const eras: any[] = require("../config/eras.json");

const RARITY_WEIGHTS: Record<string, number> = {
  S: 0.005,  // 0.5% (1 in 200) - Ultra Legendary
  A: 0.025,  // 2.5% (1 in 40) - Legendary  
  B: 0.17,   // 17% - Rare
  C: 0.8,    // 80% - Common
};

const DropInput = z.object({
  userId: z.string(),
  era: z.string().optional(),
  nonce: z.string().optional(),
});
export type DropInput = z.infer<typeof DropInput>;

export type DropResult = {
  relicId: string;
  characterId: number;
  rarity: string;
  embed: any;
};

function weightedRoll(rng: () => number, table: Record<string, number>): string {
  const entries = Object.entries(table);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [key, weight] of entries) {
    if (r < weight) return key;
    r -= weight;
  }
  return entries[entries.length - 1][0];
}

function pickCharacter(rng: () => number, rarity: string) {
  const pool = (characters as any[]).filter((c) => c.rarity === rarity);
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}

function pickCharacterByEra(rng: () => number, rarity: string, era: string) {
  let pool = (characters as any[]).filter((c) => c.rarity === rarity);
  
  // Filter by pantheon if era is specified
  if (era === "norse") {
    pool = pool.filter((c) => c.pantheon.toLowerCase() === "norse");
  } else if (era === "greco-roman") {
    pool = pool.filter((c) => c.pantheon.toLowerCase() === "greco-roman");
  }
  // "all" era includes all characters
  
  if (pool.length === 0) {
    // Fallback to all characters of that rarity if no match
    pool = (characters as any[]).filter((c) => c.rarity === rarity);
  }
  
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}

export async function performDrop(input: DropInput): Promise<DropResult> {
  const { userId, era = "all", nonce = Date.now().toString() } = DropInput.parse(input);
  const seed = `${userId}:${nonce}`;
  const rng = seedrandom(seed);

  const rarity = weightedRoll(rng, RARITY_WEIGHTS);
  const character = pickCharacterByEra(rng, rarity, era);
  const igTs = getCurrentInGameTimestamp();
  const currentEra = eras[0];

  const prisma = getPrisma();

  const currentStats = {
    hp: character.hp,
    atk: character.atk,
    def: character.def,
    spd: character.spd,
  };

  const history = [
    { ts: new Date().toISOString(), event: "dropped", details: { eraId: currentEra.id } },
  ];

  // Generate premium relic ID
  const relicId = await generateRelicId(currentEra.id, character.slug);

  const relic = await prisma.relic.create({
    data: {
      id: relicId,
      characterId: character.id,
      ownerUserId: userId,
      originUserId: userId,
      eraId: currentEra.id,
      rarity: character.rarity,
      birthIgTs: igTs,
      currentStats: JSON.stringify(currentStats),
      history: JSON.stringify(history),
    },
  });

  const baseUrl = process.env.CDN_BASE_URL || "http://localhost:3000/cdn";
  const imageUrl = `${baseUrl}/portraits/${character.slug}.png`;

  const embed: any = {
    title: `${character.name} — ${rarity} Relic` ,
    description: `Era: ${currentEra.name} | Born: ${igTs}`,
    fields: [
      { name: "Class", value: character.class, inline: true },
      { name: "Element", value: character.element, inline: true },
      ...(character.passive
        ? [{ name: "Passive", value: `"${character.passive.name}" — ${character.passive.desc}` }]
        : [{ name: "Lore", value: character.lore }]
      ),
    ],
  };

  // Only add image if we have a proper URL
  if (baseUrl && baseUrl !== "") {
    embed.image = { url: imageUrl };
  }

  return { relicId: relic.id, characterId: character.id, rarity, embed };
} 