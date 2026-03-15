const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createManualEventClientModal(eventId, eventName = 'Event') {
    const modal = new ModalBuilder()
        .setCustomId(`manual_event_client_modal_${eventId}`)
        .setTitle(`Add Manual Client - ${eventName}`.slice(0, 45));

    const clientIdInput = new TextInputBuilder()
        .setCustomId('client_id')
        .setLabel('Client Mention or Discord ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 123456789012345678 or <@123...>')
        .setMaxLength(64);

    const characterNameInput = new TextInputBuilder()
        .setCustomId('client_character_name')
        .setLabel('Character Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Gawain')
        .setMaxLength(50);

    const characterRealmInput = new TextInputBuilder()
        .setCustomId('client_character_realm')
        .setLabel('Server / Realm')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Silvermoon')
        .setMaxLength(50);

    const settledGoldInput = new TextInputBuilder()
        .setCustomId('settled_gold')
        .setLabel('Settled Gold')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 600000')
        .setMaxLength(20);

    modal.addComponents(
        new ActionRowBuilder().addComponents(clientIdInput),
        new ActionRowBuilder().addComponents(characterNameInput),
        new ActionRowBuilder().addComponents(characterRealmInput),
        new ActionRowBuilder().addComponents(settledGoldInput)
    );

    return modal;
}

module.exports = createManualEventClientModal;
