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

// Create a new event
async function getAssignedClientCount(eventId) {
    try {
        const result = await Database.get(
            `SELECT COUNT(*) AS total
             FROM tickets
             WHERE event_id = ?
             AND boost_type IN ('raid', 'raid_request')
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
            `SELECT client_id, ticket_id, settled_gold
             FROM tickets
             WHERE event_id = ?
             AND boost_type IN ('raid', 'raid_request')
             AND approval_status = 'approved'
             ORDER BY approved_at ASC, created_at ASC`,
            [eventId]
        );
    } catch (error) {
        logger.logError(error, { context: 'GET_APPROVED_CLIENTS_FOR_EVENT', eventId });
        return [];
    }
}

async function createEvent(eventName, description, scheduledDate, createdBy, guild, requirements = {}) {
    const eventId = `event-${uuidv4().substring(0, 8)}`;
    const minItemLevel = requirements.minItemLevel || 0;
    const minRioScore = requirements.minRioScore || 0;
    const clientLimit = requirements.clientLimit || 0;
    const eventType = requirements.eventType || 'raid';
    const categoryName = requirements.categoryName || getWeekdayName(new Date(scheduledDate));
    const scheduledDateIso = new Date(scheduledDate).toISOString();

    try {
        // Save event to database first
        await Database.run(
            `INSERT INTO events (event_id, name, description, scheduled_date, created_by, event_type, status, min_item_level, min_rio_score, client_limit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [eventId, eventName, description, scheduledDateIso, createdBy, eventType, 'open', minItemLevel, minRioScore, clientLimit]
        );

        // Get weekday and create/find category
        const eventDate = new Date(scheduledDate);
        const weekdayName = getWeekdayName(eventDate);
        const category = categoryName === weekdayName
            ? await getOrCreateWeekdayCategory(guild, weekdayName)
            : await getOrCreateNamedCategory(guild, categoryName);

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

        // Create event channel name with time
        const eventNameSlug = eventName.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 80);
        
        const hours = String(eventDate.getHours()).padStart(2, '0');
        const minutes = String(eventDate.getMinutes()).padStart(2, '0');
        const timeString = `${hours}-${minutes}`;

        const channelName = `${eventNameSlug}-${timeString}`;
        
        const eventChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites,
            topic: `Event: ${eventName} - ${new Date(scheduledDate).toLocaleString()}`,
        });

        // Create detailed event embed
        const eventDateTimestamp = Math.floor(eventDate.getTime() / 1000);
        const eventEmbed = new EmbedBuilder()
            .setTitle(`📅 ${eventName}`)
            .setDescription(description || 'No description provided')
            .addFields(
                { name: '📆 Date & Time', value: `<t:${eventDateTimestamp}:F>\n<t:${eventDateTimestamp}:R>`, inline: false },
                { name: '📅 Category', value: categoryName, inline: true },
                { name: '🆔 Event ID', value: `\`${eventId}\``, inline: true },
                { name: '📊 Status', value: '🟢 Applications Open', inline: true },
                { name: '🛡️ Min Item Level', value: String(minItemLevel), inline: true },
                { name: '🏆 Min Raider.IO', value: String(minRioScore), inline: true },
                { name: '👤 Client Slots', value: clientLimit === 0 ? 'Unlimited' : `0/${clientLimit}`, inline: true },
                { name: '👥 Roster', value: 'No characters selected yet', inline: false },
                { name: 'ℹ️ Instructions', value: 'Use `/listcharacters` in this channel to list your available characters. Managers will select characters from the list.', inline: false }
            )
            .setImage(eventType === 'mythic_plus' ? getDungeonImageUrl(eventName) : getRaidImageUrl(eventName))
            .setColor(0x5865F2)
            .setTimestamp(eventDate)
            .setFooter({ text: `Created by ${guild.members.cache.get(createdBy)?.displayName || 'Unknown'}` });

        // Add End Event and Cancel Event buttons for managers/admins
        const actionRow = new ActionRowBuilder();
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`end_event_${eventId}`)
                .setLabel('✅ End Event')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`cancel_event_${eventId}`)
                .setLabel('❌ Cancel Event')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        // Send detailed embed to channel
        const message = await eventChannel.send({
            embeds: [eventEmbed],
            components: [actionRow]
        });

        // Update event with channel and message ID
        await Database.run(
            `UPDATE events SET message_id = ?, channel_id = ? WHERE event_id = ?`,
            [message.id, eventChannel.id, eventId]
        );

        // Log event creation
        logger.logEventCreated(eventId, eventName, createdBy, scheduledDate);
        logger.logAction('EVENT_CHANNEL_CREATED', createdBy, {
            eventId,
            channelId: eventChannel.id,
            channelName: eventChannel.name
        });

        return { success: true, eventId, channel: eventChannel.toString() };
    } catch (error) {
        logger.logError(error, { context: 'CREATE_EVENT', eventName, createdBy });
        throw error;
    }
}

