const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createMythicPlusAmountModal() {
    const modal = new ModalBuilder()
        .setCustomId('mythic_plus_amount_modal')
        .setTitle('Mythic+ Runs');

    const runCountInput = new TextInputBuilder()
        .setCustomId('run_count')
        .setLabel('How many Mythic+ runs do you want?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 2')
        .setMaxLength(2);

    modal.addComponents(
        new ActionRowBuilder().addComponents(runCountInput)
    );

    return modal;
}

module.exports = createMythicPlusAmountModal;
