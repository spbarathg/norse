import { 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  Colors,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction
} from "discord.js";
import { getPrisma } from "../lib/db.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const emojiMap = require("../config/emoji_map.json");

type ShrineData = {
  layout: { FL?: string; FR?: string; BL?: string; BR?: string };
  alignment?: string;
  effigyId?: string;
};

function getShrineData(materialsJson: string | null): ShrineData {
  const mats = JSON.parse(materialsJson || '{}');
  const shrine = (mats.shrine || {}) as ShrineData;
  shrine.layout = shrine.layout || {};
  return shrine;
}

async function saveShrine(userId: string, mutate: (s: ShrineData) => void) {
  const prisma = getPrisma();
  const user = await prisma.user.upsert({ 
    where: { userId }, 
    create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) }, 
    update: {} 
  });
  const mats = JSON.parse(user.materials || '{}');
  const shrine = getShrineData(user.materials);
  mutate(shrine);
  mats.shrine = shrine;
  await prisma.user.update({ where: { userId }, data: { materials: JSON.stringify(mats) } });
}

export async function handleShrineView(interaction: ChatInputCommandInteraction) {
  const isPrivate = interaction.options.getBoolean('private') ?? false;
  await interaction.deferReply({ ephemeral: isPrivate });
  
  const prisma = getPrisma();
  const userId = interaction.user.id;
  const user = await prisma.user.upsert({ 
    where: { userId }, 
    create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) }, 
    update: {} 
  });
  
  const shrine = getShrineData(user.materials);
  
  // Get character details for positioned relics
  const characters = require("../../data/allgodschars.json");
  const relicIds = Object.values(shrine.layout).filter(Boolean) as string[];
  let relics: any[] = [];
  
  if (relicIds.length > 0) {
    relics = await prisma.relic.findMany({ where: { id: { in: relicIds } } });
  }
  
  const embed = new EmbedBuilder()
    .setTitle("🏛️ Your Sacred Shrine")
    .setColor(Colors.Gold)
    .setThumbnail(interaction.user.displayAvatarURL());
  
  // Build clean team display
  const positions = ['FL', 'FR', 'BL', 'BR'] as const;
  const positionLabels = {
    FL: '🗡️ Front Left',
    FR: '⚔️ Front Right', 
    BL: '🛡️ Back Left',
    BR: '🏹 Back Right'
  };
  
  let emptyPositions = 0;
  const teamLines: string[] = [];
  
  positions.forEach(pos => {
    const relicId = shrine.layout[pos];
    if (relicId) {
      const relic = relics.find((r: any) => r.id === relicId);
      const char = characters.find((c: any) => c.id === relic?.characterId);
      const emoji = char ? (emojiMap[char.slug] || '⭐') : '⭐';
      teamLines.push(`${positionLabels[pos]}: ${emoji} **${char?.name || 'Unknown'}** (${char?.rarity})`);
    } else {
      emptyPositions++;
      teamLines.push(`${positionLabels[pos]}: *Empty*`);
    }
  });
  
  embed.addFields({
    name: "⚔️ Team Formation",
    value: teamLines.join('\n'),
    inline: false
  });
  
  // Add bonuses if any exist
  const bonuses = [];
  if (shrine.alignment) {
    const emoji = shrine.alignment === 'Norse' ? '⚡' : '🏛️';
    bonuses.push(`${emoji} ${shrine.alignment} Pantheon`);
  }
  if (shrine.effigyId) {
    const effigyName = shrine.effigyId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    bonuses.push(`🏺 ${effigyName}`);
  }
  
  if (bonuses.length > 0) {
    embed.addFields({
      name: "🎯 Active Bonuses",
      value: bonuses.join('\n'),
      inline: false
    });
  }
  
  // Battle readiness
  const status = emptyPositions === 0 
    ? "✅ **Ready for Battle!**" 
    : `⚠️ ${emptyPositions} empty position${emptyPositions > 1 ? 's' : ''}`;
    
  embed.addFields({
    name: "📊 Status",
    value: status,
    inline: false
  });
  
  embed.setFooter({ text: "Use the buttons below to manage your shrine" });
  
  // Clean button layout
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shrine_setup_wizard')
        .setLabel('⚙️ Setup')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('shrine_quick_fill')
        .setLabel('⚡ Auto-Fill')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('shrine_set_alignment')
        .setLabel('⚖️ Alignment')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('shrine_set_effigy')
        .setLabel('🏺 Effigy')
        .setStyle(ButtonStyle.Secondary)
    );
    
  await interaction.editReply({ 
    embeds: [embed], 
    components: [actionRow] 
  });
}

