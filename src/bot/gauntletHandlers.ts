import { 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  Colors
} from "discord.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { getPrisma } from "../lib/db.js";
import { getVsGifUrl, getVictoryGifUrl, renderHpPanel, selectEnemyTeam, simulateBattle } from "../engines/combat.js";
import { selectPlayerTeamFromShrine } from "../engines/shrine.js";
const emojiMap = require("../config/emoji_map.json");

export async function handleGauntletBrowse(interaction: ChatInputCommandInteraction) {
  const isPrivate = interaction.options.getBoolean('private') ?? false;
  await interaction.deferReply({ ephemeral: isPrivate });
  
  const gauntlets = require("../config/gauntlets.json");
  const hazards = require("../config/hazards.json");
  
  const embed = new EmbedBuilder()
    .setTitle("🏁 Gauntlet Challenges")
    .setDescription("**Choose your trial! Each gauntlet features unique environmental hazards and themed enemies.**")
    .setColor(Colors.Blue)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: "Select a gauntlet to view details or start the challenge!" })
    .setTimestamp();
  
  // Group gauntlets by difficulty
  const difficultyGroups: { [key: number]: any[] } = {
    1: [], 2: [], 3: [], 4: [], 5: []
  };
  
  gauntlets.forEach((g: any) => {
    if (difficultyGroups[g.difficulty]) {
      difficultyGroups[g.difficulty].push(g);
    }
  });
  
  // Add fields for each difficulty level
  Object.entries(difficultyGroups).forEach(([diff, gauntletList]) => {
    if (gauntletList.length > 0) {
      const difficultyEmojis = ['😊', '🙂', '😐', '😤', '😈'];
      const difficultyNames = ['Novice', 'Apprentice', 'Veteran', 'Expert', 'Legendary'];
      const diffIndex = parseInt(diff) - 1;
      
      const gauntletText = gauntletList.map((g: any) => {
        const hazardNames = g.hazard_ids.map((hId: string) => {
          const hazard = hazards.find((h: any) => h.id === hId);
          return hazard ? hazard.name : hId;
        }).join(', ');
        
        return `**${g.name}**\n${g.description}\n🌪️ *Hazards: ${hazardNames}*`;
      }).join('\n\n');
      
      embed.addFields({
        name: `${difficultyEmojis[diffIndex]} ${difficultyNames[diffIndex]} Challenges (Level ${diff})`,
        value: gauntletText,
        inline: false
      });
    }
  });
  
  // Add interactive select menu for gauntlet selection
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('gauntlet_select')
    .setPlaceholder('🎯 Choose a gauntlet to start...')
    .addOptions(
      gauntlets.slice(0, 25).map((g: any) => ({ // Discord limit of 25 options
        label: `${g.name} (Level ${g.difficulty})`,
        description: g.description.substring(0, 100),
        value: g.id,
        emoji: g.difficulty <= 2 ? '😊' : g.difficulty <= 3 ? '😐' : '😈'
      }))
    );
  
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(selectMenu);
    
  const buttonRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('gauntlet_random')
        .setLabel('🎲 Random Challenge')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('gauntlet_info')
        .setLabel('ℹ️ Hazard Guide')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('gauntlet_leaderboard')
        .setLabel('🏆 Leaderboard')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({ 
    embeds: [embed], 
    components: [selectRow, buttonRow] 
  });
}

