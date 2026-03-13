const { PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

let client = null;

function initialize(botClient) {
    client = botClient;
    logger.logInfo('Category Isolation System initialized');
}

// Ensure category isolation is maintained
async function enforceIsolation(guild) {
    try {
        const clientCategoryId = process.env.CHANNEL_CLIENT_CATEGORY;
        const boosterCategoryId = process.env.CHANNEL_BOOSTER_CATEGORY;
        const boosterRoleId = process.env.ROLE_BOOSTER;
        const clientRoleId = process.env.ROLE_CLIENT;

        if (!clientCategoryId || !boosterCategoryId) {
            logger.logWarning('Category isolation: Missing category IDs in environment variables');
            return;
        }

        const clientCategory = await guild.channels.fetch(clientCategoryId);
        const boosterCategory = await guild.channels.fetch(boosterCategoryId);

        if (!clientCategory || !boosterCategory) {
            logger.logWarning('Category isolation: Categories not found');
            return;
        }

        // Ensure boosters cannot see client category
        if (boosterRoleId) {
            const boosterRole = guild.roles.cache.get(boosterRoleId);
            if (boosterRole) {
                await clientCategory.permissionOverwrites.edit(boosterRole.id, {
                    ViewChannel: false,
                });
            }
        }

        // Ensure clients cannot see booster category
        if (clientRoleId) {
            const clientRole = guild.roles.cache.get(clientRoleId);
            if (clientRole) {
                await boosterCategory.permissionOverwrites.edit(clientRole.id, {
                    ViewChannel: false,
                });
            }
        }

        logger.logInfo('Category isolation enforced');
    } catch (error) {
        logger.logError(error, { context: 'ENFORCE_ISOLATION' });
    }
}

module.exports = {
    initialize,
    enforceIsolation,
};
