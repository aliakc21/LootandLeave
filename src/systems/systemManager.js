const ticketSystem = require('./ticketSystem');
const categoryIsolation = require('./categoryIsolation');
const calendarSystem = require('./calendarSystem');
const payoutSystem = require('./payoutSystem');
const applicationSystem = require('./applicationSystem');
const excelExport = require('./excelExport');
const channelAccessMonitor = require('./channelAccessMonitor');
const characterSystem = require('./characterSystem');
const logChannelSystem = require('./logChannelSystem');
const cron = require('node-cron');
const logger = require('../utils/logger');

function initializeSystems(client) {
    // Initialize all systems
    ticketSystem.initialize(client);
    categoryIsolation.initialize(client);
    calendarSystem.initialize(client);
    applicationSystem.initialize(client);
    excelExport.initialize(client);
    channelAccessMonitor.initialize(client);
    logChannelSystem.initialize(client);

    // Schedule weekly cleanup of expired character locks (every Wednesday at 9 AM)
    cron.schedule('0 9 * * 3', () => {
        characterSystem.cleanupExpiredLocks();
        logger.logInfo('Weekly character lock cleanup executed');
    });

    // Schedule auto-end events (every 30 minutes)
    cron.schedule('*/30 * * * *', async () => {
        logger.logInfo('Running scheduled event auto-end check');
        await calendarSystem.autoEndEvents();
    });

    // Refresh stale character data from Raider.IO every hour in small batches.
    cron.schedule('15 * * * *', async () => {
        const result = await characterSystem.refreshStaleCharactersBatch();
        if (result.success && result.checked > 0) {
            logger.logInfo(`Scheduled character refresh executed: ${result.refreshedCount}/${result.checked} refreshed, ${result.failedCount} failed.`);
        }
    });

    logger.logInfo('All systems initialized');
}

module.exports = { initializeSystems };
