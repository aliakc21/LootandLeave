const logger = require('../utils/logger');

let client = null;

function initialize(botClient) {
    client = botClient;
    
    // Monitor channel access attempts
    client.on('channelCreate', (channel) => {
        logger.logAction('CHANNEL_CREATED', 'SYSTEM', { channelId: channel.id, channelName: channel.name, channelType: channel.type });
    });

    client.on('channelDelete', (channel) => {
        logger.logAction('CHANNEL_DELETED', 'SYSTEM', { channelId: channel.id, channelName: channel.name });
    });

    logger.logInfo('Channel Access Monitor initialized');
}

module.exports = {
    initialize,
};
