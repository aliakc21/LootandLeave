const Database = require('../database/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('../utils/uuid');
const config = require('../utils/config');
const { resolveEventCutRates } = require('../utils/cutConfig');

// Calculate and process payout
async function processPayout(totalGold, boosterIds, createdBy, eventId = null, jobId = null) {
    try {
        let event = null;
        if (eventId) {
            event = await Database.get(`SELECT * FROM events WHERE event_id = ?`, [eventId]);
        }

        const defaultTreasuryRate = await config.getConfig('commission_treasury', 0.30);
        const defaultAdvertiserRate = await config.getConfig('commission_advertiser', 0.10);
        const defaultBoosterRate = await config.getConfig('commission_booster', 0.60);
        const resolvedCuts = resolveEventCutRates({
            ...event,
            cut_treasury_rate: event?.cut_treasury_rate ?? null,
            cut_advertiser_rate: event?.cut_advertiser_rate ?? null,
            cut_booster_rate: event?.cut_booster_rate ?? null,
        });
        const treasuryRate = event ? resolvedCuts.treasuryRate : defaultTreasuryRate;
        const advertiserRate = event ? resolvedCuts.advertiserRate : defaultAdvertiserRate;
        const boosterRate = event ? resolvedCuts.boosterRate : defaultBoosterRate;

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
                 ON CONFLICT(booster_id) DO UPDATE
                 SET balance = booster_balances.balance + EXCLUDED.balance,
                     last_updated = CURRENT_TIMESTAMP`,
                [boosterId, boosterIndividualAmount]
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
            cuts: { treasuryRate, advertiserRate, boosterRate },
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
