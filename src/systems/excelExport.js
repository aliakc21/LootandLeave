const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const Database = require('../database/database');
const logger = require('../utils/logger');

let client = null;

function initialize(botClient) {
    client = botClient;
    logger.logInfo('Excel Export System initialized');
}

// Export all data to Excel
async function exportToExcel() {
    try {
        const exportsDir = path.join(__dirname, '../../exports');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const fileName = `export-${timestamp}.xlsx`;
        const filePath = path.join(exportsDir, fileName);

        const workbook = XLSX.utils.book_new();

        // Export all tables
        const tables = [
            'users',
            'tickets',
            'jobs',
            'events',
            'event_applications',
            'payouts',
            'payout_details',
            'booster_balances',
            'booster_applications',
            'characters',
            'character_weekly_locks',
            'audit_logs',
            'bot_config'
        ];

        for (const table of tables) {
            try {
                const data = await Database.all(`SELECT * FROM ${table}`);
                if (data.length > 0) {
                    const worksheet = XLSX.utils.json_to_sheet(data);
                    XLSX.utils.book_append_sheet(workbook, worksheet, table);
                }
            } catch (error) {
                logger.logWarning(`Failed to export table ${table}:`, error);
            }
        }

        XLSX.writeFile(workbook, filePath);
        logger.logInfo(`Data exported to ${fileName}`);

        return { success: true, filePath, fileName };
    } catch (error) {
        logger.logError(error, { context: 'EXPORT_TO_EXCEL' });
        throw error;
    }
}

module.exports = {
    initialize,
    exportToExcel,
};
