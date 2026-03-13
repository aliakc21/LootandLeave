const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createCancelEventModal(eventId) {
    const modal = new ModalBuilder()
        .setCustomId(`cancel_event_modal_${eventId}`)
        .setTitle('Confirm Event Cancellation');

    const confirmInput = new TextInputBuilder()
        .setCustomId('cancel_confirmation')
        .setLabel('Type CANCEL to confirm')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('CANCEL')
        .setMinLength(6)
        .setMaxLength(6);

    modal.addComponents(
        new ActionRowBuilder().addComponents(confirmInput)
    );

    return modal;
}

module.exports = createCancelEventModal;
