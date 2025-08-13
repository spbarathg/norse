import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getPrisma } from "../lib/db.js";
import {
  getTradeOfferDetails,
  acceptTradeOffer,
  cancelTradeOffer,
  getUserTrades,
  cleanupExpiredTrades,
  createTradeOffer
} from "../engines/trade.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Trading System Functions

// In-memory trade builder state (per-user)
type TradeBuilderState = {
  relics: string[];
  gold: number;
  materials: Record<string, number>;
  targetUserId: string | null;
};
const userIdToTradeBuilderState = new Map<string, TradeBuilderState>();
function getBuilderState(userId: string): TradeBuilderState {
  if (!userIdToTradeBuilderState.has(userId)) {
    userIdToTradeBuilderState.set(userId, { relics: [], gold: 0, materials: {}, targetUserId: null });
  }
  return userIdToTradeBuilderState.get(userId)!;
}
function setBuilderState(userId: string, state: TradeBuilderState) {
  userIdToTradeBuilderState.set(userId, state);
}
function clearBuilderState(userId: string) {
  userIdToTradeBuilderState.delete(userId);
}

export async function handleTradeOffer(interaction: ChatInputCommandInteraction | ButtonInteraction, userId: string) {
  let targetUser = null;
  let message = null;
  
  if (interaction.isCommand?.()) {
    targetUser = interaction.options.getUser("player");
    message = interaction.options.getString("message");
  }
  
  // Initialize builder state in memory
  setBuilderState(userId, { relics: [], gold: 0, materials: {}, targetUserId: targetUser?.id || null });

  const embed = renderTradeBuilderEmbed({ you: { relics: [], gold: 0, materials: {} }, them: { relics: [], gold: 0, materials: {} } }, targetUser?.id || null);
  await interaction.editReply(embed);
}

