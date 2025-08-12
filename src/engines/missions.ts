import { getPrisma } from "../lib/db.js";
import { createRequire } from "module";
import type { Prisma } from "@prisma/client";
const require = createRequire(import.meta.url);
const missionDefs: any[] = require("../config/missions.json");

function getMissionDef(id: string) {
  const def = missionDefs.find((m) => m.id === id);
  if (!def) throw new Error("mission_not_found");
  return def as { id: string; durationSec: number; xpReward: number; decayReduction: number; rewardTable: any };
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function startMission(ownerUserId: string, relicIds: string[], missionId: string) {
  const prisma = getPrisma();
  const def = getMissionDef(missionId);

  const relics = await prisma.relic.findMany({ where: { id: { in: relicIds } } });
  if (relics.length !== relicIds.length) throw new Error("relic_not_found");
  if (relics.some((r: any) => r.ownerUserId !== ownerUserId)) throw new Error("not_owner");
  if (relics.some((r: any) => r.isLocked)) throw new Error("relic_locked");

  const end = new Date(Date.now() + def.durationSec * 1000);

  const mission = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await (tx as any).mission.create({
      data: {
        ownerUserId,
        relicIds: JSON.stringify(relicIds), // Store as JSON string
        missionType: missionId,
        endRealTs: end,
        rewardPayload: JSON.stringify({}), // Store as JSON string
      },
    });

    await (tx as any).relic.updateMany({
      where: { id: { in: relicIds } },
      data: { isLocked: true, missionLockId: created.id },
    });

    return created;
  });

  return mission;
}

export async function completeMissionJob(missionId: string) {
  const prisma = getPrisma();
  const mission = await prisma.mission.findUnique({ where: { id: missionId } });
  if (!mission) throw new Error("mission_not_found");
  if (mission.status !== "active") return mission;
  if (mission.endRealTs.getTime() > Date.now()) return mission; // not yet due

  const def = getMissionDef(mission.missionType);
  const relicIds = JSON.parse(mission.relicIds || "[]");

  // compute rewards
  const gold = randInt(def.rewardTable.goldMin, def.rewardTable.goldMax);
  const materials: Record<string, number> = {};
  for (const [mat, range] of Object.entries(def.rewardTable.materials || {})) {
    const [a, b] = range as [number, number];
    const amt = randInt(a, b);
    if (amt > 0) materials[mat] = amt;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // unlock relics and apply xp
    await (tx as any).relic.updateMany({
      where: { id: { in: relicIds } },
      data: {
        isLocked: false,
        missionLockId: null,
        xp: { increment: def.xpReward },
      },
    });

    // fetch to mutate history JSON properly per relic
    const relics = await (tx as any).relic.findMany({ where: { id: { in: relicIds } } });
    for (const relic of relics) {
      let hist: any[];
      try {
        hist = JSON.parse(relic.history || "[]");
      } catch {
        hist = [];
      }
      hist.push({ ts: new Date().toISOString(), event: "mission_returned", details: { missionId } });
      await (tx as any).relic.update({ where: { id: relic.id }, data: { history: JSON.stringify(hist) } });
    }

    // credit pending rewards in mission row; user claims later
    await (tx as any).mission.update({
      where: { id: mission.id },
      data: { status: "ready", rewardPayload: JSON.stringify({ gold, materials, xp: def.xpReward }) },
    });
  });

  return { status: "ready", gold: gold, materials };
}

export async function claimMission(ownerUserId: string, missionId: string) {
  const prisma = getPrisma();
  const mission = await prisma.mission.findUnique({ where: { id: missionId } });
  if (!mission) throw new Error("mission_not_found");
  if (mission.ownerUserId !== ownerUserId) throw new Error("not_owner");
  if (mission.status !== "ready") throw new Error("not_ready");

  const payload = JSON.parse(mission.rewardPayload || "{}");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // credit gold and materials
    const user = await (tx as any).user.upsert({
      where: { userId: ownerUserId },
      create: { userId: ownerUserId, discordId: ownerUserId, gold: 0, materials: JSON.stringify({}) },
      update: {},
    });

    const mats: Record<string, number> = JSON.parse(user.materials || "{}");
    for (const [k, v] of Object.entries(payload.materials || {})) {
      mats[k] = (mats[k] || 0) + (v as number);
    }

    await (tx as any).user.update({
      where: { userId: ownerUserId },
      data: { gold: user.gold + (payload.gold || 0), materials: JSON.stringify(mats) },
    });

    await (tx as any).mission.update({ where: { id: missionId }, data: { status: "claimed", claimedAt: new Date() } });
  });

  return { ok: true };
} 