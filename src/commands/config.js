const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage bot configuration (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('get')
                .setDescription('Get a configuration value')
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('Configuration key')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a configuration value')
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('Configuration key')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('Configuration value')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all configuration values')),
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
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'get') {
                const key = interaction.options.getString('key');
                const value = await config.getConfig(key);
                await interaction.editReply({ content: `**${key}:** ${value !== null ? value : 'Not set'}` });
            } else if (subcommand === 'set') {
                const key = interaction.options.getString('key');
                const value = interaction.options.getString('value');
                await config.setConfig(key, value, interaction.user.id);
                await interaction.editReply({ content: `✅ Configuration updated: **${key}** = **${value}**` });
            } else if (subcommand === 'list') {
                const allConfig = await config.getAllConfig();
                const embed = new EmbedBuilder()
                    .setTitle('📋 Bot Configuration')
                    .setColor(0x5865F2)
                    .setTimestamp();

                const configList = Object.entries(allConfig)
                    .map(([key, value]) => `**${key}:** ${value}`)
                    .join('\n');

                embed.setDescription(configList || 'No configuration values set.');
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            logger.logError(error, { context: 'CONFIG_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
