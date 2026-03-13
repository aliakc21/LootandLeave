const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mychars')
        .setDescription('View your registered characters'),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const initialCharacters = await characterSystem.getBoosterCharacters(interaction.user.id);

            if (initialCharacters.length === 0) {
                await interaction.editReply({ content: '❌ You have no registered characters. Use `/registerchar` to register one.' });
                return;
            }

            const refreshResult = await characterSystem.ensureBoosterCharactersFresh(interaction.user.id);
            const characters = await characterSystem.getBoosterCharacters(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('📋 Your Registered Characters')
                .setColor(0x5865F2)
                .setTimestamp();

            const charList = characters.map((char, idx) => 
                `${idx + 1}. **${char.character_name}-${char.character_realm}**\n   Class: ${char.class_name || 'Unknown'} | Spec: ${char.spec_name || 'N/A'} | iLvl: ${char.item_level || 0} | RIO: ${char.rio_score || 0}`
            ).join('\n\n');

            embed.setDescription(charList);
            if (refreshResult.success && refreshResult.refreshedCount > 0) {
                embed.setFooter({ text: `Updated ${refreshResult.refreshedCount} stale character(s) from Raider.IO before showing this list.` });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.logError(error, { context: 'MY_CHARS_COMMAND', userId: interaction.user.id });
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    },
};
