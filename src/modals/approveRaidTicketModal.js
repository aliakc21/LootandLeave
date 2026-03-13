const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createApproveRaidTicketModal(ticket) {
    const modal = new ModalBuilder()
        .setCustomId(`approve_raid_ticket_modal_${ticket.ticket_id}`)
        .setTitle('Approve Raid Ticket');

    const eventIdInput = new TextInputBuilder()
        .setCustomId('event_id')
        .setLabel('Raid Event ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('event-xxxxxxxx')
        .setMaxLength(50);

    if (ticket.event_id) {
        eventIdInput.setValue(ticket.event_id);
    }

    const settledGoldInput = new TextInputBuilder()
        .setCustomId('settled_gold')
        .setLabel('Settled Gold')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 600000')
        .setMaxLength(20);

    modal.addComponents(
        new ActionRowBuilder().addComponents(eventIdInput),
        new ActionRowBuilder().addComponents(settledGoldInput)
    );

    return modal;
}

module.exports = createApproveRaidTicketModal;
