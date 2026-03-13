const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const ticketSystem = require('./ticketSystem');
const calendarSystem = require('./calendarSystem');
const applicationSystem = require('./applicationSystem');
const characterSystem = require('./characterSystem');
const logger = require('../utils/logger');
const createEndEventModal = require('../modals/endEventModal');
const Database = require('../database/database');
const createApproveRaidTicketModal = require('../modals/approveRaidTicketModal');
const createApproveMythicTicketModal = require('../modals/approveMythicTicketModal');
const createCancelEventModal = require('../modals/cancelEventModal');
const { MIDNIGHT_RAIDS } = require('../utils/contentCatalog');
const registerCharacterSessionStore = require('../utils/registerCharacterSessionStore');
const { formatCutRates, resolveEventCutRates } = require('../utils/cutConfig');
const boosterApplicationSessionStore = require('../utils/boosterApplicationSessionStore');

// Check if user has permission
function hasPermission(member, roles) {
    if (member.permissions.has('Administrator')) {
        return true;
    }

    const adminRole = process.env.ROLE_ADMIN;
    const managementRole = process.env.ROLE_MANAGEMENT;
    const advertiserRole = process.env.ROLE_ADVERTISER;
    const raidLeaderRole = process.env.ROLE_RAID_LEADER;

    if (roles.includes('admin') && adminRole && member.roles.cache.has(adminRole)) {
        return true;
    }
    if (roles.includes('management') && managementRole && member.roles.cache.has(managementRole)) {
        return true;
    }
    if (roles.includes('advertiser') && advertiserRole && member.roles.cache.has(advertiserRole)) {
        return true;
    }
    if (roles.includes('raid_leader') && raidLeaderRole && member.roles.cache.has(raidLeaderRole)) {
        return true;
    }

    return false;
}

