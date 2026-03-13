const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createBoosterApplicationModal() {
    const modal = new ModalBuilder()
        .setCustomId('booster_application_modal')
        .setTitle('Booster Application');

    const characterNameInput = new TextInputBuilder()
        .setCustomId('character_name')
        .setLabel('Character Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Gâwâin')
        .setMaxLength(50);

    const characterRealmInput = new TextInputBuilder()
        .setCustomId('character_realm')
        .setLabel('Realm Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Silvermoon')
        .setMaxLength(50);

    const experienceInput = new TextInputBuilder()
        .setCustomId('experience')
        .setLabel('Experience (Optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Tell us about your boosting experience...')
        .setMaxLength(1000);

    const firstActionRow = new ActionRowBuilder().addComponents(characterNameInput);
    const secondActionRow = new ActionRowBuilder().addComponents(characterRealmInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(experienceInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

    return modal;
}

module.exports = createBoosterApplicationModal;
