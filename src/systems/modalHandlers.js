const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const calendarSystem = require('./calendarSystem');
const applicationSystem = require('./applicationSystem');
const characterSystem = require('./characterSystem');
const ticketSystem = require('./ticketSystem');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const { buildRaidEventName, findRaidBoostTypeById } = require('../utils/contentCatalog');
const { MIDNIGHT_DUNGEONS } = require('../utils/contentCatalog');
const mplusRequestStore = require('../utils/mplusRequestStore');
const registerCharacterSessionStore = require('../utils/registerCharacterSessionStore');
const boosterApplicationSessionStore = require('../utils/boosterApplicationSessionStore');
const { getDefaultCutRates, formatCutRates } = require('../utils/cutConfig');

function parseDiscordUserId(rawValue) {
    const trimmed = String(rawValue || '').trim();
    const mentionMatch = trimmed.match(/^<@!?(\d{17,20})>$/);
    if (mentionMatch) {
        return mentionMatch[1];
    }

    return /^\d{17,20}$/.test(trimmed) ? trimmed : null;
}

function buildMythicDungeonSelect(sessionId, runNumber) {
    const dungeonSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_mythic_dungeon_select:${sessionId}:${runNumber}`)
        .setPlaceholder(`Choose the dungeon for run ${runNumber}`)
        .addOptions(
            MIDNIGHT_DUNGEONS.map(dungeon => ({
                label: dungeon.label,
                value: dungeon.id,
            }))
        );

    return new ActionRowBuilder().addComponents(dungeonSelectMenu);
}

function buildRegisterCharacterSessionResponse(session) {
    const queuedCharacters = session.characters.length > 0
        ? session.characters.map((entry, index) => `${index + 1}. ${entry.characterName}-${entry.characterRealm}`).join('\n')
        : 'No characters queued yet.';

    return {
        content: `Queued characters (${session.characters.length}/20):\n${queuedCharacters}`,
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`add_register_character_${session.sessionId}`)
                    .setLabel('Add Another Character')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➕')
                    .setDisabled(session.characters.length >= 20),
                new ButtonBuilder()
                    .setCustomId(`finish_register_characters_${session.sessionId}`)
                    .setLabel('Finish Registration')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`cancel_register_characters_${session.sessionId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✖️')
            )
        ],
    };
}

