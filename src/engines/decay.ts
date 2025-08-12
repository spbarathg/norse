import { getPrisma } from "../lib/db.js";
import type { Relic } from "@prisma/client";

const BASE_DECAY_PER_HOUR = 0.5; // percent

const EVOLUTION_THRESHOLDS = [
  { stage: "Legendary", minXp: 100 },
  { stage: "Awakened", minXp: 50 },
  { stage: "Stirring", minXp: 10 },
  { stage: "Dormant", minXp: 0 },
];

function stageFromXp(xp: number): string {
  for (const t of EVOLUTION_THRESHOLDS) {
    if (xp >= t.minXp) return t.stage;
  }
  return "Dormant";
}

export async function runDecayTick() {
  const prisma = getPrisma();
  const now = new Date();

  const eras = await prisma.era.findMany();
  const eraMap = new Map(eras.map((e) => [e.id, e]));

  const batchSize = 200;
  let cursor: string | undefined = undefined;

  while (true) {
    const relics: Relic[] = await prisma.relic.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      where: { isLocked: false }, // Skip locked relics
    });
    if (relics.length === 0) break;

    for (const relic of relics) {
      cursor = relic.id;

      const last = relic.lastDecayTick ?? new Date(0);
      const hours = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 3600000));
      if (hours <= 0) continue;

      const era = eraMap.get(relic.eraId);
      const eraMod = era?.decayModifier ?? 1;
      const tierMod = relic.rarity === "S" ? 0.6 : relic.rarity === "A" ? 0.8 : relic.rarity === "B" ? 1.0 : 1.2;
      const totalDecay = hours * BASE_DECAY_PER_HOUR * eraMod * tierMod;

      const newDur = Math.max(0, relic.durabilityPct - totalDecay);
      const newStage = stageFromXp(relic.xp);

      // Parse and update history (SQLite stores JSON as string)
      let hist: any[];
      try {
        hist = JSON.parse(relic.history || "[]");
      } catch {
        hist = [];
      }
      hist.push({ ts: now.toISOString(), event: "decay_tick", details: { hours, delta: -totalDecay } });

      await prisma.relic.update({
        where: { id: relic.id },
        data: { 
          durabilityPct: newDur, 
          evolutionStage: newStage, 
          lastDecayTick: now, 
          history: JSON.stringify(hist) 
        },
      });

      // Shadowborn stub (future): if (newDur <= 10) { /* noop now */ }
    }
  }

  return { ok: true };
} 