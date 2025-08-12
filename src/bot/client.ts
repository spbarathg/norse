import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { performDrop } from "../engines/drop.js";
import { commandBuilders, handleCommand } from "./commands.js";

export function createClient() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", () => {
    console.log(`Logged in as ${client.user?.tag}`);
  });

  client.on("interactionCreate", async (interaction) => {
    console.log("Interaction received:", interaction.type, interaction.isCommand?.() ? interaction.commandName : "not a command");
    if (!interaction.isChatInputCommand()) {
      console.log("Not a chat input command, ignoring");
      return;
    }
    console.log("Processing chat input command:", interaction.commandName);
    await handleCommand(interaction);
  });

  return client;
}

export async function registerGuildCommands() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const guildId = process.env.DISCORD_GUILD_ID!;

  const commands = commandBuilders.map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log("Registered guild commands.");
}

export async function registerGlobalCommands() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.DISCORD_CLIENT_ID!;

  const commands = commandBuilders.map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Registered global commands.");
} 