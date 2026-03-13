const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../utils/logger');

function isSnowflake(value) {
    return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

async function getOrCreateTextChannel(guild, name, options = {}) {
    const existing = guild.channels.cache.find(
        channel => channel.name === name && channel.type === ChannelType.GuildText
    );

    if (existing) {
        return existing;
    }

    return guild.channels.create({
        name,
        type: ChannelType.GuildText,
        ...options,
    });
}

async function applyPermissions(channel, overwrites) {
    await channel.permissionOverwrites.set(overwrites);
}

function formatPermissionName(permission) {
    return permission
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, char => char.toUpperCase());
}

async function enforceRoleVisibilityScope(guild, roleIds, allowedChannelIds, allowedCategoryIds) {
    for (const channel of guild.channels.cache.values()) {
        const isAllowed = allowedChannelIds.has(channel.id) || (channel.parentId && allowedCategoryIds.has(channel.parentId)) || allowedCategoryIds.has(channel.id);
        if (isAllowed) {
            continue;
        }

        for (const roleId of roleIds.filter(Boolean)) {
            await channel.permissionOverwrites.edit(roleId, {
                ViewChannel: false,
            }).catch(() => {});
        }
    }
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
            const boosterRoleId = process.env.ROLE_BOOSTER;
            const applicantRoleId = process.env.ROLE_BOOSTER_APPLICANT;
            const clientRoleId = process.env.ROLE_CLIENT;
            const managementRoleId = process.env.ROLE_MANAGEMENT;
            const adminRoleId = process.env.ROLE_ADMIN;
            const botMember = interaction.guild.members.me;

            if (!clientCategoryId || !boosterCategoryId) {
                return interaction.editReply({ content: '❌ Please configure CHANNEL_CLIENT_CATEGORY and CHANNEL_BOOSTER_CATEGORY in your .env file first.' });
            }

            const requiredGuildPermissions = [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
            ];

            const missingGuildPermissions = requiredGuildPermissions.filter(permission => !botMember.permissions.has(permission));
            if (missingGuildPermissions.length > 0) {
                return interaction.editReply({
                    content: `❌ The bot is missing required server permissions for \`/setup\`: ${missingGuildPermissions.map(formatPermissionName).join(', ')}. Give the bot these permissions or Administrator, then try again.`
                });
            }

            const clientCategory = await interaction.guild.channels.fetch(clientCategoryId);
            const boosterCategory = await interaction.guild.channels.fetch(boosterCategoryId);
            if (!clientCategory || !boosterCategory) {
                throw new Error('Configured client or booster category could not be found.');
            }

            const categoryPermissionsToCheck = [clientCategory, boosterCategory];
            for (const category of categoryPermissionsToCheck) {
                const categoryPerms = category.permissionsFor(botMember);
                const missingCategoryPermissions = requiredGuildPermissions.filter(permission => !categoryPerms?.has(permission));
                if (missingCategoryPermissions.length > 0) {
                    return interaction.editReply({
                        content: `❌ The bot cannot manage the category \`${category.name}\`. Missing there: ${missingCategoryPermissions.map(formatPermissionName).join(', ')}. Fix that category's overwrites for the bot role, then run \`/setup\` again.`
                    });
                }
            }

            // Create welcome channel with ticket button
            const welcomeChannel = await getOrCreateTextChannel(interaction.guild, 'welcome');
            await applyPermissions(welcomeChannel, [
                {
                    id: interaction.guild.roles.everyone.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                    deny: [PermissionFlagsBits.SendMessages],
                },
                {
                    id: interaction.guild.members.me.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                },
                ...(adminRoleId ? [{
                    id: adminRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
                ...(managementRoleId ? [{
                    id: managementRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
            ]);

            const welcomeEmbed = new EmbedBuilder()
                .setTitle('Welcome to LootandLeave')
                .setDescription('Choose your path first. Until you choose, you will only be able to use this welcome channel.')
                .setColor(0x5865F2);

            const clientChoiceButton = new ButtonBuilder()
                .setCustomId('choose_role_client')
                .setLabel('I Want To Buy A Service')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫');

            const boosterChoiceButton = new ButtonBuilder()
                .setCustomId('choose_role_booster')
                .setLabel('I Want To Become A Booster')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝');

            const onboardingRow = new ActionRowBuilder().addComponents(clientChoiceButton, boosterChoiceButton);

            const clientPanelEmbed = new EmbedBuilder()
                .setTitle('Client Services')
                .setDescription('Clients can use the button below to create a ticket after choosing the client path.')
                .setColor(0x5865F2);

            const ticketButton = new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫');

            await welcomeChannel.send({ embeds: [welcomeEmbed], components: [onboardingRow] });
            await welcomeChannel.send({ embeds: [clientPanelEmbed], components: [new ActionRowBuilder().addComponents(ticketButton)] });

            await applyPermissions(clientCategory, [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.guild.members.me.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                },
                ...(adminRoleId ? [{
                    id: adminRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                }] : []),
                ...(managementRoleId ? [{
                    id: managementRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                }] : []),
                ...(clientRoleId ? [{
                    id: clientRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
                ...(process.env.ROLE_ADVERTISER ? [{
                    id: process.env.ROLE_ADVERTISER,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
            ]);

            await applyPermissions(boosterCategory, [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.guild.members.me.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                },
                ...(adminRoleId ? [{
                    id: adminRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                }] : []),
                ...(managementRoleId ? [{
                    id: managementRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                }] : []),
                ...(boosterRoleId ? [{
                    id: boosterRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
                ...(applicantRoleId ? [{
                    id: applicantRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
            ]);

            // Create admin-only event management channel with create event button
            const eventManagementChannel = await getOrCreateTextChannel(interaction.guild, 'event-management', {
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

            const registerChannel = await getOrCreateTextChannel(interaction.guild, 'register-characters', { parent: boosterCategoryId });
            await applyPermissions(registerChannel, [
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
                ...(managementRoleId ? [{
                    id: managementRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
                ...(boosterRoleId ? [{
                    id: boosterRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
            ]);

            const registerEmbed = new EmbedBuilder()
                .setTitle('Register Characters')
                .setDescription('Click the button below to register one character or many characters at once.\nUse the format `Character-Realm`.')
                .setColor(0x5865F2);

            const registerButton = new ButtonBuilder()
                .setCustomId('open_register_characters_modal')
                .setLabel('Register Characters')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🧙');

            await registerChannel.send({
                embeds: [registerEmbed],
                components: [new ActionRowBuilder().addComponents(registerButton)]
            });

            const boosterApplyChannel = await getOrCreateTextChannel(interaction.guild, 'booster-apply', { parent: boosterCategoryId });
            await applyPermissions(boosterApplyChannel, [
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
                ...(managementRoleId ? [{
                    id: managementRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
                ...(boosterRoleId ? [{
                    id: boosterRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
                ...(applicantRoleId ? [{
                    id: applicantRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
            ]);

            const boosterApplicationsChannel = await getOrCreateTextChannel(interaction.guild, 'booster-applications', { parent: boosterCategoryId });
            await applyPermissions(boosterApplicationsChannel, [
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
            ]);

            const appEmbed = new EmbedBuilder()
                .setTitle('Become a Booster')
                .setDescription('After choosing the booster path in welcome, click below to start your application.')
                .setColor(0x5865F2);

            const appButton = new ButtonBuilder()
                .setCustomId('booster_application_button')
                .setLabel('Apply as Booster')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝');

            await boosterApplyChannel.send({ embeds: [appEmbed], components: [new ActionRowBuilder().addComponents(appButton)] });

            const weekdayNames = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'M+']);
            const boosterExtraCategories = new Set(
                interaction.guild.channels.cache
                    .filter(channel => channel.type === ChannelType.GuildCategory && weekdayNames.has(channel.name))
                    .map(channel => channel.id)
            );

            await enforceRoleVisibilityScope(
                interaction.guild,
                [clientRoleId],
                new Set([welcomeChannel.id]),
                new Set([clientCategory.id])
            );

            await enforceRoleVisibilityScope(
                interaction.guild,
                [boosterRoleId, applicantRoleId],
                new Set([welcomeChannel.id]),
                new Set([boosterCategory.id, ...boosterExtraCategories])
            );

            logger.logAction('SETUP_COMPLETED', interaction.user.id, { guildId: interaction.guild.id });
            await interaction.editReply({ content: '✅ Setup completed! Onboarding, booster application, and restricted access channels are ready.' });
        } catch (error) {
            logger.logError(error, { context: 'SETUP_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