export async function handleShrineSetup(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  const modal = new ModalBuilder()
    .setCustomId('shrine_setup_modal')
    .setTitle('🏛️ Shrine Setup Wizard');
    
  const alignmentInput = new TextInputBuilder()
    .setCustomId('alignment_input')
    .setLabel('Pantheon Alignment')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter: Norse or Greco-Roman')
    .setRequired(false);
    
  const effigyInput = new TextInputBuilder()
    .setCustomId('effigy_input')
    .setLabel('Effigy ID (e.g., warriors_effigy)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter effigy ID or leave blank')
    .setRequired(false);
    
  const positionsInput = new TextInputBuilder()
    .setCustomId('positions_input')
    .setLabel('Positions (FL/FR/BL/BR)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Example: FL:abc123,FR:def456')
    .setRequired(false);
    
  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(alignmentInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(effigyInput);
  const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(positionsInput);
  
  modal.addComponents(row1, row2, row3);
  
  await interaction.showModal(modal);
}

export async function handleShrineSet(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  const userId = interaction.user.id;
  const position = interaction.options.getString("position", true) as 'FL'|'FR'|'BL'|'BR';
  const relicId = interaction.options.getString("relic", true);
  
  // Verify the user owns this relic
  const prisma = getPrisma();
  const relic = await prisma.relic.findFirst({
    where: { id: relicId, ownerUserId: userId }
  });
  
  if (!relic) {
    await interaction.editReply({
      content: "❌ You don't own a relic with that ID. Use `/view` to see your collection."
    });
    return;
  }
  
  // Get character info for confirmation
  const characters = require("../../data/allgodschars.json");
  const char = characters.find((c: any) => c.id === relic.characterId);
  const emoji = char ? (emojiMap[char.slug] || '⭐') : '⭐';
  
  await saveShrine(userId, (s) => {
    s.layout[position] = relicId;
  });
  
  const positionNames = {
    FL: '🗡️ Front Left',
    FR: '⚔️ Front Right', 
    BL: '🛡️ Back Left',
    BR: '🏹 Back Right'
  };
  
  const successEmbed = new EmbedBuilder()
    .setTitle("✅ Position Updated!")
    .setDescription(`${emoji} **${char?.name || 'Unknown Character'}** placed in ${positionNames[position]}`)
    .setColor(Colors.Green)
    .setThumbnail(`${process.env.CDN_BASE_URL || 'http://localhost:3000/cdn'}/portraits/${char?.slug}.png`);
    
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shrine_view_updated')
        .setLabel('👁️ View Shrine')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
}

export async function handleShrineAlignment(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  const userId = interaction.user.id;
  const pantheon = interaction.options.getString("pantheon", true);
  
  await saveShrine(userId, (s) => { s.alignment = pantheon; });
  
  const alignmentEmoji = pantheon === 'Norse' ? '⚡' : '🏛️';
  const bonusText = pantheon === 'Norse' 
    ? '+10% HP and +5% DEF to Norse allies'
    : '+10% ATK and +5% SPD to Greco-Roman allies';
    
  const successEmbed = new EmbedBuilder()
    .setTitle(`${alignmentEmoji} Alignment Set!`)
    .setDescription(`Your shrine is now aligned with the **${pantheon}** pantheon.`)
    .addFields({ name: "🎯 Bonus", value: bonusText, inline: false })
    .setColor(pantheon === 'Norse' ? Colors.Purple : Colors.Gold);
    
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shrine_view_updated')
        .setLabel('👁️ View Shrine')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
}

export async function handleShrineEffigy(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  const userId = interaction.user.id;
  const effigyId = interaction.options.getString("effigy_id", true);
  
  await saveShrine(userId, (s) => { s.effigyId = effigyId; });
  
  const effigyName = effigyId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  const successEmbed = new EmbedBuilder()
    .setTitle("🏺 Effigy Equipped!")
    .setDescription(`You have equipped the **${effigyName}**.`)
    .setColor(Colors.Blue);
    
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shrine_view_updated')
        .setLabel('👁️ View Shrine')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
}

export async function handleShrineClear(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  const userId = interaction.user.id;
  const position = interaction.options.getString("position", true);
  
  if (position === "ALL") {
    await saveShrine(userId, (s) => {
      s.layout = {};
    });
    
    const successEmbed = new EmbedBuilder()
      .setTitle("🧹 Shrine Cleared!")
      .setDescription("All positions have been cleared.")
      .setColor(Colors.Yellow);
      
    await interaction.editReply({ embeds: [successEmbed] });
  } else {
    const pos = position as 'FL'|'FR'|'BL'|'BR';
    
    await saveShrine(userId, (s) => {
      delete s.layout[pos];
    });
    
    const successEmbed = new EmbedBuilder()
      .setTitle("🧹 Position Cleared!")
      .setDescription(`${position} position has been cleared.`)
      .setColor(Colors.Yellow);
      
    await interaction.editReply({ embeds: [successEmbed] });
  }
}

// Handle button interactions for shrine management
export async function handleShrineButtonInteraction(interaction: ButtonInteraction) {
  const action = interaction.customId;
  
  try {
    switch (action) {
      case 'shrine_view_updated':
        // Refresh the shrine view
        await interaction.deferUpdate();
        const newInteraction = {
          ...interaction,
          options: {
            getBoolean: () => false
          },
          deferReply: async () => Promise.resolve(),
          editReply: (options: any) => interaction.editReply(options)
        } as any;
        await handleShrineView(newInteraction);
        break;
        
      case 'shrine_setup_wizard':
        // Show the setup modal
        const modal = new ModalBuilder()
          .setCustomId('shrine_setup_modal')
          .setTitle('🏛️ Quick Shrine Setup');
          
        const alignmentInput = new TextInputBuilder()
          .setCustomId('alignment_input')
          .setLabel('Pantheon (Norse or Greco-Roman)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Norse')
          .setRequired(false);
          
        const effigyInput = new TextInputBuilder()
          .setCustomId('effigy_input')
          .setLabel('Effigy (e.g., warriors_effigy)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('warriors_effigy')
          .setRequired(false);
          
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(alignmentInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(effigyInput)
        );
        
        await interaction.showModal(modal);
        break;
        
      case 'shrine_quick_fill':
        await handleQuickFill(interaction);
        break;
        
      case 'shrine_set_alignment':
        // Show alignment selection
        await interaction.deferReply({ ephemeral: true });
        
        const alignmentEmbed = new EmbedBuilder()
          .setTitle('⚖️ Choose Pantheon Alignment')
          .setDescription('Select your divine alignment for team bonuses:')
          .addFields(
            { name: '⚡ Norse', value: '+10% HP, +5% DEF to Norse allies', inline: true },
            { name: '🏛️ Greco-Roman', value: '+10% ATK, +5% SPD to Greco-Roman allies', inline: true }
          )
          .setColor(Colors.Blue);
          
        const alignmentButtons = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('shrine_align_norse')
              .setLabel('⚡ Norse')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('shrine_align_greco')
              .setLabel('🏛️ Greco-Roman')
              .setStyle(ButtonStyle.Primary)
          );
          
        await interaction.editReply({ embeds: [alignmentEmbed], components: [alignmentButtons] });
        break;
        
      case 'shrine_align_norse':
        await setAlignment(interaction, 'Norse');
        break;
        
      case 'shrine_align_greco':
        await setAlignment(interaction, 'Greco-Roman');
        break;
        
      case 'shrine_set_effigy':
        // Show effigy selection
        await interaction.deferReply({ ephemeral: true });
        
        const effigyEmbed = new EmbedBuilder()
          .setTitle('🏺 Choose Effigy')
          .setDescription('Select equipment for specialized bonuses:')
          .setColor(Colors.Purple);
          
        const effigyButtons = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('shrine_effigy_warriors')
              .setLabel('⚔️ Warriors')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('shrine_effigy_mages')
              .setLabel('🧙‍♂️ Mages')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('shrine_effigy_guardians')
              .setLabel('🛡️ Guardians')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('shrine_effigy_rogues')
              .setLabel('🗡️ Rogues')
              .setStyle(ButtonStyle.Secondary)
          );
          
        await interaction.editReply({ embeds: [effigyEmbed], components: [effigyButtons] });
        break;
        
      case 'shrine_effigy_warriors':
        await setEffigy(interaction, 'warriors_effigy');
        break;
      case 'shrine_effigy_mages':
        await setEffigy(interaction, 'mages_effigy');
        break;
      case 'shrine_effigy_guardians':
        await setEffigy(interaction, 'guardians_effigy');
        break;
      case 'shrine_effigy_rogues':
        await setEffigy(interaction, 'rogues_effigy');
        break;
        
      default:
        await interaction.reply({ 
          content: `❌ Unknown shrine action: ${action}`, 
          ephemeral: true 
        });
    }
  } catch (error) {
    console.error('Shrine button interaction error:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: "❌ An error occurred processing your shrine interaction.", 
        ephemeral: true 
      });
    }
  }
}