function buildBoosterApplicationSessionResponse(session) {
    const queuedCharacters = session.characters.length > 0
        ? session.characters.map((entry, index) => `${index + 1}. ${entry.characterName}-${entry.characterRealm}`).join('\n')
        : 'No characters added yet.';

    return {
        content: `Application details saved.\nQueued characters (${session.characters.length}/20):\n${queuedCharacters}`,
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`add_booster_application_character_${session.sessionId}`)
                    .setLabel('Add Character')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➕')
                    .setDisabled(session.characters.length >= 20),
                new ButtonBuilder()
                    .setCustomId(`submit_booster_application_${session.sessionId}`)
                    .setLabel('Submit Application')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
                    .setDisabled(session.characters.length === 0),
                new ButtonBuilder()
                    .setCustomId(`cancel_booster_application_${session.sessionId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✖️')
            )
        ],
    };
}

async function handleModal(interaction) {
    const { customId } = interaction;

    // Booster application modal
    if (customId === 'booster_application_profile_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const battletag = interaction.fields.getTextInputValue('battletag').trim();
        const lastSeasonRio = parseFloat(interaction.fields.getTextInputValue('last_season_rio').trim());
        const previousCommunities = interaction.fields.getTextInputValue('previous_communities').trim();
        const yearsPlaying = parseInt(interaction.fields.getTextInputValue('years_playing').trim(), 10);
        const yearsBoosting = parseInt(interaction.fields.getTextInputValue('years_boosting').trim(), 10);

        if (Number.isNaN(lastSeasonRio) || lastSeasonRio < 0 || Number.isNaN(yearsPlaying) || yearsPlaying < 0 || Number.isNaN(yearsBoosting) || yearsBoosting < 0) {
            await interaction.editReply({ content: '❌ Last season RIO and year fields must be zero or higher numbers.' });
            return;
        }

        const session = boosterApplicationSessionStore.createSession(interaction.user.id, {
            battletag,
            lastSeasonRio,
            previousCommunities,
            yearsPlaying,
            yearsBoosting,
        });

        await interaction.editReply(buildBoosterApplicationSessionResponse(session));
        return;
    }

    if (customId.startsWith('booster_application_character_modal:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sessionId = customId.split(':')[1];
        const session = boosterApplicationSessionStore.getSession(sessionId);
        const characterName = interaction.fields.getTextInputValue('character_name').trim();
        const characterRealm = interaction.fields.getTextInputValue('character_realm').trim();

        if (!session || session.userId !== interaction.user.id) {
            await interaction.editReply({ content: '❌ This booster application session has expired. Please start again.' });
            return;
        }

        if (!characterName || !characterRealm) {
            await interaction.editReply({ content: '❌ Character name and realm are required.' });
            return;
        }

        const addResult = boosterApplicationSessionStore.addCharacter(sessionId, characterName, characterRealm);
        if (!addResult.success) {
            await interaction.editReply({ content: `❌ ${addResult.message}` });
            return;
        }

        await interaction.editReply(buildBoosterApplicationSessionResponse(addResult.session));
        return;
    }

    if (customId.startsWith('register_characters_modal:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sessionId = customId.split(':')[1];
        const session = registerCharacterSessionStore.getSession(sessionId);
        const characterName = interaction.fields.getTextInputValue('character_name').trim();
        const characterRealm = interaction.fields.getTextInputValue('character_realm').trim();

        if (!session || session.userId !== interaction.user.id) {
            await interaction.editReply({ content: '❌ This register session has expired. Please start again.' });
            return;
        }

        if (!characterName || !characterRealm) {
            await interaction.editReply({ content: '❌ Character name and realm are both required.' });
            return;
        }

        const addResult = registerCharacterSessionStore.addCharacter(sessionId, characterName, characterRealm);
        if (!addResult.success) {
            await interaction.editReply({ content: `❌ ${addResult.message}` });
            return;
        }

        await interaction.editReply(buildRegisterCharacterSessionResponse(addResult.session));
        return;
    }

    if (customId === 'mythic_plus_amount_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const runCountInput = interaction.fields.getTextInputValue('run_count').trim();
        const runCount = parseInt(runCountInput, 10);
        if (Number.isNaN(runCount) || runCount <= 0 || runCount > 8) {
            await interaction.editReply({ content: '❌ Amount of runs must be a number between 1 and 8.' });
            return;
        }

        const session = mplusRequestStore.createSession(interaction.user.id, interaction.guild.id, runCount);
        await interaction.editReply({
            content: `Choose the dungeon for run 1 of ${runCount}:`,
            components: [buildMythicDungeonSelect(session.sessionId, 1)]
        });
        return;
    }

    if (customId.startsWith('mythic_plus_run_modal:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [, sessionId, runNumberInput, dungeonId] = customId.split(':');
        const runNumber = parseInt(runNumberInput, 10);
        const session = mplusRequestStore.getSession(sessionId);
        const dungeon = MIDNIGHT_DUNGEONS.find(entry => entry.id === dungeonId);
        const keyLevelInput = interaction.fields.getTextInputValue('key_level').trim();
        const keyLevel = parseInt(keyLevelInput, 10);

        if (!session || session.userId !== interaction.user.id || session.guildId !== interaction.guild.id) {
            await interaction.editReply({ content: '❌ This Mythic+ request session has expired. Please start again.' });
            return;
        }

        if (!dungeon || Number.isNaN(runNumber) || session.runs.length + 1 !== runNumber) {
            await interaction.editReply({ content: '❌ Invalid Mythic+ run step. Please start again.' });
            return;
        }

        if (Number.isNaN(keyLevel) || keyLevel <= 0) {
            await interaction.editReply({ content: '❌ Key level must be a positive number.' });
            return;
        }

        mplusRequestStore.addRun(sessionId, {
            dungeonId,
            label: dungeon.label,
            keyLevel,
        });

        try {
            const updatedSession = mplusRequestStore.getSession(sessionId);
            if (updatedSession.runs.length < updatedSession.runCount) {
                const nextRun = updatedSession.runs.length + 1;
                await interaction.editReply({
                    content: `Saved run ${runNumber}/${updatedSession.runCount}: **${dungeon.label} +${keyLevel}**\nChoose the dungeon for run ${nextRun}:`,
                    components: [buildMythicDungeonSelect(sessionId, nextRun)]
                });
                return;
            }

            await interaction.editReply({
                content: `Saved run ${runNumber}/${updatedSession.runCount}: **${dungeon.label} +${keyLevel}**\nNow click below to enter your character name and server.`,
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`open_mythic_client_character_modal_${sessionId}`)
                            .setLabel('Continue')
                            .setStyle(ButtonStyle.Primary)
                    )
                ]
            });
        } catch (error) {
            logger.logError(error, { context: 'MYTHIC_PLUS_TICKET_MODAL', userId: interaction.user.id });
            mplusRequestStore.clearSession(sessionId);
            await interaction.editReply({ content: '❌ An error occurred while creating your Mythic+ ticket.' });
        }
        return;
    }

    if (customId === 'support_ticket_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const supportTopic = interaction.fields.getTextInputValue('support_topic').trim();
        if (!supportTopic) {
            await interaction.editReply({ content: '❌ Please describe what you need help with.' });
            return;
        }

        try {
            const result = await ticketSystem.createTicket(interaction.user.id, interaction.guild, {
                boost_type: 'support',
                boost_label: supportTopic,
                boost_amount: 1,
                client_character_name: interaction.fields.getTextInputValue('client_character_name').trim(),
                client_character_realm: interaction.fields.getTextInputValue('client_character_realm').trim(),
            });

            await interaction.editReply({ content: `✅ Support ticket created! ${result.channel}` });
        } catch (error) {
            logger.logError(error, { context: 'SUPPORT_TICKET_MODAL', userId: interaction.user.id });
            await interaction.editReply({ content: '❌ An error occurred while creating your support ticket.' });
        }
        return;
    }

    if (customId === 'raid_request_ticket_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const raidRequest = interaction.fields.getTextInputValue('raid_request').trim();
        if (!raidRequest) {
            await interaction.editReply({ content: '❌ Please describe the dedicated raid you want.' });
            return;
        }

        try {
            const result = await ticketSystem.createTicket(interaction.user.id, interaction.guild, {
                boost_type: 'raid_request',
                boost_label: raidRequest,
                boost_amount: 1,
                client_character_name: interaction.fields.getTextInputValue('client_character_name').trim(),
                client_character_realm: interaction.fields.getTextInputValue('client_character_realm').trim(),
            });

            await interaction.editReply({ content: `✅ Raid request ticket created! ${result.channel}` });
        } catch (error) {
            logger.logError(error, { context: 'RAID_REQUEST_TICKET_MODAL', userId: interaction.user.id });
            await interaction.editReply({ content: '❌ An error occurred while creating your raid request ticket.' });
        }
        return;
    }

    if (customId.startsWith('create_event_panel_modal:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [, raidId, difficultyId, boostTypeId] = customId.split(':');
        const eventName = buildRaidEventName(raidId, difficultyId);
        const boostType = findRaidBoostTypeById(boostTypeId);
        const datePart = interaction.fields.getTextInputValue('event_date').trim();
        const timePart = interaction.fields.getTextInputValue('event_time').trim();
        const minItemLevelInput = interaction.fields.getTextInputValue('min_item_level').trim();
        const minRioScoreInput = interaction.fields.getTextInputValue('min_rio_score').trim();
        const capacityInput = interaction.fields.getTextInputValue('capacity').trim();

        if (!eventName || !boostType) {
            await interaction.editReply({ content: '❌ Invalid raid, difficulty, or boost type selection.' });
            return;
        }

        const [day, month, year] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const scheduledDate = new Date(year, month - 1, day, hours, minutes);
        const minItemLevel = minItemLevelInput ? parseInt(minItemLevelInput, 10) : 0;
        const minRioScore = minRioScoreInput ? parseInt(minRioScoreInput, 10) : 0;
        const clientLimit = capacityInput ? parseInt(capacityInput, 10) : 0;

        if (Number.isNaN(scheduledDate.getTime())) {
            await interaction.editReply({ content: '❌ Invalid date/time. Use DD-MM-YYYY and HH:MM.' });
            return;
        }

        if ([minItemLevel, minRioScore, clientLimit].some(value => Number.isNaN(value) || value < 0)) {
            await interaction.editReply({ content: '❌ Minimum item level, Raider.IO score, and capacity must be zero or higher.' });
            return;
        }

        try {
            const result = await calendarSystem.createEvent(
                eventName,
                '',
                scheduledDate,
                interaction.user.id,
                interaction.guild,
                { minItemLevel, minRioScore, clientLimit, eventDifficulty: difficultyId, raidBoostType: boostTypeId }
            );

            await interaction.editReply({
                content: `✅ Event created!\n**Event ID:** ${result.eventId}\n**Channel:** ${result.channel}\n**Boost Type:** ${boostType.label}\n**Requirements:** iLvl ${minItemLevel}+ | RIO ${minRioScore}+\n**Capacity:** ${clientLimit === 0 ? 'Unlimited' : clientLimit}\n**Cuts:** ${formatCutRates(getDefaultCutRates())}`
            });
        } catch (error) {
            logger.logError(error, { context: 'CREATE_EVENT_PANEL_MODAL', userId: interaction.user.id, raidId, difficultyId, boostTypeId });
            await interaction.editReply({ content: `❌ ${error.message}` });
        }
        return;
    }

    if (customId.startsWith('approve_raid_ticket_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const ticketId = customId.replace('approve_raid_ticket_modal_', '');
        const eventId = interaction.fields.getTextInputValue('event_id').trim();
        const settledGoldInput = interaction.fields.getTextInputValue('settled_gold').trim();
        const settledGold = parseInt(settledGoldInput, 10);

        if (!eventId) {
            await interaction.editReply({ content: '❌ Event ID is required.' });
            return;
        }

        if (Number.isNaN(settledGold) || settledGold <= 0) {
            await interaction.editReply({ content: '❌ Settled gold must be a positive number.' });
            return;
        }

        try {
            const assignment = await calendarSystem.assignClientToEvent(ticketId, eventId, interaction.user.id, settledGold);
            if (!assignment.success) {
                await interaction.editReply({ content: `❌ ${assignment.message}` });
                return;
            }

            const ticket = await require('../database/database').get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setFields([
                ...ticketSystem.getTicketRequestFields(ticket),
                ...ticketSystem.getTicketApprovalFields(ticket)
            ]);
            embed.setColor(0x00FF00);
            await interaction.message.edit({
                embeds: [embed],
                components: ticketSystem.buildTicketActionRows(ticket)
            });

            await calendarSystem.updateEventRoster(eventId);

            await interaction.editReply({
                content: `✅ Ticket approved and client assigned to \`${eventId}\` for ${settledGold.toLocaleString()}g.`
            });
        } catch (error) {
            logger.logError(error, { context: 'APPROVE_RAID_TICKET_MODAL', userId: interaction.user.id, ticketId, eventId });
            await interaction.editReply({ content: '❌ An error occurred while approving the raid ticket.' });
        }
        return;
    }

    if (customId.startsWith('approve_mythic_ticket_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const ticketId = customId.replace('approve_mythic_ticket_modal_', '');
        const settledGoldInput = interaction.fields.getTextInputValue('settled_gold').trim();
        const settledGold = parseInt(settledGoldInput, 10);

        if (Number.isNaN(settledGold) || settledGold <= 0) {
            await interaction.editReply({ content: '❌ Settled gold must be a positive number.' });
            return;
        }

        try {
            const approval = await calendarSystem.approveMythicTicket(ticketId, interaction.user.id, settledGold, interaction.guild);
            if (!approval.success) {
                await interaction.editReply({ content: `❌ ${approval.message}` });
                return;
            }

            const ticket = await require('../database/database').get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setFields([
                ...ticketSystem.getTicketRequestFields(ticket),
                ...ticketSystem.getTicketApprovalFields(ticket)
            ]);
            embed.setColor(0x00FF00);
            await interaction.message.edit({
                embeds: [embed],
                components: ticketSystem.buildTicketActionRows(ticket)
            });

            await calendarSystem.updateEventRoster(approval.eventId);

            await interaction.editReply({
                content: `✅ Mythic+ ticket approved for ${settledGold.toLocaleString()}g. Roster channel created: ${approval.channel}`
            });
        } catch (error) {
            logger.logError(error, { context: 'APPROVE_MYTHIC_TICKET_MODAL', userId: interaction.user.id, ticketId });
            await interaction.editReply({ content: '❌ An error occurred while approving the Mythic+ ticket.' });
        }
        return;
    }

    // Event application modal (deprecated - now using select menu)
    if (customId.startsWith('event_application_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({ content: 'This method is deprecated. Please use the character selection menu.' });
        return;
    }

    // End event modal
    if (customId.startsWith('end_event_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const eventId = customId.replace('end_event_modal_', '');
        const totalGoldInput = interaction.fields.getTextInputValue('total_gold');
        
        const totalGold = parseInt(totalGoldInput);
        if (isNaN(totalGold) || totalGold <= 0) {
            await interaction.editReply({ content: '❌ Invalid gold amount. Please enter a positive number.' });
            return;
        }

        const result = await calendarSystem.endEvent(eventId, totalGold, interaction.user.id);
        
        if (result.success) {
            await interaction.editReply({ content: `✅ ${result.message}` });
        } else if (result.mismatchWarning) {
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`force_end_event:${eventId}:${totalGold}`)
                    .setLabel('End Anyway')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚠️')
            );
            await interaction.editReply({ content: `⚠️ ${result.message}`, components: [actionRow] });
        } else {
            await interaction.editReply({ content: `❌ ${result.message}` });
        }
        return;
    }

    if (customId.startsWith('manual_event_client_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const eventId = customId.replace('manual_event_client_modal_', '');
        const rawClientId = interaction.fields.getTextInputValue('client_id').trim();
        const clientCharacterName = interaction.fields.getTextInputValue('client_character_name').trim();
        const clientCharacterRealm = interaction.fields.getTextInputValue('client_character_realm').trim();
        const settledGold = parseInt(interaction.fields.getTextInputValue('settled_gold').trim(), 10);
        const clientId = parseDiscordUserId(rawClientId);

        if (!clientId) {
            await interaction.editReply({ content: '❌ Enter a valid client mention or Discord ID.' });
            return;
        }

        if (!clientCharacterName || !clientCharacterRealm) {
            await interaction.editReply({ content: '❌ Character name and realm are required.' });
            return;
        }

        if (Number.isNaN(settledGold) || settledGold < 0) {
            await interaction.editReply({ content: '❌ Settled gold must be zero or a positive number.' });
            return;
        }

        const result = await calendarSystem.addManualClientToEvent(
            eventId,
            clientId,
            clientCharacterName,
            clientCharacterRealm,
            settledGold,
            interaction.user.id
        );

        if (result.success) {
            await interaction.editReply({
                content: `✅ Manual client added to event.\nClient: <@${clientId}>\nCharacter: **${clientCharacterName}-${clientCharacterRealm}**\nSettled Gold: **${settledGold.toLocaleString()}g**`
            });
        } else {
            await interaction.editReply({ content: `❌ ${result.message}` });
        }
        return;
    }

    if (customId.startsWith('cancel_event_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const eventId = customId.replace('cancel_event_modal_', '');
        const confirmation = interaction.fields.getTextInputValue('cancel_confirmation').trim().toUpperCase();
        if (confirmation !== 'CANCEL') {
            await interaction.editReply({ content: '❌ Cancellation aborted. Type `CANCEL` exactly to confirm.' });
            return;
        }

        const result = await calendarSystem.cancelEvent(eventId, interaction.user.id);
        if (result.success) {
            await interaction.editReply({ content: `✅ ${result.message}` });
        } else {
            await interaction.editReply({ content: `❌ ${result.message}` });
        }
        return;
    }

    if (customId.startsWith('client_ticket_character_modal:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [, boostType, contextId, encodedClass, encodedRole] = customId.split(':');
        const clientCharacterName = interaction.fields.getTextInputValue('client_character_name').trim();
        const clientCharacterRealm = interaction.fields.getTextInputValue('client_character_realm').trim();

        if (!clientCharacterName || !clientCharacterRealm) {
            await interaction.editReply({ content: '❌ Character name and server are required.' });
            return;
        }

        try {
            if (boostType === 'raid') {
                const raid = await Database.get(
                    `SELECT event_id, name, scheduled_date, status, client_limit FROM events WHERE event_id = ?`,
                    [contextId]
                );
                if (!raid || raid.status !== 'open') {
                    await interaction.editReply({ content: '❌ That raid is no longer available. Please start again.' });
                    return;
                }

                const assignedClients = await calendarSystem.getAssignedClientCount(contextId);
                if (raid.client_limit > 0 && assignedClients >= raid.client_limit) {
                    await interaction.editReply({ content: '❌ That raid is already full. Please create a Raid Request ticket instead.' });
                    return;
                }

                const requestedClass = decodeURIComponent(encodedClass || '');
                const requestedRole = decodeURIComponent(encodedRole || '');
                const result = await ticketSystem.createTicket(interaction.user.id, interaction.guild, {
                    boost_type: 'raid',
                    event_id: raid.event_id,
                    boost_label: raid.name,
                    requested_class: requestedClass,
                    requested_role: requestedRole,
                    client_character_name: clientCharacterName,
                    client_character_realm: clientCharacterRealm,
                    boost_amount: 1,
                    boost_scheduled_date: raid.scheduled_date,
                });

                await interaction.editReply({
                    content: `✅ Ticket created for raid request! ${result.channel}\nClass: **${requestedClass}** | Role: **${requestedRole}**\nCharacter: **${clientCharacterName}-${clientCharacterRealm}**`
                });
                return;
            }

            if (boostType === 'mythic_plus') {
                const session = mplusRequestStore.getSession(contextId);
                if (!session || session.userId !== interaction.user.id || session.guildId !== interaction.guild.id || session.runs.length === 0) {
                    await interaction.editReply({ content: '❌ This Mythic+ request session expired. Please start again.' });
                    return;
                }

                const requestData = {
                    boost_type: 'mythic_plus',
                    boost_label: session.runCount === 1 ? session.runs[0].label : `${session.runCount} Mythic+ Runs`,
                    boost_key_level: session.runCount === 1 ? session.runs[0].keyLevel : null,
                    boost_amount: session.runCount,
                    boost_runs: JSON.stringify(session.runs),
                    client_character_name: clientCharacterName,
                    client_character_realm: clientCharacterRealm,
                };

                const result = await ticketSystem.createTicket(interaction.user.id, interaction.guild, requestData);
                mplusRequestStore.clearSession(contextId);
                await interaction.editReply({ content: `✅ Ticket created for Mythic+ request! ${result.channel}` });
                return;
            }

            await interaction.editReply({ content: '❌ Invalid ticket flow.' });
        } catch (error) {
            logger.logError(error, { context: 'CLIENT_TICKET_CHARACTER_MODAL', userId: interaction.user.id, boostType, contextId });
            await interaction.editReply({ content: '❌ An error occurred while creating your ticket.' });
        }
        return;
    }
}

module.exports = {
    handleModal,
};
