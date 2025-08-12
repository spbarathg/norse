import express from "express";
import { performDrop } from "../engines/drop.js";
import { getPrisma } from "../lib/db.js";

export const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.post("/drop", async (req, res) => {
  try {
    const userId = (req.headers["x-bot-user-id"] as string) || req.body.userId;
    if (!userId) return res.status(400).json({ error: "missing userId" });
    const result = await performDrop({ userId, nonce: req.body.nonce });
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