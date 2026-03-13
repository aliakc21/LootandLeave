const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const calendarSystem = require('../systems/calendarSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancelevent')
        .setDescription('Cancel an event (Admin/Management only)')
        .addStringOption(option =>
            option.setName('event_id')
                .setDescription('The ID of the event to cancel')
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
            const result = await calendarSystem.cancelEvent(eventId, interaction.user.id);

            if (result.success) {
                await interaction.editReply({ content: `✅ ${result.message}` });
            } else {
                await interaction.editReply({ content: `❌ ${result.message}` });
            }
        } catch (error) {
            logger.logError(error, { context: 'CANCEL_EVENT_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
