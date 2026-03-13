const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createDedicatedRaidTicketModal() {
    const modal = new ModalBuilder()
        .setCustomId('raid_request_ticket_modal')
        .setTitle('Raid Request');

    const raidInput = new TextInputBuilder()
        .setCustomId('raid_request')
        .setLabel('Raid Name / Details')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Example: Heroic Voidrift full clear for 2 clients')
        .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(raidInput));

    return modal;
}

module.exports = createDedicatedRaidTicketModal;
