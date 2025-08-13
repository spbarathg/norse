import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getPrisma } from "../lib/db.js";

type Scope = "weekly" | "alltime";
type Board = "richest" | "collectors" | "missions";

export async function getLeaderboardsEmbed(
  params: { scope: Scope; board: Board },
  viewerUserId: string
) {
  const prisma = getPrisma();
  const color = 0xC9A227;
  const embed = new EmbedBuilder().setColor(color).setTimestamp();

  if (params.board === "richest") {
    const users = await prisma.user.findMany({ orderBy: { gold: "desc" }, take: 10 });
    embed.setTitle(`Richest Players — ${params.scope === "weekly" ? "This Week" : "All-Time"}`);
    const lines = users.map((u, i) => {
      const rank = i + 1;
      const crown = rank === 1 ? " 👑" : "";
      return `${rank}.${crown} <@${u.userId}> — ${u.gold.toLocaleString()}g`;
    });
    embed.setDescription(lines.join("\n"));
  } else if (params.board === "missions") {
    // Approximate: count missions completed (claimed)
    const rows = await prisma.mission.findMany({ where: { status: "claimed" } });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.ownerUserId] = (counts[r.ownerUserId] || 0) + 1;
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    embed.setTitle(`Mission Masters — ${params.scope === "weekly" ? "This Week" : "All-Time"}`);
    embed.setDescription(list.map(([uid, c], i) => `${i + 1}. <@${uid}> — ${c} missions`).join("\n") || "No data yet.");
  } else if (params.board === "collectors") {
    // Approximate: total relic count
    const relics = await prisma.relic.findMany({ select: { ownerUserId: true } });
    const counts: Record<string, number> = {};
    for (const r of relics) counts[r.ownerUserId] = (counts[r.ownerUserId] || 0) + 1;
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    embed.setTitle(`Top Collectors — ${params.scope === "weekly" ? "This Week" : "All-Time"}`);
    embed.setDescription(list.map(([uid, c], i) => `${i + 1}. <@${uid}> — ${c} relics`).join("\n") || "No data yet.");
  }

  const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("lb_select")
      .setPlaceholder("Choose a leaderboard")
      .addOptions([
        { label: "Richest Players", value: "richest" },
        { label: "Top Collectors (by count)", value: "collectors" },
        { label: "Mission Masters", value: "missions" },
      ])
  );
  return { embeds: [embed], components: [select] };
}

export async function handleLeaderboardInteraction() {
  // Placeholder for future expansion if needed
}


