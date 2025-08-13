import { 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Colors,
  ButtonInteraction,
  Message
} from "discord.js";
import { getPrisma } from "../lib/db.js";
import { selectEnemyTeam, simulateBattle, renderHpPanel, getVsGifUrl, getCritGifUrl, getVictoryGifUrl } from "../engines/combat.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const emojiMap = require("../config/emoji_map.json");
import { selectPlayerTeamFromShrine } from "../engines/shrine.js";

// Helper function to get user shrine data
async function getUserShrine(userId: string, prisma: any) {
  const user = await prisma.user.findUnique({ where: { userId } });
  if (!user) return { layout: {}, alignment: null, effigyId: null };
  
  const materials = JSON.parse(user.materials || '{}');
  return materials.shrine || { layout: {}, alignment: null, effigyId: null };
}

export async function handleBattleCommand(interaction: ChatInputCommandInteraction) {
  const prisma = getPrisma();
  const userId = interaction.user.id;
  const difficulty = Math.min(Math.max(interaction.options.getInteger("difficulty") || 1, 1), 5);
  const showDetailed = interaction.options.getBoolean("detailed") ?? false;

  await interaction.deferReply();

  // Build teams
  const allies = await selectPlayerTeamFromShrine(userId, prisma);
  if (allies.length === 0) {
    const noTeamEmbed = new EmbedBuilder()
      .setTitle("❌ No Team Available")
      .setDescription("You don't have any characters in your shrine yet!")
      .addFields(
        { name: "🎲 Get Characters", value: "Use `/drop` to summon new characters", inline: true },
        { name: "🏛️ Build Team", value: "Use `/shrine setup` to organize your team", inline: true }
      )
      .setColor(Colors.Red);
      
    await interaction.editReply({ embeds: [noTeamEmbed] });
    return;
  }
  
  const enemies = selectEnemyTeam(difficulty, Math.max(3, allies.length));

  // Enhanced VS screen with modern styling
  const difficultyEmojis = ['😊', '🙂', '😐', '😤', '😈'];
  const difficultyNames = ['Novice', 'Apprentice', 'Veteran', 'Expert', 'Legendary'];
  
  const vsEmbed = new EmbedBuilder()
    .setTitle(`⚔️ Battle Ready! ${difficultyEmojis[difficulty - 1]}`) 
    .setDescription(
      `**Difficulty:** ${difficultyNames[difficulty - 1]} (Level ${difficulty})\n\n` +
      `**Your Team:** ${allies.map(a => `${emojiMap[a!.slug] || '🔹'} ${a!.name}`).join(', ')}\n\n` +
      `**Enemies:** ${enemies.map(e => `${emojiMap[e.slug] || '🔸'} ${e.name}`).join(', ')}`
    )
    .setColor(Colors.Orange)
    .setThumbnail(interaction.user.displayAvatarURL());

  const vsUrl = getVsGifUrl();
  if (vsUrl) vsEmbed.setImage(vsUrl);

  // Add battle preparation buttons
  const preparationRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_start_${interaction.id}`)
        .setLabel('⚔️ Begin Battle!')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`battle_preview_${interaction.id}`)
        .setLabel('👁️ Preview Teams')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`battle_cancel_${interaction.id}`)
        .setLabel('🏃 Retreat')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const sent = await interaction.editReply({ embeds: [vsEmbed], components: [preparationRow] });
  
  // Handle battle preparation interactions
  try {
    const buttonInteraction = await sent.awaitMessageComponent({
      filter: (i) => i.user.id === userId && i.customId.startsWith('battle_'),
      time: 60000 // 60 seconds
    });
    
    if (buttonInteraction.customId.includes('cancel')) {
      const retreatEmbed = new EmbedBuilder()
        .setTitle('🏃 Strategic Retreat')
        .setDescription('You have wisely chosen to retreat and fight another day.')
        .setColor(Colors.Yellow)
        .setFooter({ text: "Use /battle when you're ready to fight!" });
        
      await buttonInteraction.update({
        embeds: [retreatEmbed],
        components: []
      });
      return;
    }
    
    if (buttonInteraction.customId.includes('preview')) {
      await showTeamPreview(buttonInteraction as ButtonInteraction, allies, enemies, difficulty, showDetailed);
      return;
    }
    
    await buttonInteraction.deferUpdate();
  } catch {
    // Auto-start if no interaction after 60 seconds
    const autoStartEmbed = new EmbedBuilder()
      .setTitle('⚡ Auto-Starting Battle')
      .setDescription('Battle begins automatically!')
      .setColor(Colors.Blue);
      
    await interaction.editReply({ embeds: [autoStartEmbed], components: [] });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Get shrine data for battle context
  const shrine = await getUserShrine(userId, prisma);
  const battleContext = { shrine };
  
  // Simulate battle
  const outcome = simulateBattle(allies, enemies, 18, battleContext);
  const turns = outcome.timeline;

  // Enhanced combat stage with interactive elements
  const stageEmbed = new EmbedBuilder()
    .setTitle("⚔️ Combat in Progress")
    .setColor(Colors.Purple)
    .setDescription(renderHpPanel(turns[0]?.allies || allies, turns[0]?.enemies || enemies))
    .addFields({ name: "⚡ Current Action", value: turns[0]?.log || "Battle begins...", inline: false })
    .setFooter({ text: `Turn 1 of ${turns.length} | Click ACT to progress` });

  // Add ACT button for cinematic pacing
  const actButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_act_${interaction.id}`)
        .setLabel('⚡ ACT')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`battle_skip_${interaction.id}`)
        .setLabel('⏩ Skip to End')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({ embeds: [stageEmbed], components: [actButton] });

  // Interactive turn progression
  let currentTurnIndex = 0;
  const turnIndices: number[] = [];
  
  // Select key turns to display (first, last, and every 3rd turn)
  for (let i = 0; i < turns.length; i++) {
    if (i === 0 || i === turns.length - 1 || i % 3 === 0) {
      turnIndices.push(i);
    }
  }
  
  // Handle ACT button interactions
  const collector = sent.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId.includes('battle_'),
    time: 300000 // 5 minutes timeout
  });
  
  let battleComplete = false;
  
  collector.on('collect', async (buttonInt) => {
    if (battleComplete) return;
    
    if (buttonInt.customId.includes('skip')) {
      currentTurnIndex = turnIndices.length - 1;
    } else if (buttonInt.customId.includes('act')) {
      currentTurnIndex = Math.min(currentTurnIndex + 1, turnIndices.length - 1);
    }
    
    const actualTurnIndex = turnIndices[currentTurnIndex];
    const turn = turns[actualTurnIndex];
    
    if (turn) {
      // Update combat display
      stageEmbed.setDescription(renderHpPanel(turn.allies, turn.enemies));
      stageEmbed.data.fields![0].value = (turn as any).log || `Turn ${actualTurnIndex + 1} action`;
      stageEmbed.setFooter({ 
        text: `Turn ${actualTurnIndex + 1} of ${turns.length} | Progress: ${currentTurnIndex + 1}/${turnIndices.length}` 
      });
      
      // Show critical hit animation
      if ((turn as any).crit) {
        const critUrl = getCritGifUrl();
        if (critUrl) stageEmbed.setImage(critUrl);
      } else {
        stageEmbed.setImage(null);
      }
      
      // Update button states
      const isLastTurn = currentTurnIndex >= turnIndices.length - 1;
      const updatedButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`battle_act_${interaction.id}`)
            .setLabel(isLastTurn ? '🏆 View Results' : '⚡ ACT')
            .setStyle(isLastTurn ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(isLastTurn),
          new ButtonBuilder()
            .setCustomId(`battle_skip_${interaction.id}`)
            .setLabel('⏩ Skip to End')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isLastTurn)
        );
      
      await buttonInt.update({ embeds: [stageEmbed], components: [updatedButton] });
      
      // Show victory screen if battle is complete
      if (isLastTurn) {
        battleComplete = true;
        setTimeout(async () => {
          await showVictoryScreen(interaction, outcome, allies, enemies, difficulty, showDetailed, userId, prisma);
        }, 2000);
      }
    }
  });
  
  // Auto-complete if no interaction
  collector.on('end', async () => {
    if (!battleComplete) {
      await showVictoryScreen(interaction, outcome, allies, enemies, difficulty, showDetailed, userId, prisma);
    }
  });
}

