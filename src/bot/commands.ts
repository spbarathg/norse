import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionReplyOptions,
  APIEmbedField,
  ModalSubmitInteraction
} from "discord.js";
import { performDrop } from "../engines/drop.js";
import { startMission, claimMission } from "../engines/missions.js";
import { getPrisma } from "../lib/db.js";
import { 
  createTradeOffer, 
  getTradeOfferDetails, 
  acceptTradeOffer, 
  cancelTradeOffer, 
  getUserTrades,
  cleanupExpiredTrades
} from "../engines/trade.js";
import { checkAndNotifyAchievements, getUserAchievements } from "../engines/achievements";
import { getLeaderboardsEmbed } from "../engines/leaderboard";
import {
  handleTradeOffer,
  handleTradeList,
  handleTradeView,
  handleTradeAccept,
  handleTradeCancel,
  handleTradeHistory,
  handleBrowseTrades,
  handleBrowseMarket,
  showTradeWithRelicMenu,
  handleTradeBuilderComponent,
  handleTradeBuilderModal
} from "./tradeHandlers.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export const commandBuilders = [
  new SlashCommandBuilder().setName("drop").setDescription("Summon a new Living Relic"),
  new SlashCommandBuilder()
    .setName("missions")
    .setDescription("Missions operations")
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start a mission")
        .addStringOption((o) => o.setName("mission_id").setDescription("Mission ID").setRequired(true)
          .addChoices(
            { name: "🌲 Scout the Grove (10min)", value: "scout_grove" },
            { name: "🏛️ Raid Ancient Ruins (30min)", value: "raid_ruins" },
            { name: "🌊 Ocean Voyage (60min)", value: "ocean_voyage" }
          ))
        .addStringOption((o) =>
          o.setName("relic_ids").setDescription("Comma-separated relic IDs").setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("claim")
        .setDescription("Claim mission rewards")
        .addStringOption((o) => o.setName("mission_id").setDescription("Mission ID").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("market")
    .setDescription("Marketplace")
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("List a relic for sale")
        .addStringOption((o) => o.setName("relic_id").setDescription("Relic ID").setRequired(true))
        .addIntegerOption((o) => o.setName("price").setDescription("Price in gold").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("buy")
        .setDescription("Buy a listing")
        .addStringOption((o) => o.setName("listing_id").setDescription("Listing ID").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("collection")
    .setDescription("View your relics")
    .addIntegerOption((o) => o.setName("page").setDescription("Page").setRequired(false)),
  new SlashCommandBuilder()
    .setName("view")
    .setDescription("View a relic")
    .addStringOption((o) => o.setName("relic_id").setDescription("Relic ID").setRequired(true)),
  new SlashCommandBuilder().setName("balance").setDescription("View your gold and materials"),
  new SlashCommandBuilder().setName("daily").setDescription("Claim your daily reward"),
  new SlashCommandBuilder()
    .setName("inspect")
    .setDescription("View another player's collection")
    .addUserOption((o) => o.setName("player").setDescription("Player to inspect").setRequired(true))
    .addIntegerOption((o) => o.setName("page").setDescription("Page number").setRequired(false)),
  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Browse all available characters in the database")
    .addStringOption((o) => o.setName("search").setDescription("Search for a specific character by name").setRequired(false))
    .addIntegerOption((o) => o.setName("page").setDescription("Page number").setRequired(false)),
  new SlashCommandBuilder()
    .setName("relic")
    .setDescription("Relic management")
    .addSubcommand(s => s
      .setName("levelup")
      .setDescription("Spend XP and Gold to level up a relic")
      .addStringOption(o => o.setName("relic_id").setDescription("Relic ID").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("nexus")
    .setDescription("Open the Town Square hub"),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show your Norse player profile"),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show community leaderboards"),
  new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trading operations")
    .addSubcommand((s) =>
      s
        .setName("offer")
        .setDescription("Create a trade offer")
        .addUserOption((o) => o.setName("player").setDescription("Player to trade with (leave empty for open trade)").setRequired(false))
        .addStringOption((o) => o.setName("message").setDescription("Optional message to include with trade").setRequired(false))
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("View your active trades")
        .addStringOption((o) => 
          o.setName("type")
            .setDescription("Type of trades to view")
            .setRequired(false)
            .addChoices(
              { name: "📤 Sent by me", value: "sent" },
              { name: "📥 Received by me", value: "received" },
              { name: "🌍 Open trades", value: "open" },
              { name: "📋 All my trades", value: "all" }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View details of a specific trade")
        .addStringOption((o) => o.setName("trade_id").setDescription("Trade ID").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("accept")
        .setDescription("Accept a trade offer")
        .addStringOption((o) => o.setName("trade_id").setDescription("Trade ID").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("cancel")
        .setDescription("Cancel a trade offer")
        .addStringOption((o) => o.setName("trade_id").setDescription("Trade ID").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("history")
        .setDescription("View your trade history")
        .addIntegerOption((o) => o.setName("page").setDescription("Page number").setRequired(false))
    ),
  new SlashCommandBuilder()
    .setName("browse")
    .setDescription("Browse available trades and marketplace")
    .addSubcommand((s) =>
      s
        .setName("trades")
        .setDescription("Browse open trade offers")
        .addIntegerOption((o) => o.setName("page").setDescription("Page number").setRequired(false))
    )
    .addSubcommand((s) =>
      s
        .setName("market")
        .setDescription("Browse marketplace listings")
        .addIntegerOption((o) => o.setName("page").setDescription("Page number").setRequired(false))
    ),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  console.log(`Received command: ${interaction.commandName} from user: ${interaction.user.id}`);
  
  const prisma = getPrisma();
  const userId = interaction.user.id;

  try {
    if (interaction.commandName === "drop") {
      await interaction.deferReply(); // PUBLIC - everyone can see
      const result = await performDrop({ userId });
      
      // Clean, minimalistic drop embed
      const dropEmbed = new EmbedBuilder()
        .setTitle(`✨ ${result.embed.title}`)
        .setDescription(`${result.embed.description}`)
        .addFields(result.embed.fields)
        .setColor(getRarityColor(result.rarity))
        .setTimestamp()
        .setFooter({ text: result.relicId });
      
      if (result.embed.image) {
        dropEmbed.setImage(result.embed.image.url);
      }

      // Quick action buttons
      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`view_relic_${result.relicId}`)
            .setLabel('📋 View Details')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('drop_another')
            .setLabel('🎲 Drop Another')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('view_collection')
            .setLabel('📚 My Collection')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ 
        embeds: [dropEmbed], 
        components: [actionRow] 
      });
      // Achievement checks after drop
      try { await checkAndNotifyAchievements(interaction, userId); } catch (e) { console.warn("Achievement check failed:", (e as any).message); }
      return;
    }

    if (interaction.commandName === "missions") {
      const sub = interaction.options.getSubcommand();
      if (sub === "start") {
        await interaction.deferReply();
        const missionId = interaction.options.getString("mission_id", true);
        const relicIds = interaction.options.getString("relic_ids", true).split(",").map((s) => s.trim());
        const m = await startMission(userId, relicIds, missionId);
        
        const missionEmbed = new EmbedBuilder()
          .setTitle("🗡️ Mission Started!")
          .setDescription(`${relicIds.length} relic${relicIds.length > 1 ? 's' : ''} sent on mission`)
          .addFields(
            { name: "📋 Mission", value: missionId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
            { name: "🏺 Relics", value: relicIds.join(', '), inline: true },
            { name: "⏰ Completion", value: `<t:${Math.floor(m.endRealTs.getTime() / 1000)}:R>`, inline: true }
          )
          .setColor(0x3498DB)
          .setTimestamp();
        
        await interaction.editReply({ embeds: [missionEmbed] });
        return;
      }
      if (sub === "claim") {
        await interaction.deferReply();
        const missionId = interaction.options.getString("mission_id", true);
        await claimMission(userId, missionId);
        
        const claimEmbed = new EmbedBuilder()
          .setTitle("🎉 Mission Completed!")
          .setDescription("Rewards claimed successfully!")
          .addFields({ name: "📋 Mission ID", value: missionId, inline: true })
          .setColor(0x2ECC71)
          .setTimestamp();
        
        await interaction.editReply({ embeds: [claimEmbed] });
        return;
      }
    }

    if (interaction.commandName === "market") {
      const sub = interaction.options.getSubcommand();
      if (sub === "list") {
        await interaction.deferReply(); // PUBLIC - announce your listing!
        const relicId = interaction.options.getString("relic_id", true);
        const price = interaction.options.getInteger("price", true);
        const listing = await prisma.marketListing.create({ data: { relicId, priceGold: price, sellerUserId: userId, status: "active" } });
        
        const listingEmbed = new EmbedBuilder()
          .setTitle("💰 New Market Listing!")
          .setDescription("Relic listed for sale")
          .addFields(
            { name: "🏺 Relic ID", value: `\`${relicId}\``, inline: true },
            { name: "💰 Price", value: `${price.toLocaleString()} gold`, inline: true },
            { name: "🆔 Listing ID", value: listing.id, inline: true }
          )
          .setColor(0xF39C12)
          .setTimestamp();
        
        await interaction.editReply({ embeds: [listingEmbed] });
        return;
      }
      if (sub === "buy") {
        await interaction.deferReply(); // PUBLIC - show successful purchases!
        const listingId = interaction.options.getString("listing_id", true);
        const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });
        if (!listing) return interaction.editReply(`Listing not found.`);
        try {
          await prisma.$transaction(async (tx) => {
            const buyer = await tx.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) }, update: {} });
            if (buyer.gold < listing.priceGold) throw new Error("Insufficient gold");
            const seller = await tx.user.upsert({ where: { userId: listing.sellerUserId }, create: { userId: listing.sellerUserId, discordId: listing.sellerUserId, gold: 0, materials: JSON.stringify({}) }, update: {} });
            await tx.user.update({ where: { userId }, data: { gold: buyer.gold - listing.priceGold } });
            await tx.user.update({ where: { userId: seller.userId }, data: { gold: seller.gold + listing.priceGold } });
            await tx.relic.update({ where: { id: listing.relicId }, data: { ownerUserId: userId, missionLockId: null } });
            await tx.marketListing.update({ where: { id: listing.id }, data: { status: "sold", buyerUserId: userId } });
          });
          
          const purchaseEmbed = new EmbedBuilder()
            .setTitle("🛒 Successful Purchase!")
            .setDescription("Relic purchased successfully!")
            .addFields(
              { name: "🏺 Relic ID", value: `\`${listing.relicId}\``, inline: true },
              { name: "💰 Price Paid", value: `${listing.priceGold.toLocaleString()} gold`, inline: true },
              { name: "🆔 Listing ID", value: listingId, inline: true }
            )
            .setColor(0x2ECC71)
            .setTimestamp();
          
          await interaction.editReply({ embeds: [purchaseEmbed] });
        } catch (e: any) {
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Purchase Failed")
            .setDescription(`Transaction failed: ${e.message}`)
            .setColor(0xE74C3C);
          
          await interaction.editReply({ embeds: [errorEmbed] });
        }
        return;
      }
    }

    if (interaction.commandName === "collection") {
      await interaction.deferReply(); // PUBLIC - show your collection
      const page = interaction.options.getInteger("page") || 1;
      await showCollectionPage(interaction, userId, page);
      return;
    }

    if (interaction.commandName === "view") {
      await interaction.deferReply(); // PUBLIC - everyone can see
      const relicId = interaction.options.getString("relic_id", true);
      await showGlobalRelicDetails(interaction, relicId);
      return;
    }

    if (interaction.commandName === "balance") {
      await interaction.deferReply(); // PUBLIC - show your wealth
      const user = await prisma.user.findUnique({ where: { userId } });
      const gold = user?.gold || 0;
      const mats = JSON.parse(user?.materials || "{}");

      const embed = new EmbedBuilder()
        .setTitle("💰 Your Balance")
        .setDescription("⠀")
        .setColor(0xF1C40F)
        .setTimestamp()
        .addFields(
          { name: "🪙 Gold", value: `**${gold.toLocaleString()}**`, inline: true },
          { name: "⠀", value: "⠀", inline: true },
          { name: "📦 Materials", value: Object.keys(mats).length > 0 ? 
            Object.entries(mats).map(([key, value]) => `**${key}:** ${value}`).join('\n') : 
            "*None*", inline: true }
        )
        .setFooter({ text: `Player: ${interaction.user.username}` });

      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('view_collection')
            .setLabel('📚 View Collection')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('trade_list_all')
            .setLabel('🤝 My Trades')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('drop_another')
            .setLabel('🎲 Drop Relic')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.editReply({ 
        embeds: [embed], 
        components: [actionRow] 
      });
      return;
    }

    if (interaction.commandName === "daily") {
      await interaction.deferReply(); // PUBLIC - everyone can see
      await handleDailyReward(interaction, userId);
      return;
    }

    if (interaction.commandName === "inspect") {
      console.log("Starting inspect command...");
      await interaction.deferReply(); // PUBLIC - social viewing
      const targetUser = interaction.options.getUser("player", true);
      const page = interaction.options.getInteger("page") || 1;
      console.log(`Calling showPlayerCollection for ${targetUser.id} (${targetUser.username}), page ${page}`);
      await showPlayerCollection(interaction, targetUser.id, targetUser.username, page);
      console.log("Inspect command completed");
      return;
    }

    if (interaction.commandName === "lookup") {
      console.log("Starting lookup command...");
      await interaction.deferReply(); // PUBLIC - character database
      const searchTerm = interaction.options.getString("search");
      const page = interaction.options.getInteger("page") || 1;
      console.log(`Looking up characters: search='${searchTerm}', page=${page}`);
      await showCharacterDatabase(interaction, searchTerm, page);
      console.log("Lookup command completed");
      return;
    }

    if (interaction.commandName === "relic") {
      const sub = interaction.options.getSubcommand();
      if (sub === "levelup") {
        await interaction.deferReply();
        const relicId = interaction.options.getString("relic_id", true);
        const prisma = getPrisma();
        const relic = await prisma.relic.findUnique({ where: { id: relicId } });
        if (!relic || relic.ownerUserId !== userId) {
          await interaction.editReply("You don't own this relic or it doesn't exist.");
          return;
        }
        const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) }, update: {} });
        // Leveling costs and scaling
        const stats = JSON.parse(relic.currentStats || "{}");
        const currentLevel = Number((relic.metadata && JSON.parse(relic.metadata || '{}').level) || 1);
        const nextLevel = currentLevel + 1;
        const costGold = nextLevel * 10;
        const costXp = nextLevel * 5;
        if (user.gold < costGold || relic.xp < costXp) {
          const embed = new EmbedBuilder().setTitle("🔒 Not enough resources").setDescription(`Requires ${costGold} gold and ${costXp} XP.`).setColor(0xE74C3C);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        // Apply level: simple per-level stat increases
        const newStats = {
          hp: (stats.hp || 0) + 2,
          atk: (stats.atk || 0) + 1,
          def: (stats.def || 0) + 1,
          spd: (stats.spd || 0) + 0,
        };
        const newMeta = { ...(relic.metadata ? JSON.parse(relic.metadata) : {}), level: nextLevel };
        await prisma.$transaction(async (tx) => {
          await tx.user.update({ where: { userId }, data: { gold: user.gold - costGold } });
          await tx.relic.update({ where: { id: relicId }, data: { xp: relic.xp - costXp, currentStats: JSON.stringify(newStats), metadata: JSON.stringify(newMeta) } });
        });
        const embed = new EmbedBuilder()
          .setTitle("⬆️ Relic Leveled Up!")
          .setDescription(`Relic \`${relicId}\` is now Level ${nextLevel}`)
          .addFields(
            { name: "Costs", value: `-${costGold} gold, -${costXp} XP`, inline: true },
            { name: "New Stats", value: `HP ${newStats.hp}, ATK ${newStats.atk}, DEF ${newStats.def}, SPD ${newStats.spd}`, inline: true },
          )
          .setColor(0x2ECC71)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    if (interaction.commandName === "nexus") {
      await interaction.deferReply();
      const embed = new EmbedBuilder()
        .setTitle("🏙️ Town Square")
        .setDescription("Choose where to go:")
        .setColor(0x3498DB);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('nx_market').setLabel('Marketplace').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('nx_trades').setLabel('Open Trades').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('nx_missions').setLabel('Your Missions').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('nx_leaderboard').setLabel('Leaderboards').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('nx_profile').setLabel('Your Profile').setStyle(ButtonStyle.Success),
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }
    if (interaction.commandName === "profile") {
      await interaction.deferReply();
      const { embed, components } = await buildUserProfileEmbed(userId, interaction);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      await interaction.deferReply();
      const embedAndComponents = await getLeaderboardsEmbed({ scope: "weekly", board: "richest" }, userId);
      await interaction.editReply(embedAndComponents);
      return;
    }

    if (interaction.commandName === "trade") {
      const sub = interaction.options.getSubcommand();
      
      if (sub === "offer") {
        await interaction.deferReply(); // PUBLIC - show trade offers
        await handleTradeOffer(interaction, userId);
        return;
      }
      
      if (sub === "list") {
        await interaction.deferReply(); // PUBLIC - show trade list
        const type = interaction.options.getString("type") || "all";
        await handleTradeList(interaction, userId, type);
        return;
      }
      
      if (sub === "view") {
        await interaction.deferReply(); // PUBLIC - show trade details
        const tradeId = interaction.options.getString("trade_id", true);
        await handleTradeView(interaction, tradeId, userId);
        return;
      }
      
      if (sub === "accept") {
        await interaction.deferReply(); // PUBLIC - show successful trades
        const tradeId = interaction.options.getString("trade_id", true);
        await handleTradeAccept(interaction, tradeId, userId);
        return;
      }
      
      if (sub === "cancel") {
        await interaction.deferReply(); // PUBLIC - show cancelled trades
        const tradeId = interaction.options.getString("trade_id", true);
        await handleTradeCancel(interaction, tradeId, userId);
        return;
      }
      
      if (sub === "history") {
        await interaction.deferReply(); // PUBLIC - show trade history
        const page = interaction.options.getInteger("page") || 1;
        await handleTradeHistory(interaction, userId, page);
        return;
      }
    }

    if (interaction.commandName === "browse") {
      const sub = interaction.options.getSubcommand();
      
      if (sub === "trades") {
        await interaction.deferReply(); // PUBLIC - browse open trades
        const page = interaction.options.getInteger("page") || 1;
        await handleBrowseTrades(interaction, page);
        return;
      }
      
      if (sub === "market") {
        await interaction.deferReply(); // PUBLIC - browse marketplace
        const page = interaction.options.getInteger("page") || 1;
      await handleBrowseMarket(interaction, page, null);
        return;
      }
    }
  } catch (error: any) {
    console.error(`Command error for ${interaction.commandName}:`, error);
    console.error("Error stack:", error.stack);
    
    const reply = `Error executing command: ${error.message || "Something went wrong"}`;
    
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply({ content: reply, ephemeral: true });
      }
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

// Helper function for rarity colors
function getRarityColor(rarity: string): number {
  const colors = {
    S: 0xFF6B35, // Orange-red for legendary
    A: 0x9B59B6, // Purple for epic  
    B: 0x3498DB, // Blue for rare
    C: 0x95A5A6  // Gray for common
  };
  return colors[rarity as keyof typeof colors] || 0x95A5A6;
}

// Interactive collection display with pagination
async function showCollectionPage(interaction: ChatInputCommandInteraction | ButtonInteraction, userId: string, page: number) {
  const prisma = getPrisma();
  const pageSize = 4;
  const skip = (page - 1) * pageSize;
  
  const [relics, totalCount] = await Promise.all([
    prisma.relic.findMany({ 
      where: { ownerUserId: userId }, 
      orderBy: { birthRealTs: "desc" }, 
      skip, 
      take: pageSize 
    }),
    prisma.relic.count({ where: { ownerUserId: userId } })
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  if (relics.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("📚 Your Relic Collection")
      .setDescription("No relics found. Use `/drop` to summon your first relic!")
      .setColor(0x95A5A6);
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Create collection embed
  const embed = new EmbedBuilder()
    .setTitle(`📚 Your Relic Collection`)
    .setDescription(`**Page ${page} of ${totalPages}** • Showing ${relics.length} of ${totalCount} relics\n⠀`)
    .setColor(0x3498DB)
    .setTimestamp();

  // Add relic fields in vertical format with spacing
  relics.forEach((relic, index) => {
    const rarityEmoji = getRarityEmoji(relic.rarity);
    embed.addFields({
      name: `${rarityEmoji} **\`${relic.id}\`**`,
      value: `${getRarityName(relic.rarity)} • ${relic.durabilityPct.toFixed(1)}% HP • ${relic.evolutionStage} • ${relic.xp.toLocaleString()} XP`,
      inline: false
    });

    // Add spacing between relics (except after the last one)
    if (index < relics.length - 1) {
      embed.addFields({ name: "⠀", value: "⠀", inline: false });
    }
  });

  // Navigation buttons
  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`collection_page_${page - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId('collection_refresh')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  if (page < totalPages) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`collection_page_${page + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Quick actions row
  const actionsRow = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('relic_quick_action')
        .setPlaceholder('Choose a relic to view...')
        .addOptions(relics.map(relic => ({
          label: `${getRarityEmoji(relic.rarity)} ${relic.id}`,
          description: `${relic.rarity} • ${relic.evolutionStage} • ${relic.durabilityPct.toFixed(1)}%`,
          value: `view_${relic.id}`
        })))
    );

  const components: ActionRowBuilder<any>[] = [navigationRow];
  if (relics.length > 0) {
    components.push(actionsRow);
  }

  await interaction.editReply({ 
    embeds: [embed], 
    components 
  });
}

// Helper function for rarity emojis
function getRarityEmoji(rarity: string): string {
  const emojis = {
    S: '🌟', // Legendary
    A: '💜', // Epic
    B: '💙', // Rare  
    C: '🤍'  // Common
  };
  return emojis[rarity as keyof typeof emojis] || '⚪';
}

// Helper function for rarity names
function getRarityName(rarity: string): string {
  const names = {
    S: 'Legendary',
    A: 'Epic',
    B: 'Rare',
    C: 'Common'
  };
  return names[rarity as keyof typeof names] || 'Unknown';
}

async function buildUserProfileEmbed(userId: string, interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const prisma = getPrisma();
  const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) }, update: {} });
  const mats = JSON.parse(user.materials || '{}');
  const featuredRelicId: string | undefined = mats.featuredRelicId;
  const relic = featuredRelicId ? await prisma.relic.findUnique({ where: { id: featuredRelicId } }) : null;

  let character: any = null;
  try {
    const characters = require("../../data/allgodschars.json");
    if (relic) character = characters.find((c: any) => c.id === relic.characterId);
  } catch {}

  const achievements = (mats.achievements || {}) as Record<string, boolean>;
  const badges: string[] = [];
  if (achievements.first_s_tier_drop) badges.push('🌟');
  if (achievements.master_trader) badges.push('💱');
  if (achievements.pantheon_collector_greco) badges.push('🏛️');

  const embed = new EmbedBuilder()
    .setTitle(`${interaction.user.username} — Player Profile`)
    .setColor(0xC9A227)
    .setTimestamp()
    .addFields(
      { name: 'Joined', value: `<t:${Math.floor(user.createdAt.getTime()/1000)}:D>`, inline: true },
      { name: 'Gold', value: user.gold.toLocaleString(), inline: true },
    );

  if (relic) {
    const baseUrl = process.env.CDN_BASE_URL || 'http://localhost:3000/cdn';
    const portraitUrl = `${baseUrl}/portraits/${character?.slug || 'odin'}.png`;
    embed.setDescription(`Featured Relic: ${character ? `${character.name} (${relic.rarity}) — ${character.class}, ${character.element}` : `Relic ${relic.id}`}\nPassive: ${character ? `"${character.passive_ability_name}" — ${character.passive_ability_desc}` : '—'}`);
    if (baseUrl) embed.setImage(portraitUrl);
  } else {
    embed.setDescription('Use the button below to choose a Featured Relic.');
  }

  // Simplified stats placeholders
  const missionsCompleted = await prisma.mission.count({ where: { ownerUserId: userId, status: 'claimed' } });
  let tradesMade = 0;
  try {
    tradesMade = await (prisma as any).tradeHistory.count({ where: { OR: [{ user1Id: userId }, { user2Id: userId }] } });
  } catch {
    tradesMade = 0;
  }
  const streak = (mats.streak || 0) as number;

  embed.addFields(
    { name: 'Total Missions', value: missionsCompleted.toString(), inline: true },
    { name: 'Trades Made', value: tradesMade.toString(), inline: true },
    { name: 'Daily Streak', value: `${streak} days`, inline: true },
  );

  if (badges.length > 0) {
    embed.addFields({ name: 'Achievements', value: badges.join('  '), inline: false });
  }

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('profile_change_featured').setLabel('Change Featured Relic').setStyle(ButtonStyle.Primary)
  );

  return { embed, components: [actions] as any };
}

