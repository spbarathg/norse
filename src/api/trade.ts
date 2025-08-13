import { Router } from "express";
import { getPrisma } from "../lib/db.js";
import {
  createTradeOffer,
  getTradeOfferDetails,
  acceptTradeOffer,
  cancelTradeOffer,
  getUserTrades,
  cleanupExpiredTrades,
  createCounterOffer,
} from "../engines/trade.js";

export const tradeRouter = Router();

// Get all trade offers for a user
tradeRouter.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { type = "all" } = req.query as any;
    
    // Clean up expired trades first
    await cleanupExpiredTrades();
    
    const trades = await getUserTrades(userId, type);
    res.json({ trades });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "server_error" });
  }
});

// Get specific trade offer details
tradeRouter.get("/:tradeId", async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = await getTradeOfferDetails(tradeId);
    res.json({ trade });
  } catch (error: any) {
    res.status(404).json({ error: error.message || "trade_not_found" });
  }
});

// Create a new trade offer
tradeRouter.post("/create", async (req, res) => {
  try {
    const {
      initiatorUserId,
      targetUserId,
      offerType,
      offeredRelicIds = [],
      offeredGold = 0,
      offeredMaterials = {},
      requestedRelicIds = [],
      requestedGold = 0,
      requestedMaterials = {},
      message,
      expirationHours = 24,
    } = req.body;

    // Validation
    if (!initiatorUserId) {
      return res.status(400).json({ error: "initiatorUserId is required" });
    }

    if (!offerType || !["direct", "open", "counteroffer"].includes(offerType)) {
      return res.status(400).json({ error: "Invalid offer type" });
    }

    if (offerType === "direct" && !targetUserId) {
      return res.status(400).json({ error: "targetUserId is required for direct trades" });
    }

    // Check if something is being offered and requested
    const isOfferEmpty = 
      offeredRelicIds.length === 0 && 
      offeredGold === 0 && 
      Object.keys(offeredMaterials).length === 0;

    const isRequestEmpty = 
      requestedRelicIds.length === 0 && 
      requestedGold === 0 && 
      Object.keys(requestedMaterials).length === 0;

    if (isOfferEmpty && isRequestEmpty) {
      return res.status(400).json({ error: "Trade must offer or request something" });
    }

    const trade = await createTradeOffer({
      initiatorUserId,
      targetUserId,
      offerType,
      offeredRelicIds,
      offeredGold,
      offeredMaterials,
      requestedRelicIds,
      requestedGold,
      requestedMaterials,
      message,
      expirationHours,
    });

    res.json({ trade });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "bad_request" });
  }
});

// Accept a trade offer
tradeRouter.post("/:tradeId/accept", async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { accepterUserId } = req.body;

    if (!accepterUserId) {
      return res.status(400).json({ error: "accepterUserId is required" });
    }

    await acceptTradeOffer(tradeId, accepterUserId);
    res.json({ success: true, message: "Trade completed successfully" });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "trade_failed" });
  }
});

// Cancel a trade offer
tradeRouter.post("/:tradeId/cancel", async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    await cancelTradeOffer(tradeId, userId);
    res.json({ success: true, message: "Trade cancelled successfully" });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "cancel_failed" });
  }
});

// Create a counter offer
tradeRouter.post("/:tradeId/counter", async (req, res) => {
  try {
    const { tradeId: originalOfferId } = req.params;
    const {
      initiatorUserId,
      offeredRelicIds = [],
      offeredGold = 0,
      offeredMaterials = {},
      requestedRelicIds = [],
      requestedGold = 0,
      requestedMaterials = {},
      message,
      expirationHours = 24,
    } = req.body;

    if (!initiatorUserId) {
      return res.status(400).json({ error: "initiatorUserId is required" });
    }

    const counterOffer = await createCounterOffer(originalOfferId, {
      initiatorUserId,
      offeredRelicIds,
      offeredGold,
      offeredMaterials,
      requestedRelicIds,
      requestedGold,
      requestedMaterials,
      message,
      expirationHours,
    });

    res.json({ trade: counterOffer });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "counter_failed" });
  }
});

// Browse open trade offers
tradeRouter.get("/browse/open", async (req, res) => {
  try {
    const { page = 1, pageSize = 20, rarity, eraId } = req.query as any;
    const prisma = getPrisma();

    // Clean up expired trades first
    await cleanupExpiredTrades();

    const where: any = {
      status: "pending",
      offerType: "open",
      expiresAt: { gt: new Date() },
    };

    const skip = (Number(page) - 1) * Number(pageSize);
    const tradeOffers = await prisma.tradeOffer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(pageSize),
    });

    // Get detailed information for each trade
    const detailedTrades = await Promise.all(
      tradeOffers.map(trade => getTradeOfferDetails(trade.id))
    );

    res.json({ trades: detailedTrades, page: Number(page), pageSize: Number(pageSize) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "server_error" });
  }
});

// Get trade history for a user
tradeRouter.get("/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query as any;
    const prisma = getPrisma();

    const skip = (Number(page) - 1) * Number(pageSize);
    const history = await prisma.tradeHistory.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId },
        ],
      },
      orderBy: { completedAt: "desc" },
      skip,
      take: Number(pageSize),
    });

    res.json({ history, page: Number(page), pageSize: Number(pageSize) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "server_error" });
  }
});

// Admin endpoint to cleanup expired trades
tradeRouter.post("/admin/cleanup", async (req, res) => {
  try {
    await cleanupExpiredTrades();
    res.json({ success: true, message: "Expired trades cleaned up" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "cleanup_failed" });
  }
});
