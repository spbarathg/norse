import { getPrisma } from "../lib/db.js";
import { createRequire } from "module";
import type { Combatant } from "./combat.js";

const require = createRequire(import.meta.url);

export type ShrineData = {
  layout: { FL?: string; FR?: string; BL?: string; BR?: string };
  alignment?: string;
  effigyId?: string;
};

export async function getUserShrine(userId: string, prisma = getPrisma()): Promise<ShrineData> {
  const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) }, update: {} });
  const mats = JSON.parse(user.materials || '{}');
  const shrine = (mats.shrine || {}) as ShrineData;
  shrine.layout = shrine.layout || {};
  return shrine;
}

export async function selectPlayerTeamFromShrine(userId: string, prisma = getPrisma()): Promise<Combatant[]> {
  const shrine = await getUserShrine(userId, prisma);
  const order: Array<['FL'|'FR'|'BL'|'BR', string | undefined]> = [
    ['FL', shrine.layout.FL],
    ['FR', shrine.layout.FR],
    ['BL', shrine.layout.BL],
    ['BR', shrine.layout.BR],
  ];
  const relicIds = order.map(o => o[1]).filter(Boolean) as string[];
  if (relicIds.length === 0) return [];
  const relics = await prisma.relic.findMany({ where: { id: { in: relicIds } } });
  const characters = require("../../data/allgodschars.json");
  const team = order.map(([pos, rid]) => {
    const relic = relics.find((r: any) => r.id === rid);
    if (!relic) return null;
    const ch = characters.find((c: any) => c.id === relic.characterId);
    const stats = JSON.parse(relic.currentStats || "{}");
    const name = ch?.name || relic.id;
    const slug = ch?.slug || "odin";
    const c: Combatant = {
      id: relic.id,
      side: "ally" as const,
      name,
      slug,
      pantheon: ch?.pantheon,
      rarity: relic.rarity || ch?.rarity || "C",
      className: ch?.class,
      element: ch?.element,
      maxHp: Number(stats.hp || ch?.hp || 100),
      atk: Number(stats.atk || ch?.atk || 10),
      def: Number(stats.def || ch?.def || 10),
      spd: Number(stats.spd || ch?.spd || 10),
      currentHp: Number(stats.hp || ch?.hp || 100),
      portraitUrl: (process.env.CDN_BASE_URL || 'http://localhost:3000/cdn') + `/portraits/${slug}.png`,
      pos,
      buffs: [],
      debuffs: [],
    };
    return c;
  }).filter((x): x is Combatant => Boolean(x));
  return team;
}


