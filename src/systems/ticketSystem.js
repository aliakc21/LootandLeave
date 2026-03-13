const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('../utils/uuid');
const { getBoostImageUrl } = require('../utils/mediaCatalog');

let client = null;

function initialize(botClient) {
    client = botClient;
    logger.logInfo('Ticket System initialized');
}

function getTicketRequestSummary(ticket) {
    if (ticket.boost_type === 'raid') {
        const requestedClass = ticket.requested_class ? ` | ${ticket.requested_class}` : '';
        const requestedRole = ticket.requested_role ? ` ${ticket.requested_role}` : '';
        return `Raid - ${ticket.boost_label || 'Scheduled raid'}${requestedClass}${requestedRole}`;
    }

    if (ticket.boost_type === 'mythic_plus') {
        const runs = getMythicRuns(ticket);
        if (runs.length === 1) {
            return `Mythic+ - ${runs[0].label} +${runs[0].keyLevel}`;
        }
        if (runs.length > 1) {
            return `Mythic+ - ${runs.length} custom runs`;
        }

        const level = ticket.boost_key_level ? `+${ticket.boost_key_level}` : 'Unknown level';
        const amount = ticket.boost_amount || 1;
        return `Mythic+ - ${ticket.boost_label || 'Unknown dungeon'} ${level} x${amount}`;
    }

    if (ticket.boost_type === 'raid_request') {
        return `Raid Request - ${ticket.boost_label || 'Custom request'}`;
    }

    if (ticket.boost_type === 'support') {
        return `Support - ${ticket.boost_label || 'Representative request'}`;
    }

    return 'General request';
}

function getClientCharacterSummary(ticket) {
    if (!ticket?.client_character_name || !ticket?.client_character_realm) {
        return null;
    }

    return `${ticket.client_character_name}-${ticket.client_character_realm}`;
}

function getCommonClientFields(ticket) {
    const clientCharacter = getClientCharacterSummary(ticket);
    if (!clientCharacter) {
        return [];
    }

    return [
        { name: '🎮 Client Character', value: clientCharacter, inline: true }
    ];
}

function getTicketRequestFields(ticket) {
    if (ticket.boost_type === 'raid') {
        const fields = [
            { name: '🎯 Boost Type', value: 'Raid', inline: true },
            { name: '📅 Selected Raid', value: ticket.boost_label || 'Unknown raid', inline: true }
        ];

        if (ticket.requested_class) {
            fields.push({ name: '⚔️ Class', value: ticket.requested_class, inline: true });
        }

        if (ticket.requested_role) {
            fields.push({ name: '🛡️ Role', value: ticket.requested_role, inline: true });
        }

        if (ticket.boost_scheduled_date) {
            const scheduledTimestamp = Math.floor(new Date(ticket.boost_scheduled_date).getTime() / 1000);
            fields.push({ name: '⏰ Scheduled Time', value: `<t:${scheduledTimestamp}:F>`, inline: false });
        }

        if (ticket.event_id) {
            fields.push({ name: '🆔 Event ID', value: `\`${ticket.event_id}\``, inline: true });
        }

        return [...fields, ...getCommonClientFields(ticket)];
    }

    if (ticket.boost_type === 'mythic_plus') {
        const runs = getMythicRuns(ticket);
        if (runs.length > 0) {
            return [
                { name: '🎯 Boost Type', value: 'Mythic+', inline: true },
                { name: '🔢 Total Runs', value: String(runs.length), inline: true },
                {
                    name: '🗺️ Requested Runs',
                    value: runs.map((run, index) => `${index + 1}. ${run.label} +${run.keyLevel}`).join('\n').slice(0, 1024),
                    inline: false
                },
                ...getCommonClientFields(ticket)
            ];
        }

        return [
            { name: '🎯 Boost Type', value: 'Mythic+', inline: true },
            { name: '🗺️ Dungeon', value: ticket.boost_label || 'Unknown dungeon', inline: true },
            { name: '🔑 Key Level', value: ticket.boost_key_level ? `+${ticket.boost_key_level}` : 'N/A', inline: true },
            { name: '🔢 Amount', value: String(ticket.boost_amount || 1), inline: true },
            ...getCommonClientFields(ticket)
        ];
    }

    if (ticket.boost_type === 'raid_request') {
        const fields = [
            { name: '🎯 Boost Type', value: 'Raid Request', inline: true },
            { name: '📝 Requested Raid', value: ticket.boost_label || 'Custom request', inline: false }
        ];

        if (ticket.event_id) {
            fields.push({ name: '🆔 Assigned Event ID', value: `\`${ticket.event_id}\``, inline: true });
        }

        return [...fields, ...getCommonClientFields(ticket)];
    }

    if (ticket.boost_type === 'support') {
        return [
            { name: '🎯 Ticket Type', value: 'Support', inline: true },
            { name: '📝 Request', value: ticket.boost_label || 'Representative request', inline: false },
            ...getCommonClientFields(ticket)
        ];
    }

    return [];
}

