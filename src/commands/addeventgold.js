const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const calendarSystem = require('../systems/calendarSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addeventgold')
        .setDescription('Add gold to an event\'s balance pool (Admin/Management only)')
        .addStringOption(option =>
            option.setName('event_id')
                .setDescription('The ID of the event to add gold to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('The amount of gold to add')
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
            const eventId = interaction.options.getString('event_id');
            const amount = interaction.options.getInteger('amount');

            if (amount <= 0) {
                return interaction.editReply({ content: '❌ Amount must be a positive number.' });
            }

            const result = await calendarSystem.addGoldToEvent(eventId, amount);

            if (result.success) {
                await interaction.editReply({ content: `✅ ${amount.toLocaleString()}g added to event \`${eventId}\` balance pool.` });
            } else {
                await interaction.editReply({ content: `❌ Failed to add gold: ${result.message}` });
            }
        } catch (error) {
            logger.logError(error, { context: 'ADD_EVENT_GOLD_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ An error occurred while adding gold to the event: ${error.message}` });
        }
    },
};