export async function handleGauntletStart(interaction: ChatInputCommandInteraction) {
  const prisma = getPrisma();
  const userId = interaction.user.id;
  const gauntletName = interaction.options.getString("gauntlet");
  const difficulty = Math.min(Math.max(interaction.options.getInteger("difficulty") || 1, 1), 5);
  const showDetailed = interaction.options.getBoolean("detailed") ?? false;

  await interaction.deferReply();

  // Get player team
  const allies = await selectPlayerTeamFromShrine(userId, prisma);
  if (allies.length === 0) {
    const noTeamEmbed = new EmbedBuilder()
      .setTitle("❌ No Team Available")
      .setDescription("You don't have any characters in your shrine for this gauntlet!")
      .addFields(
        { name: "🎲 Get Characters", value: "Use `/drop` to summon new characters", inline: true },
        { name: "🏛️ Build Team", value: "Use `/shrine setup` to organize your team", inline: true }
      )
      .setColor(Colors.Red);
      
    await interaction.editReply({ embeds: [noTeamEmbed] });
    return;
  }

  // Load gauntlet data
  const gauntlets = require("../config/gauntlets.json");
  let selectedGauntlet = null;

  if (gauntletName) {
    selectedGauntlet = gauntlets.find((g: any) => 
      g.id === gauntletName || g.name.toLowerCase().includes(gauntletName.toLowerCase())
    );
  }

  if (!selectedGauntlet) {
    // Select random gauntlet of appropriate difficulty
    const appropriateGauntlets = gauntlets.filter((g: any) => g.difficulty === difficulty);
    if (appropriateGauntlets.length > 0) {
      selectedGauntlet = appropriateGauntlets[Math.floor(Math.random() * appropriateGauntlets.length)];
    } else {
      selectedGauntlet = gauntlets[Math.floor(Math.random() * gauntlets.length)];
    }
  }

  const actualDifficulty = selectedGauntlet.difficulty || difficulty;
  const enemies = selectEnemyTeam(actualDifficulty, Math.max(3, allies.length));

  // Enhanced gauntlet VS screen
  const hazards = require("../config/hazards.json");
  const gauntletHazards = selectedGauntlet.hazard_ids.map((hId: string) => {
    const hazard = hazards.find((h: any) => h.id === hId);
    return hazard ? hazard.name : hId;
  });

  const vsEmbed = new EmbedBuilder()
    .setTitle(`🏁 ${selectedGauntlet.name}`)
    .setDescription(
      `${selectedGauntlet.description}\n\n` +
      `**🌪️ Active Hazards:** ${gauntletHazards.join(', ')}\n` +
      `**⚡ Difficulty:** Level ${actualDifficulty}/5\n\n` +
      `**🛡️ Your Team:**\n${allies.map(a => `${emojiMap[a!.slug] || '🔹'} **${a!.name}** (${a!.rarity}-Tier)`).join("\n")}\n\n` +
      `**👹 Gauntlet Forces:**\n${enemies.map(e => `${emojiMap[e.slug] || '🔸'} **${e.name}** (${e.rarity}-Tier)`).join("\n")}`
    )
    .setColor(Colors.DarkRed)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: "Environmental hazards will affect the battle!" })
    .setTimestamp();

  if (selectedGauntlet.image_url) {
    vsEmbed.setImage(selectedGauntlet.image_url);
  } else {
    const vsUrl = getVsGifUrl();
    if (vsUrl) vsEmbed.setImage(vsUrl);
  }

  // Add hazard warning and battle buttons
  const battleRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`gauntlet_start_battle_${selectedGauntlet.id}`)
        .setLabel('⚔️ Enter Gauntlet!')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('gauntlet_preview_hazards')
        .setLabel('🌪️ Preview Hazards')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('gauntlet_retreat')
        .setLabel('🏃 Retreat')
        .setStyle(ButtonStyle.Secondary)
    );

  const sent = await interaction.editReply({ embeds: [vsEmbed], components: [battleRow] });

  // Handle gauntlet preparation interactions
  try {
    const buttonInteraction = await sent.awaitMessageComponent({
      filter: (i) => i.user.id === userId && i.customId.startsWith('gauntlet_'),
      time: 60000
    });

    if (buttonInteraction.customId.includes('retreat')) {
      const retreatEmbed = new EmbedBuilder()
        .setTitle('🏃 Strategic Retreat')
        .setDescription('You have wisely chosen to retreat from this dangerous gauntlet.')
        .setColor(Colors.Yellow)
        .setFooter({ text: "Use /gauntlet when you're ready to face the challenge!" });
        
      await buttonInteraction.update({
        embeds: [retreatEmbed],
        components: []
      });
      return;
    }

    if (buttonInteraction.customId.includes('preview_hazards')) {
      await showHazardPreview(buttonInteraction, selectedGauntlet.hazard_ids);
      return;
    }

    await buttonInteraction.deferUpdate();
  } catch {
    // Auto-start if no interaction
  }

  // Start the gauntlet battle with special context
  const battleContext = {
    shrine: await getUserShrine(userId, prisma),
    gauntlet: selectedGauntlet
  };

  const outcome = simulateBattle(allies, enemies, 18, battleContext);

  // Enhanced gauntlet victory screen
  await showGauntletResults(
    interaction, 
    outcome, 
    selectedGauntlet, 
    allies, 
    enemies, 
    actualDifficulty, 
    showDetailed, 
    userId, 
    prisma
  );
}

