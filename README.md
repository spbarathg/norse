# Norse – Living Relics Discord Bot

## Status: Active, feature-complete MVP

This repository contains a Discord bot and REST API for a collectible "Living Relics" game. It includes relic drops, missions, trading, a basic marketplace, decay, in‑game time, and public Discord embeds. This README reflects the current codebase.

## Features

- **Relic Drops**: Deterministic RNG per user+nonce; rarity tiers S/A/B/C; premium relic IDs (e.g., `E1ZE3K`).
- **Collections**: Public collection pages with pagination and quick actions; global relic viewer by ID.
- **Missions**: Start, complete (job), and claim rewards; relic locking during missions; rewards grant gold/materials/xp.
- **Economy**: User gold and materials stored per account; public balance display; daily reward with 7‑day streak bonuses.
- **Marketplace (basic)**: List and buy relics for gold via slash commands and REST API.
- **Player Trading (offers)**: Create direct/open/counter trade offers including relics, gold, and materials; accept/cancel; public browse and history.
- **Decay**: Hourly durability decay with rarity/era modifiers; evolution stage updates; history logging.
- **In‑game Time**: Configurable clock used for timestamps and eras.
- **Public Embeds**: All command replies are public (non‑ephemeral) and use clean embeds and components.

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

## Discord Commands

- `/drop` — Summon a new relic with rarity and character; shows action buttons.
- `/missions start mission_id relic_ids` — Start mission with comma‑separated relic IDs.
- `/missions claim mission_id` — Claim rewards after job completion.
- `/market list relic_id price` — List a relic for sale.
- `/market buy listing_id` — Buy a market listing.
- `/collection [page]` — View your relic collection.
- `/view relic_id` — Public view of any relic by ID.
- `/balance` — Show your gold and materials with quick actions.
- `/daily` — Claim daily rewards with streaks and bonuses.
- `/profile [player] [page]` — Show a player profile with a collection pane.
- `/lookup [search] [page]` — Browse all characters; search by name/pantheon/class/element. Sorted by rarity.
- `/trade offer [player] [message]` — Create a trade offer (open if no player).
- `/trade list [type]` — View sent/received/open/all trades.
- `/trade view trade_id` — View trade details.
- `/trade accept trade_id` — Accept a trade.
- `/trade cancel trade_id` — Cancel a trade (initiator/target).
- `/trade history [page]` — View your completed trade history.
- `/browse trades|market [page]` — Browse open trades or market listings.

Notes:
- Replies are public; embeds are viewable by everyone in channel.
- IDs: Relics use premium IDs; `generateRelicId` ensures uniqueness.

## REST API

- `GET /api/health` — Healthcheck.
- `POST /api/drop` — Body: `{ userId, nonce? }` or header `x-bot-user-id`; returns relic info and embed.
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
- Portraits: `public/portraits/*.png` served under `/cdn/portraits/<slug>.png`.

## Architecture

- Bot: `discord.js` (intents: Guilds) with slash commands and interactive components.
- API: Express router under `/api` with modular subrouters for market and trade.
- Persistence: SQLite via Prisma; JSON stored as strings where appropriate for SQLite.
- Time: `TIME_SCALE` and `IG_EPOCH_REAL_ISO` control in‑game timestamp formatting.
- Decay: Batch updates unlocked relics; rarity and era modifiers; write history entries.
- Trading: Validations for ownership/locks/balances; atomic DB transactions; history log.

## Design Notes

- Public, non‑ephemeral messaging and embeds to encourage social play.
- Clean, minimal embeds with clear icons/colors; consistent action/navigation rows.
- Deterministic RNG for fairness and reproducibility of drops.
- Premium human‑readable relic IDs for shareability.

## Housekeeping

- Only this README is kept as project documentation. All other docs have been removed.
- Unused dependencies: `bullmq` is present but not used in code; `redis` helper exists but is not referenced.
- Overlays: README no longer references non‑existent overlays folder.

## Production Tips

- Consider PostgreSQL in production; update `prisma/schema.prisma` and `DATABASE_URL`.
- Add background job scheduling for decay and mission completion.
- Ensure proper bot scopes: `applications.commands` and necessary channel permissions.
