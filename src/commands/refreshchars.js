const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refreshchars')
        .setDescription('Refresh one character or all registered characters from Raider.IO')
        .addStringOption(option =>
            option.setName('character_name')
                .setDescription('Character name')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('realm')
                .setDescription('Realm name')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const characterName = interaction.options.getString('character_name');
            const realm = interaction.options.getString('realm');

            if ((characterName && !realm) || (!characterName && realm)) {
                await interaction.editReply({ content: '❌ Provide both `character_name` and `realm`, or leave both empty to refresh all characters.' });
                return;
            }

            if (!characterName && !realm) {
                const result = await characterSystem.refreshBoosterCharacters(interaction.user.id);
                if (result.success) {
                    await interaction.editReply({
                        content: `✅ Refreshed ${result.refreshedCount}/${result.checked} selected character(s) from Raider.IO.${result.failedCount ? ` Failed: ${result.failedCount}.` : ''}`
                    });
                } else {
                    await interaction.editReply({ content: `❌ ${result.message}` });
                }
                return;
            }

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
