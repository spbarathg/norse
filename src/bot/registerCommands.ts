import "dotenv/config";
import { registerGuildCommands, registerGlobalCommands } from "./client.js";

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token) {
    console.error("DISCORD_TOKEN is required");
    process.exit(1);
  }

  if (!clientId) {
    console.error("DISCORD_CLIENT_ID is required");
    process.exit(1);
  }

  console.log("Registering commands...");
  
  try {
    if (guildId) {
      console.log(`Trying guild commands for guild ${guildId} first...`);
      try {
        await registerGuildCommands();
        console.log("✅ Guild commands registered successfully");
        return;
      } catch (guildError: any) {
        if (guildError.code === 50001) {
          console.log("⚠️ Bot doesn't have guild permissions, falling back to global commands...");
        } else {
          throw guildError;
        }
      }
    }
    
    console.log("Registering global commands...");
    await registerGlobalCommands();
    console.log("✅ Global commands registered successfully");
    console.log("Note: Global commands may take up to 1 hour to appear in Discord");
  } catch (error) {
    console.error("❌ Failed to register commands:", error);
    console.error("Make sure your bot has the 'applications.commands' scope and proper permissions");
    process.exit(1);
  }
}

main(); 