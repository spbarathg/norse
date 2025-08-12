import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { performDrop } from "../engines/drop.js";

export function createClient() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", () => {
    console.log(`Logged in as ${client.user?.tag}`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "drop") {
      await interaction.deferReply();
      const userId = interaction.user.id;
      const result = await performDrop({ userId });
      await interaction.editReply({ embeds: [result.embed] });
    }
  });

  return client;
}

export async function registerGuildCommands() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const guildId = process.env.DISCORD_GUILD_ID!;

  const commands = [
    new SlashCommandBuilder().setName("drop").setDescription("Summon a new Living Relic")
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log("Registered guild commands.");
} 