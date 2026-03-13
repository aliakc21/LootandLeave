const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { parseCutConfig, formatCutRates } = require('../utils/cutConfig');
const calendarSystem = require('../systems/calendarSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seteventcuts')
        .setDescription('Set or reset the cut configuration for an event')
        .addStringOption(option =>
            option.setName('event_id')
                .setDescription('The event ID')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('cuts')
                .setDescription('Optional cut config in the format 30/10/60. Leave empty to reset to defaults.')
                .setRequired(false)),
    async execute(interaction) {
        const adminRole = process.env.ROLE_ADMIN;
        const managementRole = process.env.ROLE_MANAGEMENT;
        const isServerAdmin = interaction.member.permissions.has('Administrator');
        const hasAdminRole = adminRole && interaction.member.roles.cache.has(adminRole);
        const hasManagementRole = managementRole && interaction.member.roles.cache.has(managementRole);

        if (!isServerAdmin && !hasAdminRole && !hasManagementRole) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const eventId = interaction.options.getString('event_id');
            const cutsInput = interaction.options.getString('cuts');
            const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventId]);

            if (!event) {
                await interaction.editReply({ content: '❌ Event not found.' });
                return;
            }

            if (!cutsInput) {
                await Database.run(
                    `UPDATE events
                     SET cut_treasury_rate = NULL, cut_advertiser_rate = NULL, cut_booster_rate = NULL
                     WHERE event_id = ?`,
                    [eventId]
                );
                await calendarSystem.updateEventRoster(eventId);
                await interaction.editReply({ content: '✅ Event cuts reset to default env/config values.' });
                return;
            }

            const cuts = parseCutConfig(cutsInput);
            await Database.run(
                `UPDATE events
                 SET cut_treasury_rate = ?, cut_advertiser_rate = ?, cut_booster_rate = ?
                 WHERE event_id = ?`,
                [cuts.treasuryRate, cuts.advertiserRate, cuts.boosterRate, eventId]
            );
            await calendarSystem.updateEventRoster(eventId);

            await interaction.editReply({ content: `✅ Event cuts updated: ${formatCutRates(cuts)}` });
        } catch (error) {
            logger.logError(error, { context: 'SET_EVENT_CUTS_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ ${error.message}` });
        }
    },
};
