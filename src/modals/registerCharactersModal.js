const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createRegisterCharactersModal(sessionId) {
    const modal = new ModalBuilder()
        .setCustomId(`register_characters_modal:${sessionId}`)
        .setTitle('Register Character');

    const characterNameInput = new TextInputBuilder()
        .setCustomId('character_name')
        .setLabel('Character Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Gawain')
        .setMaxLength(50);

    const characterRealmInput = new TextInputBuilder()
        .setCustomId('character_realm')
        .setLabel('Realm')
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

module.exports = createRegisterCharactersModal;
