import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./api/routes.js";
import { createClient } from "./bot/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URL'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error("Missing required environment variables:", missingEnvVars);
    console.error("Please create a .env file with the following variables:");
    console.error("DATABASE_URL=file:./prisma/dev.db");
    console.error("DISCORD_TOKEN=your_bot_token");
    console.error("DISCORD_CLIENT_ID=your_client_id");
    console.error("DISCORD_GUILD_ID=your_guild_id (optional for guild commands)");
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api", router);

  // serve dev assets under /cdn
  const publicDir = path.resolve(__dirname, "../public");
  app.use("/cdn", express.static(publicDir));

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`API listening on :${port}`));

  const client = createClient();
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.warn("DISCORD_TOKEN not set. Bot will not log in.");
    console.warn("To run the Discord bot, add DISCORD_TOKEN to your .env file");
  } else {
    console.log("Attempting to login to Discord...");
    try {
      await client.login(token);
    } catch (error) {
      console.error("Failed to login to Discord:", error);
      console.error("Please check your DISCORD_TOKEN in the .env file");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 