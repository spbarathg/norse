import "dotenv/config";
import { registerGlobalCommands } from "./client.js";

registerGlobalCommands().catch((e) => {
  console.error(e);
  process.exit(1);
});