async function showHazardPreview(interaction: any, hazardIds: string[]) {
  const hazards = require("../config/hazards.json");
  
  const previewEmbed = new EmbedBuilder()
    .setTitle("🌪️ Environmental Hazards")
    .setDescription("**These environmental effects will influence the battle:**")
    .setColor(Colors.Orange);

  hazardIds.forEach(hId => {
    const hazard = hazards.find((h: any) => h.id === hId);
    if (hazard) {
      previewEmbed.addFields({
        name: `⚠️ ${hazard.name}`,
        value: hazard.description || 'Environmental hazard effect',
        inline: false
      });
    }
  });

  const backButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('gauntlet_back_to_battle')
        .setLabel('⚔️ Enter Gauntlet')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('gauntlet_retreat')
        .setLabel('🏃 Retreat')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.update({ embeds: [previewEmbed], components: [backButton] });
}

async function showGauntletResults(
  interaction: ChatInputCommandInteraction,
  outcome: any,
  gauntlet: any,
  allies: any[],
  enemies: any[],
  difficulty: number,
  showDetailed: boolean,
  userId: string,
  prisma: any
) {
  const winnerSide = outcome.winner;
  const mvp = outcome.mvp;
  const isVictory = winnerSide === "ally";

  const resultEmbed = new EmbedBuilder()
    .setTitle(isVictory ? "🏆 Gauntlet Conquered!" : "💀 Gauntlet Failed...")
    .setDescription(
      isVictory
        ? `**Magnificent victory!** You have conquered the **${gauntlet.name}**!\n\nYour tactical prowess has overcome both enemies and environmental hazards.`
        : `**Valiant effort!** The **${gauntlet.name}** has proven too challenging this time.\n\nThe environmental hazards and fierce enemies were overwhelming.`
    )
    .setColor(isVictory ? Colors.Gold : Colors.DarkRed)
    .setThumbnail(interaction.user.displayAvatarURL());

  // Gauntlet-specific rewards
  const baseReward = difficulty * 20; // Higher than normal battles
  const gauntletBonus = isVictory ? Math.floor(baseReward * 0.75) : Math.floor(baseReward * 0.25);
  const hazardBonus = gauntlet.hazard_ids.length * 5; // Bonus for each hazard faced
  const totalGold = baseReward + gauntletBonus + hazardBonus;

  // MVP section
  if (mvp) {
    const mvpChar = [...allies, ...enemies].find(c => c.id === mvp.id);
    const mvpEmoji = mvpChar ? (emojiMap[mvpChar.slug] || '⭐') : '⭐';
    
    resultEmbed.addFields({
      name: "🌟 Gauntlet Champion",
      value: `${mvpEmoji} **${mvp.name}**\n` +
             `⚔️ Damage Dealt: ${mvp.damageDealt || 0}\n` +
             `🛡️ Damage Taken: ${mvp.damageTaken || 0}\n` +
             `🏆 Gauntlet Rating: ${getGauntletRating(mvp, isVictory)}`,
      inline: false
    });
  }

  // Gauntlet completion stats
  if (showDetailed) {
    const totalTurns = outcome.timeline.length;
    const survivalRate = allies.filter(a => a.currentHp > 0).length / allies.length;
    
    resultEmbed.addFields({
      name: "📊 Gauntlet Statistics",
      value: `🏁 Gauntlet: ${gauntlet.name}\n` +
             `🌪️ Hazards Faced: ${gauntlet.hazard_ids.length}\n` +
             `⏱️ Battle Duration: ${totalTurns} turns\n` +
             `💪 Team Survival: ${Math.round(survivalRate * 100)}%`,
      inline: true
    });
  }

  // Enhanced rewards for gauntlets
  resultEmbed.addFields({
    name: "💰 Gauntlet Rewards",
    value: `🪙 Base Reward: ${baseReward}\n` +
           `🏁 Gauntlet Bonus: ${gauntletBonus}\n` +
           `🌪️ Hazard Bonus: ${hazardBonus}\n` +
           `💰 **Total Gold: ${totalGold}**\n` +
           (isVictory ? `✨ Gauntlet Title Earned!` : `🎯 Progress: ${Math.round((baseReward / (baseReward + gauntletBonus)) * 100)}%`),
    inline: false
  });

  if (gauntlet.image_url) {
    resultEmbed.setImage(gauntlet.image_url);
  } else {
    const victoryUrl = getVictoryGifUrl();
    if (victoryUrl) resultEmbed.setImage(victoryUrl);
  }

  resultEmbed.setFooter({ 
    text: isVictory ? "Your gauntlet mastery grows!" : "Learn from this trial and return stronger!" 
  }).setTimestamp();

  // Post-gauntlet actions
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('gauntlet_retry')
        .setLabel('🔄 Retry Gauntlet')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('gauntlet_browse_others')
        .setLabel('🏁 Browse Gauntlets')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('shrine_optimize')
        .setLabel('🏛️ Optimize Shrine')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.editReply({ embeds: [resultEmbed], components: [actionRow] });

  // Award enhanced gauntlet rewards
  try {
    await prisma.user.update({
      where: { userId },
      data: { 
        gold: { increment: totalGold }
        // Could add gauntlet completion tracking here
      }
    });
  } catch (error) {
    console.error('Error awarding gauntlet rewards:', error);
  }
}

