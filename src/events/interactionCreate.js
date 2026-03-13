const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const buttonHandlers = require('../systems/buttonHandlers');
const modalHandlers = require('../systems/modalHandlers');
const selectHandlers = require('../systems/selectHandlers');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                logger.logWarning(`Command not found: ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                logger.logError(error, { context: 'COMMAND_EXECUTION', commandName: interaction.commandName, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while executing the command!', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.isButton()) {
            try {
                await buttonHandlers.handleButton(interaction);
            } catch (error) {
                logger.logError(error, { context: 'BUTTON_HANDLER', customId: interaction.customId, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while handling the button!', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.isModalSubmit()) {
            try {
                await modalHandlers.handleModal(interaction);
            } catch (error) {
                logger.logError(error, { context: 'MODAL_HANDLER', customId: interaction.customId, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while handling the modal!', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.isStringSelectMenu()) {
            try {
                await selectHandlers.handleSelect(interaction);
            } catch (error) {
                logger.logError(error, { context: 'SELECT_HANDLER', customId: interaction.customId, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while handling the select menu!', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
    },
};