async function setAlignment(interaction: ButtonInteraction, pantheon: string) {
  await interaction.deferUpdate();
  
  const userId = interaction.user.id;
  await saveShrine(userId, (s) => { s.alignment = pantheon; });
  
  const alignmentEmoji = pantheon === 'Norse' ? '⚡' : '🏛️';
  const successEmbed = new EmbedBuilder()
    .setTitle(`${alignmentEmoji} Alignment Set!`)
    .setDescription(`Your shrine is now aligned with the **${pantheon}** pantheon.`)
    .setColor(pantheon === 'Norse' ? Colors.Purple : Colors.Gold);
    
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shrine_view_updated')
        .setLabel('👁️ View Shrine')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
}

async function setEffigy(interaction: ButtonInteraction, effigyId: string) {
  await interaction.deferUpdate();
  
  const userId = interaction.user.id;
  await saveShrine(userId, (s) => { s.effigyId = effigyId; });
  
  const effigyName = effigyId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  const successEmbed = new EmbedBuilder()
    .setTitle('🏺 Effigy Equipped!')
    .setDescription(`You have equipped the **${effigyName}**.`)
    .setColor(Colors.Blue);
    
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shrine_view_updated')
        .setLabel('👁️ View Shrine')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
}

async function handleQuickFill(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  const userId = interaction.user.id;
  const prisma = getPrisma();
  
  // Get user's best relics
  const relics = await prisma.relic.findMany({
    where: { ownerUserId: userId },
    take: 4,
    orderBy: [
      { rarity: 'asc' }
    ]
  });
  
  if (relics.length === 0) {
    await interaction.editReply("❌ You don't have any relics to place.");
    return;
  }
  
  const positions = ['FL', 'FR', 'BL', 'BR'] as const;
  
  await saveShrine(userId, (s) => {
    positions.forEach((pos, index) => {
      if (index < relics.length) {
        s.layout[pos] = relics[index].id;
      }
    });
  });
  
  const embed = new EmbedBuilder()
    .setTitle("⚡ Auto-Fill Complete!")
    .setDescription(`Placed your top ${relics.length} characters in shrine positions.`)
    .setColor(Colors.Green);
    
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shrine_view_updated')
        .setLabel('👁️ View Shrine')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({ embeds: [embed], components: [actionRow] });
}