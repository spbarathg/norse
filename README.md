# Norse — Mythology Card RPG for Discord

Status: actively developed (Phase 2 complete — unified gacha, upgrades, customization, quests)

This repository contains a modern Discord game where players collect mythic characters as “Relics,” upgrade and customize them, battle in gauntlets, run missions, trade with others, and flex their collection — all with clean, public embeds.

## Feature Set (current)

- **Unified Gacha (pull)**: `/pull` rolls a character with reveal animation. If the player already owns it, the duplicate is auto‑converted to Mythic Essence (C 10, B 50, A 200, S 500). Premium human‑readable IDs.
  - Banners supported with tuned rates and soft pity (small A/S boosts the longer you go without them).
  - Pull rate limit: max 20/min, and 1/2s per user.
- **Collections & Profile**: `/inventory` with pagination/sorting, quick actions; `/profile` shows currencies (Gold, Gacha Coins, Mythic Essence), collection count, featured relic, achievements, missions/trades stats.
- **Upgrades**: `/relic upgrade [relic_id]` spends Mythic Essence — cost = 25 × nextLevel²; stats per level: HP +5, ATK +3, DEF +2.
- **Customization**: `/relic customize [relic_id] [style]` unlocks/apply art styles (default unlock cost 100 Essence); stores `activeArtStyle` + `unlockedStyles`.
- **Missions**: `/missions start|claim` — timed jobs with relic locks; claim gold/materials rewards.
- **Combat/Gauntlets**: `/gauntlet browse|start` — turn‑based engine with start‑of‑battle shrine/gauntlet effects, speed‑ordered turns, buffs/debuffs (stun/sleep/freeze, DOTs), on‑hit and defeat triggers, positional mitigation, hazards and affinities. Returns timeline + MVP.
- **Shrine (Team)**: `/shrine view|setup|set|align|effigy|clear` — formation, pantheon alignment, effigies, and team bonuses.
- **Marketplace**: `/market list|buy|browse` — list relics, buy, and browse publicly.
- **Trading**: `/trade offer|list|view|accept|cancel|history` — direct/open/counter offers; atomic swaps; history.
- **Daily & Quests**: `/daily` grants Gacha Coins (24h cooldown). `/quests` shows daily (pull 3, upgrade 1, lookup 1) and weekly (gauntlet 3) — progress auto‑tracked.
- **Lookup**: `/lookup` character database with select‑to‑view details and portrait; back‑to‑list.
- **Leaderboards**: `/leaderboard` richest, collectors, missions with selector.
- **Analytics**: `AnalyticsEvent` table for lightweight telemetry (leaderboard views, achievements checks; extensible).
- **Public Embeds**: All messages are public by design to promote social play.

## Quick Start

```bash
npm i

# Prisma
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# Register Discord commands (guild if DISCORD_GUILD_ID set, otherwise global)
npm run register-commands

# Run API + bot (PORT=3000 default)
npm run dev
```

Environment variables in `.env`:
- `DATABASE_URL` (e.g., `file:./prisma/dev.db`)
- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` (optional; for faster guild registrations)
- `TIME_SCALE` (default `3600`)
- `IG_EPOCH_REAL_ISO` (default `2025-01-01T00:00:00Z`)
- `CDN_BASE_URL` (default `http://localhost:3000/cdn`)
 - `DAILY_GACHA_COINS` (default `10`)
 - `CARD_MAX_LEVEL` (default `10`)
 - `STYLE_UNLOCK_ESSENCE` (default `100`)

## Discord Commands

- Core: `pull`, `inventory`, `profile`, `daily`, `quests`, `lookup`, `leaderboard`
- Relic: `relic view`, `relic upgrade`, `relic customize`
- Missions: `missions start`, `missions claim`
- Shrine: `shrine view|setup|set|align|effigy|clear`
- Market: `market list|buy|browse`
- Trade: `trade offer|list|view|accept|cancel|history`
- Gauntlet: `gauntlet browse|start`

