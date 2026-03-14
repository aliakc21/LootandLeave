const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { getTicketRequestFields, getTicketRequestSummary } = require('./ticketSystem');
const fs = require('fs');
const path = require('path');

let client = null;

function buildLogPermissionOverwrites(guild, options = {}) {
    const adminRole = process.env.ROLE_ADMIN;
    const managementRole = process.env.ROLE_MANAGEMENT;
    const advertiserRole = process.env.ROLE_ADVERTISER;
    const includeAdvertiser = Boolean(options.includeAdvertiser);

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: ['ViewChannel'],
        },
        {
            id: guild.members.me.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages', 'ManageChannels'],
        },
    ];

    if (adminRole) {
        const role = guild.roles.cache.get(adminRole);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            });
        }
    }

    if (managementRole) {
        const role = guild.roles.cache.get(managementRole);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            });
        }
    }

    if (includeAdvertiser && advertiserRole) {
        const role = guild.roles.cache.get(advertiserRole);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: ['ViewChannel', 'ReadMessageHistory'],
            });
        }
    }

    return permissionOverwrites;
}

function initialize(botClient) {
    client = botClient;
    logger.logInfo('Log Channel System initialized');
}

// Get or create log channel
async function getOrCreateLogChannel(guild, channelName, channelType) {
    try {
        // Try to find existing channel
        const existingChannel = guild.channels.cache.find(
            channel => channel.name === channelName && channel.type === channelType
        );

        // Create new channel if it doesn't exist
        const logCategoryName = 'Logs';
        let logCategory = guild.channels.cache.find(
            channel => channel.name === logCategoryName && channel.type === 4 // Category type
        );

        if (!logCategory) {
            logCategory = guild.channels.cache.find(
                channel => channel.name === '📋 Logs' && channel.type === 4 // Legacy category name
            );
            if (logCategory && logCategory.name !== logCategoryName) {
                await logCategory.setName(logCategoryName).catch(() => {});
            }
        }

        if (!logCategory) {
            logCategory = await guild.channels.create({
                name: logCategoryName,
                type: 4, // Category
                permissionOverwrites: buildLogPermissionOverwrites(guild),
            });
        }

        await logCategory.permissionOverwrites.set(buildLogPermissionOverwrites(guild));

        const permissionOverwrites = buildLogPermissionOverwrites(guild, { includeAdvertiser: true });

        if (existingChannel) {
            const botPermissions = existingChannel.permissionsFor(guild.members.me);
            const canManageExistingChannel = Boolean(
                botPermissions?.has('ViewChannel') && botPermissions?.has('ManageChannels')
            );

            if (!canManageExistingChannel) {
                const error = new Error(`Missing access to manage existing log channel \`${channelName}\`.`);
                error.code = 'LOG_CHANNEL_INACCESSIBLE';
                error.channelId = existingChannel.id;
                error.categoryId = existingChannel.parentId || null;
                throw error;
            }

            if (existingChannel.parentId !== logCategory.id) {
                await existingChannel.setParent(logCategory.id, { lockPermissions: false });
            }
            await existingChannel.permissionOverwrites.set(permissionOverwrites);
            return existingChannel;
        }

        const newChannel = await guild.channels.create({
            name: channelName,
            type: channelType,
            parent: logCategory.id,
            permissionOverwrites,
        });

        logger.logInfo(`Created log channel: ${channelName}`);
        return newChannel;
    } catch (error) {
        logger.logError(error, { context: 'GET_OR_CREATE_LOG_CHANNEL', channelName });
        throw error;
    }
}

