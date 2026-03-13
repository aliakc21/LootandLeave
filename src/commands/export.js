const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const excelExport = require('../systems/excelExport');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('export')
        .setDescription('Export all data to Excel (Admin only)'),
    async execute(interaction) {
        // Permission check
        const adminRole = process.env.ROLE_ADMIN;
        const isServerAdmin = interaction.member.permissions.has('Administrator');
        const hasAdminRole = adminRole && interaction.member.roles.cache.has(adminRole);

        if (!isServerAdmin && !hasAdminRole) {
            return interaction.reply({
                content: 'You do not have permission to use this command. You need Administrator permissions or Admin role.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const result = await excelExport.exportToExcel();
            await interaction.editReply({ content: `✅ Data exported successfully!\n**File:** ${result.fileName}\n**Path:** ${result.filePath}` });
        } catch (error) {
            logger.logError(error, { context: 'EXPORT_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
