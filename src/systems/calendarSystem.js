const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('../utils/uuid');
const characterSystem = require('./characterSystem');
const payoutSystem = require('./payoutSystem');
const logChannelSystem = require('./logChannelSystem');
const config = require('../utils/config');
const { getRaidImageUrl, getDungeonImageUrl } = require('../utils/mediaCatalog');
const ticketSystem = require('./ticketSystem');
const { resolveEventCutRates, formatCutRates } = require('../utils/cutConfig');
const { findRaidBoostTypeById } = require('../utils/contentCatalog');

let client = null;

function initialize(botClient) {
    client = botClient;
    logger.logInfo('Calendar System initialized');
}

function deleteEventChannelSoon(channel, eventId, channelId) {
    setTimeout(async () => {
        try {
            await channel.delete();
            logger.logAction('EVENT_CHANNEL_DELETED', 'SYSTEM', { eventId, channelId });
        } catch (error) {
            logger.logError(error, { context: 'DELETE_EVENT_CHANNEL_SOON', eventId, channelId });
        }
    }, 1000);
}

// Get weekday name from date
function getWeekdayName(date) {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return weekdays[date.getDay()];
}

async function getOrCreateNamedCategory(guild, categoryName) {
    let category = guild.channels.cache.find(
        c => c.name === categoryName && c.type === ChannelType.GuildCategory
    );

    if (!category) {
        // Get role IDs for permissions
        const adminRole = process.env.ROLE_ADMIN;
        const managementRole = process.env.ROLE_MANAGEMENT;
        const advertiserRole = process.env.ROLE_ADVERTISER;
        const boosterRole = process.env.ROLE_BOOSTER;

        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: guild.members.me.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
            },
        ];

        // Add management roles
        if (adminRole) {
            const role = guild.roles.cache.get(adminRole);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                });
            }
        }
        if (managementRole) {
            const role = guild.roles.cache.get(managementRole);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                });
            }
        }
        if (advertiserRole) {
            const role = guild.roles.cache.get(advertiserRole);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                });
            }
        }
        if (boosterRole) {
            const role = guild.roles.cache.get(boosterRole);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                });
            }
        }

        category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            permissionOverwrites,
        });

        logger.logInfo(`Created category: ${categoryName}`);
    }

    return category;
}

// Get or create weekday category
async function getOrCreateWeekdayCategory(guild, weekdayName) {
    return getOrCreateNamedCategory(guild, weekdayName);
}

function getRaidBoostTypeLabel(raidBoostType) {
    return findRaidBoostTypeById(raidBoostType || 'vip')?.label || 'VIP';
}

function formatPermissionName(permission) {
    const permissionKey = Object.entries(PermissionFlagsBits)
        .find(([, value]) => value === permission)?.[0] || String(permission);

    return permissionKey
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, char => char.toUpperCase());
}

async function getOrCreateCancelRequestsChannel(guild) {
    let channel = guild.channels.cache.find(
        entry => entry.name === 'cancel-requests' && entry.type === ChannelType.GuildText
    );

    if (channel) {
        return channel;
    }

    const adminRole = process.env.ROLE_ADMIN;
    const managementRole = process.env.ROLE_MANAGEMENT;
    const boosterCategoryId = process.env.CHANNEL_BOOSTER_CATEGORY;
    const parent = boosterCategoryId ? guild.channels.cache.get(boosterCategoryId) : null;

    channel = await guild.channels.create({
        name: 'cancel-requests',
        type: ChannelType.GuildText,
        parent: parent?.id,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: guild.members.me.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
            },
            ...(adminRole ? [{
                id: adminRole,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            }] : []),
            ...(managementRole ? [{
                id: managementRole,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            }] : []),
        ],
    });

    return channel;
}

async function notifyBoosterOfSelection(event, application) {
    try {
        const booster = await client.users.fetch(application.booster_id);
        if (!booster) {
            return;
        }

        const eventDate = new Date(event.scheduled_date);
        const eventDateTimestamp = Math.floor(eventDate.getTime() / 1000);
        const embed = new EmbedBuilder()
            .setTitle('Character Selected For Event')
            .setDescription(`One of your characters has been selected for **${event.name}**.`)
            .addFields(
                { name: 'Character', value: `${application.character_name}-${application.character_realm}`, inline: true },
                { name: 'Event ID', value: `\`${event.event_id}\``, inline: true },
                { name: 'When', value: Number.isNaN(eventDate.getTime()) ? 'Scheduled soon' : `<t:${eventDateTimestamp}:F>`, inline: false }
            )
            .setColor(0x5865F2)
            .setTimestamp();

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`request_selection_cancel_${application.id}`)
                .setLabel('Cancel Selection')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🛑')
        );

        await booster.send({
            embeds: [embed],
            components: [actionRow]
        });
    } catch (error) {
        logger.logError(error, {
            context: 'NOTIFY_BOOSTER_OF_SELECTION',
            eventId: event.event_id,
            boosterId: application.booster_id,
            applicationId: application.id,
        });
    }
}

