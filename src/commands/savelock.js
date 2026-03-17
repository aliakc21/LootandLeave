const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('savelock')
        .setDescription('Mark one of your characters as saved/locked for this reset (external raid)')
        .addStringOption(option =>
            option.setName('character_name')
                .setDescription('Character name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('realm')
                .setDescription('Realm name (e.g., Silvermoon)')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const characterName = interaction.options.getString('character_name').trim();
            const realm = interaction.options.getString('realm').trim();

            const characters = await characterSystem.getBoosterCharacters(interaction.user.id);
            const match = characters.find(c =>
                c.character_name.toLowerCase() === characterName.toLowerCase() &&
                c.character_realm.toLowerCase() === realm.toLowerCase()
            );

            if (!match) {
                await interaction.editReply({
                    content: '❌ This character is not registered. Use `/registerchar` or the Register Characters panel first.'
                });
                return;
            }

            const result = await characterSystem.lockCharacter(
                interaction.user.id,
                match.character_name,
                match.character_realm,
                null,
                {
                    eventType: 'raid',
                    lockScope: 'external',
                    lockReason: 'another raid (external)',
                }
            );

            if (!result.success) {
                await interaction.editReply({ content: `❌ ${result.message}` });
                return;
            }

            await interaction.editReply({
                content: `✅ ${match.character_name}-${match.character_realm} marked as saved/locked for this reset. This will block VIP/LootShare raids but not Saved runs.`
            });
        } catch (error) {
            logger.logError(error, { context: 'SAVELOCK_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};

