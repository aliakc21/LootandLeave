const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('../database/database');
const ticketSystem = require('./ticketSystem');
const calendarSystem = require('./calendarSystem');
const logger = require('../utils/logger');
const { RAID_DIFFICULTIES, MIDNIGHT_DUNGEONS, findRaidById, findDifficultyById } = require('../utils/contentCatalog');

function hasAdminPermission(member) {
    if (member.permissions.has('Administrator')) {
        return true;
    }

    const adminRole = process.env.ROLE_ADMIN;
    return Boolean(adminRole && member.roles.cache.has(adminRole));
}

const RAID_CLASS_OPTIONS = [
    { label: 'Death Knight', value: 'Death Knight', description: 'Plate melee hero class' },
    { label: 'Demon Hunter', value: 'Demon Hunter', description: 'Agile tank or damage dealer' },
    { label: 'Druid', value: 'Druid', description: 'Flexible hybrid class' },
    { label: 'Evoker', value: 'Evoker', description: 'Caster dragon class' },
    { label: 'Hunter', value: 'Hunter', description: 'Ranged physical damage' },
    { label: 'Mage', value: 'Mage', description: 'Ranged spell damage' },
    { label: 'Monk', value: 'Monk', description: 'Tank, healer, or damage dealer' },
    { label: 'Paladin', value: 'Paladin', description: 'Holy tank, healer, or damage dealer' },
    { label: 'Priest', value: 'Priest', description: 'Healer or caster damage' },
    { label: 'Rogue', value: 'Rogue', description: 'Melee damage dealer' },
    { label: 'Shaman', value: 'Shaman', description: 'Healer or damage dealer' },
    { label: 'Warlock', value: 'Warlock', description: 'Ranged damage dealer' },
    { label: 'Warrior', value: 'Warrior', description: 'Tank or melee damage' },
];

const RAID_ROLE_OPTIONS = [
    { label: 'Tank', value: 'Tank', description: 'Frontline defensive role' },
    { label: 'Healer', value: 'Healer', description: 'Raid healing role' },
    { label: 'DPS', value: 'DPS', description: 'Damage dealing role' },
];

function hasManagementPermission(member) {
    if (member.permissions.has('Administrator')) {
        return true;
    }

    const adminRole = process.env.ROLE_ADMIN;
    const managementRole = process.env.ROLE_MANAGEMENT;
    const raidLeaderRole = process.env.ROLE_RAID_LEADER;

    return Boolean(
        (adminRole && member.roles.cache.has(adminRole)) ||
        (managementRole && member.roles.cache.has(managementRole)) ||
        (raidLeaderRole && member.roles.cache.has(raidLeaderRole))
    );
}

async function resetManagerCharacterSelectionMessage(message, eventId, boosterId) {
    if (!message || !message.embeds || message.embeds.length === 0) {
        return;
    }

    const event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventId]);
    if (!event) {
        return;
    }

    const availableChars = await require('./characterSystem').getAvailableCharacters(
        boosterId,
        event.min_item_level || 0,
        event.min_rio_score || 0,
        {
            eventType: event.event_type,
            eventDifficulty: event.event_difficulty,
        }
    );

    const selectionMenu = new StringSelectMenuBuilder()
        .setCustomId(`manager_select_char_${eventId}_${boosterId}`)
        .setPlaceholder('Management selects the roster character here')
        .setDisabled(availableChars.length === 0)
        .addOptions(
            (availableChars.length > 0 ? availableChars : [{
                character_name: 'No eligible characters',
                character_realm: 'Unavailable',
                item_level: 0,
                rio_score: 0,
                class_name: 'N/A'
            }]).slice(0, 25).map(char => ({
                label: `${char.character_name}-${char.character_realm}`.substring(0, 100),
                description: `iLvl: ${char.item_level} | RIO: ${char.rio_score} | ${char.class_name}`.substring(0, 100),
                value: `${char.character_name}|${char.character_realm}`,
                default: false
            }))
        );

    await message.edit({
        components: [new ActionRowBuilder().addComponents(selectionMenu)]
    });
}

