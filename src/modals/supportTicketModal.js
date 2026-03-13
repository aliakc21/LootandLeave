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
        .setMaxLength(700);

    const characterNameInput = new TextInputBuilder()
        .setCustomId('client_character_name')
        .setLabel('Character Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Gawain')
        .setMaxLength(50);

    const realmInput = new TextInputBuilder()
        .setCustomId('client_character_realm')
        .setLabel('Server / Realm')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Silvermoon')
        .setMaxLength(50);

    modal.addComponents(
        new ActionRowBuilder().addComponents(topicInput),
        new ActionRowBuilder().addComponents(characterNameInput),
        new ActionRowBuilder().addComponents(realmInput)
    );

    return modal;
}

module.exports = createSupportTicketModal;
