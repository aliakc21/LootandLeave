const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const payoutSystem = require('../systems/payoutSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bank')
        .setDescription('Check your current gold balance'),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const balance = await payoutSystem.getBoosterBalance(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('💰 Your Balance')
                .setDescription(`Your current balance: **${balance.toLocaleString()}g**`)
                .setColor(0xFFD700)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.logError(error, { context: 'BANK_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
