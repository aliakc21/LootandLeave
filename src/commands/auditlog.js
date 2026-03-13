const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auditlog')
        .setDescription('View audit logs (Admin/Management only)')
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of logs to retrieve (default: 10, max: 50)')
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
            const limit = Math.min(interaction.options.getInteger('limit') || 10, 50);

            const logs = await Database.all(
                `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?`,
                [limit]
            );

            if (logs.length === 0) {
                await interaction.editReply({ content: 'No audit logs found.' });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 Audit Logs')
                .setColor(0x5865F2)
                .setTimestamp();

            const logList = logs.map((log, idx) => 
                `**${idx + 1}.** [${log.level}] ${log.action}\n   User: ${log.user_id || 'SYSTEM'}\n   Time: ${new Date(log.timestamp).toLocaleString()}`
            ).join('\n\n');

            embed.setDescription(logList.substring(0, 4096)); // Discord embed limit

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.logError(error, { context: 'AUDIT_LOG_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
