import { z } from "zod";
import { getPrisma } from "../lib/db.js";

// Input validation schemas
const CreateTradeOfferInput = z.object({
  initiatorUserId: z.string(),
  targetUserId: z.string().optional(), // For open trades
  offerType: z.enum(["direct", "open", "counteroffer"]),
  offeredRelicIds: z.array(z.string()).default([]),
  offeredGold: z.number().min(0).default(0),
  offeredMaterials: z.record(z.number()).default({}),
  requestedRelicIds: z.array(z.string()).default([]),
  requestedGold: z.number().min(0).default(0),
  requestedMaterials: z.record(z.number()).default({}),
  message: z.string().optional(),
  parentOfferId: z.string().optional(),
  expirationHours: z.number().min(1).max(168).default(24), // 1 hour to 1 week
});

export type CreateTradeOfferInput = z.infer<typeof CreateTradeOfferInput>;

export type TradeOfferDetails = {
  id: string;
  initiatorUserId: string;
  targetUserId: string | null;
  status: string;
  offerType: string;
  offeredItems: {
    relics: any[];
    gold: number;
    materials: Record<string, number>;
  };
  requestedItems: {
    relics: any[];
    gold: number;
    materials: Record<string, number>;
  };
  message?: string;
  expiresAt: Date;
  createdAt: Date;
};

// Create a new trade offer
export async function createTradeOffer(input: CreateTradeOfferInput): Promise<TradeOfferDetails> {
  const validatedInput = CreateTradeOfferInput.parse(input);
  const prisma = getPrisma();

  // Validate that initiator isn't trading with themselves
  if (validatedInput.targetUserId && validatedInput.initiatorUserId === validatedInput.targetUserId) {
    throw new Error("Cannot trade with yourself");
  }

  // Validate that initiator owns all offered relics
  if (validatedInput.offeredRelicIds.length > 0) {
    const ownedRelics = await prisma.relic.findMany({
      where: {
        id: { in: validatedInput.offeredRelicIds },
        ownerUserId: validatedInput.initiatorUserId,
        isLocked: false,
      },
    });

    if (ownedRelics.length !== validatedInput.offeredRelicIds.length) {
      throw new Error("You don't own some of the offered relics or they are locked");
    }
  }

  // Validate that initiator has enough gold and materials
  const initiator = await prisma.user.findUnique({
    where: { userId: validatedInput.initiatorUserId },
  });

  if (!initiator) {
    throw new Error("Initiator user not found");
  }

  if (initiator.gold < validatedInput.offeredGold) {
    throw new Error("Insufficient gold to offer");
  }

  const initiatorMaterials = JSON.parse(initiator.materials || "{}");
  for (const [material, amount] of Object.entries(validatedInput.offeredMaterials)) {
    const amt = Number(amount);
    if ((initiatorMaterials[material] || 0) < amt) {
      throw new Error(`Insufficient ${material} to offer`);
    }
  }

  // For direct trades, validate target user exists
  if (validatedInput.offerType === "direct" && validatedInput.targetUserId) {
    const targetUser = await prisma.user.findUnique({
      where: { userId: validatedInput.targetUserId },
    });
    if (!targetUser) {
      throw new Error("Target user not found");
    }
  }

  // Calculate expiration time
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + validatedInput.expirationHours);

  // Create the trade offer
  const tradeOffer = await prisma.tradeOffer.create({
    data: {
      initiatorUserId: validatedInput.initiatorUserId,
      targetUserId: validatedInput.targetUserId || "",
      status: "pending",
      offerType: validatedInput.offerType,
      offeredRelicIds: JSON.stringify(validatedInput.offeredRelicIds),
      offeredGold: validatedInput.offeredGold,
      offeredMaterials: JSON.stringify(validatedInput.offeredMaterials),
      requestedRelicIds: JSON.stringify(validatedInput.requestedRelicIds),
      requestedGold: validatedInput.requestedGold,
      requestedMaterials: JSON.stringify(validatedInput.requestedMaterials),
      message: validatedInput.message,
      parentOfferId: validatedInput.parentOfferId,
      expiresAt,
    },
  });

  return await getTradeOfferDetails(tradeOffer.id);
}

