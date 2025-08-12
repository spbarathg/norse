# Norse – Living Relics Discord Bot (MVP)

Run Postgres and Redis (Docker recommended), then install deps, generate Prisma client, register commands, and start dev server.

```bash
# start services
docker-compose up -d

# install deps
npm i

# prisma client
npm run prisma:generate

# copy env and fill values
# .env file should include DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DATABASE_URL, REDIS_URL

# register slash commands (guild-scoped)
npm run register-commands

# start api+bot
env PORT=3000 npm run dev
```

Slash commands:
- `/drop` — summon relic and receive cinematic embed. 