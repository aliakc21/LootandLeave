const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createMythicPlusTicketModal(sessionId, runNumber, dungeonId, dungeonLabel) {
    const modal = new ModalBuilder()
        .setCustomId(`mythic_plus_run_modal:${sessionId}:${runNumber}:${dungeonId}`)
        .setTitle(`Run ${runNumber}: ${dungeonLabel}`);

    const keyLevelInput = new TextInputBuilder()
        .setCustomId('key_level')
        .setLabel('Key Level')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 10')
        .setMaxLength(3);

    modal.addComponents(
        new ActionRowBuilder().addComponents(keyLevelInput)
    );

    return modal;
}

module.exports = createMythicPlusTicketModal;