async function presentFeaturedRelicSelector(interaction: ButtonInteraction, userId: string) {
  const prisma = getPrisma();
  const owned = await prisma.relic.findMany({ where: { ownerUserId: userId }, take: 25 });
  if (owned.length === 0) {
    await interaction.reply({ content: 'You have no relics yet. Use /drop first.', ephemeral: true });
    return;
  }
  const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('profile_feature_select')
      .setPlaceholder('Choose a relic to feature')
      .addOptions(owned.map((r) => ({ label: `${r.id} (${r.rarity})`, value: r.id })))
  );
  await interaction.reply({ content: 'Select a featured relic:', components: [menu] });
}

// Handle button and select menu interactions
export async function handleComponentInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction) {
  const userId = interaction.user.id;
  const prisma = getPrisma();

  try {
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Drop another relic
      if (customId === 'drop_another') {
        await interaction.deferReply(); // PUBLIC - everyone can see
        const result = await performDrop({ userId });
        
        const dropEmbed = new EmbedBuilder()
          .setTitle(`✨ ${result.embed.title}`)
          .setDescription(result.embed.description)
          .addFields(result.embed.fields)
          .setColor(getRarityColor(result.rarity))
          .setTimestamp()
          .setFooter({ text: result.relicId });
        
        if (result.embed.image) {
          dropEmbed.setImage(result.embed.image.url);
        }

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`view_relic_${result.relicId}`)
              .setLabel('📋 View Details')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('drop_another')
              .setLabel('🎲 Drop Another')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('view_collection')
              .setLabel('📚 My Collection')
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.editReply({ 
          embeds: [dropEmbed], 
          components: [actionRow] 
        });
        return;
      }

      // Profile actions
      if (customId === 'profile_change_featured') {
        await presentFeaturedRelicSelector(interaction, userId);
        return;
      }
      // removed share button to keep UI to working features only
      if (customId === 'ach_view_profile') {
        await interaction.deferReply();
        const { embed, components } = await buildUserProfileEmbed(userId, interaction);
        await interaction.editReply({ embeds: [embed], components });
        return;
      }
      // removed unimplemented share action

      // View collection
      if (customId === 'view_collection') {
        await interaction.deferReply();
        await showCollectionPage(interaction, userId, 1);
        return;
      }

      // Collection pagination
      if (customId.startsWith('collection_page_')) {
        const page = parseInt(customId.split('_')[2]);
        await interaction.deferUpdate();
        await showCollectionPage(interaction, userId, page);
        return;
      }

      // Collection refresh
      if (customId === 'collection_refresh') {
        await interaction.deferUpdate();
        await showCollectionPage(interaction, userId, 1);
        return;
      }

      // View specific relic
      if (customId.startsWith('view_relic_')) {
        const relicId = customId.replace('view_relic_', '');
        await interaction.deferReply(); // PUBLIC - everyone can see
        await showGlobalRelicDetails(interaction, relicId);
        return;
      }

      // Inspect player collection pagination
      if (customId.startsWith('inspect_')) {
        const parts = customId.split('_');
        const targetUserId = parts[1];
        const page = parseInt(parts[2]);
        
        // Get target user info
        const targetUser = await interaction.client.users.fetch(targetUserId);
        
        await interaction.deferUpdate(); // Keep same message
        await showPlayerCollection(interaction, targetUserId, targetUser.username, page);
        return;
      }

      // Character database pagination
      if (customId.startsWith('lookup_page_')) {
        const parts = customId.split('_');
        const searchTerm = parts[2] === 'all' ? null : parts[2];
        const page = parseInt(parts[3]);
        
        await interaction.deferUpdate(); // Keep same message
        await showCharacterDatabase(interaction, searchTerm, page);
        return;
      }

      // Nexus routing
      if (customId === 'nx_market') {
        await interaction.deferReply();
        await handleBrowseMarket(interaction, 1, null);
        return;
      }
      if (customId === 'nx_trades') {
        await interaction.deferReply();
        await handleBrowseTrades(interaction, 1);
        return;
      }
      if (customId === 'nx_missions') {
        await interaction.deferReply();
        // show user's active missions summary
        const prisma = getPrisma();
        const missions = await prisma.mission.findMany({ where: { ownerUserId: userId, status: { in: ["active", "ready"] } }, orderBy: { endRealTs: 'asc' } });
        const embed = new EmbedBuilder().setTitle('🗺️ Your Missions').setColor(0x9B59B6);
        if (missions.length === 0) embed.setDescription('No active missions. Use /missions start to begin.');
        missions.forEach(m => embed.addFields({ name: m.missionType, value: m.status === 'active' ? `Ends <t:${Math.floor(m.endRealTs.getTime()/1000)}:R>` : 'Ready to claim ✅', inline: false }));
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      if (customId === 'nx_leaderboard') {
        await interaction.deferReply();
        const payload = await getLeaderboardsEmbed({ scope: 'weekly', board: 'richest' } as any, userId);
        await interaction.editReply(payload);
        return;
      }
      if (customId === 'nx_profile') {
        await interaction.deferReply();
        const { embed, components } = await buildUserProfileEmbed(userId, interaction);
        await interaction.editReply({ embeds: [embed], components });
        return;
      }

      // Trade builder buttons
      if (customId === 'tb_add_relic' || customId === 'tb_set_gold' || customId === 'tb_add_mats' || customId === 'tb_send_offer') {
        await handleTradeBuilderComponent(interaction, userId);
        return;
      }

      // Trading system button handlers
      
      // Accept trade
      if (customId.startsWith('trade_accept_')) {
        const tradeId = customId.replace('trade_accept_', '');
        await interaction.deferReply(); // PUBLIC - show successful trades
        await handleTradeAccept(interaction, tradeId, userId);
        return;
      }

      // Cancel trade
      if (customId.startsWith('trade_cancel_')) {
        const tradeId = customId.replace('trade_cancel_', '');
        await interaction.deferReply(); // PUBLIC - show cancelled trades
        await handleTradeCancel(interaction, tradeId, userId);
        return;
      }

      // Trade list navigation
      if (customId.startsWith('trade_refresh_')) {
        const type = customId.replace('trade_refresh_', '');
        await interaction.deferUpdate();
        await handleTradeList(interaction, userId, type);
        return;
      }

      // Trade history navigation
      if (customId.startsWith('trade_history_')) {
        const page = parseInt(customId.replace('trade_history_', ''));
        await interaction.deferUpdate();
        await handleTradeHistory(interaction, userId, page);
        return;
      }

      // Browse trades navigation
      if (customId.startsWith('browse_trades_')) {
        const page = parseInt(customId.replace('browse_trades_', ''));
        await interaction.deferUpdate();
        await handleBrowseTrades(interaction, page);
        return;
      }

      // Browse market navigation
      if (customId.startsWith('browse_market_')) {
        const parts = customId.split('_');
        const page = parseInt(parts[2]);
        await interaction.deferUpdate();
        await handleBrowseMarket(interaction, page, null);
        return;
      }

      // New trade offer
      if (customId === 'trade_offer_new') {
        await interaction.deferReply(); // PUBLIC
        await handleTradeOffer(interaction, userId);
        return;
      }

      // View trade list
      if (customId === 'trade_list_all') {
        await interaction.deferReply(); // PUBLIC
        await handleTradeList(interaction, userId, "all");
        return;
      }

      // Trade with specific relic
      if (customId.startsWith('trade_with_')) {
        const relicId = customId.replace('trade_with_', '');
        await interaction.deferReply(); // PUBLIC
        await showTradeWithRelicMenu(interaction, userId, relicId);
        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;

      // Quick relic actions
      if (customId === 'relic_quick_action') {
        const selectedValue = interaction.values[0];
        if (selectedValue.startsWith('view_')) {
          const relicId = selectedValue.replace('view_', '');
          await interaction.deferReply(); // PUBLIC - everyone can see
          await showGlobalRelicDetails(interaction, relicId);
          return;
        }
      }
      if (customId === 'profile_feature_select') {
        await interaction.deferUpdate();
        const selectedRelicId = interaction.values[0];
        const prisma = getPrisma();
        const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}) }, update: {} });
        const mats = JSON.parse(user.materials || '{}');
        mats.featuredRelicId = selectedRelicId;
        await prisma.user.update({ where: { userId }, data: { materials: JSON.stringify(mats) } });
        const { embed, components } = await buildUserProfileEmbed(userId, interaction as any);
        await (interaction.message as any).edit({ embeds: [embed], components });
        return;
      }

      // Global relic lookup from inspect collections
      if (customId === 'global_relic_lookup') {
        const selectedValue = interaction.values[0];
        if (selectedValue.startsWith('lookup_')) {
          const relicId = selectedValue.replace('lookup_', '');
          await interaction.deferReply(); // PUBLIC - everyone can see
          await showGlobalRelicDetails(interaction, relicId);
          return;
        }
      }

      // Trade builder relic selection
      if (customId === 'tb_select_relic') {
        await handleTradeBuilderComponent(interaction, userId);
        return;
      }

      // Leaderboard board select
      if (customId === 'lb_select') {
        await interaction.deferUpdate();
        const val = interaction.values[0];
        const board = val === 'richest' ? 'richest' : val === 'collectors' ? 'collectors' : 'missions';
        const payload = await getLeaderboardsEmbed({ scope: 'weekly', board } as any, userId);
        await interaction.editReply(payload);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      await handleTradeBuilderModal(interaction);
      return;
    }

  } catch (error: any) {
    console.error('Component interaction error:', error);
    
    const reply = `Error: ${error.message || "Something went wrong"}`;
    
    try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply({ content: reply, ephemeral: true });
    }
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

