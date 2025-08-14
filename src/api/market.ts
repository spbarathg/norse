import { Router } from "express";
import { getPrisma } from "../lib/db.js";

export const marketRouter = Router();

marketRouter.get("/listings", async (req, res) => {
  const prisma = getPrisma();
  const { page = 1, pageSize = 20 } = req.query as any;
  const skip = (Number(page) - 1) * Number(pageSize);
  const items = await prisma.marketListing.findMany({
    where: { status: "active" },
    orderBy: { createdTs: "desc" },
    skip,
    take: Number(pageSize),
  });
  res.json({ items });
});

marketRouter.post("/list", async (req, res) => {
  try {
    const prisma = getPrisma();
    const { sellerUserId, relicId, priceGold } = req.body;
    const relic = await prisma.relic.findUnique({ where: { id: relicId } });
    if (!relic) return res.status(404).json({ error: "relic_not_found" });
    if (relic.ownerUserId !== sellerUserId) return res.status(403).json({ error: "not_owner" });
    if (relic.isLocked) return res.status(400).json({ error: "relic_locked" });

    const listing = await prisma.marketListing.create({
      data: { sellerUserId, relicId, priceGold: Number(priceGold), status: "active" },
    });
    res.json({ listing });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "server_error" });
  }
});

marketRouter.post("/buy", async (req, res) => {
  try {
    const prisma = getPrisma();
    const { buyerUserId, listingId } = req.body;
    const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "active") return res.status(400).json({ error: "not_available" });

    const relic = await prisma.relic.findUnique({ where: { id: listing.relicId } });
    if (!relic) return res.status(404).json({ error: "relic_not_found" });
    if (relic.isLocked) return res.status(400).json({ error: "relic_locked" });

    await prisma.$transaction(async (tx) => {
      const buyer = await tx.user.upsert({
        where: { userId: buyerUserId },
        create: { userId: buyerUserId, discordId: buyerUserId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) },
        update: {},
      });
      if (buyer.gold < listing.priceGold) throw new Error("insufficient_gold");

      const seller = await tx.user.upsert({
        where: { userId: listing.sellerUserId },
        create: { userId: listing.sellerUserId, discordId: listing.sellerUserId, gold: 0, materials: JSON.stringify({}), currencies: JSON.stringify({ gacha_coins: 0, mythic_essence: 0 }) },
        update: {},
      });

      await tx.user.update({ where: { userId: buyerUserId }, data: { gold: buyer.gold - listing.priceGold } });
      await tx.user.update({ where: { userId: seller.userId }, data: { gold: seller.gold + listing.priceGold } });

      await tx.relic.update({
        where: { id: relic.id },
        data: { ownerUserId: buyerUserId, missionLockId: null },
      });

      await tx.marketListing.update({
        where: { id: listingId },
        data: { status: "sold", buyerUserId, viewCount: { increment: 1 } },
      });
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "server_error" });
  }
}); 