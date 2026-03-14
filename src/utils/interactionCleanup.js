const logger = require('./logger');

const DEFAULT_EPHEMERAL_TTL_MS = 5 * 60 * 1000;

function scheduleEphemeralCleanup(interaction, delayMs = DEFAULT_EPHEMERAL_TTL_MS) {
    if (!interaction?.ephemeral) {
        return;
    }

    setTimeout(async () => {
        try {
            await interaction.deleteReply();
        } catch (error) {
            // Ignore already-dismissed or already-deleted ephemeral responses.
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
    scheduleEphemeralCleanup,
};
