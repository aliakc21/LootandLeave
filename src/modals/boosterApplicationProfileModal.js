const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function createBoosterApplicationProfileModal() {
    const modal = new ModalBuilder()
        .setCustomId('booster_application_profile_modal')
        .setTitle('Booster Application');

    const battleTagInput = new TextInputBuilder()
        .setCustomId('battletag')
        .setLabel('BattleTag')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Name#1234')
        .setMaxLength(50);

    const lastSeasonRioInput = new TextInputBuilder()
        .setCustomId('last_season_rio')
        .setLabel('Last Season Raider.IO Score')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 3200')
        .setMaxLength(10);

    const previousCommunitiesInput = new TextInputBuilder()
        .setCustomId('previous_communities')
        .setLabel('Previous Boosting Communities')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('List previous communities if any')
        .setMaxLength(500);

    const yearsPlayingInput = new TextInputBuilder()
        .setCustomId('years_playing')
        .setLabel('Years Playing WoW')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 8')
        .setMaxLength(3);

    const yearsBoostingInput = new TextInputBuilder()
        .setCustomId('years_boosting')
        .setLabel('Years Providing Boosting Services')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 3')
        .setMaxLength(3);

    modal.addComponents(
        new ActionRowBuilder().addComponents(battleTagInput),
        new ActionRowBuilder().addComponents(lastSeasonRioInput),
        new ActionRowBuilder().addComponents(previousCommunitiesInput),
        new ActionRowBuilder().addComponents(yearsPlayingInput),
        new ActionRowBuilder().addComponents(yearsBoostingInput)
    );

    return modal;
}

module.exports = createBoosterApplicationProfileModal;
