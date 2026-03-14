const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../utils/logger');
const channelVisibilitySystem = require('../systems/channelVisibilitySystem');
const logChannelSystem = require('../systems/logChannelSystem');

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

function extractCustomIds(message) {
    const customIds = [];
    for (const row of message.components || []) {
        for (const component of row.components || []) {
            if (component.customId) {
                customIds.push(component.customId);
            }
        }
    }
    return customIds;
}

async function deleteExistingManagedPanelMessages(channel, botUserId, managedCustomIds) {
    let before;
    let scanned = 0;

    while (scanned < 500) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (batch.size === 0) {
            break;
        }

        for (const message of batch.values()) {
            if (message.author?.id !== botUserId) {
                continue;
            }

            const messageCustomIds = extractCustomIds(message);
            if (messageCustomIds.some(customId => managedCustomIds.has(customId))) {
                await message.delete().catch(() => {});
            }
        }

        scanned += batch.size;
        before = batch.last()?.id;
        if (batch.size < 100) {
            break;
        }
    }
}

async function refreshManagedPanelMessage(channel, botUserId, managedCustomIds, payload) {
    await deleteExistingManagedPanelMessages(channel, botUserId, managedCustomIds);
    return channel.send(payload);
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

async function enforceIntroOnlyAccess(guild, introChannelId, privilegedRoleIds = []) {
    for (const channel of guild.channels.cache.values()) {
        const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);

        if (channel.id === introChannelId) {
            await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: false,
            }).catch(() => {});
            continue;
        }

        if (!everyoneOverwrite?.deny.has(PermissionFlagsBits.ViewChannel)) {
            await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
                ViewChannel: false,
            }).catch(() => {});
        }

        for (const roleId of privilegedRoleIds.filter(Boolean)) {
            await channel.permissionOverwrites.edit(roleId, {
                ViewChannel: true,
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

            // Create intro channel for first-time onboarding
            const introChannel = await getOrCreateTextChannel(interaction.guild, 'start-here');
            await applyPermissions(introChannel, [
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
                ...(clientRoleId ? [{
                    id: clientRoleId,
                    deny: [PermissionFlagsBits.ViewChannel],
                }] : []),
                ...(boosterRoleId ? [{
                    id: boosterRoleId,
                    deny: [PermissionFlagsBits.ViewChannel],
                }] : []),
                ...(applicantRoleId ? [{
                    id: applicantRoleId,
                    deny: [PermissionFlagsBits.ViewChannel],
                }] : []),
            ]);

            const introEmbed = new EmbedBuilder()
                .setTitle('LootandLeave Gateway')
                .setDescription('Choose your path to unlock the server.\n\n`Client` opens access to service requests.\n`Booster` opens the application flow.\n\nUntil you choose successfully, every other channel stays hidden.')
                .setColor(0x5865F2);

            const clientChoiceButton = new ButtonBuilder()
                .setCustomId('choose_role_client')
                .setLabel('Enter as Client')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫');

            const boosterChoiceButton = new ButtonBuilder()
                .setCustomId('choose_role_booster')
                .setLabel('Enter as Booster')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝');

            const onboardingRow = new ActionRowBuilder().addComponents(clientChoiceButton, boosterChoiceButton);

            await refreshManagedPanelMessage(
                introChannel,
                interaction.client.user.id,
                new Set(['choose_role_client', 'choose_role_booster']),
                { embeds: [introEmbed], components: [onboardingRow] }
            );

            const clientServicesChannel = await getOrCreateTextChannel(interaction.guild, 'client-services', { parent: clientCategoryId });
            await applyPermissions(clientServicesChannel, [
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
                ...(clientRoleId ? [{
                    id: clientRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
            ]);

            const clientPanelEmbed = new EmbedBuilder()
                .setTitle('Client Services')
                .setDescription('Use the button below to choose your service type and open a ticket.')
                .setColor(0x5865F2);

            const ticketButton = new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫');

            await refreshManagedPanelMessage(
                clientServicesChannel,
                interaction.client.user.id,
                new Set(['create_ticket']),
                { embeds: [clientPanelEmbed], components: [new ActionRowBuilder().addComponents(ticketButton)] }
            );

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

            await refreshManagedPanelMessage(
                eventManagementChannel,
                interaction.client.user.id,
                new Set(['create_event_panel']),
                {
                    embeds: [eventPanelEmbed],
                    components: [new ActionRowBuilder().addComponents(createEventButton)]
                }
            );

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

            await refreshManagedPanelMessage(
                registerChannel,
                interaction.client.user.id,
                new Set(['open_register_characters_modal']),
                {
                    embeds: [registerEmbed],
                    components: [new ActionRowBuilder().addComponents(registerButton)]
                }
            );

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

            const cancelRequestsChannel = await getOrCreateTextChannel(interaction.guild, 'cancel-requests', { parent: boosterCategoryId });
            await applyPermissions(cancelRequestsChannel, [
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
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                }] : []),
                ...(boosterRoleId ? [{
                    id: boosterRoleId,
                    deny: [PermissionFlagsBits.ViewChannel],
                }] : []),
                ...(applicantRoleId ? [{
                    id: applicantRoleId,
                    deny: [PermissionFlagsBits.ViewChannel],
                }] : []),
            ]);

            const appEmbed = new EmbedBuilder()
                .setTitle('Become a Booster')
                .setDescription('After choosing the booster path in `start-here`, click below to start your application.')
                .setColor(0x5865F2);

            const appButton = new ButtonBuilder()
                .setCustomId('booster_application_button')
                .setLabel('Apply as Booster')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝');

            await refreshManagedPanelMessage(
                boosterApplyChannel,
                interaction.client.user.id,
                new Set(['booster_application_button']),
                { embeds: [appEmbed], components: [new ActionRowBuilder().addComponents(appButton)] }
            );

            const weekdayNames = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'M+']);
            const boosterExtraCategories = new Set(
                interaction.guild.channels.cache
                    .filter(channel => channel.type === ChannelType.GuildCategory && weekdayNames.has(channel.name))
                    .map(channel => channel.id)
            );

            const clientExtraVisibility = await channelVisibilitySystem.getAllowedScopesForRoles(interaction.guild, [clientRoleId]);
            const boosterExtraVisibility = await channelVisibilitySystem.getAllowedScopesForRoles(interaction.guild, [boosterRoleId, applicantRoleId]);

            await enforceRoleVisibilityScope(
                interaction.guild,
                [clientRoleId],
                clientExtraVisibility.allowedChannelIds,
                new Set([clientCategory.id, ...clientExtraVisibility.allowedCategoryIds])
            );

            await enforceRoleVisibilityScope(
                interaction.guild,
                [boosterRoleId, applicantRoleId],
                boosterExtraVisibility.allowedChannelIds,
                new Set([boosterCategory.id, ...boosterExtraCategories, ...boosterExtraVisibility.allowedCategoryIds])
            );

            await enforceIntroOnlyAccess(
                interaction.guild,
                introChannel.id,
                [adminRoleId, managementRoleId]
            );

            await logChannelSystem.ensureLogInfrastructure(interaction.guild);

            const savedVisibilityRules = await channelVisibilitySystem.getVisibilityRulesForGuild(interaction.guild);
            for (const rule of savedVisibilityRules) {
                const targetChannel = interaction.guild.channels.cache.get(rule.target_id);

                if (!targetChannel) {
                    continue;
                }

                await channelVisibilitySystem.applyVisibilityRule(interaction.guild, rule.role_id, targetChannel, {
                    allowView: rule.allow_view,
                    allowSend: rule.allow_send,
                    allowHistory: rule.allow_history,
                });
            }

            logger.logAction('SETUP_COMPLETED', interaction.user.id, { guildId: interaction.guild.id });
            await interaction.editReply({ content: '✅ Setup completed! The gated `start-here` onboarding, client services panel, booster application flow, and restricted access rules are ready.' });
        } catch (error) {
            logger.logError(error, { context: 'SETUP_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
