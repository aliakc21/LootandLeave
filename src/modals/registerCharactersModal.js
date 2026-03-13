const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createRegisterCharactersModal() {
    const modal = new ModalBuilder()
        .setCustomId('register_characters_modal')
        .setTitle('Register Characters');

    const singleCharacterInput = new TextInputBuilder()
        .setCustomId('single_character')
        .setLabel('Single Character (Optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Character-Realm')
        .setMaxLength(100);

    const multipleCharactersInput = new TextInputBuilder()
        .setCustomId('multiple_characters')
        .setLabel('Multiple Characters (Optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('CharacterOne-Realm\nCharacterTwo-Realm\nOr comma separated')
        .setMaxLength(1800);

    modal.addComponents(
        new ActionRowBuilder().addComponents(singleCharacterInput),
        new ActionRowBuilder().addComponents(multipleCharactersInput)
    );

    return modal;
}

module.exports = createRegisterCharactersModal;
