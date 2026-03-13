const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registerchar')
        .setDescription('Register a World of Warcraft character')
        .addStringOption(option =>
            option.setName('character_name')
                .setDescription('Character name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('realm')
                .setDescription('Realm name (e.g., Silvermoon)')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const characterName = interaction.options.getString('character_name');
            const realm = interaction.options.getString('realm');

            const result = await characterSystem.registerCharacter(interaction.user.id, characterName, realm);

            if (result.success) {
                await interaction.editReply({ 
                    content: `✅ ${result.message}\n**Class:** ${result.characterData.class}\n**Spec:** ${result.characterData.spec}\n**Item Level:** ${result.characterData.itemLevel}\n**RIO Score:** ${result.characterData.rioScore}` 
                });
            } else {
                await interaction.editReply({ content: `❌ ${result.message}` });
            }
        } catch (error) {
            logger.logError(error, { context: 'REGISTER_CHAR_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
