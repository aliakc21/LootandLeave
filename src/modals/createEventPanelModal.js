const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createEventPanelModal(raidId, difficultyId, boostTypeId, title) {
    const modal = new ModalBuilder()
        .setCustomId(`create_event_panel_modal:${raidId}:${difficultyId}:${boostTypeId}`)
        .setTitle(title);

    const dateInput = new TextInputBuilder()
        .setCustomId('event_date')
        .setLabel('Date (DD-MM-YYYY)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 18-03-2026')
        .setMaxLength(10);

    const timeInput = new TextInputBuilder()
        .setCustomId('event_time')
        .setLabel('Time (HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 20:00')
        .setMaxLength(5);

    const minItemLevelInput = new TextInputBuilder()
        .setCustomId('min_item_level')
        .setLabel('Minimum Item Level')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('0');

    const minRioScoreInput = new TextInputBuilder()
        .setCustomId('min_rio_score')
        .setLabel('Minimum Raider.IO Score')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('0');

    const capacityInput = new TextInputBuilder()
        .setCustomId('capacity')
        .setLabel('Capacity (0 = unlimited)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('0');

    modal.addComponents(
        new ActionRowBuilder().addComponents(dateInput),
        new ActionRowBuilder().addComponents(timeInput),
        new ActionRowBuilder().addComponents(minItemLevelInput),
        new ActionRowBuilder().addComponents(minRioScoreInput),
        new ActionRowBuilder().addComponents(capacityInput)
    );

    return modal;
}

module.exports = createEventPanelModal;
