const { SlashCommandBuilder, MessageFlags, ChannelType } = require('discord.js');
const logger = require('../utils/logger');
const channelVisibilitySystem = require('../systems/channelVisibilitySystem');

function hasAdminAccess(interaction) {
    const adminRole = process.env.ROLE_ADMIN;
    return interaction.member.permissions.has('Administrator')
        || Boolean(adminRole && interaction.member.roles.cache.has(adminRole));
}

function describeChannel(channel) {
    if (channel.type === ChannelType.GuildCategory) {
        return `category \`${channel.name}\``;
    }

    return `channel ${channel}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channelvisibility')
        .setDescription('Grant or remove role visibility for a channel or category')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set visibility for a role on a channel or category')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to grant visibility to')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('target')
                        .setDescription('Channel or category to update')
                        .addChannelTypes(
                            ChannelType.GuildCategory,
                            ChannelType.GuildText,
                            ChannelType.GuildVoice,
                            ChannelType.GuildAnnouncement,
                            ChannelType.GuildForum
                        )
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('send_messages')
                        .setDescription('Also allow sending messages')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('read_history')
                        .setDescription('Allow reading message history')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a saved visibility rule from a channel or category')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to remove')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('target')
                        .setDescription('Channel or category to update')
                        .addChannelTypes(
                            ChannelType.GuildCategory,
                            ChannelType.GuildText,
                            ChannelType.GuildVoice,
                            ChannelType.GuildAnnouncement,
                            ChannelType.GuildForum
                        )
                        .setRequired(true))),
    async execute(interaction) {
        if (!hasAdminAccess(interaction)) {
            await interaction.reply({
                content: 'You do not have permission to use this command. You need Administrator permissions or Admin role.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const subcommand = interaction.options.getSubcommand();
            const role = interaction.options.getRole('role');
            const target = interaction.options.getChannel('target');

            if (subcommand === 'set') {
                const sendMessages = interaction.options.getBoolean('send_messages') ?? false;
                const readHistory = interaction.options.getBoolean('read_history') ?? true;

                await channelVisibilitySystem.setVisibilityRule(
                    interaction.guild,
                    role.id,
                    target,
                    {
                        allowView: true,
                        allowSend: sendMessages,
                        allowHistory: readHistory,
                    },
                    interaction.user.id
                );

                await interaction.editReply({
                    content: `✅ ${role} can now see ${describeChannel(target)}.${sendMessages ? ' Sending messages is allowed.' : ' Sending messages is disabled.'}`,
                });
                return;
            }

            await channelVisibilitySystem.removeVisibilityRule(interaction.guild, role.id, target, interaction.user.id);
            await interaction.editReply({
                content: `✅ Removed the saved visibility rule for ${role} on ${describeChannel(target)}.`,
            });
        } catch (error) {
            logger.logError(error, { context: 'CHANNEL_VISIBILITY_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