// Get detailed trade offer information
export async function getTradeOfferDetails(tradeOfferId: string): Promise<TradeOfferDetails> {
  const prisma = getPrisma();
  
  const tradeOffer = await prisma.tradeOffer.findUnique({
    where: { id: tradeOfferId },
  });

  if (!tradeOffer) {
    throw new Error("Trade offer not found");
  }

  // Get relic details for offered items
  const offeredRelicIds = JSON.parse(tradeOffer.offeredRelicIds);
  const offeredRelics = offeredRelicIds.length > 0 
    ? await prisma.relic.findMany({ where: { id: { in: offeredRelicIds } } })
    : [];

  // Get relic details for requested items
  const requestedRelicIds = JSON.parse(tradeOffer.requestedRelicIds);
  const requestedRelics = requestedRelicIds.length > 0
    ? await prisma.relic.findMany({ where: { id: { in: requestedRelicIds } } })
    : [];

  return {
    id: tradeOffer.id,
    initiatorUserId: tradeOffer.initiatorUserId,
    targetUserId: tradeOffer.targetUserId || null,
    status: tradeOffer.status,
    offerType: tradeOffer.offerType,
    offeredItems: {
      relics: offeredRelics,
      gold: tradeOffer.offeredGold,
      materials: JSON.parse(tradeOffer.offeredMaterials),
    },
    requestedItems: {
      relics: requestedRelics,
      gold: tradeOffer.requestedGold,
      materials: JSON.parse(tradeOffer.requestedMaterials),
    },
    message: tradeOffer.message || undefined,
    expiresAt: tradeOffer.expiresAt,
    createdAt: tradeOffer.createdAt,
  };
}

// Accept a trade offer
export async function acceptTradeOffer(tradeOfferId: string, accepterUserId: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    // Get trade offer
    const tradeOffer = await tx.tradeOffer.findUnique({
      where: { id: tradeOfferId },
    });

    if (!tradeOffer) {
      throw new Error("Trade offer not found");
    }

    if (tradeOffer.status !== "pending") {
      throw new Error("Trade offer is no longer available");
    }

    if (new Date() > tradeOffer.expiresAt) {
      await tx.tradeOffer.update({
        where: { id: tradeOfferId },
        data: { status: "expired" },
      });
      throw new Error("Trade offer has expired");
    }

    // For direct trades, validate accepter is the target
    if (tradeOffer.offerType === "direct" && tradeOffer.targetUserId !== accepterUserId) {
      throw new Error("You are not the target of this trade");
    }

    // Get both users
    const initiator = await tx.user.findUnique({
      where: { userId: tradeOffer.initiatorUserId },
    });
    const accepter = await tx.user.findUnique({
      where: { userId: accepterUserId },
    });

    if (!initiator || !accepter) {
      throw new Error("User not found");
    }

    // Parse trade items
    const offeredRelicIds = JSON.parse(tradeOffer.offeredRelicIds);
    const requestedRelicIds = JSON.parse(tradeOffer.requestedRelicIds);
    const offeredMaterials = JSON.parse(tradeOffer.offeredMaterials);
    const requestedMaterials = JSON.parse(tradeOffer.requestedMaterials);

    // Validate initiator still owns offered items
    if (offeredRelicIds.length > 0) {
      const initiatorRelics = await tx.relic.findMany({
        where: {
          id: { in: offeredRelicIds },
          ownerUserId: tradeOffer.initiatorUserId,
          isLocked: false,
        },
      });
      if (initiatorRelics.length !== offeredRelicIds.length) {
        throw new Error("Initiator no longer owns some offered relics");
      }
    }

    // Validate accepter owns requested items
    if (requestedRelicIds.length > 0) {
      const accepterRelics = await tx.relic.findMany({
        where: {
          id: { in: requestedRelicIds },
          ownerUserId: accepterUserId,
          isLocked: false,
        },
      });
      if (accepterRelics.length !== requestedRelicIds.length) {
        throw new Error("You don't own some of the requested relics");
      }
    }

    // Validate both users have sufficient resources
    if (initiator.gold < tradeOffer.offeredGold) {
      throw new Error("Initiator has insufficient gold");
    }

    if (accepter.gold < tradeOffer.requestedGold) {
      throw new Error("You have insufficient gold");
    }

    const initiatorMaterials = JSON.parse(initiator.materials || "{}");
    const accepterMaterials = JSON.parse(accepter.materials || "{}");

    for (const [material, amount] of Object.entries(offeredMaterials)) {
      const amt = Number(amount);
      if ((initiatorMaterials[material] || 0) < amt) {
        throw new Error(`Initiator has insufficient ${material}`);
      }
    }

    for (const [material, amount] of Object.entries(requestedMaterials)) {
      const amt = Number(amount);
      if ((accepterMaterials[material] || 0) < amt) {
        throw new Error(`You have insufficient ${material}`);
      }
    }

    // Execute the trade
    // Transfer relics
    if (offeredRelicIds.length > 0) {
      await tx.relic.updateMany({
        where: { id: { in: offeredRelicIds } },
        data: { ownerUserId: accepterUserId },
      });
    }

    if (requestedRelicIds.length > 0) {
      await tx.relic.updateMany({
        where: { id: { in: requestedRelicIds } },
        data: { ownerUserId: tradeOffer.initiatorUserId },
      });
    }

    // Transfer gold
    const newInitiatorGold = initiator.gold - tradeOffer.offeredGold + tradeOffer.requestedGold;
    const newAccepterGold = accepter.gold - tradeOffer.requestedGold + tradeOffer.offeredGold;

    await tx.user.update({
      where: { userId: tradeOffer.initiatorUserId },
      data: { gold: newInitiatorGold },
    });

    await tx.user.update({
      where: { userId: accepterUserId },
      data: { gold: newAccepterGold },
    });

    // Transfer materials
    for (const [material, amount] of Object.entries(offeredMaterials)) {
      const amt = Number(amount);
      if (amt > 0) {
        initiatorMaterials[material] = (initiatorMaterials[material] || 0) - amt;
        accepterMaterials[material] = (accepterMaterials[material] || 0) + amt;
      }
    }

    for (const [material, amount] of Object.entries(requestedMaterials)) {
      const amt = Number(amount);
      if (amt > 0) {
        accepterMaterials[material] = (accepterMaterials[material] || 0) - amt;
        initiatorMaterials[material] = (initiatorMaterials[material] || 0) + amt;
      }
    }

    await tx.user.update({
      where: { userId: tradeOffer.initiatorUserId },
      data: { materials: JSON.stringify(initiatorMaterials) },
    });

    await tx.user.update({
      where: { userId: accepterUserId },
      data: { materials: JSON.stringify(accepterMaterials) },
    });

    // Update trade offer status
    await tx.tradeOffer.update({
      where: { id: tradeOfferId },
      data: { 
        status: "completed",
        completedAt: new Date(),
      },
    });

    // Create trade history record
    const estimatedValue = tradeOffer.offeredGold + tradeOffer.requestedGold; // Simple estimation
    await tx.tradeHistory.create({
      data: {
        tradeOfferId,
        user1Id: tradeOffer.initiatorUserId,
        user2Id: accepterUserId,
        user1Gave: JSON.stringify({
          relics: offeredRelicIds,
          gold: tradeOffer.offeredGold,
          materials: offeredMaterials,
        }),
        user2Gave: JSON.stringify({
          relics: requestedRelicIds,
          gold: tradeOffer.requestedGold,
          materials: requestedMaterials,
        }),
        tradeValue: estimatedValue,
      },
    });
  });
}

