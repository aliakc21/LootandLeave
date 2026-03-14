const logger = require('./logger');

const DEFAULT_EPHEMERAL_TTL_MS = 5 * 60 * 1000;
const EXPIRED_EPHEMERAL_CONTENT = 'This message expired.';

function scheduleEphemeralCleanup(interaction, delayMs = DEFAULT_EPHEMERAL_TTL_MS) {
    if (!interaction?.ephemeral) {
        return;
    }

    setTimeout(async () => {
        try {
            await interaction.editReply({
                content: EXPIRED_EPHEMERAL_CONTENT,
                embeds: [],
                components: [],
                attachments: [],
            });
        } catch (error) {
            // Ignore already-dismissed or otherwise unavailable ephemeral responses.
            logger.logDebug?.('Skipping ephemeral cleanup because the response is already gone.', {
                customId: interaction.customId || null,
                commandName: interaction.commandName || null,
                userId: interaction.user?.id || null,
            });
        }
    }, delayMs);
}

module.exports = {
    DEFAULT_EPHEMERAL_TTL_MS,
    EXPIRED_EPHEMERAL_CONTENT,
    scheduleEphemeralCleanup,
};
