import seedrandom from "seedrandom";
import { z } from "zod";
import { getPrisma } from "../lib/db.js";
import { getCurrentInGameTimestamp } from "./time.js";
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
  S: 0.02,
  A: 0.1,
  B: 0.28,
  C: 0.6,
};

const DropInput = z.object({
  userId: z.string(),
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

export async function performDrop(input: DropInput): Promise<DropResult> {
  const { userId, nonce = Date.now().toString() } = DropInput.parse(input);
  const seed = `${userId}:${nonce}`;
  const rng = seedrandom(seed);

  const rarity = weightedRoll(rng, RARITY_WEIGHTS);
  const character = pickCharacter(rng, rarity);
  const igTs = getCurrentInGameTimestamp();
  const currentEra = eras[0];

  const prisma = getPrisma();

  const currentStats = {
    hp: character.hp,
    atk: character.atk,
    def: character.def,
    spd: character.spd,
  };

  const relic = await prisma.relic.create({
    data: {
      characterId: character.id,
      ownerUserId: userId,
      originUserId: userId,
      eraId: currentEra.id,
      birthIgTs: igTs,
      currentStats,
      history: [
        { ts: new Date().toISOString(), event: "dropped", details: { eraId: currentEra.id } },
      ],
    },
  });

  const imageUrl = `${process.env.CDN_BASE_URL || ""}/portraits/${character.slug}.png`;

  const embed = {
    title: `${character.name} — ${rarity} Relic` ,
    description: `Era: ${currentEra.name} | Born: ${igTs}`,
    image: { url: imageUrl },
    fields: [
      { name: "Class", value: character.class, inline: true },
      { name: "Element", value: character.element, inline: true },
      { name: "Passive", value: `"${character.passive_ability_name}" — ${character.passive_ability_desc}` },
    ],
  };

  return { relicId: relic.id, characterId: character.id, rarity, embed };
} 