// Cancel a trade offer
export async function cancelTradeOffer(tradeOfferId: string, userId: string): Promise<void> {
  const prisma = getPrisma();

  const tradeOffer = await prisma.tradeOffer.findUnique({
    where: { id: tradeOfferId },
  });

  if (!tradeOffer) {
    throw new Error("Trade offer not found");
  }

  if (tradeOffer.initiatorUserId !== userId && tradeOffer.targetUserId !== userId) {
    throw new Error("You can only cancel your own trades or trades directed at you");
  }

  if (tradeOffer.status !== "pending") {
    throw new Error("Trade offer cannot be cancelled");
  }

  await prisma.tradeOffer.update({
    where: { id: tradeOfferId },
    data: { status: "cancelled" },
  });
}

// Get user's trade offers (sent and received)
export async function getUserTrades(userId: string, type: "sent" | "received" | "all" = "all") {
  const prisma = getPrisma();

  const where: any = {
    status: { in: ["pending", "accepted"] },
  };

  if (type === "sent") {
    where.initiatorUserId = userId;
  } else if (type === "received") {
    where.OR = [
      { targetUserId: userId },
      { targetUserId: "", offerType: "open" }, // Open trades
    ];
  } else {
    where.OR = [
      { initiatorUserId: userId },
      { targetUserId: userId },
      { targetUserId: "", offerType: "open" },
    ];
  }

  const trades = await prisma.tradeOffer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50, // Limit to prevent spam
  });

  return Promise.all(trades.map(trade => getTradeOfferDetails(trade.id)));
}

// Clean up expired trades
export async function cleanupExpiredTrades(): Promise<void> {
  const prisma = getPrisma();

  await prisma.tradeOffer.updateMany({
    where: {
      status: "pending",
      expiresAt: { lt: new Date() },
    },
    data: { status: "expired" },
  });
}

// Create a counter offer
export async function createCounterOffer(
  originalOfferId: string,
  counterOfferInput: Omit<CreateTradeOfferInput, "parentOfferId" | "offerType" | "targetUserId">
): Promise<TradeOfferDetails> {
  const prisma = getPrisma();

  const originalOffer = await prisma.tradeOffer.findUnique({
    where: { id: originalOfferId },
  });

  if (!originalOffer) {
    throw new Error("Original trade offer not found");
  }

  if (originalOffer.status !== "pending") {
    throw new Error("Cannot counter a non-pending trade");
  }

  // Create counter offer
  return createTradeOffer({
    ...counterOfferInput,
    offerType: "counteroffer",
    targetUserId: originalOffer.initiatorUserId,
    parentOfferId: originalOfferId,
  });
}
