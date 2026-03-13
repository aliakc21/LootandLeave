const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { getTicketRequestFields } = require('../systems/ticketSystem');
const { getBoostImageUrl } = require('../utils/mediaCatalog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('postjob')
        .setDescription('Post a job from a ticket to booster channels (Admin/Management only)')
        .addStringOption(option =>
            option.setName('ticket_id')
                .setDescription('The ticket ID')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Job description')
                .setRequired(false)),
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
            const ticketId = interaction.options.getString('ticket_id');
            const description = interaction.options.getString('description') || 'No description provided';

            const ticket = await Database.get(
                `SELECT * FROM tickets WHERE ticket_id = ?`,
                [ticketId]
            );

            if (!ticket) {
                return interaction.editReply({ content: '❌ Ticket not found.' });
            }

            const jobId = `job-${require('../utils/uuid').v4().substring(0, 8)}`;
            const jobsChannelId = process.env.CHANNEL_JOBS;

            if (!jobsChannelId) {
                return interaction.editReply({ content: '❌ CHANNEL_JOBS not configured.' });
            }

            const jobsChannel = await interaction.guild.channels.fetch(jobsChannelId);
            if (!jobsChannel) {
                return interaction.editReply({ content: '❌ Jobs channel not found.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 New Job Available')
                .setDescription(description)
                .addFields(
                    { name: '🆔 Job ID', value: `\`${jobId}\``, inline: true },
                    { name: '🎫 Ticket ID', value: `\`${ticketId}\``, inline: true },
                    { name: '👤 Client', value: `<@${ticket.client_id}>`, inline: true },
                    ...getTicketRequestFields(ticket)
                )
                .setImage(getBoostImageUrl(ticket))
                .setColor(0x5865F2)
                .setTimestamp();

            await jobsChannel.send({ embeds: [embed] });

            // Save job to database
            await Database.run(
                `INSERT INTO jobs (job_id, ticket_id, client_id, status) VALUES (?, ?, ?, ?)`,
                [jobId, ticketId, ticket.client_id, 'open']
            );

            logger.logAction('JOB_POSTED', interaction.user.id, { jobId, ticketId });
            await interaction.editReply({ content: `✅ Job posted successfully! Job ID: \`${jobId}\`` });
        } catch (error) {
            logger.logError(error, { context: 'POST_JOB_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