// Enhanced relic details view
async function showRelicDetails(interaction: ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction, relicId: string) {
  const prisma = getPrisma();
  const relic = await prisma.relic.findUnique({ where: { id: relicId } });
  
  if (!relic) {
    await interaction.editReply("Relic not found.");
    return;
  }

  // Get character data
  let character;
  try {
    const characters = require("../../data/allgodschars.json");
    character = characters.find((c: any) => c.id === relic.characterId);
  } catch {
    character = null;
  }

  const rarityEmoji = getRarityEmoji(relic.rarity);
  const embed = new EmbedBuilder()
    .setTitle(`${rarityEmoji} Relic \`${relicId}\``)
    .setColor(getRarityColor(relic.rarity))
    .setTimestamp()
    .addFields(
      { name: "📊 Era", value: relic.eraId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
      { name: "💎 Rarity", value: `${rarityEmoji} ${getRarityName(relic.rarity)}`, inline: true },
      { name: "🔒 Status", value: relic.isLocked ? "🔒 Locked" : "✅ Available", inline: true },
      { name: "💪 Durability", value: `${relic.durabilityPct.toFixed(1)}%`, inline: true },
      { name: "⭐ Evolution", value: relic.evolutionStage, inline: true },
      { name: "✨ Experience", value: `${relic.xp.toLocaleString()} XP`, inline: true }
    );

  if (character) {
    embed.setDescription(`**${character.name}** • ${character.class} • ${character.element}\n⠀`);
    embed.addFields(
      { name: "🏛️ Pantheon", value: character.pantheon, inline: true },
      { name: "⠀", value: "⠀", inline: true },
      { name: "⠀", value: "⠀", inline: true },
      { name: "⚔️ Passive Ability", value: `**"${character.passive_ability_name}"**\n${character.passive_ability_desc}`, inline: false }
    );

    // Add character stats if available
    const stats = JSON.parse(relic.currentStats || "{}");
    if (stats.hp) {
      embed.addFields(
        { name: "⠀", value: "⠀", inline: false },
        {
          name: "📈 Combat Stats",
          value: `❤️ **HP:** ${stats.hp}\n⚔️ **ATK:** ${stats.atk}\n🛡️ **DEF:** ${stats.def}\n⚡ **SPD:** ${stats.spd}`,
          inline: true
        }
      );
    }
  }

  // Action buttons for this relic
  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('view_collection')
        .setLabel('🔙 Back to Collection')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`market_list_${relicId}`)
        .setLabel('💰 List for Sale')
        .setStyle(ButtonStyle.Success)
        .setDisabled(relic.isLocked),
      new ButtonBuilder()
        .setCustomId(`trade_with_${relicId}`)
        .setLabel('🤝 Trade')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(relic.isLocked),
      new ButtonBuilder()
        .setCustomId(`mission_with_${relicId}`)
        .setLabel('🗡️ Send on Mission')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(relic.isLocked)
    );

  await interaction.editReply({ 
    embeds: [embed], 
    components: [actionRow] 
  });
}

