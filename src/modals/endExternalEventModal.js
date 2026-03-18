const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createEndExternalEventModal(eventId, eventName = 'External Raid') {
    const modal = new ModalBuilder()
        .setCustomId(`end_external_event_modal_${eventId}`)
        .setTitle('End External Raid - Confirm');

    const confirmInput = new TextInputBuilder()
        .setCustomId('confirm_text')
        .setLabel('Type END to confirm ending this external raid')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('END')
        .setMaxLength(10);

    const row = new ActionRowBuilder().addComponents(confirmInput);
    modal.addComponents(row);

    return modal;
}

module.exports = createEndExternalEventModal;

