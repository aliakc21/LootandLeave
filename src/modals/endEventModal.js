const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createEndEventModal(eventId) {
    const modal = new ModalBuilder()
        .setCustomId(`end_event_modal_${eventId}`)
        .setTitle('End Event - Enter Total Gold');

    const totalGoldInput = new TextInputBuilder()
        .setCustomId('total_gold')
        .setLabel('Total Gold Earned')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 60000')
        .setMinLength(1)
        .setMaxLength(20);

    const firstActionRow = new ActionRowBuilder().addComponents(totalGoldInput);

    modal.addComponents(firstActionRow);

    return modal;
}

module.exports = createEndEventModal;
