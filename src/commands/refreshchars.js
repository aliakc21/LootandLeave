const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refreshchars')
        .setDescription('Refresh character data from Raider.IO')
        .addStringOption(option =>
            option.setName('character_name')
                .setDescription('Character name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('realm')
                .setDescription('Realm name')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const characterName = interaction.options.getString('character_name');
            const realm = interaction.options.getString('realm');

            const result = await characterSystem.refreshCharacter(interaction.user.id, characterName, realm);

            if (result.success) {
                await interaction.editReply({ 
                    content: `✅ ${result.message}\n**Item Level:** ${result.characterData.itemLevel}\n**RIO Score:** ${result.characterData.rioScore}` 
                });
            } else {
                await interaction.editReply({ content: `❌ ${result.message}` });
            }
        } catch (error) {
            logger.logError(error, { context: 'REFRESH_CHARS_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