async function postSelectionCancelRequest(guild, request) {
    const channel = await getOrCreateCancelRequestsChannel(guild);
    const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [request.event_id]);
    const embed = new EmbedBuilder()
        .setTitle('Selection Cancel Request')
        .setDescription(`<@${request.requested_by}> requested to cancel a roster selection.`)
        .addFields(
            { name: 'Request ID', value: `\`${request.id}\``, inline: true },
            { name: 'Booster', value: `<@${request.booster_id}>`, inline: true },
            { name: 'Character', value: `${request.character_name}-${request.character_realm}`, inline: true },
            { name: 'Event', value: event ? `${event.name}\n\`${event.event_id}\`` : `\`${request.event_id}\``, inline: false }
        )
        .setColor(0xF1C40F)
        .setTimestamp(new Date(request.created_at || Date.now()));

    const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approve_selection_cancel_${request.id}`)
            .setLabel('Approve Cancellation')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`reject_selection_cancel_${request.id}`)
            .setLabel('Reject')
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [actions] });
}

// Create a new event
async function getAssignedClientCount(eventId) {
    try {
        const result = await Database.get(
            `SELECT COUNT(*) AS total
             FROM tickets
             WHERE event_id = ?
             AND boost_type IN ('raid', 'raid_request', 'mythic_plus')
             AND approval_status = 'approved'`,
            [eventId]
        );

        return result?.total || 0;
    } catch (error) {
        logger.logError(error, { context: 'GET_ASSIGNED_CLIENT_COUNT', eventId });
        return 0;
    }
}

async function getApprovedClientsForEvent(eventId) {
    try {
        return await Database.all(
            `SELECT client_id, ticket_id, settled_gold, client_character_name, client_character_realm
             FROM tickets
             WHERE event_id = ?
             AND boost_type IN ('raid', 'raid_request', 'mythic_plus')
             AND approval_status = 'approved'
             ORDER BY approved_at ASC, created_at ASC`,
            [eventId]
        );
    } catch (error) {
        logger.logError(error, { context: 'GET_APPROVED_CLIENTS_FOR_EVENT', eventId });
        return [];
    }
}

async function getApprovedClientGoldTotal(eventId) {
    try {
        const result = await Database.get(
            `SELECT COALESCE(SUM(settled_gold), 0) AS total
             FROM tickets
             WHERE event_id = ?
             AND boost_type IN ('raid', 'raid_request', 'mythic_plus')
             AND approval_status = 'approved'`,
            [eventId]
        );

        return Number(result?.total || 0);
    } catch (error) {
        logger.logError(error, { context: 'GET_APPROVED_CLIENT_GOLD_TOTAL', eventId });
        return 0;
    }
}

function getEventCutText(event) {
    return formatCutRates(resolveEventCutRates(event));
}

function getRaidBoostTypeChannelSuffix(raidBoostType) {
    if (raidBoostType === 'lootshare') {
        return 'ls';
    }

    if (raidBoostType === 'saved') {
        return 'saved';
    }

    return 'vip';
}

function buildEventChannelName(eventName, scheduledDate, eventType = 'raid', raidBoostType = null) {
    const eventDate = new Date(scheduledDate);
    const eventNameSlug = String(eventName || 'event')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 70);

    const hours = String(eventDate.getHours()).padStart(2, '0');
    const minutes = String(eventDate.getMinutes()).padStart(2, '0');
    const timeString = `${hours}-${minutes}`;
    const boostSuffix = eventType === 'raid' ? `-${getRaidBoostTypeChannelSuffix(raidBoostType)}` : '';

    return `${eventNameSlug}${boostSuffix}-${timeString}`.substring(0, 100);
}

function getEventCategoryName(event) {
    if (event.event_type === 'mythic_plus') {
        return 'M+';
    }

    return getWeekdayName(new Date(event.scheduled_date));
}

async function ensureEventCategoryAccess(category, guild) {
    const botMember = guild.members.me;
    const requiredCategoryPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
    ];
    const categoryPerms = category.permissionsFor(botMember);
    const missingCategoryPermissions = requiredCategoryPermissions
        .filter(permission => !categoryPerms?.has(permission))
        .map(formatPermissionName);

    if (missingCategoryPermissions.length > 0) {
        throw new Error(
            `The bot cannot create event channels under \`${category.name}\`. Missing there: ${missingCategoryPermissions.join(', ')}.`
        );
    }
}

function buildEventPermissionOverwrites(guild) {
    const adminRole = process.env.ROLE_ADMIN;
    const managementRole = process.env.ROLE_MANAGEMENT;
    const advertiserRole = process.env.ROLE_ADVERTISER;
    const boosterRole = process.env.ROLE_BOOSTER;

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: guild.members.me.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
        },
    ];

    if (adminRole) {
        const role = guild.roles.cache.get(adminRole);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
            });
        }
    }

    if (managementRole) {
        const role = guild.roles.cache.get(managementRole);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
            });
        }
    }

    if (advertiserRole) {
        const role = guild.roles.cache.get(advertiserRole);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            });
        }
    }

    if (boosterRole) {
        const role = guild.roles.cache.get(boosterRole);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            });
        }
    }

    return permissionOverwrites;
}

function buildEventActionRow(eventId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`end_event_${eventId}`)
            .setLabel('End Event')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId(`cancel_event_${eventId}`)
            .setLabel('Cancel Event')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌'),
        new ButtonBuilder()
            .setCustomId(`add_manual_client_${eventId}`)
            .setLabel('Add Manual Client')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👤'),
        new ButtonBuilder()
            .setCustomId(`view_event_admin_details_${eventId}`)
            .setLabel('Admin Details')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔎')
    );
}

function buildEventEmbed(event, guild, categoryName) {
    const eventDate = new Date(event.scheduled_date);
    const eventDateTimestamp = Math.floor(eventDate.getTime() / 1000);

    return new EmbedBuilder()
        .setTitle(`📅 ${event.name}`)
        .setDescription(event.description || 'No description provided')
        .addFields(
            { name: '📆 Date & Time', value: `<t:${eventDateTimestamp}:F>\n<t:${eventDateTimestamp}:R>`, inline: false },
            { name: '📅 Category', value: categoryName, inline: true },
            { name: '🆔 Event ID', value: `\`${event.event_id}\``, inline: true },
            { name: '📊 Status', value: '🟢 Applications Open', inline: true },
            { name: '⚔️ Difficulty', value: event.event_difficulty || (event.event_type === 'mythic_plus' ? 'Mythic+' : 'N/A'), inline: true },
            ...(event.event_type === 'raid'
                ? [{ name: '🎟️ Boost Type', value: getRaidBoostTypeLabel(event.raid_boost_type), inline: true }]
                : []),
            { name: '🛡️ Min Item Level', value: String(event.min_item_level || 0), inline: true },
            { name: '🏆 Min Raider.IO', value: String(event.min_rio_score || 0), inline: true },
            { name: '👤 Client Slots', value: event.client_limit === 0 ? 'Unlimited' : `0/${event.client_limit}`, inline: true },
            { name: '👥 Roster', value: 'No characters selected yet', inline: false },
            { name: 'ℹ️ Instructions', value: 'Use `/listcharacters` in this channel to list your available characters. Managers will select characters from the list.', inline: false }
        )
        .setImage(event.event_type === 'mythic_plus' ? getDungeonImageUrl(event.name) : getRaidImageUrl(event.name))
        .setColor(0x5865F2)
        .setTimestamp(eventDate)
        .setFooter({ text: `Created by ${guild.members.cache.get(event.created_by)?.displayName || 'Unknown'}` });
}