export async function handleTradeList(interaction: ChatInputCommandInteraction | ButtonInteraction, userId: string, type: string) {
  await cleanupExpiredTrades();
  
  let trades;
  let title;
  let description;

  if (type === "open") {
    // Show open trades that others can accept
    const prisma = getPrisma();
    const openTrades = await prisma.tradeOffer.findMany({
      where: {
        status: "pending",
        offerType: "open",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    trades = await Promise.all(openTrades.map(trade => getTradeOfferDetails(trade.id)));
    title = "🌍 Open Trade Offers";
    description = "Trade offers anyone can accept:";
  } else {
    const tradeType = type === "all" ? "all" : type as "sent" | "received";
    trades = await getUserTrades(userId, tradeType);
    
    switch (type) {
      case "sent":
        title = "📤 Your Sent Trades";
        description = "Trade offers you've sent to others:";
        break;
      case "received":
        title = "📥 Your Received Trades";
        description = "Trade offers sent to you:";
        break;
      default:
        title = "📋 All Your Trades";
        description = "All your active trade offers:";
    }
  }

  if (trades.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription("No trades found.")
      .setColor(0x95A5A6)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x3498DB)
    .setTimestamp();

  trades.slice(0, 5).forEach((trade, index) => {
    const isInitiator = trade.initiatorUserId === userId;
    const otherUser = isInitiator ? trade.targetUserId : trade.initiatorUserId;
    const direction = isInitiator ? "→" : "←";
    
    const offerSummary = createTradeSummary(trade.offeredItems);
    const requestSummary = createTradeSummary(trade.requestedItems);
    
    embed.addFields({
      name: `${trade.offerType === "open" ? "🌍" : "🤝"} ${trade.id.slice(-6)} ${direction} ${otherUser ? `<@${otherUser}>` : "Open Trade"}`,
      value: `**Offering:** ${offerSummary}\n**Requesting:** ${requestSummary}\n**Expires:** <t:${Math.floor(trade.expiresAt.getTime() / 1000)}:R>`,
      inline: false
    });
  });

  if (trades.length > 5) {
    embed.setFooter({ text: `Showing 5 of ${trades.length} trades` });
  }

  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`trade_refresh_${type}`)
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('trade_offer_new')
        .setLabel('✨ New Trade')
        .setStyle(ButtonStyle.Primary)
    );

  await interaction.editReply({ 
    embeds: [embed], 
    components: [actionRow] 
  });
}

function renderTradeBuilderEmbed(
  state: { you: { relics: any[]; gold: number; materials: Record<string, number> }, them: { relics: any[]; gold: number; materials: Record<string, number> } },
  targetUserId: string | null
) {
  const embed = new EmbedBuilder()
    .setTitle(`🤝 Trade Offer — ${targetUserId ? `with <@${targetUserId}>` : "Open"}`)
    .setColor(0x8BA6FF)
    .addFields(
      { name: "Your Offer", value: `Relics: ${state.you.relics.length || "none"}\nGold: ${state.you.gold.toLocaleString()}\nMaterials: ${Object.keys(state.you.materials).length || "none"}` , inline: true },
      { name: "Counterparty's Offer", value: `Relics: ${state.them.relics.length || "—"}\nGold: ${state.them.gold ? state.them.gold.toLocaleString() : "—"}\nMaterials: ${Object.keys(state.them.materials).length || "—"}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Use the buttons below to build and send your offer" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tb_add_relic").setLabel("Add Relic").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tb_set_gold").setLabel("Set Gold").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tb_add_mats").setLabel("Add Materials").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tb_send_offer").setLabel("Send Offer").setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

export async function handleTradeBuilderComponent(interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction, userId: string) {
  const state = getBuilderState(userId);
  const customId = (interaction as any).customId;

  if (customId === "tb_add_relic") {
    // load user's relics and present a select menu
    const prisma = getPrisma();
    const owned = await prisma.relic.findMany({ where: { ownerUserId: userId }, take: 25 });
    const menu = new ActionRowBuilder<any>().addComponents(
      new (require("discord.js").StringSelectMenuBuilder)()
        .setCustomId("tb_select_relic")
        .setPlaceholder("Choose a relic to add")
        .addOptions(owned.map((r: any) => ({ label: `${r.id} (${r.rarity})`, value: r.id })))
    );
    await (interaction as ButtonInteraction).editReply({ components: [menu] });
    return;
  }

  if (customId === "tb_select_relic" && (interaction as StringSelectMenuInteraction).isStringSelectMenu?.()) {
    const selectedRelicId = (interaction as StringSelectMenuInteraction).values[0];
    state.relics = state.relics || [];
    if (!state.relics.includes(selectedRelicId)) state.relics.push(selectedRelicId);
    setBuilderState(userId, state);
    const payload = renderTradeBuilderEmbed({ you: { relics: state.relics.map((id: string) => ({ id })), gold: state.gold || 0, materials: state.materials || {} }, them: { relics: [], gold: 0, materials: {} } }, state.targetUserId || null);
    await (interaction as StringSelectMenuInteraction).update(payload);
    return;
  }

  if (customId === "tb_set_gold") {
    const modal = new (require("discord.js").ModalBuilder)()
      .setCustomId("tb_modal_gold")
      .setTitle("Set Gold Offer");
    const input = new (require("discord.js").TextInputBuilder)()
      .setCustomId("tb_gold_amount")
      .setLabel("Gold Amount")
      .setStyle(require("discord.js").TextInputStyle.Short)
      .setRequired(true);
    const row = new (require("discord.js").ActionRowBuilder)().addComponents(input);
    modal.addComponents(row as any);
    await (interaction as ButtonInteraction).showModal(modal);
    return;
  }

  if (customId === "tb_send_offer") {
    // Basic validation: at least one asset
    const hasAssets = (state.relics && state.relics.length > 0) || (state.gold && state.gold > 0) || (state.materials && Object.keys(state.materials).length > 0);
    if (!hasAssets) {
      await (interaction as ButtonInteraction).editReply({ content: "Add something to your offer first.", components: [] });
      return;
    }
    try {
      const offer = await createTradeOffer({
        initiatorUserId: userId,
        targetUserId: state.targetUserId || undefined,
        offerType: state.targetUserId ? "direct" : "open",
        offeredRelicIds: (state.relics || []) as string[],
        offeredGold: Number(state.gold || 0),
        offeredMaterials: (state.materials || {}) as Record<string, number>,
        requestedRelicIds: [],
        requestedGold: 0,
        requestedMaterials: {},
        message: undefined,
        expirationHours: 24,
      });
      clearBuilderState(userId);
      await (interaction as ButtonInteraction).editReply({ content: `✅ Offer sent (#${offer.id.slice(-6)}).`, components: [] });
    } catch (e: any) {
      await (interaction as ButtonInteraction).editReply({ content: `❌ Failed to create offer: ${e.message}`, components: [] });
    }
    return;
  }
}

export async function handleTradeBuilderModal(interaction: any) {
  if (interaction.customId === "tb_modal_gold") {
    const userId = interaction.user.id;
    const state = getBuilderState(userId);
    const amountStr = interaction.fields.getTextInputValue("tb_gold_amount");
    const amount = Math.max(0, parseInt(amountStr || "0", 10) || 0);
    state.gold = amount;
    setBuilderState(userId, state);
    await interaction.reply(renderTradeBuilderEmbed({ you: { relics: state.relics || [], gold: state.gold || 0, materials: state.materials || {} }, them: { relics: [], gold: 0, materials: {} } }, state.targetUserId || null));
  }
}

export async function handleTradeView(interaction: ChatInputCommandInteraction | ButtonInteraction, tradeId: string, userId: string) {
  try {
    const trade = await getTradeOfferDetails(tradeId);
    
    const isInitiator = trade.initiatorUserId === userId;
    const isTarget = trade.targetUserId === userId;
    const canAccept = !isInitiator && (trade.targetUserId === userId || trade.offerType === "open");
    
    const embed = new EmbedBuilder()
      .setTitle(`🤝 Trade Offer #${trade.id.slice(-6)}`)
      .setDescription(
        `**From:** <@${trade.initiatorUserId}>\n` +
        `**To:** ${trade.targetUserId ? `<@${trade.targetUserId}>` : "🌍 Open Trade"}\n` +
        `**Status:** ${getStatusEmoji(trade.status)} ${trade.status.toUpperCase()}\n` +
        `**Type:** ${trade.offerType}\n` +
        `**Created:** <t:${Math.floor(trade.createdAt.getTime() / 1000)}:R>\n` +
        `**Expires:** <t:${Math.floor(trade.expiresAt.getTime() / 1000)}:R>`
      )
      .setColor(getTradeColor(trade.status))
      .setTimestamp();

    // Add offered items
    const offerSummary = createDetailedTradeSummary(trade.offeredItems);
    if (offerSummary) {
      embed.addFields({ name: "📦 Offering", value: offerSummary, inline: true });
    }

    // Add requested items
    const requestSummary = createDetailedTradeSummary(trade.requestedItems);
    if (requestSummary) {
      embed.addFields({ name: "🎯 Requesting", value: requestSummary, inline: true });
    }

    // Add message if present
    if (trade.message) {
      embed.addFields({ name: "💬 Message", value: trade.message, inline: false });
    }

    // Create action buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>();

    if (canAccept && trade.status === "pending") {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`trade_accept_${trade.id}`)
          .setLabel('✅ Accept Trade')
          .setStyle(ButtonStyle.Success)
      );
    }

    if ((isInitiator || isTarget) && trade.status === "pending") {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`trade_cancel_${trade.id}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (!isInitiator && trade.status === "pending") {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`trade_counter_${trade.id}`)
          .setLabel('🔄 Counter Offer')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('trade_list_all')
        .setLabel('📋 Back to List')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ 
      embeds: [embed], 
      components: actionRow.components.length > 0 ? [actionRow] : [] 
    });
    
  } catch (error: any) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Trade Not Found")
      .setDescription(`Trade offer \`${tradeId}\` was not found or has expired.`)
      .setColor(0xE74C3C);

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

export async function handleTradeAccept(interaction: ChatInputCommandInteraction | ButtonInteraction, tradeId: string, userId: string) {
  try {
    await acceptTradeOffer(tradeId, userId);
    
    const embed = new EmbedBuilder()
      .setTitle("✅ Trade Completed!")
      .setDescription(`Successfully completed trade \`${tradeId.slice(-6)}\`\n\nItems have been transferred to both parties.`)
      .setColor(0x2ECC71)
      .setTimestamp();

    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('view_collection')
          .setLabel('📚 View Collection')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('trade_list_all')
          .setLabel('📋 My Trades')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({ 
      embeds: [embed], 
      components: [actionRow] 
    });
    
  } catch (error: any) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Trade Failed")
      .setDescription(`Failed to accept trade: ${error.message}`)
      .setColor(0xE74C3C);

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

export async function handleTradeCancel(interaction: ChatInputCommandInteraction | ButtonInteraction, tradeId: string, userId: string) {
  try {
    await cancelTradeOffer(tradeId, userId);
    
    const embed = new EmbedBuilder()
      .setTitle("❌ Trade Cancelled")
      .setDescription(`Trade offer \`${tradeId.slice(-6)}\` has been cancelled.`)
      .setColor(0xF39C12)
      .setTimestamp();

    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('trade_list_all')
          .setLabel('📋 My Trades')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('trade_offer_new')
          .setLabel('✨ New Trade')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.editReply({ 
      embeds: [embed], 
      components: [actionRow] 
    });
    
  } catch (error: any) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Cancel Failed")
      .setDescription(`Failed to cancel trade: ${error.message}`)
      .setColor(0xE74C3C);

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

export async function handleTradeHistory(interaction: ChatInputCommandInteraction | ButtonInteraction, userId: string, page: number) {
  const prisma = getPrisma();
  
  const pageSize = 10;
  const skip = (page - 1) * pageSize;
  
  const history = await prisma.tradeHistory.findMany({
    where: {
      OR: [
        { user1Id: userId },
        { user2Id: userId },
      ],
    },
    orderBy: { completedAt: "desc" },
    skip,
    take: pageSize,
  });

  if (history.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("📜 Trade History")
      .setDescription("No completed trades found.")
      .setColor(0x95A5A6);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📜 Trade History")
    .setDescription(`Your completed trades (Page ${page}):`)
    .setColor(0x9B59B6)
    .setTimestamp();

  history.forEach((trade, index) => {
    const isUser1 = trade.user1Id === userId;
    const otherUser = isUser1 ? trade.user2Id : trade.user1Id;
    const userGave = JSON.parse(isUser1 ? trade.user1Gave : trade.user2Gave);
    const userReceived = JSON.parse(isUser1 ? trade.user2Gave : trade.user1Gave);
    
    const gaveSummary = createTradeSummary(userGave);
    const receivedSummary = createTradeSummary(userReceived);
    
    embed.addFields({
      name: `🤝 Trade with <@${otherUser}>`,
      value: `**Gave:** ${gaveSummary}\n**Received:** ${receivedSummary}\n**Date:** <t:${Math.floor(trade.completedAt.getTime() / 1000)}:R>`,
      inline: false
    });
  });

  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`trade_history_${page - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_history_${page}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  if (history.length === pageSize) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`trade_history_${page + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  await interaction.editReply({ 
    embeds: [embed], 
    components: [navigationRow] 
  });
}

export async function handleBrowseTrades(interaction: ChatInputCommandInteraction | ButtonInteraction, page: number) {
  await cleanupExpiredTrades();
  
  const prisma = getPrisma();
  const pageSize = 10;
  const skip = (page - 1) * pageSize;
  
  const openTrades = await prisma.tradeOffer.findMany({
    where: {
      status: "pending",
      offerType: "open",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    skip,
    take: pageSize,
  });

  if (openTrades.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("🌍 Open Trade Offers")
      .setDescription("No open trades available at the moment.")
      .setColor(0x95A5A6);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🌍 Open Trade Offers")
    .setDescription(`Browse available trades (Page ${page}):`)
    .setColor(0x3498DB)
    .setTimestamp();

  const trades = await Promise.all(openTrades.map(trade => getTradeOfferDetails(trade.id)));

  trades.forEach((trade, index) => {
    const offerSummary = createTradeSummary(trade.offeredItems);
    const requestSummary = createTradeSummary(trade.requestedItems);
    
    embed.addFields({
      name: `🌍 #${trade.id.slice(-6)} by <@${trade.initiatorUserId}>`,
      value: `**Offering:** ${offerSummary}\n**Requesting:** ${requestSummary}\n**Expires:** <t:${Math.floor(trade.expiresAt.getTime() / 1000)}:R>`,
      inline: false
    });
  });

  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`browse_trades_${page - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`browse_trades_${page}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  if (openTrades.length === pageSize) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`browse_trades_${page + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  await interaction.editReply({ 
    embeds: [embed], 
    components: [navigationRow] 
  });
}

export async function handleBrowseMarket(interaction: ChatInputCommandInteraction | ButtonInteraction, page: number, rarity: string | null) {
  const prisma = getPrisma();
  const pageSize = 10;
  const skip = (page - 1) * pageSize;
  
  const where: any = { status: "active" };
  if (rarity) where.rarity = rarity;

  const listings = await prisma.marketListing.findMany({
    where,
    orderBy: { createdTs: "desc" },
    skip,
    take: pageSize,
  });

  if (listings.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("🏪 Marketplace")
      .setDescription("No marketplace listings found.")
      .setColor(0x95A5A6);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🏪 Marketplace")
    .setDescription(`Browse marketplace listings${rarity ? ` (${rarity} rarity)` : ""} (Page ${page}):`)
    .setColor(0xF39C12)
    .setTimestamp();

  for (const listing of listings) {
    const relic = await prisma.relic.findUnique({ where: { id: listing.relicId } });
    if (!relic) continue;
    
    embed.addFields({
      name: `💰 ${listing.id.slice(-6)} - ${listing.priceGold.toLocaleString()} gold`,
      value: `**Relic:** \`${relic.id}\` (${relic.rarity})\n**Seller:** <@${listing.sellerUserId}>\n**Listed:** <t:${Math.floor(listing.createdTs.getTime() / 1000)}:R>`,
      inline: false
    });
  }

  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`browse_market_${rarity || 'all'}_${page - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`browse_market_${rarity || 'all'}_${page}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  if (listings.length === pageSize) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`browse_market_${rarity || 'all'}_${page + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  await interaction.editReply({ 
    embeds: [embed], 
    components: [navigationRow] 
  });
}

// Helper functions for trade display
function createTradeSummary(items: any): string {
  const parts = [];
  
  if (items.relics && items.relics.length > 0) {
    parts.push(`${items.relics.length} relic${items.relics.length > 1 ? 's' : ''}`);
  }
  
  if (items.gold > 0) {
    parts.push(`${items.gold.toLocaleString()} gold`);
  }
  
  if (items.materials && Object.keys(items.materials).length > 0) {
    const materialCount = Object.values(items.materials).reduce((sum: number, val: any) => sum + val, 0);
    parts.push(`${materialCount} materials`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'Nothing';
}

function createDetailedTradeSummary(items: any): string {
  const parts = [];
  
  if (items.relics && items.relics.length > 0) {
    const relicList = items.relics.map((relic: any) => `\`${relic.id}\` (${relic.rarity})`).join('\n');
    parts.push(`**Relics:**\n${relicList}`);
  }
  
  if (items.gold > 0) {
    parts.push(`**Gold:** ${items.gold.toLocaleString()}`);
  }
  
  if (items.materials && Object.keys(items.materials).length > 0) {
    const materialList = Object.entries(items.materials)
      .map(([name, amount]) => `${name}: ${amount}`)
      .join('\n');
    parts.push(`**Materials:**\n${materialList}`);
  }
  
  return parts.join('\n\n') || 'Nothing';
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'accepted': return '✅';
    case 'completed': return '✅';
    case 'cancelled': return '❌';
    case 'expired': return '⏰';
    default: return '❓';
  }
}

function getTradeColor(status: string): number {
  switch (status) {
    case 'pending': return 0xF39C12;
    case 'accepted': return 0x2ECC71;
    case 'completed': return 0x2ECC71;
    case 'cancelled': return 0xE74C3C;
    case 'expired': return 0x95A5A6;
    default: return 0x3498DB;
  }
}

export async function showTradeWithRelicMenu(interaction: ChatInputCommandInteraction | ButtonInteraction, userId: string, relicId: string) {
  const prisma = getPrisma();
  
  // Get the relic details
  const relic = await prisma.relic.findUnique({ where: { id: relicId } });
  if (!relic || relic.ownerUserId !== userId) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Relic Not Found")
      .setDescription("This relic doesn't exist or you don't own it.")
      .setColor(0xE74C3C);
    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  // Get character data for display
  let character;
  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const characters = require("../../data/allgodschars.json");
    character = characters.find((c: any) => c.id === relic.characterId);
  } catch {
    character = null;
  }

  // Initialize builder with this relic and show builder UI
  const state = getBuilderState(userId);
  state.relics = Array.from(new Set([...(state.relics || []), relicId]));
  setBuilderState(userId, state);

  const payload = renderTradeBuilderEmbed(
    { you: { relics: state.relics.map((id: string) => ({ id })), gold: state.gold || 0, materials: state.materials || {} }, them: { relics: [], gold: 0, materials: {} } },
    state.targetUserId || null
  );
  await interaction.editReply(payload);
}
