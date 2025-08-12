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
  } else {
    await client.login(token);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 