import { 
  ButtonInteraction, 
  StringSelectMenuInteraction, 
  EmbedBuilder, 
  Colors 
} from "discord.js";

// Handle gauntlet button interactions
export async function handleGauntletButtonInteraction(interaction: ButtonInteraction) {
  const action = interaction.customId;
  
  try {
    switch (action) {
      case 'gauntlet_random':
        await handleGauntletRandomChallenge(interaction);
        break;
        
      case 'gauntlet_info':
        await handleGauntletInfoButton(interaction);
        break;
        
      case 'gauntlet_leaderboard':
        await interaction.reply({
          content: "Gauntlet leaderboards coming soon!",
          ephemeral: true
        });
        break;
        
      case 'gauntlet_preview_hazards':
        await handleGauntletPreviewHazards(interaction);
        break;
        
      case 'gauntlet_retreat':
        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle('Strategic Retreat')
            .setDescription('You have wisely chosen to retreat from this challenge.')
            .setColor(Colors.Yellow)],
          components: []
        });
        break;
        
      case 'gauntlet_retry':
        await interaction.reply({
          content: "Use `/gauntlet start` to retry the challenge!",
          ephemeral: true
        });
        break;
        
      case 'gauntlet_browse_others':
        await interaction.reply({
          content: "Use `/gauntlet browse` to see all available challenges!",
          ephemeral: true
        });
        break;
        
      case 'gauntlet_back_to_battle':
        await handleGauntletBackToBattle(interaction);
        break;
        
      default:
        if (action.startsWith('gauntlet_start_battle_')) {
          await handleGauntletStartBattle(interaction);
        } else {
          await interaction.reply({
            content: `❌ Unknown gauntlet action: ${action}`,
            ephemeral: true
          });
        }
    }
  } catch (error) {
    console.error('Gauntlet button interaction error:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred processing your gauntlet interaction.",
        ephemeral: true
      });
    }
  }
}

// Handle gauntlet select menu interactions
export async function handleGauntletSelectMenu(interaction: StringSelectMenuInteraction) {
  try {
    await interaction.deferReply();
    
    const selectedGauntletId = interaction.values[0];
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const gauntlets = req("../config/gauntlets.json");
    const selectedGauntlet = gauntlets.find((g: any) => g.id === selectedGauntletId);
    
    if (!selectedGauntlet) {
      await interaction.editReply({ content: "Gauntlet not found." });
      return;
    }
    
    // Start the gauntlet directly
    await startGauntletBattle(interaction, selectedGauntletId);
    
  } catch (error) {
    console.error('Gauntlet select menu error:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "An error occurred starting the gauntlet.",
        ephemeral: true
      });
    }
  }
}

async function handleGauntletRandomChallenge(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply();
    
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const gauntlets = req("../config/gauntlets.json");
    const randomGauntlet = gauntlets[Math.floor(Math.random() * gauntlets.length)];
    
    // Start the random gauntlet directly
    await startGauntletBattle(interaction, randomGauntlet.id);
    
  } catch (error) {
    console.error('Random gauntlet error:', error);
    await interaction.editReply({ content: "Failed to start random gauntlet." });
  }
}

async function handleGauntletInfoButton(interaction: ButtonInteraction) {
  try {
    const { handleGauntletInfo } = await import("./gauntletHandlers.js");
    
    // Create a mock interaction for info
    const mockInteraction = {
      ...interaction,
      deferReply: async (options: any) => interaction.deferReply(options),
      editReply: (options: any) => interaction.editReply(options)
    } as any;
    
    await handleGauntletInfo(mockInteraction);
    
  } catch (error) {
    console.error('Gauntlet info error:', error);
    await interaction.reply({
      content: "❌ Failed to load gauntlet information.",
      ephemeral: true
    });
  }
}

async function handleGauntletPreviewHazards(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const hazards = req("../config/hazards.json");
    
    const previewEmbed = new EmbedBuilder()
      .setTitle("Environmental Hazards Preview")
      .setDescription("**These environmental effects will influence the battle:**")
      .setColor(Colors.Orange);

    // Show a few example hazards
    hazards.slice(0, 5).forEach((hazard: any) => {
      previewEmbed.addFields({
        name: `${hazard.name}`,
        value: hazard.description || 'Environmental hazard effect',
        inline: false
      });
    });

    await interaction.editReply({ embeds: [previewEmbed] });
    
  } catch (error) {
    console.error('Hazard preview error:', error);
    await interaction.editReply({ content: "❌ Failed to load hazard preview." });
  }
}

async function handleGauntletStartBattle(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply();
    
    // Extract gauntlet ID from custom ID
    const gauntletId = interaction.customId.replace('gauntlet_start_battle_', '');
    
    // Start the gauntlet battle directly
    await startGauntletBattle(interaction, gauntletId);
    
  } catch (error) {
    console.error('Gauntlet start battle error:', error);
    await interaction.editReply({ content: "Failed to start gauntlet battle." });
  }
}

async function handleGauntletBackToBattle(interaction: ButtonInteraction) {
  try {
    await interaction.update({
      content: "Use `/gauntlet start` to begin a new challenge!",
      embeds: [],
      components: []
    });
  } catch (error) {
    console.error('Back to battle error:', error);
    await interaction.reply({
      content: "Failed to navigate back.",
      ephemeral: true
    });
  }
}

// Direct gauntlet battle starter that works with already-deferred interactions
async function startGauntletBattle(interaction: any, gauntletId: string) {
  try {
    const userId = interaction.user.id;
    const { getPrisma } = await import("../lib/db.js");
    const { selectPlayerTeamFromShrine } = await import("../engines/shrine.js");
    const { handleBattleCommand } = await import("./battleHandlers.js");

    const prisma = getPrisma();

    // Get gauntlet data
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const gauntlets = req("../config/gauntlets.json");
    const selectedGauntlet = gauntlets.find((g: any) => g.id === gauntletId);

    if (!selectedGauntlet) {
      await interaction.editReply({ content: "Gauntlet not found." });
      return;
    }

    // Get player team
    const allies = await selectPlayerTeamFromShrine(userId, prisma);
    if (allies.length === 0) {
      await interaction.editReply({
        content: "You don't have any characters in your shrine for this gauntlet!\nUse `/shrine setup` to configure your team."
      });
      return;
    }

    // Reuse the existing interaction instance to preserve prototype methods
    const battleInteraction: any = interaction;
    battleInteraction.commandName = 'battle';
    // Prevent double-defer errors
    battleInteraction.deferReply = async () => {};
    // Provide the options expected by handleBattleCommand
    battleInteraction.options = {
      getString: (name: string) => (name === 'gauntlet' ? gauntletId : null),
      getInteger: (name: string) => (name === 'difficulty' ? 1 : null),
      getBoolean: (_name: string) => false,
    };

    // Start the battle
    await handleBattleCommand(battleInteraction);

  } catch (error) {
    console.error('Start gauntlet battle error:', error);
    await interaction.editReply({ content: "Failed to start the gauntlet battle." });
  }
}
