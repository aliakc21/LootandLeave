const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const payoutSystem = require('../systems/payoutSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('payout')
        .setDescription('Process a payout for completed job/event (Admin/Management only)')
        .addIntegerOption(option =>
            option.setName('total_gold')
                .setDescription('Total gold amount')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('booster_ids')
                .setDescription('Comma-separated list of booster Discord IDs')
                .setRequired(true)),
    async execute(interaction) {
        // Permission check
        const adminRole = process.env.ROLE_ADMIN;
        const managementRole = process.env.ROLE_MANAGEMENT;
        const isServerAdmin = interaction.member.permissions.has('Administrator');
        const hasAdminRole = adminRole && interaction.member.roles.cache.has(adminRole);
        const hasManagementRole = managementRole && interaction.member.roles.cache.has(managementRole);

        if (!isServerAdmin && !hasAdminRole && !hasManagementRole) {
            return interaction.reply({
                content: 'You do not have permission to use this command. You need Administrator permissions or Admin/Management role.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const totalGold = interaction.options.getInteger('total_gold');
            const boosterIdsString = interaction.options.getString('booster_ids');
            const boosterIds = boosterIdsString.split(',').map(id => id.trim());

            const result = await payoutSystem.processPayout(totalGold, boosterIds, interaction.user.id, null, null);

            const embed = new EmbedBuilder()
                .setTitle('💰 Payout Processed')
                .addFields(
                    { name: '📋 Payout ID', value: `\`${result.payoutId}\``, inline: true },
                    { name: '💰 Total Gold', value: `${totalGold.toLocaleString()}g`, inline: true },
                    { name: '🏛️ Treasury', value: `${result.treasuryAmount.toLocaleString()}g`, inline: true },
                    { name: '📢 Advertiser', value: `${result.advertiserAmount.toLocaleString()}g`, inline: true },
                    { name: '👥 Boosters (Total)', value: `${result.boosterTotalAmount.toLocaleString()}g`, inline: true },
                    { name: '👤 Per Booster', value: `${result.boosterIndividualAmount.toLocaleString()}g`, inline: true },
                    { name: '👥 Participants', value: `${boosterIds.length} booster(s)`, inline: false }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.logError(error, { context: 'PAYOUT_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