// Get upcoming open raids for client ticket selection
async function getAvailableClientRaids(limit = 25) {
    try {
        const openRaids = await Database.all(
            `SELECT event_id, name, scheduled_date, client_limit
             FROM events
             WHERE status = 'open' AND event_type = 'raid'
             ORDER BY scheduled_date ASC`
        );

        const raidsWithCapacity = [];
        for (const raid of openRaids) {
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

// Select character for event (manager action)
async function selectCharacterForEvent(eventId, boosterId, characterName, characterRealm, selectedBy) {
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

        const lockOptions = event.event_type === 'mythic_plus'
            ? {
                lockedUntil: characterSystem.getMythicPlusLockUntil(),
                lockReason: 'the next 1 hour 30 minutes',
            }
            : {
                lockReason: 'this week',
            };

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

        // Create or update application
        const existingApp = await Database.get(
            `SELECT * FROM event_applications WHERE event_id = ? AND booster_id = ? AND character_name = ? AND character_realm = ?`,
            [eventId, boosterId, characterName, characterRealm]
        );

        if (existingApp) {
            await Database.run(
                `UPDATE event_applications SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?`,
                [selectedBy, existingApp.id]
            );
        } else {
            await Database.run(
                `INSERT INTO event_applications (event_id, booster_id, character_name, character_realm, status, approved_at, approved_by) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
                [eventId, boosterId, characterName, characterRealm, 'approved', selectedBy]
            );
        }

        // Update event roster
        await updateEventRoster(eventId);

        logger.logEventApproval(eventId, boosterId, selectedBy);
        return { success: true, message: 'Character selected for event.' };
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
            await characterSystem.unlockCharacter(boosterId, characterName, characterRealm);
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
async function endEvent(eventId, totalGoldFromModal, endedBy) {
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

        if (event.event_type !== 'mythic_plus') {
            // Permanently lock raid characters only.
            for (const app of applications) {
                await Database.run(
                    `UPDATE character_weekly_locks SET locked_until = '2099-12-31' WHERE booster_id = ? AND character_name = ? AND character_realm = ? AND event_id = ?`,
                    [app.booster_id, app.character_name, app.character_realm, eventId]
                );
            }
        }

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
                    await channel.send(`✅ **Event Ended Successfully**\nThis ${event.event_type === 'mythic_plus' ? 'Mythic+ run' : 'event'} has been completed by <@${endedBy}>. ${event.event_type === 'mythic_plus' ? 'Payments have been processed.' : 'All characters have been permanently locked. Payments have been processed and private receipts have been sent to all boosters.'} This channel is being archived and removed now.`);
                    deleteEventChannelSoon(channel, eventId, event.channel_id);
                }
            } catch (error) {
                logger.logError(error, { context: 'NOTIFY_EVENT_END', eventId });
            }
        }
        // Log to event logs channel
        await logChannelSystem.logEvent(event, 'ended', endedBy);

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
            const unlockResult = await characterSystem.unlockCharacter(app.booster_id, app.character_name, app.character_realm);
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

module.exports = {
    initialize,
    createEvent,
    getAvailableClientRaids,
    getAssignedClientCount,
    getApprovedClientsForEvent,
    assignClientToEvent,
    approveMythicTicket,
    selectCharacterForEvent,
    deselectCharacterFromEvent,
    updateEventRoster,
    endEvent,
    cancelEvent,
    addGoldToEvent,
    autoEndEvents,
};
