const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const characterSystem = require('../systems/characterSystem');
const Database = require('../database/database');
const logger = require('../utils/logger');
const { findRaidBoostTypeById } = require('../utils/contentCatalog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listcharacters')
        .setDescription('List your available characters for event application'),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const event = await Database.get(
                `SELECT * FROM events WHERE channel_id = ? AND status = 'open'`,
                [interaction.channel.id]
            );

            if (!event) {
                await interaction.editReply({ content: '❌ This command can only be used in an event channel.' });
                return;
            }

            const registeredChars = await characterSystem.getBoosterCharacters(interaction.user.id);
            if (registeredChars.length === 0) {
                await interaction.editReply({ content: '❌ You have no registered characters. Please register characters using `/registerchar` first.' });
                return;
            }

            await characterSystem.ensureBoosterCharactersFresh(interaction.user.id);

            const minItemLevel = event.min_item_level || 0;
            const minRioScore = event.min_rio_score || 0;
            const availableChars = await characterSystem.getAvailableCharacters(interaction.user.id, minItemLevel, minRioScore, {
                eventType: event.event_type,
                eventDifficulty: event.event_difficulty,
                raidBoostType: event.raid_boost_type,
                eventScheduledDate: event.scheduled_date,
            });

            if (availableChars.length === 0) {
                await interaction.editReply({
                    content: `❌ None of your registered characters are eligible for **${event.name}** right now.\nRequirements: iLvl ${minItemLevel}+ and RIO ${minRioScore}+.\nRaid locks only block raids scheduled before the next weekly reset. Mythic+ has no character lock.`
                });
                return;
            }

            // Check if booster already has a character selected for this event
            const selectedApp = await Database.get(
                `SELECT * FROM event_applications WHERE event_id = ? AND booster_id = ? AND status = 'approved'`,
                [event.event_id, interaction.user.id]
            );

            const embed = new EmbedBuilder()
                .setTitle('📋 Your Available Characters')
                .setDescription(`Event: **${event.name}**\nBoost Type: **${findRaidBoostTypeById(event.raid_boost_type)?.label || 'VIP'}**\nRequirements: **iLvl ${minItemLevel}+** | **RIO ${minRioScore}+**\n\nManagement will select the final roster character from the buttons below.${event.raid_boost_type === 'saved' ? '\nSaved raids also allow already-locked raid characters to be listed.' : ''}`)
                .setColor(0x5865F2)
                .setTimestamp();

            const components = [];
            const selectionMenu = new StringSelectMenuBuilder()
                .setCustomId(`manager_select_char_${event.event_id}_${interaction.user.id}`)
                .setPlaceholder(selectedApp
                    ? `Selected: ${selectedApp.character_name}-${selectedApp.character_realm}`
                    : 'Management selects the roster character here')
                .setDisabled(Boolean(selectedApp))
                .addOptions(
                    availableChars.slice(0, 25).map(char => ({
                        label: `${char.character_name}-${char.character_realm}`.substring(0, 100),
                        description: `iLvl: ${char.item_level} | RIO: ${char.rio_score} | ${char.class_name}`.substring(0, 100),
                        value: `${char.character_name}|${char.character_realm}`,
                    }))
                );

            components.push(new ActionRowBuilder().addComponents(selectionMenu));

            if (selectedApp) {
                const deselectButton = new ButtonBuilder()
                    .setCustomId(`deselect_char_${event.event_id}_${interaction.user.id}_${selectedApp.character_name}_${selectedApp.character_realm}`)
                    .setLabel('Deselect Character')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌');

                const deselectRow = new ActionRowBuilder().addComponents(deselectButton);
                components.push(deselectRow);
            } else {
                const revertButton = new ButtonBuilder()
                    .setCustomId(`revert_listing_${event.event_id}_${interaction.user.id}`)
                    .setLabel('Revert Listing')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('↩️');

                components.push(new ActionRowBuilder().addComponents(revertButton));
            }

            // Send to channel (not ephemeral) so managers can see and select
            await interaction.channel.send({ 
                embeds: [embed],
                content: `<@${interaction.user.id}> listed their available characters:`,
                components: components.length > 0 ? components : undefined
            });
            await interaction.editReply({ content: '✅ Listed your available characters in this event channel.' });
        } catch (error) {
            logger.logError(error, { context: 'LIST_CHARACTERS_COMMAND', userId: interaction.user.id });
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        }
    },
};