// Daily reward system
async function handleDailyReward(interaction: ChatInputCommandInteraction, userId: string) {
  const prisma = getPrisma();
  
  // Get or create user
  const user = await prisma.user.upsert({
    where: { userId },
    create: { 
      userId, 
      discordId: userId, 
      gold: 0, 
      materials: JSON.stringify({}) 
    },
    update: {}
  });

  const now = new Date();
  const today = now.toDateString();
  
  // Check if user already claimed today
  const lastClaimDate = user.updatedAt.toDateString();
  const materials = JSON.parse(user.materials || "{}");
  
  if (lastClaimDate === today) {
    const embed = new EmbedBuilder()
      .setTitle("⏰ Daily Reward Already Claimed")
      .setDescription("You've already claimed your daily reward today! Come back tomorrow.")
      .setColor(0x95A5A6)
      .setTimestamp()
      .addFields(
        { name: "Next Reward", value: "Available tomorrow", inline: true },
        { name: "Current Gold", value: user.gold.toLocaleString(), inline: true }
      );

    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('view_collection')
          .setLabel('📚 View Collection')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('drop_another')
          .setLabel('🎲 Drop Relic')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.editReply({ embeds: [embed], components: [actionRow] });
    return;
  }

  // Calculate streak (simplified - consecutive days)
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const wasYesterday = user.updatedAt.toDateString() === yesterday.toDateString();
  
  // Get current streak from materials or start at 1
  let streak = wasYesterday ? (materials.streak || 1) + 1 : 1;
  streak = Math.min(streak, 7); // Cap at 7 days

  // Calculate rewards based on streak
  const baseGold = 50;
  const streakMultiplier = 1 + (streak - 1) * 0.2; // 20% more per day
  const goldReward = Math.floor(baseGold * streakMultiplier);
  
  // Bonus materials based on streak
  const bonusMaterials: Record<string, number> = {};
  if (streak >= 3) bonusMaterials.wood = (bonusMaterials.wood || 0) + 2;
  if (streak >= 5) bonusMaterials.stone = (bonusMaterials.stone || 0) + 1;
  if (streak >= 7) bonusMaterials.pearls = (bonusMaterials.pearls || 0) + 1;

  // Update user with rewards
  const updatedMaterials = { ...materials, streak };
  Object.entries(bonusMaterials).forEach(([key, value]) => {
    updatedMaterials[key] = (updatedMaterials[key] || 0) + value;
  });

  await prisma.user.update({
    where: { userId },
    data: {
      gold: user.gold + goldReward,
      materials: JSON.stringify(updatedMaterials),
      updatedAt: now
    }
  });

  // Create reward embed
  const embed = new EmbedBuilder()
    .setTitle("🎁 Daily Reward Claimed!")
    .setDescription(`🔥 ${streak}-day streak maintained!`)
    .setColor(0x2ECC71)
    .setTimestamp()
    .addFields(
      { name: "🪙 Gold Earned", value: `+${goldReward.toLocaleString()}`, inline: true },
      { name: "🔥 Current Streak", value: `${streak} days`, inline: true },
      { name: "💰 Total Gold", value: (user.gold + goldReward).toLocaleString(), inline: true }
    );

  if (Object.keys(bonusMaterials).length > 0) {
    embed.addFields({
      name: "🎁 Bonus Materials",
      value: Object.entries(bonusMaterials)
        .map(([key, value]) => `+${value} ${key}`)
        .join(', '),
      inline: false
    });
  }

  embed.addFields({
    name: "⭐ Streak Bonuses",
    value: `Day 3: +2 Wood${streak >= 3 ? ' ✅' : ''}\nDay 5: +1 Stone${streak >= 5 ? ' ✅' : ''}\nDay 7: +1 Pearl${streak >= 7 ? ' ✅' : ''}`,
    inline: false
  });

  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('drop_another')
        .setLabel('🎲 Use Your Gold - Drop Relic!')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('view_collection')
        .setLabel('📚 View Collection')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.editReply({ 
    embeds: [embed], 
    components: [actionRow] 
  });
}

