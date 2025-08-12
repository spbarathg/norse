import "dotenv/config";
import { registerGuildCommands } from "./client.js";

registerGuildCommands().catch((e) => {
  console.error(e);
  process.exit(1);
}); 