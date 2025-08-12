import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { performDrop } from "../engines/drop.js";
import { startMission, claimMission } from "../engines/missions.js";
import { getPrisma } from "../lib/db.js";

export const commandBuilders = [
  new SlashCommandBuilder().setName("drop").setDescription("Summon a new Living Relic"),
  new SlashCommandBuilder()
    .setName("missions")
    .setDescription("Missions operations")
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start a mission")
        .addStringOption((o) => o.setName("mission_id").setDescription("Mission ID").setRequired(true))
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
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  console.log(`Received command: ${interaction.commandName} from user: ${interaction.user.id}`);
  
  const prisma = getPrisma();
  const userId = interaction.user.id;

  try {
    if (interaction.commandName === "drop") {
      await interaction.deferReply();
      const result = await performDrop({ userId });
      await interaction.editReply({ embeds: [result.embed] });
      return;
    }

    if (interaction.commandName === "missions") {
      const sub = interaction.options.getSubcommand();
      if (sub === "start") {
        await interaction.deferReply({ ephemeral: true });
        const missionId = interaction.options.getString("mission_id", true);
        const relicIds = interaction.options.getString("relic_ids", true).split(",").map((s) => s.trim());
        const m = await startMission(userId, relicIds, missionId);
        await interaction.editReply(`Mission started: ${m.id}. Ends at ${m.endRealTs.toISOString()}`);
        return;
      }
      if (sub === "claim") {
        await interaction.deferReply({ ephemeral: true });
        const missionId = interaction.options.getString("mission_id", true);
        await claimMission(userId, missionId);
        await interaction.editReply(`Claimed rewards for mission ${missionId}.`);
        return;
      }
    }

    if (interaction.commandName === "market") {
      const sub = interaction.options.getSubcommand();
      if (sub === "list") {
        await interaction.deferReply({ ephemeral: true });
        const relicId = interaction.options.getString("relic_id", true);
        const price = interaction.options.getInteger("price", true);
        const listing = await prisma.marketListing.create({ data: { relicId, priceGold: price, sellerUserId: userId, status: "active" } });
        await interaction.editReply(`Listed ${relicId} for ${price} gold. Listing ID: ${listing.id}`);
        return;
      }
      if (sub === "buy") {
        await interaction.deferReply({ ephemeral: true });
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
          await interaction.editReply(`Purchased listing ${listingId}.`);
        } catch (e: any) {
          await interaction.editReply(`Buy failed: ${e.message}`);
        }
        return;
      }
    }

    if (interaction.commandName === "collection") {
      await interaction.deferReply({ ephemeral: true });
      const page = interaction.options.getInteger("page") || 1;
      const pageSize = 6;
      const relics = await prisma.relic.findMany({ where: { ownerUserId: userId }, orderBy: { birthRealTs: "desc" }, skip: (page-1)*pageSize, take: pageSize });
      if (relics.length === 0) {
        await interaction.editReply(`No relics on page ${page}.`);
        return;
      }
      const embeds = relics.map((r) => new EmbedBuilder().setTitle(`${r.id}`).setDescription(`Rarity: ${r.rarity} | Durability: ${r.durabilityPct.toFixed(1)}% | Stage: ${r.evolutionStage}`));
      await interaction.editReply({ embeds });
      return;
    }

    if (interaction.commandName === "view") {
      await interaction.deferReply({ ephemeral: true });
      const relicId = interaction.options.getString("relic_id", true);
      const relic = await prisma.relic.findUnique({ where: { id: relicId } });
      if (!relic) return interaction.editReply(`Relic not found.`);
      const embed = new EmbedBuilder()
        .setTitle(`Relic ${relic.id}`)
        .addFields(
          { name: "Era", value: relic.eraId, inline: true },
          { name: "Rarity", value: relic.rarity, inline: true },
          { name: "Durability", value: `${relic.durabilityPct.toFixed(1)}%`, inline: true },
          { name: "Stage", value: relic.evolutionStage, inline: true },
          { name: "XP", value: relic.xp.toString(), inline: true },
          { name: "Locked", value: relic.isLocked ? "Yes" : "No", inline: true }
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "balance") {
      await interaction.deferReply({ ephemeral: true });
      const user = await prisma.user.findUnique({ where: { userId } });
      const gold = user?.gold || 0;
      const mats = JSON.parse(user?.materials || "{}");
      await interaction.editReply(`Gold: ${gold}\nMaterials: ${JSON.stringify(mats, null, 2)}`);
      return;
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