async function handleSelect(interaction) {
    const { customId } = interaction;

    if (customId === 'ticket_type_select') {
        const selectedType = interaction.values[0];

        if (selectedType === 'raid') {
            try {
                const raids = await calendarSystem.getAvailableClientRaids();

                if (raids.length === 0) {
                    await interaction.update({
                        content: 'There are no scheduled raids available right now. Please contact staff if you need help.',
                        components: []
                    });
                    return;
                }

                const raidSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId('ticket_raid_select')
                    .setPlaceholder('Choose one of the available raids')
                    .addOptions(
                        raids.map(raid => {
                            const scheduledAt = new Date(raid.scheduled_date);
                            const timeText = Number.isNaN(scheduledAt.getTime())
                                ? 'Scheduled soon'
                                : scheduledAt.toLocaleString();
                            const clientText = raid.client_limit > 0
                                ? `Clients ${raid.assigned_clients}/${raid.client_limit}`
                                : `Clients ${raid.assigned_clients}/Unlimited`;

                            return {
                                label: raid.name.substring(0, 100),
                                description: `${timeText} | ${clientText}`.substring(0, 100),
                                value: raid.event_id,
                            };
                        })
                    );

                await interaction.update({
                    content: 'Choose the raid you want from the scheduled raids below:',
                    components: [new ActionRowBuilder().addComponents(raidSelectMenu)]
                });
            } catch (error) {
                logger.logError(error, { context: 'TICKET_TYPE_SELECT_RAID', userId: interaction.user.id });
                await interaction.update({
                    content: '❌ An error occurred while loading scheduled raids.',
                    components: []
                });
            }
            return;
        }

        if (selectedType === 'mythic_plus') {
            const createMythicPlusAmountModal = require('../modals/mythicPlusAmountModal');
            await interaction.showModal(createMythicPlusAmountModal());
            return;
        }

        if (selectedType === 'support') {
            const createSupportTicketModal = require('../modals/supportTicketModal');
            await interaction.showModal(createSupportTicketModal());
            return;
        }

        if (selectedType === 'raid_request') {
            const createDedicatedRaidTicketModal = require('../modals/dedicatedRaidTicketModal');
            await interaction.showModal(createDedicatedRaidTicketModal());
            return;
        }
    }

    if (customId.startsWith('ticket_mythic_dungeon_select:')) {
        const [, sessionId, runNumberValue] = customId.split(':');
        const runNumber = parseInt(runNumberValue, 10);
        const mplusRequestStore = require('../utils/mplusRequestStore');
        const session = mplusRequestStore.getSession(sessionId);
        const dungeonId = interaction.values[0];
        const dungeon = MIDNIGHT_DUNGEONS.find(entry => entry.id === dungeonId);

        if (!session || session.userId !== interaction.user.id) {
            await interaction.reply({ content: '❌ This Mythic+ request session has expired. Please start again.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (!dungeon || Number.isNaN(runNumber) || session.runs.length + 1 !== runNumber) {
            await interaction.reply({ content: '❌ Invalid dungeon selection.', flags: MessageFlags.Ephemeral });
            return;
        }

        const createMythicPlusTicketModal = require('../modals/mythicPlusTicketModal');
        await interaction.showModal(createMythicPlusTicketModal(sessionId, runNumber, dungeon.id, dungeon.label));
        return;
    }

    if (customId === 'admin_event_raid_select') {
        if (!hasAdminPermission(interaction.member)) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        const raidId = interaction.values[0];
        const raid = findRaidById(raidId);
        const difficultyMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_event_difficulty_select:${raidId}`)
            .setPlaceholder('Choose the raid difficulty')
            .addOptions(
                RAID_DIFFICULTIES.map(difficulty => ({
                    label: difficulty.label,
                    value: difficulty.id,
                }))
            );

        await interaction.update({
            content: `Selected raid: **${raid ? raid.label : raidId}**\nNow choose a difficulty:`,
            components: [new ActionRowBuilder().addComponents(difficultyMenu)]
        });
        return;
    }

    if (customId.startsWith('admin_event_difficulty_select:')) {
        if (!hasAdminPermission(interaction.member)) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        const raidId = customId.split(':')[1];
        const difficultyId = interaction.values[0];
        const raid = findRaidById(raidId);
        const difficulty = findDifficultyById(difficultyId);
        const createEventPanelModal = require('../modals/createEventPanelModal');

        await interaction.showModal(
            createEventPanelModal(
                raidId,
                difficultyId,
                `${raid ? raid.label : 'Raid'} - ${difficulty ? difficulty.label : 'Difficulty'}`
            )
        );
        return;
    }

    if (customId === 'ticket_raid_select') {
        await interaction.deferUpdate();

        const eventId = interaction.values[0];

        try {
            const raid = await Database.get(
                `SELECT event_id, name, scheduled_date, status, client_limit FROM events WHERE event_id = ?`,
                [eventId]
            );

            if (!raid || raid.status !== 'open') {
                await interaction.editReply({
                    content: '❌ That raid is no longer available. Please open the ticket menu again and choose another one.',
                    components: []
                });
                return;
            }

            const assignedClients = await calendarSystem.getAssignedClientCount(eventId);
            if (raid.client_limit > 0 && assignedClients >= raid.client_limit) {
                await interaction.editReply({
                    content: '❌ That raid is already full. Please create a Raid Request ticket instead.',
                    components: []
                });
                return;
            }
            const classSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`ticket_raid_class_select:${raid.event_id}`)
                .setPlaceholder('Choose the class you want to bring')
                .addOptions(RAID_CLASS_OPTIONS);

            await interaction.editReply({
                content: `Selected raid: **${raid.name}**\nNow choose your class:`,
                components: [new ActionRowBuilder().addComponents(classSelectMenu)]
            });
        } catch (error) {
            logger.logError(error, { context: 'TICKET_RAID_SELECT', userId: interaction.user.id, eventId });
            await interaction.editReply({
                content: '❌ An error occurred while creating the raid ticket.',
                components: []
            });
        }
        return;
    }

    if (customId.startsWith('ticket_raid_class_select:')) {
        await interaction.deferUpdate();

        const eventId = customId.split(':')[1];
        const requestedClass = interaction.values[0];

        try {
            const raid = await Database.get(
                `SELECT event_id, name, scheduled_date, status, client_limit FROM events WHERE event_id = ?`,
                [eventId]
            );

            if (!raid || raid.status !== 'open') {
                await interaction.editReply({
                    content: '❌ That raid is no longer available. Please start again.',
                    components: []
                });
                return;
            }

            const assignedClients = await calendarSystem.getAssignedClientCount(eventId);
            if (raid.client_limit > 0 && assignedClients >= raid.client_limit) {
                await interaction.editReply({
                    content: '❌ That raid is already full. Please create a Raid Request ticket instead.',
                    components: []
                });
                return;
            }

            const roleSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`ticket_raid_role_select:${raid.event_id}:${encodeURIComponent(requestedClass)}`)
                .setPlaceholder('Choose your role')
                .addOptions(RAID_ROLE_OPTIONS);

            await interaction.editReply({
                content: `Selected raid: **${raid.name}**\nSelected class: **${requestedClass}**\nNow choose your role:`,
                components: [new ActionRowBuilder().addComponents(roleSelectMenu)]
            });
        } catch (error) {
            logger.logError(error, { context: 'TICKET_RAID_CLASS_SELECT', userId: interaction.user.id, eventId, requestedClass });
            await interaction.editReply({
                content: '❌ An error occurred while processing your raid class selection.',
                components: []
            });
        }
        return;
    }

    if (customId.startsWith('ticket_raid_role_select:')) {
        const [, eventId, encodedClass] = customId.split(':');
        const requestedClass = decodeURIComponent(encodedClass || '');
        const requestedRole = interaction.values[0];

        try {
            const raid = await Database.get(
                `SELECT event_id, name, scheduled_date, status, client_limit FROM events WHERE event_id = ?`,
                [eventId]
            );

            if (!raid || raid.status !== 'open') {
                await interaction.editReply({
                    content: '❌ That raid is no longer available. Please start again.',
                    components: []
                });
                return;
            }

            const assignedClients = await calendarSystem.getAssignedClientCount(eventId);
            if (raid.client_limit > 0 && assignedClients >= raid.client_limit) {
                await interaction.editReply({
                    content: '❌ That raid is already full. Please create a Raid Request ticket instead.',
                    components: []
                });
                return;
            }

            const createClientCharacterDetailsModal = require('../modals/clientCharacterDetailsModal');
            await interaction.showModal(
                createClientCharacterDetailsModal(
                    `client_ticket_character_modal:raid:${raid.event_id}:${encodeURIComponent(requestedClass)}:${encodeURIComponent(requestedRole)}`,
                    `Raid Details - ${raid.name}`
                )
            );
        } catch (error) {
            logger.logError(error, { context: 'TICKET_RAID_ROLE_SELECT', userId: interaction.user.id, eventId, requestedClass, requestedRole });
            await interaction.editReply({
                content: '❌ An error occurred while creating the raid ticket.',
                components: []
            });
        }
        return;
    }

    if (customId.startsWith('manager_select_char_')) {
        if (!hasManagementPermission(interaction.member)) {
            await interaction.reply({ content: 'You do not have permission for this action.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        logger.logAction('ROSTER_SELECT_MENU_CLICKED', interaction.user.id, { customId, messageId: interaction.message.id });

        const parts = customId.replace('manager_select_char_', '').split('_');
        const eventId = parts[0];
        const boosterId = parts.slice(1).join('_');
        const [characterName, characterRealm] = interaction.values[0].split('|');

        try {
            const result = await calendarSystem.selectCharacterForEvent(eventId, boosterId, characterName, characterRealm, interaction.user.id);

            if (!result.success) {
                await interaction.editReply({ content: `❌ ${result.message}` });
                return;
            }

            const disabledMenu = StringSelectMenuBuilder.from(interaction.component)
                .setDisabled(true)
                .setPlaceholder(`Selected: ${characterName}-${characterRealm}`);
            const updatedComponents = [
                new ActionRowBuilder().addComponents(disabledMenu),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`deselect_char_${eventId}_${boosterId}_${characterName}_${characterRealm}`)
                        .setLabel('Deselect Character')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                )
            ];

            await interaction.message.edit({ components: updatedComponents });
            await interaction.editReply({ content: '✅ Character selected for event.' });
        } catch (error) {
            logger.logError(error, { context: 'MANAGER_SELECT_CHAR', userId: interaction.user.id, eventId, boosterId });
            await interaction.editReply({ content: '❌ An error occurred while selecting the character.' });
        }
        return;
    }

    // Event character selection
    if (customId.startsWith('event_char_select_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const eventId = customId.replace('event_char_select_', '');
        const selectedValue = interaction.values[0];
        const [characterName, characterRealm] = selectedValue.split('|');

        try {
            // Check if already applied
            const existing = await Database.get(
                `SELECT * FROM event_applications WHERE event_id = ? AND booster_id = ? AND status = 'pending'`,
                [eventId, interaction.user.id]
            );

            if (existing) {
                await interaction.editReply({ content: '❌ You have already applied for this event. Please wait for manager approval.' });
                return;
            }

            // Create application
            await Database.run(
                `INSERT INTO event_applications (event_id, booster_id, character_name, character_realm, status) VALUES (?, ?, ?, ?, ?)`,
                [eventId, interaction.user.id, characterName, characterRealm, 'pending']
            );

            logger.logEventApplication(eventId, interaction.user.id, characterName, characterRealm);
            await interaction.editReply({ content: `✅ Application submitted! Character: ${characterName}-${characterRealm}. Waiting for manager approval.` });
        } catch (error) {
            logger.logError(error, { context: 'EVENT_CHAR_SELECT', userId: interaction.user.id, eventId });
            await interaction.editReply({ content: '❌ An error occurred while submitting your application.' });
        }
        return;
    }
}

module.exports = {
    handleSelect,
    resetManagerCharacterSelectionMessage,
};
