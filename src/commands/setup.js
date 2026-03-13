const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../utils/logger');

function isSnowflake(value) {
    return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Set up initial bot infrastructure (Admin only)'),
    async execute(interaction) {
        // Permission check
        const adminRole = process.env.ROLE_ADMIN;
        const isServerAdmin = interaction.member.permissions.has('Administrator');
        const hasAdminRole = adminRole && interaction.member.roles.cache.has(adminRole);

        if (!isServerAdmin && !hasAdminRole) {
            return interaction.reply({
                content: 'You do not have permission to use this command. You need Administrator permissions or Admin role.',
                flags: require('discord.js').MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: require('discord.js').MessageFlags.Ephemeral });

        try {
            // Create categories if they don't exist
            const clientCategoryId = process.env.CHANNEL_CLIENT_CATEGORY;
            const boosterCategoryId = process.env.CHANNEL_BOOSTER_CATEGORY;

            if (!clientCategoryId || !boosterCategoryId) {
                return interaction.editReply({ content: '❌ Please configure CHANNEL_CLIENT_CATEGORY and CHANNEL_BOOSTER_CATEGORY in your .env file first.' });
            }

            // Create welcome channel with ticket button
            const welcomeChannel = await interaction.guild.channels.create({
                name: 'welcome',
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                ],
            });

            const welcomeEmbed = new EmbedBuilder()
                .setTitle('Welcome to LootandLeave')
                .setDescription('Click the button below to create a ticket and get started!')
                .setColor(0x5865F2);

            const ticketButton = new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫');

            const actionRow = new ActionRowBuilder().addComponents(ticketButton);

            await welcomeChannel.send({ embeds: [welcomeEmbed], components: [actionRow] });

            // Create admin-only event management channel with create event button
            const adminRoleId = process.env.ROLE_ADMIN;
            const eventManagementChannel = await interaction.guild.channels.create({
                name: 'event-management',
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.guild.members.me.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    },
                    ...(adminRoleId ? [{
                        id: adminRoleId,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    }] : []),
                ],
            });

            const eventPanelEmbed = new EmbedBuilder()
                .setTitle('Event Management')
                .setDescription('Admins can create raid events from the button below.')
                .setColor(0x5865F2);

            const createEventButton = new ButtonBuilder()
                .setCustomId('create_event_panel')
                .setLabel('Create Event')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📅');

            await eventManagementChannel.send({
                embeds: [eventPanelEmbed],
                components: [new ActionRowBuilder().addComponents(createEventButton)]
            });

            // Create applications channel with application button
            const applicationsChannelId = process.env.CHANNEL_APPLICATIONS;
            if (isSnowflake(applicationsChannelId)) {
                const applicationsChannel = await interaction.guild.channels.fetch(applicationsChannelId);
                if (applicationsChannel) {
                    const appEmbed = new EmbedBuilder()
                        .setTitle('Become a Booster')
                        .setDescription('Click the button below to apply as a booster!')
                        .setColor(0x5865F2);

                    const appButton = new ButtonBuilder()
                        .setCustomId('booster_application_button')
                        .setLabel('Apply as Booster')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('📝');

                    const appActionRow = new ActionRowBuilder().addComponents(appButton);
                    await applicationsChannel.send({ embeds: [appEmbed], components: [appActionRow] });
                }
            } else if (applicationsChannelId) {
                logger.logWarning('Skipping applications channel setup because CHANNEL_APPLICATIONS is not a valid Discord channel ID');
            }

            logger.logAction('SETUP_COMPLETED', interaction.user.id, { guildId: interaction.guild.id });
            await interaction.editReply({ content: '✅ Setup completed! Welcome channel and buttons created.' });
        } catch (error) {
            logger.logError(error, { context: 'SETUP_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
