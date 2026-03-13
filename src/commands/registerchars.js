const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registerchars')
        .setDescription('Register multiple World of Warcraft characters at once')
        .addStringOption(option =>
            option.setName('characters')
                .setDescription('Use Character-Realm entries separated by commas or new lines')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const charactersInput = interaction.options.getString('characters');
            const result = await characterSystem.registerMultipleCharacters(interaction.user.id, charactersInput);

            if (!result.success) {
                await interaction.editReply({ content: `❌ ${result.message}` });
                return;
            }

            const lines = [
                `✅ Registered or updated ${result.successes.length} character(s).`,
            ];

            if (result.successes.length > 0) {
                lines.push(`Success: ${result.successes.join(', ')}`);
            }

            if (result.failures.length > 0) {
                lines.push(`Failed: ${result.failures.join(' | ')}`.slice(0, 1900));
            }

            await interaction.editReply({ content: lines.join('\n') });
        } catch (error) {
            logger.logError(error, { context: 'REGISTER_CHARS_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
