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

// Default banner rarity weights; overridable by banner config
const RARITY_WEIGHTS: Record<string, number> = {
  S: 0.005,
  A: 0.025,
  B: 0.17,
  C: 0.8,
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

export type GachaResult = {
  isDuplicate: boolean;
  awardedEssence?: number;
  rarity: string;
  characterId: number;
  relicId?: string;
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
      metadata: JSON.stringify({ level: 1, activeArtStyle: 'default' }),
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

// Gacha that converts duplicates to Mythic Essence instead of creating another copy
export async function performGacha(input: DropInput & { bannerId?: string }): Promise<GachaResult> {
  const { userId, era = "all", nonce = Date.now().toString(), bannerId } = input as any;
  const seed = `${userId}:${nonce}`;
  const rng = seedrandom(seed);

  // Optional banner config with pity
  const prisma = getPrisma();
  const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
  const mats = JSON.parse(user.materials || '{}');
  const pity = mats.pity || { pullsSinceA: 0, pullsSinceS: 0 };
  let weights = { ...RARITY_WEIGHTS };
  if (bannerId) {
    // Example: small boost to A/S and pity softcaps
    weights = { S: 0.008, A: 0.04, B: 0.17, C: 0.782 };
  }
  // Soft pity: if many pulls without A/S, gently increase odds
  const pityBoostA = Math.min(0.04, (pity.pullsSinceA || 0) * 0.0005);
  const pityBoostS = Math.min(0.01, (pity.pullsSinceS || 0) * 0.0002);
  weights.A += pityBoostA; weights.C -= pityBoostA;
  weights.S += pityBoostS; weights.B -= pityBoostS;

  const rarity = weightedRoll(rng, weights);
  const character = pickCharacterByEra(rng, rarity, era);

  // Check if user already owns a relic for this character
  const existing = await prisma.relic.findFirst({ where: { ownerUserId: userId, characterId: character.id } });

  const baseUrl = process.env.CDN_BASE_URL || "http://localhost:3000/cdn";
  const imageUrl = `${baseUrl}/portraits/${character.slug}.png`;

  // Essence reward mapping by rarity
  const essenceByRarity: Record<string, number> = { C: 10, B: 50, A: 200, S: 500 };

  if (existing) {
    // Duplicate: award essence
    const essence = essenceByRarity[rarity] ?? 10;
    // Ensure user exists and update currencies
    const user = await prisma.user.upsert({
      where: { userId },
      create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) },
      update: {},
    });
    const currencies = JSON.parse((user as any).currencies || '{}');
    currencies.mythic_essence = Number(currencies.mythic_essence || 0) + essence;
    await prisma.user.update({ where: { userId }, data: { currencies: JSON.stringify(currencies) } });

    const isFirstEssence = !('mythic_essence' in currencies) || Number(currencies.mythic_essence || 0) === essence; // naive first-time check
    const embed: any = {
      title: `Duplicate — ${character.name}`,
      description: `You already own this character. Converted to Mythic Essence!${isFirstEssence ? "\nUse /upgrade to power up cards or /customize to unlock art." : ""}`,
      fields: [
        { name: "Rarity", value: rarity, inline: true },
        { name: "Essence Awarded", value: `+${essence}`, inline: true },
      ],
      image: baseUrl ? { url: imageUrl } : undefined,
    };

    // update pity counters
    pity.pullsSinceA += 1; pity.pullsSinceS += 1;
    await prisma.user.update({ where: { userId }, data: { materials: JSON.stringify({ ...mats, pity }) } });
    return { isDuplicate: true, awardedEssence: essence, rarity, characterId: character.id, embed };
  }

  // Not a duplicate: create new relic (same as performDrop but minimal fields here)
  const result = await performDrop({ userId, era, nonce });
  // reset pity for landed rarity
  pity.pullsSinceA = rarity === 'A' || rarity === 'S' ? 0 : pity.pullsSinceA + 1;
  pity.pullsSinceS = rarity === 'S' ? 0 : pity.pullsSinceS + 1;
  await prisma.user.update({ where: { userId }, data: { materials: JSON.stringify({ ...mats, pity }) } });
  const embed = {
    title: `New — ${characters.find((c:any)=>c.id===result.characterId)?.name || 'Character'}`,
    description: `Added to your collection!`,
    fields: [
      { name: "Rarity", value: result.rarity, inline: true },
      { name: "Relic ID", value: result.relicId, inline: true },
    ],
    image: result.embed?.image,
  } as any;

  return { isDuplicate: false, rarity: result.rarity, characterId: result.characterId, relicId: result.relicId, embed };
}