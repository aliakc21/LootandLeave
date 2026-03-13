const Database = require('../database/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('../utils/uuid');
const config = require('../utils/config');

// Calculate and process payout
async function processPayout(totalGold, boosterIds, createdBy, eventId = null, jobId = null) {
    try {
        // Get commission rates from config
        const treasuryRate = await config.getConfig('commission_treasury', 0.30);
        const advertiserRate = await config.getConfig('commission_advertiser', 0.10);
        const boosterRate = await config.getConfig('commission_booster', 0.60);

        // Calculate amounts
        const treasuryAmount = Math.floor(totalGold * treasuryRate);
        const advertiserAmount = Math.floor(totalGold * advertiserRate);
        const boosterTotalAmount = totalGold - treasuryAmount - advertiserAmount;
        const boosterIndividualAmount = Math.floor(boosterTotalAmount / boosterIds.length);

        const payoutId = `payout-${uuidv4().substring(0, 8)}`;

        // Save payout to database
        await Database.run(
            `INSERT INTO payouts (payout_id, event_id, job_id, total_gold, treasury_amount, advertiser_amount, booster_amount, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [payoutId, eventId, jobId, totalGold, treasuryAmount, advertiserAmount, boosterTotalAmount, createdBy]
        );

        // Save individual booster payouts
        for (const boosterId of boosterIds) {
            await Database.run(
                `INSERT INTO payout_details (payout_id, booster_id, amount) VALUES (?, ?, ?)`,
                [payoutId, boosterId, boosterIndividualAmount]
            );

            // Update booster balance
            await Database.run(
                `INSERT INTO booster_balances (booster_id, balance) VALUES (?, ?)
                 ON CONFLICT(booster_id) DO UPDATE SET balance = balance + ?, last_updated = CURRENT_TIMESTAMP`,
                [boosterId, boosterIndividualAmount, boosterIndividualAmount]
            );
        }

        logger.logPayout(payoutId, totalGold, boosterIds, createdBy, eventId, jobId);

        return {
            success: true,
            payoutId,
            treasuryAmount,
            advertiserAmount,
            boosterTotalAmount,
            boosterIndividualAmount,
        };
    } catch (error) {
        logger.logError(error, { context: 'PROCESS_PAYOUT', totalGold, boosterIds });
        throw error;
    }
}

// Get booster balance
async function getBoosterBalance(boosterId) {
    try {
        const balance = await Database.get(
            `SELECT balance FROM booster_balances WHERE booster_id = ?`,
            [boosterId]
        );
        return balance ? balance.balance : 0;
    } catch (error) {
        logger.logError(error, { context: 'GET_BOOSTER_BALANCE', boosterId });
        return 0;
    }
}

module.exports = {
    processPayout,
    getBoosterBalance,
};