function getMythicRuns(ticket) {
    if (!ticket?.boost_runs) {
        return [];
    }

    try {
        const runs = typeof ticket.boost_runs === 'string'
            ? JSON.parse(ticket.boost_runs)
            : ticket.boost_runs;
        return Array.isArray(runs) ? runs : [];
    } catch {
        return [];
    }
}

function getTicketApprovalFields(ticket) {
    if (!['raid', 'raid_request', 'mythic_plus'].includes(ticket.boost_type)) {
        return [];
    }

    return [
        { name: '✅ Approval Status', value: ticket.approval_status || 'pending', inline: true },
        { name: '💰 Settled Gold', value: ticket.settled_gold ? `${Number(ticket.settled_gold).toLocaleString()}g` : 'Pending', inline: true },
        { name: '👤 Approved By', value: ticket.approved_by ? `<@${ticket.approved_by}>` : 'Pending', inline: true }
    ];
}

function buildTicketActionRows(ticket) {
    const rows = [];
    const mainRow = new ActionRowBuilder();

    if (['raid', 'raid_request'].includes(ticket.boost_type) && ticket.approval_status !== 'approved') {
        mainRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_raid_ticket_${ticket.ticket_id}`)
                .setLabel('Approve Raid Assignment')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );
    }

    if (ticket.boost_type === 'mythic_plus' && ticket.approval_status !== 'approved') {
        mainRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_mythic_ticket_${ticket.ticket_id}`)
                .setLabel('Approve Mythic+')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );
    }

    mainRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`close_ticket_${ticket.ticket_id}`)
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔒')
    );

    rows.push(mainRow);
    return rows;
}

async function fetchAllTicketMessages(channel) {
    const allMessages = [];
    let lastMessageId;

    while (true) {
        const options = { limit: 100 };
        if (lastMessageId) {
            options.before = lastMessageId;
        }

        const batch = await channel.messages.fetch(options);
        if (batch.size === 0) {
            break;
        }

        const messages = Array.from(batch.values());
        allMessages.push(...messages);
        lastMessageId = messages[messages.length - 1].id;

        if (batch.size < 100) {
            break;
        }
    }

    return allMessages.reverse();
}

