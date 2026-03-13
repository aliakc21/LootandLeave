const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createApproveMythicTicketModal(ticket) {
    const modal = new ModalBuilder()
        .setCustomId(`approve_mythic_ticket_modal_${ticket.ticket_id}`)
        .setTitle('Approve Mythic+ Ticket');

    const settledGoldInput = new TextInputBuilder()
        .setCustomId('settled_gold')
        .setLabel('Settled Gold')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 250000')
        .setMaxLength(20);

    modal.addComponents(
        new ActionRowBuilder().addComponents(settledGoldInput)
    );

    return modal;
}

module.exports = createApproveMythicTicketModal;
