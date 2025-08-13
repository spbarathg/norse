import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import { getPrisma } from "../lib/db.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type AnyInteraction = ChatInputCommandInteraction | ButtonInteraction;

export type AchievementFlags = {
  first_s_tier_drop?: boolean;
  master_trader?: boolean;
  pantheon_collector_greco?: boolean;
};

export async function getUserAchievements(userId: string): Promise<AchievementFlags> {
  const prisma = getPrisma();
  const user = await prisma.user.upsert({
    where: { userId },
    create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) },
    update: {},
  });
  const materials = JSON.parse(user.materials || "{}");
  return (materials.achievements || {}) as AchievementFlags;
}

export async function checkAndNotifyAchievements(interaction: AnyInteraction, userId: string): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.upsert({
    where: { userId },
    create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) },
    update: {},
  });
  const materials = JSON.parse(user.materials || "{}");
  const flags: AchievementFlags = materials.achievements || {};

  let characters: any[] = [];
  try {
    characters = require("../../data/allgodschars.json");
  } catch {
    characters = [];
  }

  const unlocks: Array<{ key: keyof AchievementFlags; title: string; desc: string; reward: { gold?: number; badge?: string } }>
    = [];

  // First S-Tier Drop
  if (!flags.first_s_tier_drop) {
    const sCount = await prisma.relic.count({ where: { ownerUserId: userId, rarity: "S" } });
    if (sCount > 0) {
      flags.first_s_tier_drop = true;
      unlocks.push({
        key: "first_s_tier_drop",
        title: "First S-Tier Drop",
        desc: "Your first S-tier relic has descended. The gods take notice.",
        reward: { gold: 100, badge: "🌟" },
      });
    }
  }

  // Master Trader (25+ trades)
  if (!flags.master_trader) {
    const tradeCount = await prisma.tradeHistory.count({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    });
    if (tradeCount >= 25) {
      flags.master_trader = true;
      unlocks.push({
        key: "master_trader",
        title: "Master Trader",
        desc: "You have completed 25 trades.",
        reward: { gold: 200, badge: "💱" },
      });
    }
  }

  // Pantheon Collector: Greco-Roman (15 unique)
  if (!flags.pantheon_collector_greco) {
    const myRelics = await prisma.relic.findMany({
      where: { ownerUserId: userId },
      select: { characterId: true },
    });
    if (characters.length > 0 && myRelics.length > 0) {
      const charSet = new Set<number>(myRelics.map((r) => r.characterId));
      const uniqueGreco = [...charSet].filter((cid) => {
        const c = characters.find((x) => x.id === cid);
        return c && c.pantheon === "Greco-Roman";
      });
      if (uniqueGreco.length >= 15) {
        flags.pantheon_collector_greco = true;
        unlocks.push({
          key: "pantheon_collector_greco",
          title: "Pantheon Collector: Greco-Roman",
          desc: "Collected 15 unique Greco-Roman relics.",
          reward: { gold: 250, badge: "🏛️" },
        });
      }
    }
  }

  if (unlocks.length === 0) return;

  // Persist flags and rewards
  const newMaterials = { ...materials, achievements: flags } as any;
  let goldBonus = 0;
  for (const u of unlocks) {
    if (u.reward.gold) goldBonus += u.reward.gold;
  }
  await prisma.user.update({ where: { userId }, data: {
    gold: user.gold + goldBonus,
    materials: JSON.stringify(newMaterials),
  }});

  // Send one celebratory embed per unlock
  for (const u of unlocks) {
    const embed = new EmbedBuilder()
      .setTitle("✨ Achievement Unlocked! ✨")
      .setDescription(`**${u.title}**\n${u.desc}`)
      .addFields(
        ...(u.reward.gold ? [{ name: "💰 Reward", value: `+${u.reward.gold} Gold`, inline: true }] : []),
        ...(u.reward.badge ? [{ name: "🎖️ Badge", value: `${u.reward.badge} Added to your profile`, inline: true }] : []),
      )
      .setColor(0xF5D76E)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder().setCustomId("ach_view_profile").setLabel("View Profile").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ach_share_public").setLabel("Share to Channel").setStyle(ButtonStyle.Primary),
      );

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [embed], components: [row] });
    } else {
      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }
}