async function ensureOpenEventInfrastructure(eventOrId, guildOverride = null) {
    const event = typeof eventOrId === 'string'
        ? await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventOrId])
        : eventOrId;

    if (!event || event.status !== 'open') {
        return { success: false, message: 'Event not found or not open.' };
    }

    const guild = guildOverride || await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    if (!guild) {
        return { success: false, message: 'Guild not found.' };
    }

    const categoryName = getEventCategoryName(event);
    const weekdayName = getWeekdayName(new Date(event.scheduled_date));
    const category = categoryName === weekdayName
        ? await getOrCreateWeekdayCategory(guild, weekdayName)
        : await getOrCreateNamedCategory(guild, categoryName);

    await ensureEventCategoryAccess(category, guild);

    const expectedChannelName = buildEventChannelName(event.name, event.scheduled_date, event.event_type, event.raid_boost_type);
    const permissionOverwrites = buildEventPermissionOverwrites(guild);
    let channel = event.channel_id ? await client.channels.fetch(event.channel_id).catch(() => null) : null;
    const createdChannel = !channel;

    if (!channel) {
        channel = await guild.channels.create({
            name: expectedChannelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites,
            topic: `Event: ${event.name} - ${new Date(event.scheduled_date).toLocaleString()}`,
        });
    } else {
        if (channel.parentId !== category.id) {
            await channel.setParent(category.id, { lockPermissions: false });
        }
        if (channel.name !== expectedChannelName) {
            await channel.setName(expectedChannelName);
        }
        if (channel.topic !== `Event: ${event.name} - ${new Date(event.scheduled_date).toLocaleString()}`) {
            await channel.setTopic(`Event: ${event.name} - ${new Date(event.scheduled_date).toLocaleString()}`);
        }
        await channel.permissionOverwrites.set(permissionOverwrites);
    }

    const eventEmbed = buildEventEmbed(event, guild, categoryName);
    const actionRow = buildEventActionRow(event.event_id);
    let message = event.message_id ? await channel.messages.fetch(event.message_id).catch(() => null) : null;

    if (!message) {
        message = await channel.send({ embeds: [eventEmbed], components: [actionRow] });
    } else {
        await message.edit({ embeds: [eventEmbed], components: [actionRow] });
    }

    await Database.run(
        `UPDATE events SET message_id = ?, channel_id = ? WHERE event_id = ?`,
        [message.id, channel.id, event.event_id]
    );

    await updateEventRoster(event.event_id);

    if (createdChannel) {
        logger.logAction('EVENT_CHANNEL_CREATED', event.created_by, {
            eventId: event.event_id,
            channelId: channel.id,
            channelName: channel.name
        });
    } else {
        logger.logAction('EVENT_INFRASTRUCTURE_REPAIRED', 'SYSTEM', {
            eventId: event.event_id,
            channelId: channel.id,
            channelName: channel.name
        });
    }

    return { success: true, eventId: event.event_id, channel, message };
}

