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
  ModalSubmitInteraction,
  AutocompleteInteraction,
  Colors
} from "discord.js";
import path from "path";
import fs from "fs";
import { AttachmentBuilder } from "discord.js";
import { performDrop, performGacha } from "../engines/drop.js";
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
import { checkAndNotifyAchievements, getUserAchievements } from "../engines/achievements.js";
import { getLeaderboardsEmbed } from "../engines/leaderboard.js";
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
const emojiMap = require("../config/emoji_map.json");

// Enhanced autocomplete handler for modern Discord features
export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  try {
    const { commandName, options } = interaction;
    const focusedOption = options.getFocused(true);
    const prisma = getPrisma();
    const characters = require("../../data/allgodschars.json");
    
    let choices: { name: string; value: string }[] = [];

    // Character name autocomplete
    if (focusedOption.name === 'character' || focusedOption.name === 'name') {
      const filtered = characters
        .filter((char: any) => 
          char.name.toLowerCase().includes(focusedOption.value.toLowerCase())
        )
        .slice(0, 25)
        .map((char: any) => ({
          name: `${emojiMap[char.slug] || '⭐'} ${char.name} (${char.rarity}-Tier ${char.pantheon})`,
          value: char.name
        }));
      choices = filtered;
    }

    // Relic ID autocomplete (fetch all user's relics, sort by rarity, filter by query)
    if (focusedOption.name === 'relic' || focusedOption.name === 'relic_id' || focusedOption.name === 'relic_ids') {
      try {
        const userId = interaction.user.id;
        const query = String(focusedOption.value || '').toLowerCase();
        const rarityRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

        const relics = await prisma.relic.findMany({
          where: { ownerUserId: userId },
          select: { id: true, rarity: true, characterId: true, birthRealTs: true }
        });

        const enriched = relics.map((relic: any) => {
          const char = characters.find((c: any) => c.id === relic.characterId);
          return { relic, char };
        });

        const filtered = enriched.filter(({ relic, char }) => {
          if (!query) return true;
          return relic.id.toLowerCase().includes(query) || (char?.name?.toLowerCase()?.includes(query) ?? false);
        });

        filtered.sort((a, b) => {
          const ar = rarityRank[a.relic.rarity] ?? 9;
          const br = rarityRank[b.relic.rarity] ?? 9;
          if (ar !== br) return ar - br; // rarer first
          const at = new Date(a.relic.birthRealTs).getTime();
          const bt = new Date(b.relic.birthRealTs).getTime();
          return bt - at; // newer first within same rarity
        });

        choices = filtered.slice(0, 25).map(({ relic, char }) => {
          const emoji = char ? (emojiMap[char.slug] || '⭐') : '⭐';
          const labelName = char?.name || 'Unknown';
          return {
            name: `${emoji} ${labelName} (${relic.rarity}) - ${relic.id}`,
            value: relic.id
          };
        });
      } catch (error) {
        console.error('Autocomplete error:', error);
      }
    }

    // Gauntlet autocomplete
    if (focusedOption.name === 'gauntlet') {
      try {
        const gauntlets = require("../config/gauntlets.json");
        choices = gauntlets
          .filter((g: any) => 
            g.name.toLowerCase().includes(focusedOption.value.toLowerCase())
          )
          .slice(0, 25)
          .map((g: any) => ({
            name: `${g.name} (Difficulty: ${g.difficulty})`,
            value: g.id
          }));
      } catch (error) {
        console.error('Gauntlet autocomplete error:', error);
      }
    }

    await interaction.respond(choices);
  } catch (error) {
    console.error('Autocomplete handler error:', error);
    await interaction.respond([]);
  }
}

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("pull")
    .setDescription("🎴 Pull a card; duplicates convert to Mythic Essence")
    .addStringOption(option => 
      option.setName("era")
        .setDescription("🏛️ Choose which pantheon to summon from")
        .setRequired(false)
        .addChoices(
          { name: "🌍 All Pantheons", value: "all" },
          { name: "🏛️ Greco-Roman Gods", value: "greco-roman" },
          { name: "⚡ Norse Gods", value: "norse" }
        )
    )
    .addBooleanOption(option =>
      option.setName("private")
        .setDescription("🔒 Make this response visible only to you")
        .setRequired(false)
    ),
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
    )
    .addSubcommand((s) =>
      s
        .setName("browse")
        .setDescription("Browse marketplace listings")
        .addIntegerOption((o) => o.setName("page").setDescription("Page number").setRequired(false))
    ),
  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your relics")
    .addIntegerOption((o) => o.setName("page").setDescription("Page").setRequired(false))
    .addStringOption((o) =>
      o
        .setName("sort")
        .setDescription("Sorting")
        .setRequired(false)
        .addChoices(
          { name: "Rarest → Common", value: "rarity_desc" },
          { name: "Common → Rarest", value: "rarity_asc" },
          { name: "Newest", value: "newest" },
          { name: "Oldest", value: "oldest" },
          { name: "Highest XP", value: "xp_desc" },
          { name: "Highest Durability", value: "durability_desc" },
          { name: "Name A→Z", value: "name_asc" },
          { name: "Best (Battle)", value: "best" },
          { name: "Worst (Battle)", value: "worst" }
        )
    ),
  // Removed old collection alias; inventory is the single entry point
  // Removed separate view/balance; use /relic view and /profile
  new SlashCommandBuilder().setName("daily").setDescription("Claim your daily reward"),
  // Removed separate inspect; handled via /profile
  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Browse all available characters in the database")
    .addStringOption((o) => o.setName("search").setDescription("Search for a specific character by name").setRequired(false))
    .addIntegerOption((o) => o.setName("page").setDescription("Page number").setRequired(false)),
  new SlashCommandBuilder()
    .setName("relic")
    .setDescription("Relic management")
    .addSubcommand(s => s
      .setName("view")
      .setDescription("View a relic")
      .addStringOption(o => o.setName("relic_id").setDescription("Relic ID").setRequired(true))
    )
    .addSubcommand(s => s
      .setName("upgrade")
      .setDescription("Spend Mythic Essence to level up a relic")
      .addStringOption(o => o.setName("relic_id").setDescription("Relic ID").setRequired(true))
    )
    .addSubcommand(s => s
      .setName("customize")
      .setDescription("Unlock or apply an alternate art style")
      .addStringOption(o => o.setName("relic_id").setDescription("Relic ID").setRequired(true))
      .addStringOption(o => o.setName("style").setDescription("Art style id").setRequired(true))
    ),
  // Removed nexus hub to reduce command surface
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show a player profile and collection")
    .addUserOption((o) => o.setName("player").setDescription("Player to view").setRequired(false))
    .addIntegerOption((o) => o.setName("page").setDescription("Collection page").setRequired(false)),
  new SlashCommandBuilder()
    .setName("shrine")
    .setDescription("🏛️ Manage your sacred team shrine and battle formations")
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("👁️ View your current shrine configuration")
        .addBooleanOption(option =>
          option.setName("private")
            .setDescription("🔒 Make this response visible only to you")
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("setup")
        .setDescription("⚙️ Interactive shrine setup wizard")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription("📍 Place a character in a specific shrine position")
        .addStringOption(option => 
          option.setName("position")
            .setDescription("🎯 Choose formation position")
            .setRequired(true)
            .addChoices(
              { name: "🗡️ Front Left (Tank)", value: "FL" },
              { name: "⚔️ Front Right (DPS)", value: "FR" },
              { name: "🛡️ Back Left (Support)", value: "BL" },
              { name: "🏹 Back Right (Range)", value: "BR" }
            )
        )
        .addStringOption(option => 
          option.setName("relic")
            .setDescription("🎭 Relic ID to place (use autocomplete)")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("align")
        .setDescription("⚖️ Set your pantheon alignment for team bonuses")
        .addStringOption(option => 
          option.setName("pantheon")
            .setDescription("🏛️ Choose your divine alignment")
            .setRequired(true)
            .addChoices(
              { name: "⚡ Norse (+10% HP, +5% DEF)", value: "Norse" },
              { name: "🏛️ Greco-Roman (+10% ATK, +5% SPD)", value: "Greco-Roman" }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("effigy")
        .setDescription("🏺 Equip powerful effigies for specialized team bonuses")
        .addStringOption(option => 
          option.setName("effigy_id")
            .setDescription("🏺 Choose your effigy")
            .setRequired(true)
            .addChoices(
              { name: "⚔️ Warrior's Effigy (+12% ATK to Warriors)", value: "warriors_effigy" },
              { name: "🧙‍♂️ Mage's Effigy (+12% ATK to Mages)", value: "mages_effigy" },
              { name: "🛡️ Guardian's Effigy (+12% DEF to Guardians)", value: "guardians_effigy" },
              { name: "🗡️ Rogue's Effigy (+12% SPD to Rogues)", value: "rogues_effigy" },
              { name: "🔥 Fire Effigy (+10% ATK to Fire)", value: "fire_effigy" },
              { name: "❄️ Ice Effigy (+10% DEF to Ice)", value: "ice_effigy" },
              { name: "💧 Water Effigy (+10% HP to Water)", value: "water_effigy" },
              { name: "☀️ Light Effigy (+10% SPD to Light)", value: "light_effigy" },
              { name: "🌑 Dark Effigy (+10% ATK to Dark)", value: "dark_effigy" },
              { name: "🌿 Nature Effigy (+10% HP to Nature)", value: "nature_effigy" }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("clear")
        .setDescription("🧹 Remove a character from shrine position")
        .addStringOption(option => 
          option.setName("position")
            .setDescription("📍 Position to clear")
            .setRequired(true)
            .addChoices(
              { name: "🗡️ Front Left", value: "FL" },
              { name: "⚔️ Front Right", value: "FR" },
              { name: "🛡️ Back Left", value: "BL" },
              { name: "🏹 Back Right", value: "BR" },
              { name: "🧹 Clear All Positions", value: "ALL" }
            )
        )
    ),
  new SlashCommandBuilder()
    .setName("gauntlet")
    .setDescription("🏁 Face challenging gauntlet scenarios with unique hazards")
    .addSubcommand(subcommand =>
      subcommand
        .setName("browse")
        .setDescription("🗺️ Explore available gauntlet challenges")
        .addBooleanOption(option =>
          option.setName("private")
            .setDescription("🔒 Make this response visible only to you")
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("🚀 Begin an epic gauntlet challenge")
        .addStringOption(option =>
          option.setName("gauntlet")
            .setDescription("🏁 Choose your challenge")
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addIntegerOption(option => 
          option.setName("difficulty")
            .setDescription("🎯 Challenge intensity")
            .setRequired(false)
            .addChoices(
              { name: "😊 Novice (Level 1)", value: 1 },
              { name: "🙂 Apprentice (Level 2)", value: 2 },
              { name: "😐 Veteran (Level 3)", value: 3 },
              { name: "😤 Expert (Level 4)", value: 4 },
              { name: "😈 Legendary (Level 5)", value: 5 }
            )
        )
        .addBooleanOption(option =>
          option.setName("detailed")
            .setDescription("📊 Show detailed challenge information")
            .setRequired(false)
        )
    ),
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
    if (interaction.commandName === "pull") {
      const era = interaction.options.getString("era") || "all";
      const isPrivate = interaction.options.getBoolean("private") ?? false;
      await interaction.deferReply({ ephemeral: isPrivate });

      // Use unified gacha path with reveal to ensure duplicate conversion
      const baseUrl = process.env.CDN_BASE_URL || "http://localhost:3000/cdn";
      const backUrl = `${baseUrl}/portraits/odin.png`;
      const back = new EmbedBuilder().setTitle("🎴 Summoning...").setDescription("Revealing your card...").setImage(backUrl).setColor(0x2c3e50);
      await interaction.editReply({ embeds: [back] });
      await new Promise((r) => setTimeout(r, 1500));

      const result = await performGacha({ userId, era });

      const embed = new EmbedBuilder()
        .setTitle(result.embed.title)
        .setDescription(result.embed.description)
        .setColor(getRarityColor(result.rarity))
        .setTimestamp();
      if ((result.embed as any).fields) embed.addFields((result.embed as any).fields as any);
      if ((result.embed as any).image) embed.setImage((result.embed as any).image.url);

      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder().setCustomId('drop_another').setLabel('🎲 Pull Again').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('view_collection').setLabel('📚 My Collection').setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [actionRow] });
      try { await checkAndNotifyAchievements(interaction, userId); } catch {}
      return;
    }

    // Legacy alias path removed to reduce confusion

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
            const buyer = await tx.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
            if (buyer.gold < listing.priceGold) throw new Error("Insufficient gold");
            const seller = await tx.user.upsert({ where: { userId: listing.sellerUserId }, create: { userId: listing.sellerUserId, discordId: listing.sellerUserId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
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
      if (sub === "browse") {
        await interaction.deferReply();
        const page = interaction.options.getInteger("page") || 1;
        await handleBrowseMarket(interaction, page, null);
        return;
      }
    }

    if (interaction.commandName === "inventory") {
      await interaction.deferReply(); // PUBLIC - show your collection
      const page = interaction.options.getInteger("page") || 1;
      const sort = interaction.options.getString("sort") || "rarity_desc";
      await showCollectionPage(interaction, userId, page, { search: "", sort });
      return;
    }

    // Removed top-level view; use /relic view

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

    // Inspect removed; handled by /profile

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
        const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
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

    if (interaction.commandName === "relic") {
      const sub = interaction.options.getSubcommand();
      if (sub === 'upgrade') {
      await interaction.deferReply();
      const relicId = interaction.options.getString("relic_id", true);
      const prisma = getPrisma();
      const relic = await prisma.relic.findUnique({ where: { id: relicId } });
      if (!relic || relic.ownerUserId !== userId) {
        await interaction.editReply("You don't own this relic or it doesn't exist.");
        return;
      }

      const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
      const currencies = JSON.parse((user as any).currencies || '{}');
      const currentEssence = Number(currencies.mythic_essence || 0);

      const meta = relic.metadata ? JSON.parse(relic.metadata) : {};
      const level = Number(meta.level || 1);
      const maxLevel = Number(process.env.CARD_MAX_LEVEL || 10);
      if (level >= maxLevel) {
        await interaction.editReply(`This relic is already at max level (${maxLevel}).`);
        return;
      }
      // Cost scaling: 25 * nextLevel^2
      const nextLevel = level + 1;
      const costEssence = 25 * nextLevel * nextLevel;
      if (currentEssence < costEssence) {
        const embed = new EmbedBuilder().setTitle("🔒 Not enough Mythic Essence").setDescription(`Requires ${costEssence} Essence.`).setColor(0xE74C3C);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const baseStats = JSON.parse(relic.currentStats || '{}');
      const inc = { hp: 5, atk: 3, def: 2, spd: 0 };
      const newStats = {
        hp: Number(baseStats.hp || 0) + inc.hp,
        atk: Number(baseStats.atk || 0) + inc.atk,
        def: Number(baseStats.def || 0) + inc.def,
        spd: Number(baseStats.spd || 0) + inc.spd,
      };
      const newMeta = { ...meta, level: nextLevel };

      await prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { userId } });
        const cur = JSON.parse((u as any).currencies || '{}');
        cur.mythic_essence = Number(cur.mythic_essence || 0) - costEssence;
        await tx.user.update({ where: { userId }, data: { currencies: JSON.stringify(cur) } });
        await tx.relic.update({ where: { id: relicId }, data: { currentStats: JSON.stringify(newStats), metadata: JSON.stringify(newMeta) } });
      });

      const embed = new EmbedBuilder()
        .setTitle("⬆️ Card Upgraded!")
        .setDescription(`Relic \`${relicId}\` is now Level ${nextLevel}`)
        .addFields(
          { name: "Cost", value: `-${costEssence} Mythic Essence`, inline: true },
          { name: "New Stats", value: `HP ${newStats.hp}, ATK ${newStats.atk}, DEF ${newStats.def}, SPD ${newStats.spd}`, inline: true },
        )
        .setColor(0x2ECC71)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
      }
      if (sub === 'view') {
        await interaction.deferReply();
        const relicId = interaction.options.getString('relic_id', true);
        await showGlobalRelicDetails(interaction, relicId);
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
      const targetUser = interaction.options.getUser("player") || interaction.user;
      const { embed, components } = await buildUserProfileEmbed(targetUser.id, interaction);
      // Only show profile initially; collection appears on button click
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      await interaction.deferReply();
      const embedAndComponents = await getLeaderboardsEmbed({ scope: "weekly", board: "richest" }, userId);
      await interaction.editReply(embedAndComponents);
      return;
    }


    if (interaction.commandName === "relic") {
      const sub = interaction.options.getSubcommand();
      if (sub !== 'customize') { /* handled above */ } else {
      await interaction.deferReply();
      const relicId = interaction.options.getString("relic_id", true);
      const style = interaction.options.getString("style", true);
      const prisma = getPrisma();
      const relic = await prisma.relic.findUnique({ where: { id: relicId } });
      if (!relic || relic.ownerUserId !== userId) {
        await interaction.editReply("You don't own this relic or it doesn't exist.");
        return;
      }
      // Load character and available styles from data; if not present, allow any string id
      const characters = require("../../data/allgodschars.json");
      const character = characters.find((c: any) => c.id === relic.characterId) || {};
      const availableStyles: string[] = Array.isArray(character.art_styles) ? character.art_styles : ["default"];
      if (!availableStyles.includes(style)) {
        await interaction.editReply(`Style not available for this character. Available: ${availableStyles.join(', ')}`);
        return;
      }

      // Unlock cost if not unlocked yet
      const meta = relic.metadata ? JSON.parse(relic.metadata) : { level: 1 };
      const unlocked: string[] = Array.isArray(meta.unlockedStyles) ? meta.unlockedStyles : ["default"];
      const isUnlocked = unlocked.includes(style);
      const unlockCost = Number(process.env.STYLE_UNLOCK_ESSENCE || 100);

      if (!isUnlocked) {
        const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
        const currencies = JSON.parse((user as any).currencies || '{}');
        const essence = Number(currencies.mythic_essence || 0);
        if (essence < unlockCost) {
          await interaction.editReply(`Not enough Mythic Essence to unlock. Requires ${unlockCost}.`);
          return;
        }
        await prisma.$transaction(async (tx) => {
          const u = await tx.user.findUnique({ where: { userId } });
          const cur = JSON.parse((u as any).currencies || '{}');
          cur.mythic_essence = Number(cur.mythic_essence || 0) - unlockCost;
          await tx.user.update({ where: { userId }, data: { currencies: JSON.stringify(cur) } });
          const m = relic.metadata ? JSON.parse(relic.metadata) : { level: 1 };
          const un = Array.isArray(m.unlockedStyles) ? m.unlockedStyles : ["default"];
          if (!un.includes(style)) un.push(style);
          m.unlockedStyles = un;
          m.activeArtStyle = style;
          await tx.relic.update({ where: { id: relicId }, data: { metadata: JSON.stringify(m) } });
        });
        await interaction.editReply(`Unlocked and applied style '${style}' to relic ${relicId}.`);
        return;
      }

      // Already unlocked: just apply
      meta.activeArtStyle = style;
      await prisma.relic.update({ where: { id: relicId }, data: { metadata: JSON.stringify(meta) } });
      await interaction.editReply(`Applied style '${style}' to relic ${relicId}.`);
      return;
      }
    }

    if (interaction.commandName === "shrine") {
      const sub = interaction.options.getSubcommand();
      const { 
        handleShrineView, 
        handleShrineSet, 
        handleShrineAlignment, 
        handleShrineEffigy, 
        handleShrineSetup,
        handleShrineClear 
      } = await import("./shrineHandlers.js");
      if (sub === 'view') return void (await handleShrineView(interaction));
      if (sub === 'setup') return void (await handleShrineSetup(interaction));
      if (sub === 'set') return void (await handleShrineSet(interaction));
      if (sub === 'align') return void (await handleShrineAlignment(interaction));
      if (sub === 'effigy') return void (await handleShrineEffigy(interaction));
      if (sub === 'clear') return void (await handleShrineClear(interaction));
      return;
    }

    if (interaction.commandName === "gauntlet") {
      const sub = interaction.options.getSubcommand();
      const { handleGauntletBrowse, handleGauntletStart } = await import("./gauntletHandlers.js");
      if (sub === 'browse') return void (await handleGauntletBrowse(interaction));
      if (sub === 'start') return void (await handleGauntletStart(interaction));
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
type CollectionView = { search: string; sort: string };

async function showCollectionPage(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  userId: string,
  page: number,
  view: CollectionView = { search: "", sort: "rarity_desc" }
) {
  const prisma = getPrisma();
  const pageSize = 4;
  const skip = (page - 1) * pageSize;
  const characters = require("../../data/allgodschars.json");

  const allRelics = await prisma.relic.findMany({ where: { ownerUserId: userId } });

  const enriched = allRelics.map((r: any) => ({
    relic: r,
    char: characters.find((c: any) => c.id === r.characterId)
  }));

  const searchLower = (view.search || "").toLowerCase();
  const filtered = enriched.filter(({ relic, char }) => {
    if (!searchLower) return true;
    return relic.id.toLowerCase().includes(searchLower) || (char?.name?.toLowerCase()?.includes(searchLower) ?? false);
  });

  const rarityRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

  // Battle score heuristic for best/worst sorting
  const battleScore = (r: any, ch: any) => {
    const stats = JSON.parse(r.currentStats || "{}");
    const hp = Number(stats.hp || ch?.hp || 0);
    const atk = Number(stats.atk || ch?.atk || 0);
    const def = Number(stats.def || ch?.def || 0);
    const spd = Number(stats.spd || ch?.spd || 0);
    const rarityMultMap: Record<string, number> = { S: 1.3, A: 1.15, B: 1.0, C: 0.9 };
    const rarityMult = rarityMultMap[r.rarity as keyof typeof rarityMultMap] ?? 1.0;
    const dur = Number(r.durabilityPct || 0) / 100;
    return Math.round(((hp * 0.35 + atk * 0.4 + def * 0.2 + spd * 0.05) * rarityMult) * (0.7 + 0.3 * dur) + r.xp * 0.2);
  };

  filtered.sort((a, b) => {
    const va = a.relic; const vb = b.relic; const ca = a.char; const cb = b.char;
    switch (view.sort) {
      case "rarity_asc":
        // Common → Rarest: higher rank number first (C=3 ... S=0)
        return (rarityRank[vb.rarity] ?? 9) - (rarityRank[va.rarity] ?? 9);
      case "rarity_desc":
        return (rarityRank[va.rarity] ?? 9) - (rarityRank[vb.rarity] ?? 9);
      case "oldest":
        return new Date(va.birthRealTs).getTime() - new Date(vb.birthRealTs).getTime();
      case "newest":
        return new Date(vb.birthRealTs).getTime() - new Date(va.birthRealTs).getTime();
      case "xp_desc":
        return vb.xp - va.xp;
      case "durability_desc":
        return vb.durabilityPct - va.durabilityPct;
      case "name_asc":
        return String(ca?.name || va.id).localeCompare(String(cb?.name || vb.id));
      case "best":
        return battleScore(vb, cb) - battleScore(va, ca);
      case "worst":
        return battleScore(va, ca) - battleScore(vb, cb);
      default:
        // Default to rarity_desc, then newest within the same rarity
        return ((rarityRank[va.rarity] ?? 9) - (rarityRank[vb.rarity] ?? 9)) || (new Date(vb.birthRealTs).getTime() - new Date(va.birthRealTs).getTime());
    }
  });

  const totalCount = filtered.length;
  const pageItems = filtered.slice(skip, skip + pageSize);

  const totalPages = Math.ceil(totalCount / pageSize);

  if (pageItems.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("📚 Your Relic Collection")
      .setDescription(view.search ? `No relics found for "${view.search}"` : "No relics found. Use `/drop` to summon your first relic!")
      .setColor(0x95A5A6);
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Create collection embed
  const embed = new EmbedBuilder()
    .setTitle(`📚 Your Relic Collection`)
    .setDescription(`**Page ${page} of ${totalPages}** • Showing ${pageItems.length} of ${totalCount} relics\n⠀`)
    .setColor(0x3498DB)
    .setTimestamp();

  // Add relic fields in vertical format with spacing
  pageItems.forEach(({ relic, char }, index) => {
    const rarityEmoji = getRarityEmoji(relic.rarity);
    const icon = char ? (emojiMap[char.slug] || '🔹') : '🔹';
    embed.addFields({
      name: `${icon} ${rarityEmoji} **\`${relic.id}\`**`,
      value: `${char ? char.name + ' • ' : ''}${getRarityName(relic.rarity)} • ${relic.durabilityPct.toFixed(1)}% HP • ${relic.evolutionStage} • ${relic.xp.toLocaleString()} XP`,
      inline: false
    });

    // Add spacing between relics (except after the last one)
    if (index < pageItems.length - 1) {
      embed.addFields({ name: "⠀", value: "⠀", inline: false });
    }
  });

  // Navigation buttons
  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`collection_page_${page - 1}_${encodeURIComponent(view.search || '')}_${view.sort}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (totalPages > 1 && page > 2) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`collection_page_1_${encodeURIComponent(view.search || '')}_${view.sort}`)
        .setLabel('⏮️ First')
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
        .setCustomId(`collection_page_${page + 1}_${encodeURIComponent(view.search || '')}_${view.sort}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (totalPages > 1 && page < totalPages - 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`collection_page_${totalPages}_${encodeURIComponent(view.search || '')}_${view.sort}`)
        .setLabel('Last ⏭️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Quick actions row
  const actionsRow = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('relic_quick_action')
        .setPlaceholder('Choose a relic to view...')
        .addOptions(pageItems.map(({ relic }) => ({
          label: `${getRarityEmoji(relic.rarity)} ${relic.id}`,
          description: `${relic.rarity} • ${relic.evolutionStage} • ${relic.durabilityPct.toFixed(1)}%`,
          value: `view_${relic.id}`
        })))
    );

  // Sort/select controls
  const controlsRow = new ActionRowBuilder<any>().addComponents(
    new (require('discord.js').StringSelectMenuBuilder)()
      .setCustomId('collection_sort')
      .setPlaceholder('Sort')
      .addOptions([
        { label: 'Rarest → Common', value: 'rarity_desc', default: view.sort === 'rarity_desc' },
        { label: 'Common → Rarest', value: 'rarity_asc', default: view.sort === 'rarity_asc' },
        { label: 'Newest', value: 'newest', default: view.sort === 'newest' },
        { label: 'Oldest', value: 'oldest', default: view.sort === 'oldest' },
        { label: 'Highest XP', value: 'xp_desc', default: view.sort === 'xp_desc' },
        { label: 'Highest Durability', value: 'durability_desc', default: view.sort === 'durability_desc' },
        { label: 'Name A→Z', value: 'name_asc', default: view.sort === 'name_asc' },
        { label: 'Best (Battle)', value: 'best', default: view.sort === 'best' },
        { label: 'Worst (Battle)', value: 'worst', default: view.sort === 'worst' },
      ])
  );

  const components: ActionRowBuilder<any>[] = [controlsRow, navigationRow];
  if (pageItems.length > 0) {
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

async function buildUserProfileEmbed(viewUserId: string, interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const prisma = getPrisma();
  const user = await prisma.user.upsert({ where: { userId: viewUserId }, create: { userId: viewUserId, discordId: viewUserId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
  const mats = JSON.parse(user.materials || '{}');
  const currencies = JSON.parse((user as any).currencies || '{}');
  const featuredRelicId: string | undefined = mats.featuredRelicId;
  const relic = featuredRelicId ? await prisma.relic.findUnique({ where: { id: featuredRelicId } }) : null;

  let character: any = null;
  try {
    const characters = require("../../data/allgodschars.json");
    if (relic) character = characters.find((c: any) => c.id === relic.characterId);
  } catch {}

  const displayUser = await (interaction.client as any).users.fetch(viewUserId).catch(() => null);
  const displayName = displayUser?.username || (viewUserId === (interaction as any).user.id ? (interaction as any).user.username : 'Player');
  const isSelf = viewUserId === (interaction as any).user.id;

  const achievements = (mats.achievements || {}) as Record<string, boolean>;
  const badges: string[] = [];
  if (achievements.first_s_tier_drop) badges.push('🌟');
  if (achievements.master_trader) badges.push('💱');
  if (achievements.pantheon_collector_greco) badges.push('🏛️');

  const totalChars = (() => { try { return require("../../data/allgodschars.json").length; } catch { return 0; } })();
  const ownedCount = await prisma.relic.count({ where: { ownerUserId: viewUserId } });

  const embed = new EmbedBuilder()
    .setTitle(`${displayName} — Player Profile`)
    .setColor(0xC9A227)
    .setTimestamp()
    .addFields(
      { name: 'Joined', value: `<t:${Math.floor(user.createdAt.getTime()/1000)}:D>`, inline: true },
      { name: 'Collection', value: `${ownedCount}/${totalChars} collected`, inline: true },
      { name: '⠀', value: '⠀', inline: true },
      { name: 'Gacha Coins', value: String(currencies.gacha_coins ?? 0), inline: true },
      { name: 'Mythic Essence', value: String(currencies.mythic_essence ?? 0), inline: true },
      { name: 'Gold', value: user.gold.toLocaleString(), inline: true },
    );

  if (relic) {
    const baseUrl = process.env.CDN_BASE_URL || 'http://localhost:3000/cdn';
    const portraitUrl = `${baseUrl}/portraits/${character?.slug || 'odin'}.png`;
    const subtitle = character ? `${character.name} (${relic.rarity}) — ${character.class}, ${character.element}` : `Relic ${relic.id}`;
    const detail = character?.passive?.name ? `Passive: "${character.passive.name}" — ${character.passive.desc}` : (character?.lore ? `Lore: ${character.lore}` : '');
    embed.setDescription(`Featured Relic: ${subtitle}${detail ? `\n${detail}` : ''}`);
    if (baseUrl) embed.setImage(portraitUrl);
  } else {
    embed.setDescription(isSelf ? 'Use the button below to choose a Featured Relic.' : 'No featured relic set.');
  }

  const missionsCompleted = await prisma.mission.count({ where: { ownerUserId: viewUserId, status: 'claimed' } });
  let tradesMade = 0;
  try {
    tradesMade = await (prisma as any).tradeHistory.count({ where: { OR: [{ user1Id: viewUserId }, { user2Id: viewUserId }] } });
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

  const actions = new ActionRowBuilder<ButtonBuilder>();
  actions.addComponents(
    new ButtonBuilder().setCustomId(`profile_view_collection_${viewUserId}_1`).setLabel('📚 View Collection').setStyle(ButtonStyle.Secondary)
  );
  if (isSelf) {
    actions.addComponents(
      new ButtonBuilder().setCustomId('profile_change_featured').setLabel('Change Featured Relic').setStyle(ButtonStyle.Primary)
    );
  }

  return { embed, components: [actions] as any };
}

async function buildPlayerCollectionEmbed(targetUserId: string, targetUsername: string, page: number) {
  const prisma = getPrisma();
  const pageSize = 4;
  const skip = (page - 1) * pageSize;
  const [relics, totalCount] = await Promise.all([
    prisma.relic.findMany({ where: { ownerUserId: targetUserId }, orderBy: { birthRealTs: "desc" }, skip, take: pageSize }),
    prisma.relic.count({ where: { ownerUserId: targetUserId } })
  ]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const embed = new EmbedBuilder()
    .setTitle(targetUserId ? `👤 ${targetUsername}'s Collection` : '📚 Collection')
    .setDescription(totalCount === 0 ? 'No relics found.' : `**Page ${page} of ${totalPages}** • ${totalCount} total relics\n⠀`)
    .setColor(0x9B59B6)
    .setTimestamp();

  relics.forEach((relic, index) => {
    const rarityEmoji = getRarityEmoji(relic.rarity);
    embed.addFields({
      name: `${rarityEmoji} **\`${relic.id}\`**`,
      value: `${getRarityName(relic.rarity)} • ${relic.durabilityPct.toFixed(1)}% HP • ${relic.evolutionStage} • ${relic.xp.toLocaleString()} XP`,
      inline: false
    });
    if (index < relics.length - 1) embed.addFields({ name: "⠀", value: "⠀", inline: false });
  });

  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder().setCustomId(`profcol_prev_${targetUserId}_${page - 1}`).setLabel('⬅️ Previous').setStyle(ButtonStyle.Secondary)
    );
    if (totalPages > 1) {
      navigationRow.addComponents(
        new ButtonBuilder().setCustomId(`profcol_first_${targetUserId}`).setLabel('⏮️ First').setStyle(ButtonStyle.Secondary)
      );
    }
  }
  navigationRow.addComponents(new ButtonBuilder().setCustomId(`profcol_refresh_${targetUserId}_${page}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary));
  if (page < totalPages) {
    navigationRow.addComponents(
      new ButtonBuilder().setCustomId(`profcol_next_${targetUserId}_${page + 1}`).setLabel('Next ➡️').setStyle(ButtonStyle.Secondary)
    );
    if (totalPages > 1) {
      navigationRow.addComponents(
        new ButtonBuilder().setCustomId(`profcol_last_${targetUserId}`).setLabel('Last ⏭️').setStyle(ButtonStyle.Secondary)
      );
    }
  }

  return { embed, components: [navigationRow] as any };
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
  // Battle step buttons are handled by message collectors inside battleHandlers.
  // Ignore them here to avoid double acknowledgements and 40060 errors.
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id.startsWith('battle_act_') || id.startsWith('battle_skip_') || id.startsWith('battle_start_') || id.startsWith('battle_preview_') || id.startsWith('battle_cancel_')) {
      return;
    }
  }
  const userId = interaction.user.id;
  const prisma = getPrisma();

  try {
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Shrine button interactions
      if (customId.startsWith('shrine_')) {
        const { handleShrineButtonInteraction } = await import("./shrineHandlers.js");
        await handleShrineButtonInteraction(interaction);
        return;
      }

      // Post-battle buttons route to battleHandlers; step buttons are ignored above
      if (customId.startsWith('battle_')) {
        const { handleBattleButtonInteraction } = await import("./battleHandlers.js");
        await handleBattleButtonInteraction(interaction as ButtonInteraction);
        return;
      }

      // Gauntlet button interactions
      if (customId.startsWith('gauntlet_')) {
        const { handleGauntletButtonInteraction } = await import("./gauntletInteractions.js");
        await handleGauntletButtonInteraction(interaction);
        return;
      }

      // Drop another relic
      if (customId === 'drop_another') {
        await interaction.deferReply();
        const baseUrl = process.env.CDN_BASE_URL || "http://localhost:3000/cdn";
        const backUrl = `${baseUrl}/portraits/odin.png`;
        const back = new EmbedBuilder().setTitle("🎴 Pulling...").setDescription("Revealing your card...").setImage(backUrl).setColor(0x2c3e50);
        await interaction.editReply({ embeds: [back], components: [] });
        await new Promise((r) => setTimeout(r, 1500));
        const result = await performGacha({ userId });
        const embed = new EmbedBuilder().setTitle(result.embed.title).setDescription(result.embed.description).setColor(getRarityColor(result.rarity)).setTimestamp();
        if ((result.embed as any).fields) embed.addFields((result.embed as any).fields as any);
        if ((result.embed as any).image) embed.setImage((result.embed as any).image.url);
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('drop_another').setLabel('🎲 Pull Again').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('view_collection').setLabel('📚 My Collection').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [actionRow] });
        return;
      }

      // Profile actions
      if (customId === 'profile_change_featured') {
        await presentFeaturedRelicSelector(interaction, userId);
        return;
      }
      if (customId.startsWith('profile_view_collection_')) {
        const parts = customId.split('_');
        const targetUserId = parts[3];
        const page = parseInt(parts[4] || '1', 10) || 1;
        const targetUser = await interaction.client.users.fetch(targetUserId);
        await interaction.deferUpdate();
        const collection = await buildPlayerCollectionEmbed(targetUserId, targetUser.username, page);
        const currentEmbeds = (interaction.message as any).embeds || [];
        const profileEmbed = currentEmbeds[0];
        const newEmbeds = profileEmbed ? [profileEmbed, collection.embed] : [collection.embed];
        await (interaction.message as any).edit({ embeds: newEmbeds, components: collection.components });
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
        const parts = customId.split('_');
        const page = parseInt(parts[2]);
        const search = decodeURIComponent(parts.slice(3, parts.length - 1).join('_')) || '';
        const sort = parts[parts.length - 1] || 'rarity_desc';
        await interaction.deferUpdate();
        await showCollectionPage(interaction, userId, page, { search, sort });
        return;
      }
      // Search removed per request

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

      // Quick list relic for sale
      if (customId.startsWith('market_list_')) {
        const relicId = customId.replace('market_list_', '');
        const modal = new ModalBuilder()
          .setCustomId(`market_list_modal_${relicId}`)
          .setTitle('List Relic for Sale');
        const priceInput = new TextInputBuilder()
          .setCustomId('price_gold')
          .setLabel('Price in gold')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }

      // Mission with relic helper
      if (customId.startsWith('mission_with_')) {
        const relicId = customId.replace('mission_with_', '');
        await interaction.reply({ content: `Use /missions start with relic_ids=${relicId} to send this relic on a mission.`, ephemeral: false });
        return;
      }

      // Profile collection pagination
      if (customId.startsWith('profcol_')) {
        const parts = customId.split('_');
        let action = parts[1];
        const targetUserId = parts[2];
        let page = parts[3] ? parseInt(parts[3]) : 1;
        const targetUser = await interaction.client.users.fetch(targetUserId);
        await interaction.deferUpdate();
        // Resolve action into page
        const prisma = getPrisma();
        const totalCount = await prisma.relic.count({ where: { ownerUserId: targetUserId } });
        const totalPages = Math.max(1, Math.ceil(totalCount / 4));
        if (action === 'first') page = 1;
        if (action === 'last') page = totalPages;
        if (action === 'next') page = Math.min(page, totalPages);
        if (action === 'prev') page = Math.max(page, 1);
        // Build and swap just the collection pane if already present; otherwise append
        const collection = await buildPlayerCollectionEmbed(targetUserId, targetUser.username, page);
        const currentEmbeds = (interaction.message as any).embeds || [];
        const profileEmbed = currentEmbeds[0];
        const newEmbeds = profileEmbed ? [profileEmbed, collection.embed] : [collection.embed];
        await (interaction.message as any).edit({ embeds: newEmbeds, components: collection.components });
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

      // Character detail selection from lookup
      if (customId === 'lookup_select') {
        const isSelect = (interaction as any).isStringSelectMenu && (interaction as any).isStringSelectMenu();
        const value = isSelect ? (interaction as any).values?.[0] : undefined;
        if (value && value.startsWith('lookup_view_')) {
          const slug = value.replace('lookup_view_', '');
          // Edit the original reply in-place without deferring if possible
          const embed = buildCharacterDetailsEmbed(slug);
          await interaction.update({ embeds: [embed], components: [] });
          return;
        }
      }

      // Back to list from character details
      if (customId === 'lookup_back') {
        // Rebuild the last list view; try to retrieve stored context from the original interaction if present
        await interaction.deferUpdate();
        const msg: any = interaction.message;
        const ctx = (interaction as any)._lookupCtx || (msg && (msg as any)._lookupCtx) || null;
        const searchTerm = ctx?.searchTerm ?? null;
        const page = ctx?.page ?? 1;
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
      if (customId === 'collection_sort') {
        await interaction.deferUpdate();
        const sort = interaction.values[0] || 'rarity_desc';
        await showCollectionPage(interaction as any, interaction.user.id, 1, { search: '', sort });
        return;
      }

      // Character details from lookup select menu
      if (customId === 'lookup_select') {
        const value = interaction.values?.[0];
        if (value && value.startsWith('lookup_view_')) {
          const slug = value.replace('lookup_view_', '');
          await showCharacterDetails(interaction, slug);
          return;
        }
      }

      // Gauntlet select menu
      if (customId === 'gauntlet_select') {
        const { handleGauntletSelectMenu } = await import("./gauntletInteractions.js");
        await handleGauntletSelectMenu(interaction);
        return;
      }

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
        const user = await prisma.user.upsert({ where: { userId }, create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, update: {} });
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
      // Handle shrine setup modal
      if (interaction.customId === 'shrine_setup_modal') {
        await handleShrineSetupModal(interaction);
        return;
      }
      
      await handleTradeBuilderModal(interaction);
      // Market list modal
      if (interaction.customId.startsWith('market_list_modal_')) {
        const relicId = interaction.customId.replace('market_list_modal_', '');
        const priceStr = interaction.fields.getTextInputValue('price_gold');
        const price = Math.max(0, parseInt(priceStr || '0', 10) || 0);
        const prisma = getPrisma();
        try {
          const relic = await prisma.relic.findUnique({ where: { id: relicId } });
          if (!relic || relic.ownerUserId !== interaction.user.id) {
            await interaction.reply({ content: 'You do not own this relic.', ephemeral: false });
            return;
          }
          const listing = await prisma.marketListing.create({ data: { relicId, priceGold: price, sellerUserId: interaction.user.id, status: 'active' } });
          const embed = new EmbedBuilder()
            .setTitle('💰 Listing Created')
            .setDescription(`Relic \`${relicId}\` listed for ${price.toLocaleString()} gold (ID ${listing.id}).`)
            .setColor(0xF39C12);
          await interaction.reply({ embeds: [embed] });
        } catch (e: any) {
          await interaction.reply({ content: `Failed to create listing: ${e.message}`, ephemeral: false });
        }
        return;
      }
      return;
    }

  } catch (error: any) {
    console.error('Component interaction error:', error);
  }
}

// Handle shrine setup modal submission
async function handleShrineSetupModal(interaction: ModalSubmitInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const userId = interaction.user.id;
    const alignment = interaction.fields.getTextInputValue('alignment_input')?.trim();
    const effigyId = interaction.fields.getTextInputValue('effigy_input')?.trim();
    
    // Update shrine with provided values
    const prisma = getPrisma();
    const user = await prisma.user.upsert({ 
      where: { userId }, 
      create: { userId, discordId: userId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) }, 
      update: {} 
    });
    
    const mats = JSON.parse(user.materials || '{}');
    const shrine = (mats.shrine || {}) as { layout?: any; alignment?: string; effigyId?: string };
    shrine.layout = shrine.layout || {};
    
    let updates = [];
    
    if (alignment && (alignment.toLowerCase() === 'norse' || alignment.toLowerCase() === 'greco-roman')) {
      const properAlignment = alignment.toLowerCase() === 'norse' ? 'Norse' : 'Greco-Roman';
      shrine.alignment = properAlignment;
      updates.push(`⚖️ Alignment: ${properAlignment}`);
    }
    
    if (effigyId && effigyId.endsWith('_effigy')) {
      shrine.effigyId = effigyId;
      const effigyName = effigyId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      updates.push(`🏺 Effigy: ${effigyName}`);
    }
    
    mats.shrine = shrine;
    await prisma.user.update({ where: { userId }, data: { materials: JSON.stringify(mats) } });
    
    const successEmbed = new EmbedBuilder()
      .setTitle('⚙️ Shrine Setup Complete!')
      .setDescription(updates.length > 0 ? `Updated:\n${updates.join('\n')}` : 'No valid changes were made.')
      .setColor(Colors.Green);
      
    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('shrine_view_updated')
          .setLabel('👁️ View Shrine')
          .setStyle(ButtonStyle.Primary)
      );
    
    await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
    
  } catch (error) {
    console.error('Shrine modal error:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: "❌ An error occurred setting up your shrine.", 
        ephemeral: true 
      });
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
    const extraFields: any[] = [
      { name: "🏛️ Pantheon", value: character.pantheon, inline: true },
      { name: "⠀", value: "⠀", inline: true },
      { name: "⠀", value: "⠀", inline: true }
    ];
    if (character.passive && character.passive.name) {
      extraFields.push({ name: "⚔️ Passive", value: `**${character.passive.name}**\n${character.passive.desc}`, inline: false });
    } else if (character.lore) {
      extraFields.push({ name: "📜 Lore", value: character.lore, inline: false });
    }
    embed.addFields(...extraFields);

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
      materials: JSON.stringify({}),
      currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 })
    },
    update: {}
  });

  const now = new Date();
  const lastClaimAt: Date | null = (user as any).lastDailyClaimAt || null;
  const canClaim = !lastClaimAt || (now.getTime() - new Date(lastClaimAt).getTime()) >= 24 * 60 * 60 * 1000;

  const currencies = JSON.parse((user as any).currencies || '{}');
  const currentCoins = Number(currencies.gacha_coins || 0);
  const dailyCoins = Number(process.env.DAILY_GACHA_COINS || 10);

  if (!canClaim) {
    const nextAt = new Date(new Date(lastClaimAt as any).getTime() + 24 * 60 * 60 * 1000);
    const embed = new EmbedBuilder()
      .setTitle("⏰ Daily Already Claimed")
      .setDescription(`Next claim available <t:${Math.floor(nextAt.getTime()/1000)}:R>`) 
      .setColor(0x95A5A6)
      .setTimestamp()
      .addFields(
        { name: "Gacha Coins", value: String(currentCoins), inline: true },
        { name: "Mythic Essence", value: String(currencies.mythic_essence ?? 0), inline: true }
      );

    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('view_collection')
          .setLabel('📚 View Collection')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({ embeds: [embed], components: [actionRow] });
    return;
  }

  const updatedCurrencies = { ...currencies, gacha_coins: currentCoins + dailyCoins };

  await prisma.user.update({
    where: { userId },
    data: {
      currencies: JSON.stringify(updatedCurrencies),
      lastDailyClaimAt: now
    }
  });

  const embed = new EmbedBuilder()
    .setTitle("🎁 Daily Gacha Coins Claimed!")
    .setDescription(`+${dailyCoins} Gacha Coins added.`)
    .setColor(0x2ECC71)
    .setTimestamp()
    .addFields(
      { name: "Gacha Coins", value: String(updatedCurrencies.gacha_coins), inline: true },
      { name: "Mythic Essence", value: String(updatedCurrencies.mythic_essence ?? 0), inline: true }
    );

  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('view_collection')
        .setLabel('📚 View Collection')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.editReply({ embeds: [embed], components: [actionRow] });
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
    if (totalPages > 1) {
      navigationRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`inspect_${targetUserId}_1`)
          .setLabel('⏮️ First')
          .setStyle(ButtonStyle.Secondary)
      );
    }
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
    if (totalPages > 1 && page < totalPages - 1) {
      navigationRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`inspect_${targetUserId}_${totalPages}`)
          .setLabel('Last ⏭️')
          .setStyle(ButtonStyle.Secondary)
      );
    }
  }

  if (navigationRow.components.length > 0) {
    components.push(navigationRow);
  }

  await interaction.editReply({ 
    embeds: [embed],
    components 
  });
  // Store last view context on the message for back navigation
  try {
    (interaction as any)._lookupCtx = { page };
  } catch {}
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
    const extraFields: any[] = [
      { name: "🏛️ Pantheon", value: character.pantheon, inline: true },
      { name: "⠀", value: "⠀", inline: true },
      { name: "🔒 Status", value: relic.isLocked ? "🔒 Locked" : "✅ Available", inline: true }
    ];
    if (character.passive && character.passive.name) {
      extraFields.push({ name: "⚔️ Passive", value: `**${character.passive.name}**\n${character.passive.desc}`, inline: false });
    } else if (character.lore) {
      extraFields.push({ name: "📜 Lore", value: character.lore, inline: false });
    }
    embed.addFields(...extraFields);

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
  const components = [] as any[];
  const navigationRow = new ActionRowBuilder<ButtonBuilder>();
  
  if (page > 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`lookup_page_${searchTerm || 'all'}_${page - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
    );
    if (totalPages > 1 && page > 2) {
      navigationRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`lookup_page_${searchTerm || 'all'}_1`)
          .setLabel('⏮️ First')
          .setStyle(ButtonStyle.Secondary)
      );
    }
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
    if (totalPages > 1 && page < totalPages - 1) {
      navigationRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`lookup_page_${searchTerm || 'all'}_${totalPages}`)
          .setLabel('Last ⏭️')
          .setStyle(ButtonStyle.Secondary)
      );
    }
  }

  if (navigationRow.components.length > 0) {
    components.push(navigationRow);
  }

  // Selection menu to view character details with portrait
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('lookup_select')
        .setPlaceholder('Select a character to view details...')
        .addOptions(
          pageCharacters.map((character: any) => ({
            label: character.name,
            description: `${character.pantheon} • ${character.class} • ${character.element}`,
            value: `lookup_view_${character.slug}`
          }))
        )
    );
  components.push(selectRow as any);

  await interaction.editReply({ 
    embeds: [embed],
    components 
  });
} 

// Build absolute portrait URL for Discord embeds
function getPortraitUrlForSlug(slug: string): string {
  // Prefer CDN_BASE_URL, otherwise if the static file exists, fall back to absolute file URL served under /cdn
  const base = process.env.CDN_BASE_URL || 'http://localhost:3000/cdn';
  // Best effort existence check to avoid broken images in dev
  try {
    const localPath = path.resolve(process.cwd(), 'public', 'portraits', `${slug}.png`);
    if (fs.existsSync(localPath)) return `${base}/portraits/${slug}.png`;
  } catch {}
  return `${base}/portraits/${slug}.png`;
}

async function showCharacterDetails(interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction, slug: string) {
  let characters: any[] = [];
  try {
    characters = require("../../data/allgodschars.json");
  } catch {}
  const ch = characters.find((c: any) => c.slug === slug);
  if (!ch) {
    const embed = new EmbedBuilder().setTitle('❌ Not found').setDescription(`Character '${slug}' not found`).setColor(0xE74C3C);
    if ((interaction as any).editReply) {
      await (interaction as any).editReply({ embeds: [embed], components: [] });
    } else {
      await (interaction as any).reply({ embeds: [embed] });
    }
    return;
  }
  const rarityEmoji = getRarityEmoji(ch.rarity);
  const embed = new EmbedBuilder()
    .setTitle(`${rarityEmoji} ${ch.name}`)
    .setDescription(ch.lore || '')
    .setColor(getRarityColor(ch.rarity) as any)
    .addFields(
      { name: 'Pantheon', value: ch.pantheon || '—', inline: true },
      { name: 'Class', value: ch.class || '—', inline: true },
      { name: 'Element', value: ch.element || '—', inline: true },
      { name: 'Stats', value: `HP ${ch.hp} • ATK ${ch.atk} • DEF ${ch.def} • SPD ${ch.spd}`, inline: false }
    );
  // Prefer local attachment in dev to avoid Discord caching issues
  try {
    const localPath = path.resolve(process.cwd(), 'public', 'portraits', `${slug}.png`);
    if (fs.existsSync(localPath)) {
      const attachment = new AttachmentBuilder(localPath, { name: `${slug}.png` });
      embed.setImage(`attachment://${slug}.png`);
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('lookup_back').setLabel('⬅️ Back to list').setStyle(ButtonStyle.Secondary)
      );
      // Send a new message with attachment (cannot attach files when updating an existing message)
      await (interaction as any).reply({ embeds: [embed], components: [backRow] as any, files: [attachment] });
      return;
    }
  } catch {}
  const portraitUrl = getPortraitUrlForSlug(slug);
  if (portraitUrl) embed.setImage(portraitUrl);

  // Passive details (supports structured and legacy)
  if (ch.passive && ch.passive.name) {
    embed.addFields({ name: `Passive — ${ch.passive.name}`, value: ch.passive.desc || '—', inline: false });
  } else if (ch.passive_ability_name || ch.passive_ability_desc) {
    embed.addFields({ name: `Passive — ${ch.passive_ability_name || '—'}`, value: ch.passive_ability_desc || '—', inline: false });
  }

  // Add back button to return to the previous list page
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('lookup_back').setLabel('⬅️ Back to list').setStyle(ButtonStyle.Secondary)
  );
  const payload = { embeds: [embed], components: [backRow] as any };
  if ((interaction as any).update) {
    await (interaction as any).update(payload);
  } else if ((interaction as any).editReply) {
    await (interaction as any).editReply(payload);
  }
}

