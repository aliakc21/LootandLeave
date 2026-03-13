const fs = require('fs');
const path = require('path');
const Database = require('../database/database');

class Logger {
    constructor() {
        this.logsDir = path.join(__dirname, '../../data/logs');
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    getLogFileName() {
        const today = new Date().toISOString().split('T')[0];
        return path.join(this.logsDir, `bot-${today}.log`);
    }

    formatMessage(level, message, details = {}) {
        const timestamp = new Date().toISOString();
        const detailsStr = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : '';
        return `[${timestamp}] [${level}] ${message}${detailsStr}\n`;
    }

    async writeToFile(level, message, details = {}) {
        try {
            const logFile = this.getLogFileName();
            const logMessage = this.formatMessage(level, message, details);
            fs.appendFileSync(logFile, logMessage, 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    async writeToDatabase(level, action, userId, details = {}) {
        try {
            await Database.run(
                `INSERT INTO audit_logs (level, action, user_id, details) VALUES (?, ?, ?, ?)`,
                [level, action, userId || null, JSON.stringify(details)]
            );
        } catch (error) {
            console.error('Failed to write to audit log database:', error);
        }
    }

    logInfo(message, details = {}) {
        console.log(`[INFO] ${message}`, details);
        this.writeToFile('INFO', message, details);
    }

    logWarning(message, details = {}) {
        console.warn(`[WARN] ${message}`, details);
        this.writeToFile('WARN', message, details);
    }

    logError(error, details = {}) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error(`[ERROR] ${errorMessage}`, { ...details, stack: errorStack });
        this.writeToFile('ERROR', errorMessage, { ...details, stack: errorStack });
    }

    logAction(action, userId, details = {}) {
        this.logInfo(`[ACTION] ${action}`, { userId, ...details });
        this.writeToDatabase('ACTION', action, userId, details);
    }

    logEventCreated(eventId, eventName, createdBy, scheduledDate) {
        this.logAction('EVENT_CREATED', createdBy, { eventId, eventName, scheduledDate });
    }

    logEventApplication(eventId, boosterId, characterName, characterRealm) {
        this.logAction('EVENT_APPLICATION', boosterId, { eventId, characterName, characterRealm });
    }

    logEventApproval(eventId, boosterId, approvedBy) {
        this.logAction('EVENT_APPROVAL', approvedBy, { eventId, boosterId });
    }

    logEventRejection(eventId, boosterId, rejectedBy) {
        this.logAction('EVENT_REJECTION', rejectedBy || 'SYSTEM', { eventId, boosterId });
    }

    logTicketCreated(ticketId, clientId) {
        this.logAction('TICKET_CREATED', clientId, { ticketId });
    }

    logTicketClosed(ticketId, closedBy, clientId) {
        this.logAction('TICKET_CLOSED', closedBy, { ticketId, clientId });
    }

    logPayout(payoutId, totalGold, boosterIds, createdBy, eventId, jobId) {
        this.logAction('PAYOUT_CREATED', createdBy, { payoutId, totalGold, boosterIds, eventId, jobId });
    }
}

module.exports = new Logger();