// Log event (ended or cancelled)
async function logEvent(event, action, actionBy, options = {}) {
    try {
        // Get guild from event channel if available, otherwise use env
        let guild;
        if (event.channel_id) {
            try {
                const channel = await client.channels.fetch(event.channel_id);
                guild = channel.guild;
            } catch (error) {
                logger.logWarning('Event channel not found during logEvent, falling back to guild fetch', {
                    eventId: event.event_id,
                    channelId: event.channel_id,
                });
            }
        }

        if (!guild) {
            guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        }
        
        if (!guild) {
            logger.logError(new Error('Guild not found'), { context: 'LOG_EVENT' });
            return;
        }

        const logChannel = await getOrCreateLogChannel(guild, 'event-logs', 0); // Text channel

        const eventDate = new Date(event.scheduled_date);
        const eventDateTimestamp = Math.floor(eventDate.getTime() / 1000);

        // Get roster information
        const applications = await Database.all(
            `SELECT * FROM event_applications WHERE event_id = ? AND status IN ('approved', 'completed', 'cancelled')`,
            [event.event_id]
        );

        const rosterEntries = [];
        for (const app of applications) {
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

        const embed = new EmbedBuilder()
            .setTitle(`📅 ${event.name} - ${action === 'ended' ? '✅ Ended' : '❌ Cancelled'}`)
            .setDescription(event.description || 'No description provided')
            .addFields(
                { name: '📆 Date & Time', value: `<t:${eventDateTimestamp}:F>`, inline: false },
                { name: '🆔 Event ID', value: `\`${event.event_id}\``, inline: true },
                { name: '📊 Status', value: action === 'ended' ? '✅ Ended' : '❌ Cancelled', inline: true },
                { name: '👤 Action By', value: `<@${actionBy}>`, inline: true },
                { 
                    name: `👥 Roster (${rosterEntries.length})`, 
                    value: rosterEntries.length > 0 
                        ? rosterEntries.map((entry, idx) => 
                            `${idx + 1}. ${entry.booster} - **${entry.character}**\n   iLvl: ${entry.ilvl} | RIO: ${entry.rio} | ${entry.class}${entry.spec !== 'N/A' ? ` (${entry.spec})` : ''}`
                          ).join('\n\n')
                        : 'No characters selected',
                    inline: false 
                }
            )
            .setColor(action === 'ended' ? 0x00FF00 : 0xFF0000)
            .setTimestamp()
            .setFooter({ text: `Event ${action} at` });

        const files = [];
        let payoutFilePath = null;
        if (action === 'ended' && options.payoutId) {
            const payoutDetails = await Database.all(
                `SELECT payout_details.booster_id, payout_details.amount
                 FROM payout_details
                 WHERE payout_details.payout_id = ?
                 ORDER BY payout_details.amount DESC, payout_details.booster_id ASC`,
                [options.payoutId]
            );

            if (payoutDetails.length > 0) {
                const fileName = `event-${event.event_id}-payouts.txt`;
                payoutFilePath = path.join(__dirname, '../../data/logs', fileName);
                const logsDir = path.dirname(payoutFilePath);
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }

                const payoutLines = payoutDetails.map((detail, index) => {
                    const rosterEntry = rosterEntries.find(entry => entry.booster === `<@${detail.booster_id}>`);
                    return `${index + 1}. Booster: ${detail.booster_id} | Character: ${rosterEntry?.character || 'Unknown'} | Paid: ${Number(detail.amount).toLocaleString()}g`;
                }).join('\n');

                fs.writeFileSync(payoutFilePath, payoutLines, 'utf8');
                files.push(new AttachmentBuilder(payoutFilePath, { name: fileName }));
            }
        }

        await logChannel.send({ embeds: [embed], files });
        if (payoutFilePath) {
            setTimeout(() => {
                try {
                    if (fs.existsSync(payoutFilePath)) {
                        fs.unlinkSync(payoutFilePath);
                    }
                } catch (cleanupError) {
                    logger.logError(cleanupError, { context: 'CLEANUP_EVENT_PAYOUT_LOG_FILE', payoutFilePath });
                }
            }, 5000);
        }
        logger.logInfo(`Event logged: ${event.event_id} - ${action}`);
    } catch (error) {
        logger.logError(error, { context: 'LOG_EVENT', eventId: event.event_id });
    }
}

