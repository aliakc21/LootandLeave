const logger = require('../utils/logger');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        logger.logInfo(`Bot is ready! Logged in as ${client.user.tag}`);
        logger.logInfo(`Bot is in ${client.guilds.cache.size} guild(s)`);
    },
};
