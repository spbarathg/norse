import express from "express";
import { performGacha } from "../engines/drop.js";
import { getPrisma } from "../lib/db.js";
import { marketRouter } from "./market.js";
import { tradeRouter } from "./trade.js";
import { startMission, claimMission, completeMissionJob } from "../engines/missions.js";
import { runDecayTick } from "../engines/decay.js";

export const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.post("/drop", async (req, res) => {
  try {
    const userId = (req.headers["x-bot-user-id"] as string) || req.body.userId;
    if (!userId) return res.status(400).json({ error: "missing userId" });
    const result = await performGacha({ userId, nonce: req.body.nonce });
    res.json({
      id: result.relicId,
      character_id: result.characterId,
      embed: result.embed,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "server_error" });
  }
});

router.get("/relics/:id", async (req, res) => {
  try {
    const prisma = getPrisma();
    const relic = await prisma.relic.findUnique({ where: { id: req.params.id } });
    if (!relic) return res.status(404).json({ error: "not_found" });
    res.json(relic);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "server_error" });
  }
});

// Missions
router.post("/missions/start", async (req, res) => {
  try {
    const { userId, relicIds, missionId } = req.body;
    const mission = await startMission(userId, relicIds, missionId);
    res.json({ mission });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "bad_request" });
  }
});

router.post("/missions/complete", async (req, res) => {
  try {
    const { missionId } = req.body;
    const result = await completeMissionJob(missionId);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "bad_request" });
  }
});

router.post("/missions/claim", async (req, res) => {
  try {
    const { userId, missionId } = req.body;
    const result = await claimMission(userId, missionId);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "bad_request" });
  }
});

// Decay trigger (admin/worker)
router.post("/decay/tick", async (_req, res) => {
  try {
    const result = await runDecayTick();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "server_error" });
  }
});

// Marketplace
router.use("/market", marketRouter);

// Trading System
router.use("/trade", tradeRouter); 