function getGauntletRating(mvp: any, victory: boolean): string {
  const damageRatio = (mvp.damageDealt || 0) / Math.max(mvp.damageTaken || 1, 1);
  const baseRating = victory ? 1 : 0.5;
  const finalRating = damageRatio * baseRating;
  
  if (finalRating >= 4) return "🌟 Gauntlet Master";
  if (finalRating >= 3) return "🏆 Gauntlet Hero";
  if (finalRating >= 2) return "⭐ Gauntlet Warrior";
  if (finalRating >= 1) return "✨ Gauntlet Fighter";
  return "💪 Gauntlet Challenger";
}

async function getUserShrine(userId: string, prisma: any) {
  const user = await prisma.user.findUnique({ where: { userId } });
  if (!user) return { layout: {}, alignment: null, effigyId: null };
  
  const materials = JSON.parse(user.materials || '{}');
  return materials.shrine || { layout: {}, alignment: null, effigyId: null };
}

export async function handleGauntletInfo(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  const hazards = require("../config/hazards.json");
  
  const infoEmbed = new EmbedBuilder()
    .setTitle("ℹ️ Gauntlet Hazard Guide")
    .setDescription("**Environmental hazards affect all combatants during gauntlet battles. Plan your strategy accordingly!**")
    .setColor(Colors.Yellow);
  
  hazards.forEach((hazard: any) => {
    infoEmbed.addFields({
      name: `🌪️ ${hazard.name}`,
      value: hazard.description || 'Environmental hazard',
      inline: true
    });
  });

  infoEmbed.addFields({
    name: "💡 Strategy Tips",
    value: "• Build balanced teams to handle multiple hazard types\n" +
           "• Consider pantheon alignment for hazard resistance\n" +
           "• Some effigies provide protection against specific hazards\n" +
           "• Higher difficulty gauntlets have more dangerous hazard combinations",
    inline: false
  });
  
  await interaction.editReply({ embeds: [infoEmbed] });
}