Notes:
- Replies are public; embeds are viewable by everyone in channel.
- IDs: Relics use premium IDs; `generateRelicId` ensures uniqueness.

## REST API (subset)

- `GET /api/health` — Healthcheck.
- `POST /api/drop` — Uses the unified gacha flow (duplicate‑to‑essence) for consistency.
- `GET /api/relics/:id` — Get relic by ID.
- Missions: `POST /api/missions/start`, `/complete`, `/claim`.
- Decay: `POST /api/decay/tick` — Runs decay tick over unlocked relics.
- Market:
  - `GET /api/market/listings?{page,pageSize,rarity,eraId}`
  - `POST /api/market/list` — `{ sellerUserId, relicId, priceGold }`
  - `POST /api/market/buy` — `{ buyerUserId, listingId }`
- Trade:
  - `GET /api/trade/user/:userId?type=sent|received|all`
  - `GET /api/trade/:tradeId`
  - `POST /api/trade/create`
  - `POST /api/trade/:tradeId/accept` — `{ accepterUserId }`
  - `POST /api/trade/:tradeId/cancel` — `{ userId }`
  - `POST /api/trade/:tradeId/counter` — counter‑offer body
  - `GET /api/trade/browse/open?{page,pageSize}`
  - `GET /api/trade/history/:userId?{page,pageSize}`
  - `POST /api/trade/admin/cleanup`

## Data & Assets

- Characters: `data/allgodschars.json` (used for drops, lookup, and embeds).
- Eras: `src/config/eras.json` (seeded to DB via `prisma/seed.ts`).
- Missions: `src/config/missions.json`.
- Portraits: `public/portraits/*.png` served under `/cdn/portraits/<slug>.png` (details view attaches local asset in dev to avoid caching).
- Frame previews: `npm run preview-frames` (uses `sharp`) with margins/fit/position/offset flags; outputs to `public/previews`.

## Architecture

- Bot: `discord.js` (intents: Guilds) with slash commands and interactive components.
- API: Express router under `/api` with modular subrouters for market and trade.
- Persistence: SQLite via Prisma; JSON stored as strings where appropriate for SQLite.
- Time: `TIME_SCALE` and `IG_EPOCH_REAL_ISO` control in‑game timestamp formatting.
- Decay: Batch updates unlocked relics; rarity and era modifiers; write history entries. (Available; not central to Phase 2.)
- Trading: Validations for ownership/locks/balances; atomic DB transactions; history log.

## Combat Overview

- Turn‑based simulator with clear phases:
  - OnBattleStart: shrine bonuses, structured passives, codex fallback, gauntlet hazards
  - Turn order by effective SPD each round; incapacitation checks (stun/sleep/freeze)
  - Pre‑attack buff/debuff math; positional mitigation for backline
  - On‑hit and on‑being‑attacked effects (cleave, DOT application, lifesteal, resistance)
  - Defeat triggers (revive, team auras) and structured on‑enemy/ally defeat hooks
  - End when a team is wiped or turn cap reached; returns winner + timeline + MVP

## Design Notes

- Public, non‑ephemeral messaging and embeds to encourage social play.
- Clean, minimal embeds with clear icons/colors; consistent action/navigation rows.
- Deterministic RNG for fairness and reproducibility of drops.
- Premium human‑readable relic IDs for shareability.

## Housekeeping

- Public, non‑ephemeral UX; social flex and clean navigation in every embed.
- Deterministic RNG and premium relic IDs for memorable sharing.
- JSON‑backed flexible fields for SQLite (materials/currencies/history/metadata).

## Production Tips

- Consider PostgreSQL in production; update `prisma/schema.prisma` and `DATABASE_URL`.
- Add background job scheduling for decay and mission completion.
- Ensure proper bot scopes: `applications.commands` and necessary channel permissions.
