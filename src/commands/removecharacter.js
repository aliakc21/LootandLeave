const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removecharacter')
        .setDescription('Remove one of your registered characters')
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

            const result = await characterSystem.removeCharacter(interaction.user.id, characterName, realm);

            if (result.success) {
                await interaction.editReply({ content: `✅ ${result.message}` });
            } else {
                await interaction.editReply({ content: `❌ ${result.message}` });
            }
        } catch (error) {
            logger.logError(error, { context: 'REMOVE_CHARACTER_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};