// Show another player's collection
async function showPlayerCollection(interaction: ChatInputCommandInteraction | ButtonInteraction, targetUserId: string, targetUsername: string, page: number) {
  console.log(`showPlayerCollection called for user ${targetUserId} (${targetUsername}), page ${page}`);
  const prisma = getPrisma();
  const pageSize = 4;
  const skip = (page - 1) * pageSize;
  
  const [relics, totalCount] = await Promise.all([
    prisma.relic.findMany({ 
      where: { ownerUserId: targetUserId }, 
      orderBy: { birthRealTs: "desc" }, 
      skip, 
      take: pageSize 
    }),
    prisma.relic.count({ where: { ownerUserId: targetUserId } })
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  if (relics.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`👤 ${targetUsername}'s Collection`)
      .setDescription("This player has no relics yet!")
      .setColor(0x95A5A6);
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Create collection embed
  const embed = new EmbedBuilder()
    .setTitle(`👤 ${targetUsername}'s Collection`)
    .setDescription(`**Page ${page} of ${totalPages}** • ${totalCount} total relics\n⠀`)
    .setColor(0x9B59B6)
    .setTimestamp();

  // Add relic fields in vertical format with spacing
  relics.forEach((relic, index) => {
    const rarityEmoji = getRarityEmoji(relic.rarity);
    embed.addFields({
      name: `${rarityEmoji} **\`${relic.id}\`**`,
      value: `${getRarityName(relic.rarity)} • ${relic.durabilityPct.toFixed(1)}% HP • ${relic.evolutionStage} • ${relic.xp.toLocaleString()} XP`,
      inline: false
    });

    // Add spacing between relics (except after the last one)
    if (index < relics.length - 1) {
      embed.addFields({ name: "⠀", value: "⠀", inline: false });
    }
  });

  // Navigation buttons for player collection
  const components = [];
  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`inspect_${targetUserId}_${page - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`inspect_${targetUserId}_${page}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  if (page < totalPages) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`inspect_${targetUserId}_${page + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (navigationRow.components.length > 0) {
    components.push(navigationRow);
  }

  await interaction.editReply({ 
    embeds: [embed],
    components 
  });
}

// Global relic lookup - anyone can view any relic
async function showGlobalRelicDetails(interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction, relicId: string) {
  const prisma = getPrisma();
  const relic = await prisma.relic.findUnique({ where: { id: relicId } });
  
  if (!relic) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Relic Not Found")
      .setDescription(`Relic \`${relicId}\` does not exist in the global database.`)
      .setColor(0xE74C3C);
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Get character data
  let character;
  try {
    const characters = require("../../data/allgodschars.json");
    character = characters.find((c: any) => c.id === relic.characterId);
  } catch {
    character = null;
  }

  const rarityEmoji = getRarityEmoji(relic.rarity);
  const embed = new EmbedBuilder()
    .setTitle(`${rarityEmoji} Global Relic \`${relicId}\``)
    .setColor(getRarityColor(relic.rarity))
    .setTimestamp()
    .addFields(
      { name: "👤 Owner", value: `<@${relic.ownerUserId}>`, inline: true },
      { name: "📊 Era", value: relic.eraId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
      { name: "💎 Rarity", value: `${rarityEmoji} ${getRarityName(relic.rarity)}`, inline: true },
      { name: "💪 Durability", value: `${relic.durabilityPct.toFixed(1)}%`, inline: true },
      { name: "⭐ Evolution", value: relic.evolutionStage, inline: true },
      { name: "✨ Experience", value: `${relic.xp.toLocaleString()} XP`, inline: true }
    );

  if (character) {
    embed.setDescription(`**${character.name}** • ${character.class} • ${character.element}\n⠀`);
    embed.addFields(
      { name: "🏛️ Pantheon", value: character.pantheon, inline: true },
      { name: "⠀", value: "⠀", inline: true },
      { name: "🔒 Status", value: relic.isLocked ? "🔒 Locked" : "✅ Available", inline: true },
      { name: "⚔️ Passive Ability", value: `**"${character.passive_ability_name}"**\n${character.passive_ability_desc}`, inline: false }
    );

    // Add character stats if available
    const stats = JSON.parse(relic.currentStats || "{}");
    if (stats.hp) {
      embed.addFields(
        { name: "⠀", value: "⠀", inline: false },
        {
          name: "📈 Combat Stats",
          value: `❤️ **HP:** ${stats.hp}\n⚔️ **ATK:** ${stats.atk}\n🛡️ **DEF:** ${stats.def}\n⚡ **SPD:** ${stats.spd}`,
          inline: true
        }
      );
    }
  }

  await interaction.editReply({ 
    embeds: [embed]
  });
}

// Show character database with search and pagination
async function showCharacterDatabase(interaction: ChatInputCommandInteraction | ButtonInteraction, searchTerm: string | null, page: number) {
  let characters;
  try {
    characters = require("../../data/allgodschars.json");
    console.log(`Loaded ${characters.length} characters from database`);
  } catch (error) {
    console.error("Error loading character database:", error);
    const embed = new EmbedBuilder()
      .setTitle("❌ Database Error")
      .setDescription(`Unable to load character database: ${(error as Error).message}`)
      .setColor(0xE74C3C);
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Filter by search term if provided
  let filteredCharacters = characters;
  if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    filteredCharacters = characters.filter((char: any) => 
      char.name.toLowerCase().includes(searchLower) ||
      char.pantheon.toLowerCase().includes(searchLower) ||
      char.class.toLowerCase().includes(searchLower) ||
      char.element.toLowerCase().includes(searchLower)
    );
  }

  // Sort by rarity (Legendary -> Common)
  const rarityOrder = { "legendary": 0, "epic": 1, "rare": 2, "uncommon": 3, "common": 4 };
  filteredCharacters.sort((a: any, b: any) => {
    const aRarity = rarityOrder[a.rarity.toLowerCase() as keyof typeof rarityOrder] ?? 5;
    const bRarity = rarityOrder[b.rarity.toLowerCase() as keyof typeof rarityOrder] ?? 5;
    return aRarity - bRarity;
  });

  const pageSize = 5;
  const totalCount = filteredCharacters.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const skip = (page - 1) * pageSize;
  const pageCharacters = filteredCharacters.slice(skip, skip + pageSize);

  if (pageCharacters.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("🔍 Character Database")
      .setDescription(searchTerm ? `No characters found matching "${searchTerm}"` : "No characters found")
      .setColor(0x95A5A6);
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Create character database embed
  const embed = new EmbedBuilder()
    .setTitle("📚 Character Database")
    .setDescription(searchTerm ? 
      `**Search:** "${searchTerm}" • **Page ${page} of ${totalPages}** • ${totalCount} results\n⠀` :
      `**Page ${page} of ${totalPages}** • ${totalCount} total characters\n⠀`
    )
    .setColor(0x3498DB)
    .setTimestamp();

  // Add character fields in vertical format with spacing
  pageCharacters.forEach((character: any, index: number) => {
    const rarityEmoji = getRarityEmoji(character.rarity);
    const rarityName = getRarityName(character.rarity);
    
    embed.addFields({
      name: `${rarityEmoji} **${character.name}**`,
      value: `${character.pantheon} • ${character.class} • ${character.element} • ${rarityName}`,
      inline: false
    });

    // Add spacing between characters (except after the last one)
    if (index < pageCharacters.length - 1) {
      embed.addFields({ name: "⠀", value: "⠀", inline: false });
    }
  });

  // Navigation buttons
  const components = [];
  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`lookup_page_${searchTerm || 'all'}_${page - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`lookup_page_${searchTerm || 'all'}_${page}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  if (page < totalPages) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`lookup_page_${searchTerm || 'all'}_${page + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (navigationRow.components.length > 0) {
    components.push(navigationRow);
  }

  await interaction.editReply({ 
    embeds: [embed],
    components 
  });
} 