async function handleButton(interaction) {
    const { customId } = interaction;
    const clientRoleId = process.env.ROLE_CLIENT;
    const boosterRoleId = process.env.ROLE_BOOSTER;
    const applicantRoleId = process.env.ROLE_BOOSTER_APPLICANT;

    if (customId === 'choose_role_client') {
        if (!clientRoleId) {
            await interaction.reply({ content: '❌ ROLE_CLIENT is not configured.', flags: MessageFlags.Ephemeral });
            return;
        }

        const clientRole = interaction.guild.roles.cache.get(clientRoleId);
        if (!clientRole) {
            await interaction.reply({ content: '❌ Client role not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.member.roles.add(clientRole);
        if (applicantRoleId && interaction.member.roles.cache.has(applicantRoleId)) {
            await interaction.member.roles.remove(applicantRoleId).catch(() => {});
        }
        await interaction.reply({ content: '✅ You now have client access. Head to `#client-services` to choose your service type and open a ticket.', flags: MessageFlags.Ephemeral });
        return;
    }

    if (customId === 'choose_role_booster') {
        if (!applicantRoleId) {
            await interaction.reply({ content: '❌ ROLE_BOOSTER_APPLICANT is not configured.', flags: MessageFlags.Ephemeral });
            return;
        }

        const applicantRole = interaction.guild.roles.cache.get(applicantRoleId);
        if (!applicantRole) {
            await interaction.reply({ content: '❌ Booster applicant role not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (!interaction.member.roles.cache.has(applicantRoleId)) {
            await interaction.member.roles.add(applicantRole);
        }
        if (clientRoleId && interaction.member.roles.cache.has(clientRoleId)) {
            await interaction.member.roles.remove(clientRoleId).catch(() => {});
        }

        await interaction.reply({ content: '✅ You now have booster applicant access. Head to `#booster-apply` and submit your application.', flags: MessageFlags.Ephemeral });
        return;
    }

    // Booster application button
    if (customId === 'booster_application_button') {
        if (!hasPermission(interaction.member, ['admin', 'management']) && !(applicantRoleId && interaction.member.roles.cache.has(applicantRoleId))) {
            await interaction.reply({ content: '❌ Select the booster path first before applying.', flags: MessageFlags.Ephemeral });
            return;
        }

        const createBoosterApplicationProfileModal = require('../modals/boosterApplicationProfileModal');
        await interaction.showModal(createBoosterApplicationProfileModal());
        return;
    }

    if (customId === 'open_register_characters_modal') {
        const createRegisterCharactersModal = require('../modals/registerCharactersModal');
        const session = registerCharacterSessionStore.createSession(interaction.user.id);
        await interaction.showModal(createRegisterCharactersModal(session.sessionId));
        return;
    }

    if (customId.startsWith('add_register_character_')) {
        const sessionId = customId.replace('add_register_character_', '');
        const session = registerCharacterSessionStore.getSession(sessionId);
        if (!session || session.userId !== interaction.user.id) {
            await interaction.reply({ content: '❌ This register session has expired. Please start again.', flags: MessageFlags.Ephemeral });
            return;
        }

        const createRegisterCharactersModal = require('../modals/registerCharactersModal');
        await interaction.showModal(createRegisterCharactersModal(sessionId));
        return;
    }

    if (customId.startsWith('open_mythic_client_character_modal_')) {
        const sessionId = customId.replace('open_mythic_client_character_modal_', '');
        const session = require('../utils/mplusRequestStore').getSession(sessionId);
        if (!session || session.userId !== interaction.user.id) {
            await interaction.reply({ content: '❌ This Mythic+ request session has expired. Please start again.', flags: MessageFlags.Ephemeral });
            return;
        }

        const createClientCharacterDetailsModal = require('../modals/clientCharacterDetailsModal');
        await interaction.showModal(
            createClientCharacterDetailsModal(
                `client_ticket_character_modal:mythic_plus:${sessionId}`,
                'Mythic+ Character Details'
            )
        );
        return;
    }

    if (customId.startsWith('add_booster_application_character_')) {
        const sessionId = customId.replace('add_booster_application_character_', '');
        const session = boosterApplicationSessionStore.getSession(sessionId);
        if (!session || session.userId !== interaction.user.id) {
            await interaction.reply({ content: '❌ This booster application session has expired. Please start again.', flags: MessageFlags.Ephemeral });
            return;
        }

        const createBoosterApplicationCharacterModal = require('../modals/boosterApplicationCharacterModal');
        await interaction.showModal(createBoosterApplicationCharacterModal(sessionId));
        return;
    }

    if (customId.startsWith('submit_booster_application_')) {
        await interaction.update({ content: '⏳ Submitting application...', components: [] });

        const sessionId = customId.replace('submit_booster_application_', '');
        const session = boosterApplicationSessionStore.getSession(sessionId);
        if (!session || session.userId !== interaction.user.id) {
            await interaction.editReply({ content: '❌ This booster application session has expired. Please start again.' });
            return;
        }

        const result = await applicationSystem.processApplication(interaction.user.id, session.applicationData, session.characters);
        boosterApplicationSessionStore.clearSession(sessionId);

        if (!result.success) {
            await interaction.editReply({ content: `❌ ${result.message}` });
            return;
        }

        await interaction.editReply({ content: '✅ Booster application submitted successfully. Management will review it shortly.' });
        return;
    }

    if (customId.startsWith('request_selection_cancel_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const applicationId = customId.replace('request_selection_cancel_', '');
        const result = await calendarSystem.createSelectionCancelRequest(applicationId, interaction.user.id);
        if (!result.success) {
            await interaction.editReply({ content: `❌ ${result.message}` });
            return;
        }

        const disabledButton = ButtonBuilder.from(interaction.component).setDisabled(true).setLabel('Cancel Request Submitted');
        await interaction.message.edit({
            components: [new ActionRowBuilder().addComponents(disabledButton)]
        }).catch(() => {});
        await interaction.editReply({ content: '✅ Your cancel request was sent to admins for review.' });
        return;
    }

    if (customId.startsWith('approve_selection_cancel_')) {
        if (!hasPermission(interaction.member, ['admin'])) {
            await interaction.reply({ content: 'Only admins can approve selection cancellations.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const requestId = customId.replace('approve_selection_cancel_', '');
        const result = await calendarSystem.approveSelectionCancelRequest(requestId, interaction.user.id);
        if (!result.success) {
            await interaction.editReply({ content: `❌ ${result.message}` });
            return;
        }

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setColor(0x00FF00);
        embed.addFields({ name: 'Status', value: `Approved by <@${interaction.user.id}>`, inline: false });
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: `✅ ${result.message}` });
        return;
    }

    if (customId.startsWith('reject_selection_cancel_')) {
        if (!hasPermission(interaction.member, ['admin'])) {
            await interaction.reply({ content: 'Only admins can reject selection cancellations.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const requestId = customId.replace('reject_selection_cancel_', '');
        const result = await calendarSystem.rejectSelectionCancelRequest(requestId, interaction.user.id);
        if (!result.success) {
            await interaction.editReply({ content: `❌ ${result.message}` });
            return;
        }

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setColor(0xFF0000);
        embed.addFields({ name: 'Status', value: `Rejected by <@${interaction.user.id}>`, inline: false });
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: `✅ ${result.message}` });
        return;
    }

    if (customId.startsWith('revert_listing_')) {
        await interaction.deferUpdate();

        const parts = customId.replace('revert_listing_', '').split('_');
        const eventId = parts[0];
        const boosterId = parts.slice(1).join('_');

        if (interaction.user.id !== boosterId && !hasPermission(interaction.member, ['admin', 'management', 'raid_leader'])) {
            await interaction.followUp({ content: '❌ Only the booster who posted this listing or management can revert it.', flags: MessageFlags.Ephemeral });
            return;
        }

        const selectedApp = await Database.get(
            `SELECT * FROM event_applications WHERE event_id = ? AND booster_id = ? AND status = 'approved'`,
            [eventId, boosterId]
        );
        if (selectedApp) {
            await interaction.followUp({ content: '❌ A character from this listing has already been selected. Use the DM `Cancel Selection` flow instead.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.message.delete().catch(async () => {
            await interaction.editReply({ content: 'Listing reverted.', embeds: [], components: [] });
        });
        return;
    }

    if (customId.startsWith('cancel_booster_application_')) {
        const sessionId = customId.replace('cancel_booster_application_', '');
        const session = boosterApplicationSessionStore.getSession(sessionId);
        if (session && session.userId === interaction.user.id) {
            boosterApplicationSessionStore.clearSession(sessionId);
        }
        await interaction.update({ content: 'Booster application cancelled.', components: [] });
        return;
    }

    if (customId.startsWith('view_event_admin_details_')) {
        if (!hasPermission(interaction.member, ['admin'])) {
            await interaction.reply({ content: 'Only admins can view event cuts and client details.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const eventId = customId.replace('view_event_admin_details_', '');
        const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventId]);
        if (!event) {
            await interaction.editReply({ content: '❌ Event not found.' });
            return;
        }

        const clients = await calendarSystem.getApprovedClientsForEvent(eventId);
        const clientLines = [];
        for (const client of clients) {
            let memberName = `User ${client.client_id}`;
            try {
                const member = await interaction.guild.members.fetch(client.client_id);
                memberName = member.displayName;
            } catch {
                // Keep fallback display.
            }

            const characterText = client.client_character_name && client.client_character_realm
                ? `${client.client_character_name}-${client.client_character_realm}`
                : 'No character provided';
            clientLines.push(`- ${memberName} (<@${client.client_id}>) | ${characterText}${client.settled_gold ? ` | ${Number(client.settled_gold).toLocaleString()}g` : ''}`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`Admin Details - ${event.name}`)
            .addFields(
                { name: '🆔 Event ID', value: `\`${event.event_id}\``, inline: true },
                { name: '💰 Cuts', value: formatCutRates(resolveEventCutRates(event)), inline: false },
                { name: `👤 Clients (${clients.length})`, value: clientLines.length > 0 ? clientLines.join('\n').slice(0, 1024) : 'No approved clients yet.', inline: false }
            )
            .setColor(0x5865F2)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (customId.startsWith('finish_register_characters_')) {
        await interaction.update({ content: '⏳ Registering queued characters...', components: [] });

        const sessionId = customId.replace('finish_register_characters_', '');
        const session = registerCharacterSessionStore.getSession(sessionId);
        if (!session || session.userId !== interaction.user.id) {
            await interaction.editReply({ content: '❌ This register session has expired. Please start again.' });
            return;
        }

        const result = await characterSystem.registerCharacterEntries(interaction.user.id, session.characters);
        registerCharacterSessionStore.clearSession(sessionId);

        if (!result.success) {
            await interaction.editReply({ content: `❌ ${result.message}` });
            return;
        }

        const lines = [`✅ Registered or updated ${result.successes.length} character(s).`];
        if (result.successes.length > 0) {
            lines.push(`Success: ${result.successes.join(', ')}`.slice(0, 1900));
        }
        if (result.failures.length > 0) {
            lines.push(`Failed: ${result.failures.join(' | ')}`.slice(0, 1900));
        }

        await interaction.editReply({ content: lines.join('\n') });
        return;
    }

    if (customId.startsWith('cancel_register_characters_')) {
        const sessionId = customId.replace('cancel_register_characters_', '');
        const session = registerCharacterSessionStore.getSession(sessionId);
        if (session && session.userId === interaction.user.id) {
            registerCharacterSessionStore.clearSession(sessionId);
        }
        await interaction.update({ content: 'Registration cancelled.', components: [] });
        return;
    }

    // Create ticket button
    if (customId === 'create_ticket') {
        if (!hasPermission(interaction.member, ['admin', 'management']) && !(clientRoleId && interaction.member.roles.cache.has(clientRoleId))) {
            await interaction.reply({ content: '❌ Choose the client path first to create a service ticket.', flags: MessageFlags.Ephemeral });
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_type_select')
            .setPlaceholder('Choose the type of boost you want')
            .addOptions(
                {
                    label: 'Raid',
                    description: 'Pick from the available scheduled raids',
                    value: 'raid',
                },
                {
                    label: 'Mythic+',
                    description: 'Set the run count, then choose each dungeon and key level',
                    value: 'mythic_plus',
                },
                {
                    label: 'Support',
                    description: 'Talk to a representative or ask for help',
                    value: 'support',
                },
                {
                    label: 'Raid Request',
                    description: 'Ask for a raid when the listed raids are not suitable',
                    value: 'raid_request',
                }
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: 'Select the type of boost you want:',
            components: [actionRow],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (customId === 'create_event_panel') {
        if (!hasPermission(interaction.member, ['admin'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        const raidSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_event_raid_select')
            .setPlaceholder('Choose the raid to create')
            .addOptions(
                MIDNIGHT_RAIDS.map(raid => ({
                    label: raid.label,
                    value: raid.id,
                }))
            );

        await interaction.reply({
            content: 'Choose the raid to create:',
            components: [new ActionRowBuilder().addComponents(raidSelectMenu)],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (customId.startsWith('approve_raid_ticket_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        const ticketId = customId.replace('approve_raid_ticket_', '');
        const ticket = await Database.get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
        if (!ticket) {
            await interaction.reply({ content: '❌ Ticket not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (!['raid', 'raid_request'].includes(ticket.boost_type)) {
            await interaction.reply({ content: '❌ This ticket is not a raid assignment ticket.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (ticket.approval_status === 'approved') {
            await interaction.reply({ content: '❌ This ticket is already approved.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(createApproveRaidTicketModal(ticket));
        return;
    }

    if (customId.startsWith('approve_mythic_ticket_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        const ticketId = customId.replace('approve_mythic_ticket_', '');
        const ticket = await Database.get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
        if (!ticket) {
            await interaction.reply({ content: '❌ Ticket not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (ticket.boost_type !== 'mythic_plus') {
            await interaction.reply({ content: '❌ This ticket is not a Mythic+ ticket.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (ticket.approval_status === 'approved') {
            await interaction.reply({ content: '❌ This ticket is already approved.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(createApproveMythicTicketModal(ticket));
        return;
    }

    // Close ticket button
    if (customId.startsWith('close_ticket_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const ticketId = customId.replace('close_ticket_', '');
        try {
            await ticketSystem.closeTicket(ticketId, interaction.user.id);
            await interaction.editReply({ content: '✅ Ticket closed successfully.' });
        } catch (error) {
            logger.logError(error, { context: 'CLOSE_TICKET_BUTTON', userId: interaction.user.id });
            await interaction.editReply({ content: '❌ An error occurred while closing the ticket.' });
        }
        return;
    }

    // Booster application buttons
    if (customId.startsWith('approve_application_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const applicationId = customId.replace('approve_application_', '');
        const result = await applicationSystem.approveApplication(applicationId, interaction.user.id);

        if (result.success) {
            await interaction.editReply({ content: '✅ Application approved successfully.' });
            // Update the message
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setColor(0x00FF00);
            embed.addFields({ name: '✅ Status', value: 'Approved', inline: false });
            await interaction.message.edit({ embeds: [embed], components: [] });
        } else {
            await interaction.editReply({ content: `❌ ${result.message}` });
        }
        return;
    }

    if (customId.startsWith('reject_application_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const applicationId = customId.replace('reject_application_', '');
        const result = await applicationSystem.rejectApplication(applicationId, interaction.user.id);

        if (result.success) {
            await interaction.editReply({ content: '✅ Application rejected.' });
            // Update the message
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setColor(0xFF0000);
            embed.addFields({ name: '❌ Status', value: 'Rejected', inline: false });
            await interaction.message.edit({ embeds: [embed], components: [] });
        } else {
            await interaction.editReply({ content: `❌ ${result.message}` });
        }
        return;
    }

    // Event application button
    if (customId.startsWith('event_apply_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const eventId = customId.replace('event_apply_', '');
        const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventId]);
        if (!event || event.status !== 'open') {
            await interaction.editReply({ content: '❌ This event is no longer open for applications.' });
            return;
        }
        
        // Get available characters for this booster
        const availableChars = await characterSystem.getAvailableCharacters(
            interaction.user.id,
            event.min_item_level || 0,
            event.min_rio_score || 0,
            {
                eventType: event.event_type,
                eventDifficulty: event.event_difficulty,
            }
        );

        if (availableChars.length === 0) {
            await interaction.editReply({ content: '❌ You have no available characters. Please register characters using `/registerchar`.' });
            return;
        }

        // Show character selection menu
        const { StringSelectMenuBuilder } = require('discord.js');
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`event_char_select_${eventId}`)
            .setPlaceholder('Select a character to apply with')
            .addOptions(
                availableChars.map(char => ({
                    label: `${char.character_name}-${char.character_realm}`,
                    description: `iLvl: ${char.item_level} | RIO: ${char.rio_score} | ${char.class_name}`,
                    value: `${char.character_name}|${char.character_realm}`,
                }))
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.editReply({ content: 'Select a character to apply with:', components: [actionRow], flags: MessageFlags.Ephemeral });
        return;
    }

    // Select character for event (manager action)
    if (customId.startsWith('select_char_')) {
        if (!hasPermission(interaction.member, ['admin', 'management', 'raid_leader'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        logger.logAction('ROSTER_SELECT_CLICKED', interaction.user.id, { customId, messageId: interaction.message.id });

        // Format: select_char_${eventId}_${boosterId}_${charName}_${charRealm}
        const parts = customId.replace('select_char_', '').split('_');
        const eventId = parts[0];
        const boosterId = parts[1];
        const charName = parts.slice(2, -1).join('_'); // Handle names with underscores
        const charRealm = parts[parts.length - 1];

        const result = await calendarSystem.selectCharacterForEvent(eventId, boosterId, charName, charRealm, interaction.user.id, {
            listingChannelId: interaction.channel.id,
            listingMessageId: interaction.message.id,
        });

        if (result.success) {
            await interaction.editReply({ content: '✅ Character selected for event.' });
        } else {
            await interaction.editReply({ content: `❌ ${result.message}` });
        }
        return;
    }

    // Deselect character from event
    if (customId.startsWith('deselect_char_')) {
        if (!hasPermission(interaction.member, ['admin', 'management', 'raid_leader'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        logger.logAction('ROSTER_DESELECT_CLICKED', interaction.user.id, { customId, messageId: interaction.message.id });

        const parts = customId.replace('deselect_char_', '').split('_');
        const eventId = parts[0];
        const boosterId = parts[1];
        const charName = parts.slice(2, -1).join('_');
        const charRealm = parts[parts.length - 1];

        const result = await calendarSystem.deselectCharacterFromEvent(eventId, boosterId, charName, charRealm, interaction.user.id);

        if (result.success) {
            const selectHandlers = require('./selectHandlers');
            if (typeof selectHandlers.resetManagerCharacterSelectionMessage === 'function') {
                await selectHandlers.resetManagerCharacterSelectionMessage(interaction.message, eventId, boosterId);
            }
            await interaction.editReply({ content: '✅ Character deselected from event.' });
        } else {
            await interaction.editReply({ content: `❌ ${result.message}` });
        }
        return;
    }

    // End event button
    if (customId.startsWith('end_event_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        const eventId = customId.replace('end_event_', '');
        const modal = createEndEventModal(eventId);
        await interaction.showModal(modal);
        return;
    }

    // Cancel event button
    if (customId.startsWith('cancel_event_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        const eventId = customId.replace('cancel_event_', '');
        await interaction.showModal(createCancelEventModal(eventId));
        return;
    }

    // Complete payment button
    if (customId.startsWith('complete_payment_')) {
        if (!hasPermission(interaction.member, ['admin', 'management'])) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Parse: complete_payment_${payoutIdSafe}_${boosterId}
        const customIdParts = customId.replace('complete_payment_', '');
        const payoutPrefix = 'payout_';
        if (!customIdParts.startsWith(payoutPrefix)) {
            throw new Error('Invalid payout ID format');
        }
        const afterPrefix = customIdParts.substring(payoutPrefix.length);
        const payoutIdSafe = afterPrefix.substring(0, 8);
        const boosterId = afterPrefix.substring(9);

        try {
            // Update receipt status
            await Database.run(
                `UPDATE payout_receipts SET status = 'completed', completed_at = CURRENT_TIMESTAMP, completed_by = ? WHERE payout_id = ? AND booster_id = ?`,
                [interaction.user.id, payoutIdSafe.replace(/_/g, '-'), boosterId]
            );

            // Update embed
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            const fields = embed.data.fields || [];
            const statusFieldIndex = fields.findIndex(field => field.name === '✅ Payment Status');
            if (statusFieldIndex !== -1) {
                fields[statusFieldIndex].value = '✅ Payment Completed';
            } else {
                embed.addFields({ name: '✅ Payment Status', value: '✅ Payment Completed', inline: false });
            }
            embed.setColor(0x00FF00);

            // Remove the button
            await interaction.message.edit({
                embeds: [embed],
                components: []
            });

            logger.logAction('PAYMENT_COMPLETED', interaction.user.id, {
                payoutId: payoutIdSafe.replace(/_/g, '-'),
                boosterId,
                messageId: interaction.message.id
            });

            await interaction.editReply({ content: `✅ Payment for booster <@${boosterId}> marked as completed.` });
        } catch (error) {
            logger.logError(error, { context: 'COMPLETE_PAYMENT_BUTTON', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error marking payment as completed: ${error.message}` });
        }
        return;
    }
}

module.exports = {
    handleButton,
};