async function createEvent(eventName, description, scheduledDate, createdBy, guild, requirements = {}) {
    const eventId = `event-${uuidv4().substring(0, 8)}`;
    const minItemLevel = requirements.minItemLevel || 0;
    const minRioScore = requirements.minRioScore || 0;
    const clientLimit = requirements.clientLimit || 0;
    const eventType = requirements.eventType || 'raid';
    const eventDifficulty = requirements.eventDifficulty || null;
    const raidBoostType = eventType === 'raid' ? (requirements.raidBoostType || 'vip') : null;
    const customCuts = requirements.customCuts || null;
    const categoryName = requirements.categoryName || getWeekdayName(new Date(scheduledDate));
    const scheduledDateIso = new Date(scheduledDate).toISOString();

    let eventInserted = false;
    try {
        // Save event to database first
        await Database.run(
            `INSERT INTO events (event_id, name, description, scheduled_date, created_by, event_type, event_difficulty, raid_boost_type, status, min_item_level, min_rio_score, client_limit, cut_treasury_rate, cut_advertiser_rate, cut_booster_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                eventId,
                eventName,
                description,
                scheduledDateIso,
                createdBy,
                eventType,
                eventDifficulty,
                raidBoostType,
                'open',
                minItemLevel,
                minRioScore,
                clientLimit,
                customCuts?.treasuryRate ?? null,
                customCuts?.advertiserRate ?? null,
                customCuts?.boosterRate ?? null,
            ]
        );
        eventInserted = true;
        const provision = await ensureOpenEventInfrastructure(
            {
                event_id: eventId,
                name: eventName,
                description,
                scheduled_date: scheduledDateIso,
                created_by: createdBy,
                event_type: eventType,
                event_difficulty: eventDifficulty,
                raid_boost_type: raidBoostType,
                status: 'open',
                min_item_level: minItemLevel,
                min_rio_score: minRioScore,
                client_limit: clientLimit,
                cut_treasury_rate: customCuts?.treasuryRate ?? null,
                cut_advertiser_rate: customCuts?.advertiserRate ?? null,
                cut_booster_rate: customCuts?.boosterRate ?? null,
                channel_id: null,
                message_id: null,
            },
            guild
        );

        // Log event creation
        logger.logEventCreated(eventId, eventName, createdBy, scheduledDate);
        return { success: true, eventId, channel: provision.channel.toString() };
    } catch (error) {
        if (eventInserted) {
            await Database.run(`DELETE FROM events WHERE event_id = ? AND channel_id IS NULL`, [eventId]).catch(() => {});
        }
        logger.logError(error, { context: 'CREATE_EVENT', eventName, createdBy });
        throw error;
    }
}

// Get upcoming open raids for client ticket selection
async function getAvailableClientRaids(limit = 25) {
    try {
        const openRaids = await Database.all(
            `SELECT event_id, name, scheduled_date, client_limit, raid_boost_type, channel_id, message_id
             FROM events
             WHERE status = 'open' AND event_type = 'raid'
             ORDER BY scheduled_date ASC`
        );

        const raidsWithCapacity = [];
        for (const raid of openRaids) {
            let needsRepair = !raid.channel_id || !raid.message_id;
            if (!needsRepair && client) {
                const channel = await client.channels.fetch(raid.channel_id).catch(() => null);
                if (!channel) {
                    needsRepair = true;
                } else {
                    const message = await channel.messages.fetch(raid.message_id).catch(() => null);
                    if (!message) {
                        needsRepair = true;
                    }
                }
            }

            if (needsRepair) {
                const infrastructure = await ensureOpenEventInfrastructure(raid.event_id).catch(error => {
                    logger.logError(error, { context: 'REPAIR_RAID_INFRASTRUCTURE_FOR_LISTING', eventId: raid.event_id });
                    return { success: false };
                });
                if (!infrastructure?.success) {
                    continue;
                }
            }

            const assignedClients = await getAssignedClientCount(raid.event_id);
            if (raid.client_limit > 0 && assignedClients >= raid.client_limit) {
                continue;
            }

            raidsWithCapacity.push({
                ...raid,
                assigned_clients: assignedClients,
            });
        }

        return raidsWithCapacity
            .filter(raid => Boolean(raid.scheduled_date))
            .slice(0, limit);
    } catch (error) {
        logger.logError(error, { context: 'GET_AVAILABLE_CLIENT_RAIDS', limit });
        return [];
    }
}

async function assignClientToEvent(ticketId, eventId, approvedBy, settledGold) {
    try {
        const ticket = await Database.get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
        if (!ticket) {
            return { success: false, message: 'Ticket not found.' };
        }

        const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventId]);
        if (!event || event.status !== 'open' || event.event_type !== 'raid') {
            return { success: false, message: 'Raid event not found or not open.' };
        }

        const assignedClients = await getAssignedClientCount(eventId);
        if (event.client_limit > 0 && assignedClients >= event.client_limit) {
            return { success: false, message: 'This raid is already full.' };
        }

        await Database.run(
            `UPDATE tickets
             SET event_id = ?, boost_scheduled_date = ?, approval_status = 'approved', approved_at = CURRENT_TIMESTAMP,
                 approved_by = ?, settled_gold = ?, assigned_to = ?
             WHERE ticket_id = ?`,
            [eventId, event.scheduled_date, approvedBy, settledGold, approvedBy, ticketId]
        );

        return {
            success: true,
            event,
            assignedClients: assignedClients + 1,
        };
    } catch (error) {
        logger.logError(error, { context: 'ASSIGN_CLIENT_TO_EVENT', ticketId, eventId, approvedBy });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function approveMythicTicket(ticketId, approvedBy, settledGold, guild) {
    try {
        const ticket = await Database.get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
        if (!ticket) {
            return { success: false, message: 'Ticket not found.' };
        }
        if (ticket.boost_type !== 'mythic_plus') {
            return { success: false, message: 'Ticket is not a Mythic+ ticket.' };
        }
        if (ticket.approval_status === 'approved') {
            return { success: false, message: 'Ticket is already approved.' };
        }

        const runs = ticketSystem.getMythicRuns(ticket);
        const eventName = runs.length === 1
            ? `${runs[0].label} +${runs[0].keyLevel}`
            : runs.length > 1
                ? `M+ Order x${runs.length}`
                : `${ticket.boost_label} +${ticket.boost_key_level} x${ticket.boost_amount || 1}`;
        const scheduledDate = new Date();
        const eventResult = await createEvent(
            eventName,
            'Mythic+ service roster channel',
            scheduledDate,
            approvedBy,
            guild,
            {
                minItemLevel: 0,
                minRioScore: 0,
                clientLimit: 1,
                eventType: 'mythic_plus',
                categoryName: 'M+',
            }
        );

        await Database.run(
            `UPDATE tickets
             SET event_id = ?, boost_scheduled_date = ?, approval_status = 'approved', approved_at = CURRENT_TIMESTAMP,
                 approved_by = ?, settled_gold = ?, assigned_to = ?
             WHERE ticket_id = ?`,
            [eventResult.eventId, scheduledDate.toISOString(), approvedBy, settledGold, approvedBy, ticketId]
        );

        return { success: true, eventId: eventResult.eventId, channel: eventResult.channel };
    } catch (error) {
        logger.logError(error, { context: 'APPROVE_MYTHIC_TICKET', ticketId, approvedBy });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function addManualClientToEvent(eventId, clientId, clientCharacterName, clientCharacterRealm, settledGold, addedBy) {
    try {
        const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventId]);
        if (!event || event.status !== 'open') {
            return { success: false, message: 'Event not found or not open.' };
        }

        const assignedClients = await getAssignedClientCount(eventId);
        if (event.client_limit > 0 && assignedClients >= event.client_limit) {
            return { success: false, message: 'This event is already full.' };
        }

        const ticketId = `ticket-${uuidv4().substring(0, 8)}`;
        const boostType = event.event_type === 'mythic_plus' ? 'mythic_plus' : 'raid';

        await Database.run(
            `INSERT INTO tickets (
                ticket_id, client_id, channel_id, boost_type, event_id, boost_label,
                client_character_name, client_character_realm, boost_amount, boost_scheduled_date,
                approval_status, approved_at, approved_by, settled_gold, status, assigned_to
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP, ?, ?, 'closed', ?)`,
            [
                ticketId,
                clientId,
                event.channel_id || eventId,
                boostType,
                event.event_id,
                event.name,
                clientCharacterName,
                clientCharacterRealm,
                1,
                event.scheduled_date,
                addedBy,
                settledGold,
                addedBy,
            ]
        );

        await updateEventRoster(eventId);

        logger.logAction('MANUAL_CLIENT_ADDED_TO_EVENT', addedBy, {
            eventId,
            clientId,
            clientCharacterName,
            clientCharacterRealm,
            settledGold,
        });

        return { success: true, ticketId };
    } catch (error) {
        logger.logError(error, { context: 'ADD_MANUAL_CLIENT_TO_EVENT', eventId, clientId, addedBy });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Select character for event (manager action)
async function selectCharacterForEvent(eventId, boosterId, characterName, characterRealm, selectedBy, options = {}) {
    try {
        const event = await Database.get(
            `SELECT * FROM events WHERE event_id = ?`,
            [eventId]
        );

        if (!event) {
            return { success: false, message: 'Event not found.' };
        }

        // Check if booster already has a character selected for this event
        const existing = await Database.get(
            `SELECT * FROM event_applications WHERE event_id = ? AND booster_id = ? AND status = 'approved'`,
            [eventId, boosterId]
        );

        if (existing) {
            return { success: false, message: 'This booster already has a character selected for this event.' };
        }

        // Check if character is available
        const character = await Database.get(
            `SELECT * FROM characters WHERE booster_id = ? AND character_name = ? AND character_realm = ?`,
            [boosterId, characterName, characterRealm]
        );

        if (!character) {
            return { success: false, message: 'Character not found.' };
        }

        const lockOptions = event.event_type === 'raid'
            ? {
                lockedUntil: characterSystem.getNextWednesday(event.scheduled_date).toISOString(),
                lockReason: 'the weekly reset for that raid week',
                eventType: 'raid',
                lockScope: event.event_difficulty || 'raid',
                allowExistingLock: event.raid_boost_type === 'saved',
                eventScheduledDate: event.scheduled_date,
                raidBoostType: event.raid_boost_type,
            }
            : null;

        if (lockOptions) {
            const lockResult = await characterSystem.lockCharacter(
                boosterId,
                characterName,
                characterRealm,
                eventId,
                lockOptions
            );
            if (!lockResult.success) {
                return lockResult;
            }
        }

        // Create or update application
        const existingApp = await Database.get(
            `SELECT * FROM event_applications WHERE event_id = ? AND booster_id = ? AND character_name = ? AND character_realm = ?`,
            [eventId, boosterId, characterName, characterRealm]
        );

        if (existingApp) {
            await Database.run(
                `UPDATE event_applications
                 SET status = 'approved',
                     approved_at = CURRENT_TIMESTAMP,
                     approved_by = ?,
                     listing_channel_id = COALESCE(?, listing_channel_id),
                     listing_message_id = COALESCE(?, listing_message_id)
                 WHERE id = ?`,
                [selectedBy, options.listingChannelId || null, options.listingMessageId || null, existingApp.id]
            );
        } else {
            await Database.run(
                `INSERT INTO event_applications (
                    event_id, booster_id, character_name, character_realm, listing_channel_id, listing_message_id, status, approved_at, approved_by
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
                [eventId, boosterId, characterName, characterRealm, options.listingChannelId || null, options.listingMessageId || null, 'approved', selectedBy]
            );
        }

        const approvedApplication = await Database.get(
            `SELECT * FROM event_applications
             WHERE event_id = ? AND booster_id = ? AND character_name = ? AND character_realm = ? AND status = 'approved'
             ORDER BY approved_at DESC NULLS LAST, id DESC
             LIMIT 1`,
            [eventId, boosterId, characterName, characterRealm]
        );

        // Update event roster
        await updateEventRoster(eventId);
        if (approvedApplication) {
            await notifyBoosterOfSelection(event, approvedApplication);
        }

        logger.logEventApproval(eventId, boosterId, selectedBy);
        return { success: true, message: 'Character selected for event.', application: approvedApplication };
    } catch (error) {
        logger.logError(error, { context: 'SELECT_CHARACTER_FOR_EVENT', eventId, boosterId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Deselect character from event
async function deselectCharacterFromEvent(eventId, boosterId, characterName, characterRealm, deselectedBy) {
    try {
        // Get the application
        const application = await Database.get(
            `SELECT * FROM event_applications WHERE event_id = ? AND booster_id = ? AND character_name = ? AND character_realm = ? AND status = 'approved'`,
            [eventId, boosterId, characterName, characterRealm]
        );

        if (!application) {
            return { success: false, message: 'Character not found in event roster.' };
        }

        // Update application status
        await Database.run(
            `UPDATE event_applications SET status = 'rejected' WHERE id = ?`,
            [application.id]
        );

        const event = await Database.get(
            `SELECT * FROM events WHERE event_id = ?`,
            [eventId]
        );
        if (event) {
            await characterSystem.unlockCharacter(boosterId, characterName, characterRealm, { eventId });
        }

        // Update event roster
        await updateEventRoster(eventId);

        logger.logAction('CHARACTER_DESELECTED_FROM_EVENT', deselectedBy, { eventId, boosterId, characterName, characterRealm });
        return { success: true, message: 'Character deselected from event.' };
    } catch (error) {
        logger.logError(error, { context: 'DESELECT_CHARACTER_FROM_EVENT', eventId, boosterId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function createSelectionCancelRequest(applicationId, requestedBy) {
    try {
        const application = await Database.get(
            `SELECT * FROM event_applications WHERE id = ? AND status = 'approved'`,
            [applicationId]
        );
        if (!application) {
            return { success: false, message: 'That roster selection is no longer active.' };
        }

        if (application.booster_id !== requestedBy) {
            return { success: false, message: 'You can only request cancellation for your own selected character.' };
        }

        const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [application.event_id]);
        if (!event || event.status !== 'open') {
            return { success: false, message: 'This event is no longer open for selection changes.' };
        }

        const existingRequest = await Database.get(
            `SELECT * FROM selection_cancel_requests
             WHERE application_id = ? AND status = 'pending'
             ORDER BY created_at DESC
             LIMIT 1`,
            [applicationId]
        );
        if (existingRequest) {
            return { success: false, message: 'A cancellation request for this selection is already pending.' };
        }

        await Database.run(
            `INSERT INTO selection_cancel_requests (
                application_id, event_id, booster_id, character_name, character_realm,
                source_channel_id, source_message_id, requested_by, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                application.id,
                application.event_id,
                application.booster_id,
                application.character_name,
                application.character_realm,
                application.listing_channel_id || null,
                application.listing_message_id || null,
                requestedBy,
            ]
        );

        const request = await Database.get(
            `SELECT * FROM selection_cancel_requests
             WHERE application_id = ? AND requested_by = ? AND status = 'pending'
             ORDER BY id DESC
             LIMIT 1`,
            [applicationId, requestedBy]
        );

        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        await postSelectionCancelRequest(guild, request);
        logger.logAction('SELECTION_CANCEL_REQUEST_CREATED', requestedBy, {
            requestId: request.id,
            applicationId,
            eventId: application.event_id,
        });

        return { success: true, requestId: request.id };
    } catch (error) {
        logger.logError(error, { context: 'CREATE_SELECTION_CANCEL_REQUEST', applicationId, requestedBy });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function approveSelectionCancelRequest(requestId, approvedBy) {
    try {
        const request = await Database.get(
            `SELECT * FROM selection_cancel_requests WHERE id = ?`,
            [requestId]
        );
        if (!request) {
            return { success: false, message: 'Cancel request not found.' };
        }
        if (request.status !== 'pending') {
            return { success: false, message: 'This cancel request has already been processed.' };
        }

        const result = await deselectCharacterFromEvent(
            request.event_id,
            request.booster_id,
            request.character_name,
            request.character_realm,
            approvedBy
        );
        if (!result.success) {
            return result;
        }

        await Database.run(
            `UPDATE selection_cancel_requests
             SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
             WHERE id = ?`,
            [approvedBy, requestId]
        );

        try {
            const selectHandlers = require('./selectHandlers');
            let message = null;

            if (request.source_channel_id && request.source_message_id) {
                const sourceChannel = await client.channels.fetch(request.source_channel_id).catch(() => null);
                message = sourceChannel
                    ? await sourceChannel.messages.fetch(request.source_message_id).catch(() => null)
                    : null;
            }

            if (!message) {
                const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [request.event_id]);
                const eventChannel = event?.channel_id
                    ? await client.channels.fetch(event.channel_id).catch(() => null)
                    : null;

                if (eventChannel) {
                    message = await selectHandlers.findManagerCharacterSelectionMessage(
                        eventChannel,
                        request.event_id,
                        request.booster_id
                    );
                }
            }

            if (message) {
                await selectHandlers.resetManagerCharacterSelectionMessage(message, request.event_id, request.booster_id);
            } else {
                logger.logWarning('Could not find the original listing message to reset after cancel approval', {
                    requestId,
                    eventId: request.event_id,
                    boosterId: request.booster_id,
                    sourceChannelId: request.source_channel_id,
                    sourceMessageId: request.source_message_id,
                });
            }
        } catch (error) {
            logger.logError(error, { context: 'RESET_LISTING_MESSAGE_AFTER_CANCEL_APPROVAL', requestId });
        }

        try {
            const booster = await client.users.fetch(request.booster_id);
            await booster.send(`Your cancellation request for **${request.character_name}-${request.character_realm}** in \`${request.event_id}\` was approved.`);
        } catch (error) {
            logger.logError(error, { context: 'DM_CANCEL_REQUEST_APPROVED', requestId, boosterId: request.booster_id });
        }

        logger.logAction('SELECTION_CANCEL_REQUEST_APPROVED', approvedBy, { requestId, eventId: request.event_id });
        return { success: true, message: 'Cancellation approved and character removed from the event roster.' };
    } catch (error) {
        logger.logError(error, { context: 'APPROVE_SELECTION_CANCEL_REQUEST', requestId, approvedBy });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function rejectSelectionCancelRequest(requestId, reviewedBy) {
    try {
        const request = await Database.get(
            `SELECT * FROM selection_cancel_requests WHERE id = ?`,
            [requestId]
        );
        if (!request) {
            return { success: false, message: 'Cancel request not found.' };
        }
        if (request.status !== 'pending') {
            return { success: false, message: 'This cancel request has already been processed.' };
        }

        await Database.run(
            `UPDATE selection_cancel_requests
             SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
             WHERE id = ?`,
            [reviewedBy, requestId]
        );

        try {
            const booster = await client.users.fetch(request.booster_id);
            await booster.send(`Your cancellation request for **${request.character_name}-${request.character_realm}** in \`${request.event_id}\` was rejected.`);
        } catch (error) {
            logger.logError(error, { context: 'DM_CANCEL_REQUEST_REJECTED', requestId, boosterId: request.booster_id });
        }

        logger.logAction('SELECTION_CANCEL_REQUEST_REJECTED', reviewedBy, { requestId, eventId: request.event_id });
        return { success: true, message: 'Cancellation request rejected.' };
    } catch (error) {
        logger.logError(error, { context: 'REJECT_SELECTION_CANCEL_REQUEST', requestId, reviewedBy });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Update event roster embed
async function updateEventRoster(eventId) {
    try {
        const event = await Database.get(
            `SELECT * FROM events WHERE event_id = ?`,
            [eventId]
        );

        if (!event || !event.channel_id || !event.message_id) {
            return;
        }

        const channel = await client.channels.fetch(event.channel_id);
        if (!channel) {
            return;
        }

        const message = await channel.messages.fetch(event.message_id);
        if (!message) {
            return;
        }

        // Get approved applications
        const applications = await Database.all(
            `SELECT * FROM event_applications WHERE event_id = ? AND status = 'approved'`,
            [eventId]
        );

        // Get unique boosters (one character per booster)
        const boosterMap = new Map();
        for (const app of applications) {
            if (!boosterMap.has(app.booster_id)) {
                boosterMap.set(app.booster_id, app);
            }
        }

        const rosterEntries = [];
        for (const app of boosterMap.values()) {
            const char = await Database.get(
                `SELECT * FROM characters WHERE booster_id = ? AND character_name = ? AND character_realm = ?`,
                [app.booster_id, app.character_name, app.character_realm]
            );
            if (char) {
                rosterEntries.push({
                    booster: `<@${app.booster_id}>`,
                    character: `${app.character_name}-${app.character_realm}`,
                    ilvl: char.item_level || 'N/A',
                    rio: char.rio_score || 'N/A',
                    class: char.class_name || 'N/A',
                    spec: char.spec_name || 'N/A'
                });
            }
        }

        const eventDate = new Date(event.scheduled_date);
        const eventDateTimestamp = Math.floor(eventDate.getTime() / 1000);
        const categoryLabel = event.event_type === 'mythic_plus' ? 'M+' : getWeekdayName(eventDate);
        const assignedClients = await getAssignedClientCount(eventId);

        const eventEmbed = EmbedBuilder.from(message.embeds[0]);
        eventEmbed.setFields(
            { name: '📆 Date & Time', value: `<t:${eventDateTimestamp}:F>\n<t:${eventDateTimestamp}:R>`, inline: false },
            { name: '📅 Category', value: categoryLabel, inline: true },
            { name: '🆔 Event ID', value: `\`${event.event_id}\``, inline: true },
            { name: '📊 Status', value: event.status === 'open' ? '🟢 Applications Open' : event.status === 'ended' ? '✅ Ended' : '❌ Cancelled', inline: true },
            { name: '⚔️ Difficulty', value: event.event_difficulty || (event.event_type === 'mythic_plus' ? 'Mythic+' : 'N/A'), inline: true },
            ...(event.event_type === 'raid'
                ? [{ name: '🎟️ Boost Type', value: getRaidBoostTypeLabel(event.raid_boost_type), inline: true }]
                : []),
            { name: '🛡️ Min Item Level', value: String(event.min_item_level || 0), inline: true },
            { name: '🏆 Min Raider.IO', value: String(event.min_rio_score || 0), inline: true },
            { name: '👤 Client Slots', value: event.client_limit > 0 ? `${assignedClients}/${event.client_limit}` : `${assignedClients}/Unlimited`, inline: true },
            { 
                name: `👥 Roster (${rosterEntries.length})`, 
                value: rosterEntries.length > 0 
                    ? rosterEntries.map((entry, idx) => 
                        `${idx + 1}. ${entry.booster} - **${entry.character}**\n   iLvl: ${entry.ilvl} | RIO: ${entry.rio} | ${entry.class}${entry.spec !== 'N/A' ? ` (${entry.spec})` : ''}`
                      ).join('\n\n')
                    : 'No characters selected yet',
                inline: false 
            },
            { name: 'ℹ️ Instructions', value: 'Use `/listcharacters` in this channel to list your available characters. Managers will select characters from the list.', inline: false }
        );
        eventEmbed.setImage(event.event_type === 'mythic_plus' ? getDungeonImageUrl(event.name) : getRaidImageUrl(event.name));

        // Keep the buttons
        await message.edit({ embeds: [eventEmbed] });
    } catch (error) {
        logger.logError(error, { context: 'UPDATE_EVENT_ROSTER', eventId });
    }
}

// End event
async function endEvent(eventId, totalGoldFromModal, endedBy, options = {}) {
    try {
        const event = await Database.get(
            `SELECT * FROM events WHERE event_id = ?`,
            [eventId]
        );

        if (!event) {
            return { success: false, message: 'Event not found.' };
        }
        if (event.status === 'ended') {
            return { success: false, message: 'Event is already ended.' };
        }
        if (event.status === 'cancelled') {
            return { success: false, message: 'Cannot end a cancelled event.' };
        }

        // Determine total gold: use balance_pool if available, otherwise use modal input
        const totalGold = event.balance_pool > 0 ? event.balance_pool : totalGoldFromModal;
        const clientGoldTotal = await getApprovedClientGoldTotal(eventId);

        if (!options.forceMismatch && totalGold !== clientGoldTotal) {
            return {
                success: false,
                mismatchWarning: true,
                totalGold,
                clientGoldTotal,
                message: `Client settled gold totals ${clientGoldTotal.toLocaleString()}g, but you entered ${totalGold.toLocaleString()}g. A client may be missing from the event.`,
            };
        }

        if (totalGold <= 0) {
            // If no gold in balance pool and no gold provided, mark as ended without payout
            await Database.run(
                `UPDATE events SET status = 'ended' WHERE event_id = ?`,
                [eventId]
            );
            await updateEventRoster(eventId);
            logger.logAction('EVENT_ENDED_NO_PAYOUT', endedBy, { eventId, eventName: event.name });
            
            // Delete channel after a delay
            if (event.channel_id) {
                try {
                    const channel = await client.channels.fetch(event.channel_id);
                    if (channel) {
                        await channel.send(`⚠️ **Event Ended (No Payout)**\nThis event has been completed by <@${endedBy}> without a payout. This channel is being archived and removed now.`);
                        // Log first, then delete on the next tick so interaction replies can complete.
                        deleteEventChannelSoon(channel, eventId, event.channel_id);
                    }
                } catch (error) {
                    logger.logError(error, { context: 'NOTIFY_EVENT_END_NO_PAYOUT', eventId });
                }
            }
            // Log to event logs channel
            await logChannelSystem.logEvent(event, 'ended', endedBy);

            return { success: true, message: 'Event ended without payout (no gold provided).' };
        }

        // Get approved applications (roster)
        const applications = await Database.all(
            `SELECT * FROM event_applications WHERE event_id = ? AND status = 'approved'`,
            [eventId]
        );

        if (applications.length === 0) {
            return { success: false, message: 'No characters in roster to pay out.' };
        }

        // Get unique booster IDs (one character per booster)
        const boosterIds = [...new Set(applications.map(app => app.booster_id))];

        // Process payout
        const payoutResult = await payoutSystem.processPayout(totalGold, boosterIds, endedBy, eventId, null);

        // Mark applications as completed
        await Database.run(
            `UPDATE event_applications SET status = 'completed' WHERE event_id = ? AND status = 'approved'`,
            [eventId]
        );

        // Update event status
        await Database.run(
            `UPDATE events SET status = 'ended' WHERE event_id = ?`,
            [eventId]
        );

        await updateEventRoster(eventId);

        // Send private receipts to boosters
        for (const app of applications) {
            const payoutDetail = await Database.get(
                `SELECT * FROM payout_details WHERE payout_id = ? AND booster_id = ?`,
                [payoutResult.payoutId, app.booster_id]
            );

            if (payoutDetail) {
                try {
                    const booster = await client.users.fetch(app.booster_id);
                    const receiptEmbed = new EmbedBuilder()
                        .setTitle('💰 Payment Receipt')
                        .addFields(
                            { name: '📅 Event', value: event.name, inline: false },
                            { name: '🆔 Event ID', value: `\`${event.event_id}\``, inline: true },
                            { name: '🎮 Character', value: `${app.character_name}-${app.character_realm}`, inline: true },
                            { name: '💰 Payment', value: `${payoutDetail.amount.toLocaleString()}g`, inline: false },
                            { name: '📋 Payout ID', value: `\`${payoutResult.payoutId}\``, inline: false }
                        )
                        .setColor(0x00FF00)
                        .setTimestamp();

                    await booster.send({ embeds: [receiptEmbed] });
                } catch (error) {
                    logger.logError(error, { context: 'SEND_PRIVATE_RECEIPT', boosterId: app.booster_id });
                }

                // Log to booster logs channel (also stores in database)
                await logChannelSystem.logBoosterReceipt(event, app.booster_id, app.character_name, app.character_realm, payoutDetail.amount, payoutResult.payoutId);
            }
        }

        // Delete channel after a delay
        if (event.channel_id) {
            try {
                const channel = await client.channels.fetch(event.channel_id);
                if (channel) {
                    await channel.send(`✅ **Event Ended Successfully**\nThis ${event.event_type === 'mythic_plus' ? 'Mythic+ run' : 'event'} has been completed by <@${endedBy}>. ${event.event_type === 'mythic_plus' ? 'Payments have been processed.' : 'Raid locks remain only until the weekly reset. Payments have been processed and private receipts have been sent to all boosters.'} This channel is being archived and removed now.`);
                    deleteEventChannelSoon(channel, eventId, event.channel_id);
                }
            } catch (error) {
                logger.logError(error, { context: 'NOTIFY_EVENT_END', eventId });
            }
        }
        // Log to event logs channel
        await logChannelSystem.logEvent(event, 'ended', endedBy, { payoutId: payoutResult.payoutId });

        return { 
            success: true, 
            message: `Event ended successfully. Payout processed. Private receipts sent to ${boosterIds.length} booster(s).`,
            payoutId: payoutResult.payoutId
        };
    } catch (error) {
        logger.logError(error, { context: 'END_EVENT', eventId });
        throw error;
    }
}

// Cancel event
async function cancelEvent(eventId, cancelledBy) {
    try {
        const event = await Database.get(
            `SELECT * FROM events WHERE event_id = ?`,
            [eventId]
        );

        if (!event) {
            return { success: false, message: 'Event not found.' };
        }
        if (event.status === 'cancelled') {
            return { success: false, message: 'Event is already cancelled.' };
        }
        if (event.status === 'ended') {
            return { success: false, message: 'Cannot cancel an ended event.' };
        }

        // Get approved applications
        const applications = await Database.all(
            `SELECT * FROM event_applications WHERE event_id = ? AND status = 'approved'`,
            [eventId]
        );

        // Unlock all characters when the event is cancelled
        let unlockedCount = 0;
        for (const app of applications) {
            const unlockResult = await characterSystem.unlockCharacter(app.booster_id, app.character_name, app.character_realm, { eventId });
            if (unlockResult.success) {
                unlockedCount++;
            }
        }

        // Mark applications as cancelled
        await Database.run(
            `UPDATE event_applications SET status = 'cancelled' WHERE event_id = ? AND status = 'approved'`,
            [eventId]
        );

        // Update event status
        await Database.run(
            `UPDATE events SET status = 'cancelled' WHERE event_id = ?`,
            [eventId]
        );

        await updateEventRoster(eventId);

        // Delete channel after a delay
        if (event.channel_id) {
            try {
                const channel = await client.channels.fetch(event.channel_id);
                if (channel) {
                    await channel.send(`🚫 **Event Cancelled**\nThis ${event.event_type === 'mythic_plus' ? 'Mythic+ run' : 'event'} has been cancelled by <@${cancelledBy}>.${event.event_type === 'mythic_plus' ? '' : ' All characters have been unlocked.'} This channel is being archived and removed now.`);
                    deleteEventChannelSoon(channel, eventId, event.channel_id);
                }
            } catch (error) {
                logger.logError(error, { context: 'NOTIFY_EVENT_CANCELLATION', eventId });
            }
        }
        // Log to event logs channel
        await logChannelSystem.logEvent(event, 'cancelled', cancelledBy);

        return { 
            success: true, 
            message: `Event cancelled. ${unlockedCount} character(s) unlocked.`,
            unlockedCount
        };
    } catch (error) {
        logger.logError(error, { context: 'CANCEL_EVENT', eventId });
        throw error;
    }
}

// Add gold to event balance pool
async function addGoldToEvent(eventId, amount) {
    try {
        const event = await Database.get(
            `SELECT * FROM events WHERE event_id = ?`,
            [eventId]
        );

        if (!event) {
            return { success: false, message: 'Event not found.' };
        }

        if (event.status !== 'open') {
            return { success: false, message: 'Can only add gold to open events.' };
        }

        await Database.run(
            `UPDATE events SET balance_pool = balance_pool + ? WHERE event_id = ?`,
            [amount, eventId]
        );

        logger.logAction('EVENT_GOLD_ADDED', 'SYSTEM', { eventId, amount });
        return { success: true, message: `Added ${amount.toLocaleString()}g to event balance pool.` };
    } catch (error) {
        logger.logError(error, { context: 'ADD_GOLD_TO_EVENT', eventId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Auto-end events (called by cron job)
async function autoEndEvents() {
    try {
        const now = new Date();
        const fiveHoursAgo = new Date(now.getTime() - (5 * 60 * 60 * 1000));

        const openEvents = await Database.all(
            `SELECT * FROM events WHERE status = 'open' AND event_type = 'raid'`
        );

        const eventsToEnd = openEvents.filter(event => {
            const scheduledDate = new Date(event.scheduled_date);
            if (Number.isNaN(scheduledDate.getTime())) {
                logger.logWarning('Skipping auto-end for event with invalid scheduled_date', {
                    eventId: event.event_id,
                    scheduledDate: event.scheduled_date,
                });
                return false;
            }

            return scheduledDate <= fiveHoursAgo;
        });

        for (const event of eventsToEnd) {
            logger.logInfo(`Auto-ending event: ${event.event_id} - ${event.name}`);
            await endEvent(event.event_id, 0, 'SYSTEM_AUTO_END');
        }
    } catch (error) {
        logger.logError(error, { context: 'AUTO_END_EVENTS' });
    }
}

async function repairOpenEventInfrastructure(limit = 50) {
    try {
        const openEvents = await Database.all(
            `SELECT event_id, channel_id, message_id
             FROM events
             WHERE status = 'open'
             ORDER BY scheduled_date ASC`
        );

        let repairedCount = 0;
        let failedCount = 0;
        let checkedCount = 0;

        for (const event of openEvents.slice(0, limit)) {
            checkedCount++;
            let needsRepair = !event.channel_id || !event.message_id;

            if (!needsRepair && client) {
                const channel = await client.channels.fetch(event.channel_id).catch(() => null);
                if (!channel) {
                    needsRepair = true;
                } else {
                    const message = await channel.messages.fetch(event.message_id).catch(() => null);
                    if (!message) {
                        needsRepair = true;
                    }
                }
            }

            if (!needsRepair) {
                continue;
            }

            const result = await ensureOpenEventInfrastructure(event.event_id).catch(error => {
                logger.logError(error, { context: 'REPAIR_OPEN_EVENT_INFRASTRUCTURE', eventId: event.event_id });
                return { success: false };
            });

            if (result?.success) {
                repairedCount++;
            } else {
                failedCount++;
            }
        }

        return {
            success: true,
            checkedCount,
            repairedCount,
            failedCount,
        };
    } catch (error) {
        logger.logError(error, { context: 'REPAIR_OPEN_EVENT_INFRASTRUCTURE_BATCH' });
        return { success: false, message: error.message };
    }
}

module.exports = {
    initialize,
    createEvent,
    repairOpenEventInfrastructure,
    getAvailableClientRaids,
    getAssignedClientCount,
    getApprovedClientsForEvent,
    getApprovedClientGoldTotal,
    createSelectionCancelRequest,
    approveSelectionCancelRequest,
    rejectSelectionCancelRequest,
    assignClientToEvent,
    addManualClientToEvent,
    approveMythicTicket,
    selectCharacterForEvent,
    deselectCharacterFromEvent,
    updateEventRoster,
    endEvent,
    cancelEvent,
    addGoldToEvent,
    autoEndEvents,
};
