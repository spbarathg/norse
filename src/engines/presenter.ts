import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, AttachmentBuilder } from "discord.js";

type TimelineEntry = {
  turnNumber: number;
  actorId: string;
  targetId?: string;
  crit?: boolean;
  damage?: number;
  defeatedTarget?: boolean;
  log?: string;
};

export type BattleRecordLike = {
  battleId: string;
  mode: string;
  difficulty: string;
  seed: string;
  engineVersion: string;
  rulesVersion: string;
  ownerUserId: string;
  guildId?: string | null;
  channelId?: string | null;
  startedAt: Date;
  endedAt: Date;
  winner: string;
  turnCount: number;
  summaryJson: string;
  timelineJson: string;
};

// Simple replay rate limiter (memory) — per user per minute
const replayRequestsPerUser: Map<string, number[]> = new Map();

export function rateLimitReplay(userId: string, maxPerMinute = 5): boolean {
  const now = Date.now();
  const arr = (replayRequestsPerUser.get(userId) || []).filter(t => now - t < 60_000);
  if (arr.length >= maxPerMinute) return false;
  arr.push(now);
  replayRequestsPerUser.set(userId, arr);
  return true;
}

export function buildSummaryEmbed(rec: BattleRecordLike) {
  const summary: any = safeParse(rec.summaryJson) || {};
  const title = rec.winner === 'ally' ? '🏆 Victory' : (rec.winner === 'enemy' ? '💀 Defeat' : '⚖️ Draw');
  const embed = new EmbedBuilder()
    .setTitle(`${title} — ${rec.mode} (Lv ${rec.difficulty})`)
    .setColor(rec.winner === 'ally' ? Colors.Green : rec.winner === 'enemy' ? Colors.Red : Colors.Grey)
    .setDescription(`Turns: **${rec.turnCount}** • Engine ${rec.engineVersion}/${rec.rulesVersion}`)
    .setFooter({ text: `Battle #${rec.battleId}` })
    .setTimestamp(new Date(rec.endedAt));
  if (summary.mvpName) {
    embed.addFields({ name: '🌟 MVP', value: summary.mvpName, inline: true });
  }
  return embed;
}

export function extractHighlights(rec: BattleRecordLike, max = 3): string[] {
  const t: TimelineEntry[] = safeParse(rec.timelineJson) || [];
  if (t.length === 0) return [];
  // pick: highest damage crit, first defeat, final blow
  const final = t[t.length - 1];
  const crits = t.filter(x => x.crit && (x.damage || 0) > 0).sort((a, b) => (b.damage || 0) - (a.damage || 0));
  const firstKill = t.find(x => x.defeatedTarget);
  const lines: string[] = [];
  if (crits[0]) lines.push(`T${crits[0].turnNumber} ⚡ Big Crit: ${crits[0].damage}`);
  if (firstKill) lines.push(`T${firstKill.turnNumber} ☠️ First KO`);
  if (final) lines.push(`T${final.turnNumber} 🏁 Final blow`);
  return lines.slice(0, max);
}

export function buildHighlightsEmbed(rec: BattleRecordLike) {
  const embed = new EmbedBuilder()
    .setTitle('🎞️ Highlights')
    .setColor(Colors.Orange);
  const lines = extractHighlights(rec, 3);
  embed.setDescription(lines.length ? lines.join('\n') : 'No highlights.');
  return embed;
}

export function buildReplayEmbed(rec: BattleRecordLike, index: number) {
  const t: TimelineEntry[] = safeParse(rec.timelineJson) || [];
  const last = Math.max(0, t.length - 1);
  const i = Math.min(Math.max(0, index), last);
  const e = t[i];
  const embed = new EmbedBuilder()
    .setTitle('▶ Replay')
    .setColor(Colors.Blurple)
    .setDescription(e?.log || `Turn ${i + 1}`)
    .setFooter({ text: `Turn ${i + 1} / ${t.length} — Battle #${rec.battleId}` });
  return { embed, index: i, last };
}

export function buildReplayControls(battleId: string, index: number, last: number) {
  const prev = Math.max(0, index - 1);
  const next = Math.min(last, index + 1);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`replay_prev_${battleId}_${prev}`).setLabel('⬅️ Prev').setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
    new ButtonBuilder().setCustomId(`replay_next_${battleId}_${next}`).setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(index === last),
    new ButtonBuilder().setCustomId(`replay_end_${battleId}_${last}`).setLabel('⏭️ End').setStyle(ButtonStyle.Secondary).setDisabled(index === last),
    new ButtonBuilder().setCustomId(`replay_dl_${battleId}_0`).setLabel('📥 Download Log').setStyle(ButtonStyle.Primary)
  );
}

export function buildReplayFile(rec: BattleRecordLike) {
  const buf = Buffer.from(rec.timelineJson, 'utf8');
  return new AttachmentBuilder(buf, { name: `battle_${rec.battleId}.json` });
}

function safeParse(s: string): any {
  try { return JSON.parse(s || '{}'); } catch { return null; }
}


