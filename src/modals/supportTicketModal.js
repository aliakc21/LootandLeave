const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createSupportTicketModal() {
    const modal = new ModalBuilder()
        .setCustomId('support_ticket_modal')
        .setTitle('Support Request');

    const topicInput = new TextInputBuilder()
        .setCustomId('support_topic')
        .setLabel('What do you need help with?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Describe the issue or the representative help you need')
        .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(topicInput));

    return modal;
}

module.exports = createSupportTicketModal;