// Log customer ticket (when closed)
async function logCustomerTicket(ticket, ticketMessages, closedBy) {
    try {
        // Get guild from ticket channel if available, otherwise use env
        let guild;
        if (ticket.channel_id) {
            const channel = await client.channels.fetch(ticket.channel_id);
            guild = channel.guild;
        } else {
            guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        }
        
        if (!guild) {
            logger.logError(new Error('Guild not found'), { context: 'LOG_CUSTOMER_TICKET' });
            return;
        }

        const logChannel = await getOrCreateLogChannel(guild, 'customer-logs', 0); // Text channel

        // Create text file with all messages
        const messagesText = ticketMessages.map(msg => {
            const timestamp = msg.createdAt ? msg.createdAt.toISOString() : new Date().toISOString();
            const author = msg.author ? msg.author.tag : 'Unknown';
            const content = msg.cleanContent || msg.content || '(No text content)';
            const attachments = msg.attachments && msg.attachments.size > 0
                ? `\nAttachments: ${Array.from(msg.attachments.values()).map(attachment => attachment.url).join(', ')}`
                : '';
            return `[${timestamp}] ${author}: ${content}${attachments}`;
        }).join('\n\n');

        const fileName = `ticket-${ticket.ticket_id}-${Date.now()}.txt`;
        const filePath = path.join(__dirname, '../../data/logs', fileName);
        
        // Ensure logs directory exists
        const logsDir = path.dirname(filePath);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        fs.writeFileSync(filePath, messagesText, 'utf8');

        const fileAttachment = new AttachmentBuilder(filePath, { name: fileName });

        const embed = new EmbedBuilder()
            .setTitle(`📋 Customer Ticket - ${ticket.ticket_id}`)
            .addFields(
                { name: '👤 Client', value: `<@${ticket.client_id}>`, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:F>`, inline: true },
                { name: '📅 Closed', value: ticket.closed_at ? `<t:${Math.floor(new Date(ticket.closed_at).getTime() / 1000)}:F>` : 'N/A', inline: true },
                { name: '📊 Status', value: ticket.status || 'closed', inline: true },
                { name: '👤 Assigned To', value: ticket.assigned_to ? `<@${ticket.assigned_to}>` : 'Unassigned', inline: true },
                { name: '🔎 Request', value: getTicketRequestSummary(ticket), inline: false },
                { name: '🔒 Closed By', value: closedBy ? `<@${closedBy}>` : 'Unknown', inline: true },
                { name: '💬 Messages', value: `${ticketMessages.length} message(s)`, inline: true },
                ...getTicketRequestFields(ticket)
            )
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: `Ticket ID: ${ticket.ticket_id}` });

        await logChannel.send({ 
            embeds: [embed],
            files: [fileAttachment]
        });

        // Clean up file after sending
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (error) {
                logger.logError(error, { context: 'CLEANUP_TICKET_LOG_FILE', filePath });
            }
        }, 5000);

        logger.logInfo(`Customer ticket logged: ${ticket.ticket_id}`);
    } catch (error) {
        logger.logError(error, { context: 'LOG_CUSTOMER_TICKET', ticketId: ticket.ticket_id });
    }
}

// Log booster receipt
async function logBoosterReceipt(event, boosterId, characterName, characterRealm, paymentAmount, payoutId) {
    try {
        // Get guild from event channel if available, otherwise use env
        let guild;
        if (event.channel_id) {
            const channel = await client.channels.fetch(event.channel_id);
            guild = channel.guild;
        } else {
            guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        }
        
        if (!guild) {
            logger.logError(new Error('Guild not found'), { context: 'LOG_BOOSTER_RECEIPT' });
            return null;
        }

        const logChannel = await getOrCreateLogChannel(guild, 'booster-logs', 0); // Text channel

        const eventDate = new Date(event.scheduled_date);
        const eventDateTimestamp = Math.floor(eventDate.getTime() / 1000);

        const embed = new EmbedBuilder()
            .setTitle(`💰 Booster Payment Receipt`)
            .addFields(
                { name: '📅 Event', value: event.name, inline: false },
                { name: '🆔 Event ID', value: `\`${event.event_id}\``, inline: true },
                { name: '📆 Event Date', value: `<t:${eventDateTimestamp}:F>`, inline: true },
                { name: '👤 Booster', value: `<@${boosterId}>`, inline: true },
                { name: '🎮 Character', value: `${characterName}-${characterRealm}`, inline: true },
                { name: '💰 Payment', value: `${paymentAmount.toLocaleString()}g`, inline: true },
                { name: '📋 Payout ID', value: `\`${payoutId}\``, inline: false },
                { name: '✅ Payment Status', value: '⏳ Pending', inline: false }
            )
            .setColor(0xFFD700)
            .setTimestamp()
            .setFooter({ text: `Receipt for ${characterName}-${characterRealm}` });

        // Replace dashes with underscores for custom ID (Discord limitation)
        // Format: complete_payment_payout_XXXXXXXX_boosterId
        const payoutIdSafe = payoutId.replace(/-/g, '_'); // payout-XXXXXXXX -> payout_XXXXXXXX
        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`complete_payment_${payoutIdSafe}_${boosterId}`)
                .setLabel('✅ Mark as Paid')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );

        const message = await logChannel.send({ 
            embeds: [embed],
            components: [buttonRow]
        });
        
        // Store receipt in database
        await Database.run(
            `INSERT INTO payout_receipts (payout_id, booster_id, event_id, payment_amount, message_id, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [payoutId, boosterId, event.event_id, paymentAmount, message.id, 'pending']
        );
        
        logger.logInfo(`Booster receipt logged: ${boosterId} - ${payoutId}`);
        return message.id;
    } catch (error) {
        logger.logError(error, { context: 'LOG_BOOSTER_RECEIPT', boosterId, payoutId });
        return null;
    }
}

async function ensureLogInfrastructure(guild) {
    const results = [];
    for (const channelName of ['event-logs', 'customer-logs', 'booster-logs']) {
        try {
            await getOrCreateLogChannel(guild, channelName, 0);
            results.push({ channelName, success: true });
        } catch (error) {
            logger.logError(error, { context: 'ENSURE_LOG_INFRASTRUCTURE', channelName });
            results.push({
                channelName,
                success: false,
                errorCode: error.code || 'UNKNOWN',
                message: error.message,
                channelId: error.channelId || null,
                categoryId: error.categoryId || null,
            });
        }
    }

    return results;
}

module.exports = {
    ensureLogInfrastructure,
    initialize,
    logEvent,
    logCustomerTicket,
    logBoosterReceipt,
};