async function showTeamPreview(
  interaction: ButtonInteraction, 
  allies: any[], 
  enemies: any[], 
  difficulty: number,
  showDetailed: boolean
) {
  const previewEmbed = new EmbedBuilder()
    .setTitle("👁️ Team Preview")
    .setColor(Colors.Blue);

  // Ally team details
  const allyDetails = allies.map(a => {
    const emoji = emojiMap[a.slug] || '🔹';
    return `${emoji} **${a.name}** (${a.rarity})\n` +
           `❤️ ${a.maxHp} HP | ⚔️ ${a.atk} ATK | 🛡️ ${a.def} DEF | ⚡ ${a.spd} SPD\n` +
           `🏛️ ${a.pantheon} ${a.className}`;
  }).join('\n\n');

  const enemyDetails = enemies.map(e => {
    const emoji = emojiMap[e.slug] || '🔸';
    return `${emoji} **${e.name}** (${e.rarity})\n` +
           `❤️ ${e.maxHp} HP | ⚔️ ${e.atk} ATK | 🛡️ ${e.def} DEF | ⚡ ${e.spd} SPD`;
  }).join('\n\n');

  previewEmbed.addFields(
    { name: "🛡️ Your Team", value: allyDetails, inline: false },
    { name: "👹 Enemy Team", value: enemyDetails, inline: false }
  );

  if (showDetailed) {
    const allyPower = allies.reduce((sum, a) => sum + a.atk + a.def + a.maxHp + a.spd, 0);
    const enemyPower = enemies.reduce((sum, e) => sum + e.atk + e.def + e.maxHp + e.spd, 0);
    
    previewEmbed.addFields({
      name: "📊 Power Analysis",
      value: `🛡️ Your Team Power: ${allyPower}\n👹 Enemy Team Power: ${enemyPower}\n📈 Advantage: ${allyPower > enemyPower ? 'YOU' : 'ENEMY'} (+${Math.abs(allyPower - enemyPower)})`,
      inline: false
    });
  }

  const backButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_start_${interaction.message.id}`)
        .setLabel('⚔️ Begin Battle!')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`battle_cancel_${interaction.message.id}`)
        .setLabel('🏃 Retreat')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.update({ embeds: [previewEmbed], components: [backButton] });
}

async function showVictoryScreen(
  interaction: ChatInputCommandInteraction,
  outcome: any,
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
  const difficultyEmojis = ['😊', '🙂', '😐', '😤', '😈'];
  const difficultyNames = ['novice', 'apprentice', 'veteran', 'expert', 'legendary'];
  
  const victoryEmbed = new EmbedBuilder()
    .setTitle(isVictory ? "🏆 Glorious Victory!" : "💀 Heroic Defeat...")
    .setDescription(
      isVictory 
        ? `**Your heroes have triumphed!** ${difficultyEmojis[difficulty - 1]}\n\nThe gods smile upon your victory in this ${difficultyNames[difficulty - 1]} battle!`
        : `**A valiant effort!** Your heroes fought bravely but were overcome.\n\nEven in defeat, honor was earned this day.`
    )
    .setColor(isVictory ? Colors.Green : Colors.Red)
    .setThumbnail(interaction.user.displayAvatarURL());
  
  // MVP section
  if (mvp) {
    const mvpChar = [...allies, ...enemies].find(c => c.id === mvp.id);
    const mvpEmoji = mvpChar ? (emojiMap[mvpChar.slug] || '⭐') : '⭐';
    
    victoryEmbed.addFields({
      name: "🌟 Battle MVP",
      value: `${mvpEmoji} **${mvp.name}**\n` +
             `⚔️ Damage Dealt: ${mvp.damageDealt || 0}\n` +
             `🛡️ Damage Taken: ${mvp.damageTaken || 0}\n` +
             `💥 Performance: ${getMvpRating(mvp)}`,
      inline: false
    });
  }
  
  // Battle statistics (if detailed view requested)
  if (showDetailed) {
    const totalTurns = outcome.timeline.length;
    const totalDamage = [...allies, ...enemies].reduce((sum, c) => sum + (c.damageDealt || 0), 0);
    const critCount = outcome.timeline.filter((t: any) => t.crit).length;
    
    victoryEmbed.addFields({
      name: "📊 Battle Statistics",
      value: `🔄 Total Turns: ${totalTurns}\n` +
             `💥 Total Damage: ${totalDamage}\n` +
             `✨ Critical Hits: ${critCount}\n` +
             `⏱️ Battle Duration: ${Math.ceil(totalTurns * 1.5)}s`,
      inline: true
    });
  }
  
  // Rewards section
  const baseReward = difficulty * 15;
  const victoryBonus = isVictory ? Math.floor(baseReward * 0.5) : 0;
  const totalGold = baseReward + victoryBonus;
  const expGained = difficulty * 5;
  
  victoryEmbed.addFields({
    name: "💰 Battle Rewards",
    value: `🪙 Base Gold: ${baseReward}\n` +
           (isVictory ? `🏆 Victory Bonus: ${victoryBonus}\n` : '') +
           `✨ Experience: ${expGained} XP\n` +
           `💰 **Total Gold: ${totalGold}**`,
    inline: false
  });
  
  const victoryUrl = getVictoryGifUrl();
  if (victoryUrl) victoryEmbed.setImage(victoryUrl);
  
  victoryEmbed.setFooter({ 
    text: isVictory ? "Your legend grows!" : "Learn from this defeat and return stronger!" 
  }).setTimestamp();
  
  // Action buttons for post-battle
  const postBattleRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('battle_again')
        .setLabel('⚔️ Battle Again')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('shrine_view')
        .setLabel('🏛️ Manage Shrine')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('view_collection')
        .setLabel('📚 View Collection')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({ embeds: [victoryEmbed], components: [postBattleRow] });
  
  // Award rewards to user
  try {
    await prisma.user.update({
      where: { userId },
      data: { 
        gold: { increment: totalGold },
        // Add experience if you have an experience system
      }
    });
  } catch (error) {
    console.error('Error awarding battle rewards:', error);
  }
}

// Helper function to rate MVP performance
function getMvpRating(mvp: any): string {
  const damageRatio = (mvp.damageDealt || 0) / Math.max(mvp.damageTaken || 1, 1);
  if (damageRatio >= 3) return "🌟 Legendary";
  if (damageRatio >= 2) return "⭐ Excellent";
  if (damageRatio >= 1.5) return "✨ Good";
  if (damageRatio >= 1) return "💫 Decent";
  return "💥 Valiant";
}

// Handle post-battle button interactions
export async function handleBattleButtonInteraction(interaction: ButtonInteraction) {
  const action = interaction.customId;
  
  if (action === 'battle_again') {
    await interaction.reply({
      content: "⚔️ Ready for another battle? Use `/battle` to begin!",
      ephemeral: true
    });
  } else if (action === 'shrine_view') {
    await interaction.reply({
      content: "🏛️ Use `/shrine view` to manage your team formation and strategy.",
      ephemeral: true
    });
  } else if (action === 'view_collection') {
    await interaction.reply({
      content: "📚 Use `/view` or `/collection` to browse your characters and relics.",
      ephemeral: true
    });
  } else {
    await interaction.reply({
      content: "❌ Unknown battle action.",
      ephemeral: true
    });
  }
}