// Create a new ticket for a client
async function createTicket(clientId, guild, requestData = {}) {
    try {
        const ticketId = `ticket-${uuidv4().substring(0, 8)}`;
        
        // Get client category
        const clientCategoryId = process.env.CHANNEL_CLIENT_CATEGORY;
        if (!clientCategoryId) {
            throw new Error('CHANNEL_CLIENT_CATEGORY not configured');
        }
        
        const category = await guild.channels.fetch(clientCategoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
            throw new Error('Client category not found');
        }

        // Create ticket channel with strict permissions
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: clientId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
            {
                id: guild.members.me.id, // Bot
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels],
            },
        ];

        // Add management roles if they exist
        const adminRole = process.env.ROLE_ADMIN;
        const managementRole = process.env.ROLE_MANAGEMENT;
        const advertiserRole = process.env.ROLE_ADVERTISER;

        if (adminRole) {
            const role = guild.roles.cache.get(adminRole);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
                });
            }
        }
        if (managementRole) {
            const role = guild.roles.cache.get(managementRole);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
                });
            }
        }
        if (advertiserRole) {
            const role = guild.roles.cache.get(advertiserRole);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                });
            }
        }

        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketId.substring(7)}`,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites,
            topic: `Ticket for ${guild.members.cache.get(clientId)?.displayName || 'Unknown'} | ${getTicketRequestSummary(requestData)}`,
        });

        // Save ticket to database
        await Database.run(
            `INSERT INTO tickets (ticket_id, client_id, channel_id, boost_type, event_id, boost_label, boost_runs, client_character_name, client_character_realm, requested_class, requested_role, boost_key_level, boost_amount, boost_scheduled_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ticketId,
                clientId,
                ticketChannel.id,
                requestData.boost_type || null,
                requestData.event_id || null,
                requestData.boost_label || null,
                requestData.boost_runs || null,
                requestData.client_character_name || null,
                requestData.client_character_realm || null,
                requestData.requested_class || null,
                requestData.requested_role || null,
                requestData.boost_key_level || null,
                requestData.boost_amount || 1,
                requestData.boost_scheduled_date || null,
                'open'
            ]
        );

        // Send welcome message
        const persistedTicket = await Database.get(
            `SELECT * FROM tickets WHERE ticket_id = ?`,
            [ticketId]
        );

        const welcomeEmbed = new EmbedBuilder()
            .setTitle('✅ Ticket Created')
            .setDescription('Your request has been received. You are being directed to an authorized person. Please wait.')
            .addFields([...getTicketRequestFields(persistedTicket || requestData), ...getTicketApprovalFields(persistedTicket || requestData)])
            .setImage(getBoostImageUrl(requestData))
            .setColor(0x5865F2)
            .setTimestamp();

        await ticketChannel.send({ embeds: [welcomeEmbed], components: buildTicketActionRows(persistedTicket || requestData) });

        logger.logTicketCreated(ticketId, clientId);
        logger.logAction('TICKET_CHANNEL_CREATED', clientId, { ticketId, channelId: ticketChannel.id });

        return { success: true, ticketId, channel: ticketChannel };
    } catch (error) {
        logger.logError(error, { context: 'CREATE_TICKET', clientId });
        throw error;
    }
}

// Close a ticket
async function closeTicket(ticketId, closedBy) {
    try {
        await Database.run(
            `UPDATE tickets SET status = ?, closed_at = CURRENT_TIMESTAMP WHERE ticket_id = ?`,
            ['closed', ticketId]
        );

        const ticket = await Database.get(
            `SELECT * FROM tickets WHERE ticket_id = ?`,
            [ticketId]
        );

        // Log ticket closure
        logger.logTicketClosed(ticketId, closedBy, ticket?.client_id);

        if (ticket && ticket.channel_id) {
            const channel = await client.channels.fetch(ticket.channel_id);
            if (channel) {
                const messageArray = await fetchAllTicketMessages(channel);

                // Log to customer logs channel
                const logChannelSystem = require('./logChannelSystem');
                await logChannelSystem.logCustomerTicket(ticket, messageArray, closedBy);

                await channel.send(`This ticket was closed by <@${closedBy}>. This channel will be deleted in 5 seconds.`);
                setTimeout(async () => {
                    try {
                        await channel.delete();
                        logger.logAction('TICKET_CHANNEL_DELETED', closedBy, { ticketId, channelId: ticket.channel_id });
                    } catch (err) {
                        logger.logError(err, { context: 'TICKET_CHANNEL_DELETE', ticketId });
                    }
                }, 5000);
            }
        }
    } catch (error) {
        logger.logError(error, { context: 'CLOSE_TICKET', ticketId, closedBy });
        throw error;
    }
}

module.exports = {
    initialize,
    createTicket,
    closeTicket,
    getTicketRequestFields,
    getTicketRequestSummary,
    getTicketApprovalFields,
    buildTicketActionRows,
    getMythicRuns,
};
