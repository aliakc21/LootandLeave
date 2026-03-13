const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createMythicPlusTicketModal(dungeonId, dungeonLabel) {
    const modal = new ModalBuilder()
        .setCustomId(`mythic_plus_ticket_modal:${dungeonId}`)
        .setTitle(`Mythic+ - ${dungeonLabel}`);

    const keyLevelInput = new TextInputBuilder()
        .setCustomId('key_level')
        .setLabel('Key Level')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 10')
        .setMaxLength(3);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount of Runs')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 1')
        .setMaxLength(3);

    modal.addComponents(
        new ActionRowBuilder().addComponents(keyLevelInput),
        new ActionRowBuilder().addComponents(amountInput)
    );

    return modal;
}

module.exports = createMythicPlusTicketModal;