// Build character details embed (no send)
function buildCharacterDetailsEmbed(slug: string): any {
  let characters: any[] = [];
  try {
    characters = require("../../data/allgodschars.json");
  } catch {}
  const ch = characters.find((c: any) => c.slug === slug);
  if (!ch) {
    return new EmbedBuilder().setTitle('❌ Not found').setDescription(`Character '${slug}' not found`).setColor(0xE74C3C);
  }
  const rarityEmoji = getRarityEmoji(ch.rarity);
  const embed = new EmbedBuilder()
    .setTitle(`${rarityEmoji} ${ch.name}`)
    .setDescription(ch.lore || '')
    .setColor(getRarityColor(ch.rarity) as any)
    .addFields(
      { name: 'Pantheon', value: ch.pantheon || '—', inline: true },
      { name: 'Class', value: ch.class || '—', inline: true },
      { name: 'Element', value: ch.element || '—', inline: true },
      { name: 'Stats', value: `HP ${ch.hp} • ATK ${ch.atk} • DEF ${ch.def} • SPD ${ch.spd}`, inline: false }
    );
  const portraitUrl = getPortraitUrlForSlug(slug);
  if (portraitUrl) embed.setImage(portraitUrl);
  if (ch.passive && ch.passive.name) {
    embed.addFields({ name: `Passive — ${ch.passive.name}`, value: ch.passive.desc || '—', inline: false });
  } else if (ch.passive_ability_name || ch.passive_ability_desc) {
    embed.addFields({ name: `Passive — ${ch.passive_ability_name || '—'}`, value: ch.passive_ability_desc || '—', inline: false });
  }
  return embed;
}