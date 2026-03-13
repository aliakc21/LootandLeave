const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createClientCharacterDetailsModal(customId, title = 'Your Character Details') {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    const characterNameInput = new TextInputBuilder()
        .setCustomId('client_character_name')
        .setLabel('Character Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Gawain')
        .setMaxLength(50);

    const characterRealmInput = new TextInputBuilder()
        .setCustomId('client_character_realm')
        .setLabel('Server / Realm')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Silvermoon')
        .setMaxLength(50);

    modal.addComponents(
        new ActionRowBuilder().addComponents(characterNameInput),
        new ActionRowBuilder().addComponents(characterRealmInput)
    );

    return modal;
}

module.exports = createClientCharacterDetailsModal;
