const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const buttonHandlers = require('../systems/buttonHandlers');
const modalHandlers = require('../systems/modalHandlers');
const selectHandlers = require('../systems/selectHandlers');
const { scheduleEphemeralCleanup } = require('../utils/interactionCleanup');

function isUnknownDiscordMessageError(error) {
    return Boolean(error?.code === 10008 || error?.rawError?.code === 10008);
}

async function safeSendInteractionError(interaction, errorMessage) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    } catch (responseError) {
        if (isUnknownDiscordMessageError(responseError)) {
            logger.logDebug?.('Skipped interaction error response because original message is no longer available.', {
                customId: interaction.customId || null,
                commandName: interaction.commandName || null,
                userId: interaction.user?.id || null,
            });
            return;
        }
        throw responseError;
    }
}

function hasOnboardingAccess(member) {
    if (!member) {
        return false;
    }

    if (member.permissions.has('Administrator')) {
        return true;
    }

    const allowedRoles = [
        process.env.ROLE_CLIENT,
        process.env.ROLE_BOOSTER,
        process.env.ROLE_BOOSTER_APPLICANT,
        process.env.ROLE_ADMIN,
        process.env.ROLE_MANAGEMENT,
    ].filter(Boolean);

    return allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            try {
                if (interaction.commandName !== 'setup' && !hasOnboardingAccess(interaction.member)) {
                    await interaction.reply({
                        content: 'Please complete the onboarding choice first in `#start-here`.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const command = interaction.client.commands.get(interaction.commandName);

                if (!command) {
                    logger.logWarning(`Command not found: ${interaction.commandName}`);
                    return;
                }

                await command.execute(interaction);
            } catch (error) {
                logger.logError(error, { context: 'COMMAND_EXECUTION', commandName: interaction.commandName, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while executing the command!', flags: MessageFlags.Ephemeral };
                await safeSendInteractionError(interaction, errorMessage);
            } finally {
                scheduleEphemeralCleanup(interaction);
            }
        } else if (interaction.isButton()) {
            try {
                await buttonHandlers.handleButton(interaction);
            } catch (error) {
                logger.logError(error, { context: 'BUTTON_HANDLER', customId: interaction.customId, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while handling the button!', flags: MessageFlags.Ephemeral };
                await safeSendInteractionError(interaction, errorMessage);
            } finally {
                scheduleEphemeralCleanup(interaction);
            }
        } else if (interaction.isModalSubmit()) {
            try {
                await modalHandlers.handleModal(interaction);
            } catch (error) {
                logger.logError(error, { context: 'MODAL_HANDLER', customId: interaction.customId, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while handling the modal!', flags: MessageFlags.Ephemeral };
                await safeSendInteractionError(interaction, errorMessage);
            } finally {
                scheduleEphemeralCleanup(interaction);
            }
        } else if (interaction.isStringSelectMenu()) {
            try {
                await selectHandlers.handleSelect(interaction);
            } catch (error) {
                logger.logError(error, { context: 'SELECT_HANDLER', customId: interaction.customId, userId: interaction.user.id });
                
                const errorMessage = { content: 'An error occurred while handling the select menu!', flags: MessageFlags.Ephemeral };
                await safeSendInteractionError(interaction, errorMessage);
            } finally {
                scheduleEphemeralCleanup(interaction);
            }
        }
    },
};
