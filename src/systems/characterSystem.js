const Database = require('../database/database');
const { fetchCharacterData } = require('../utils/wowApi');
const logger = require('../utils/logger');

// Register a character for a booster
async function registerCharacter(boosterId, characterName, characterRealm) {
    try {
        // Fetch character data from Raider.IO
        const characterData = await fetchCharacterData(characterName, characterRealm);

        if (!characterData || !characterData.characterName) {
            return { 
                success: false, 
                message: 'Character not found on Raider.IO. Please check:\n- Character name is spelled correctly\n- Realm name is correct (e.g., "Silvermoon" not "Silvermoon-EU")\n- Character exists on EU servers\n- Character has been synced to Raider.IO recently' 
            };
        }
        
        // Validate that we got actual data (not all zeros)
        if (characterData.itemLevel === 0 && characterData.rioScore === 0) {
            logger.logWarning('Character data returned with zero values', { characterName, characterRealm, characterData });
        }

        // Check if character already exists
        const existing = await Database.get(
            `SELECT * FROM characters WHERE booster_id = ? AND character_name = ? AND character_realm = ?`,
            [boosterId, characterName, characterRealm]
        );

        if (existing) {
            // Update existing character
            await Database.run(
                `UPDATE characters SET class_name = ?, spec_name = ?, item_level = ?, rio_score = ?, last_updated = CURRENT_TIMESTAMP WHERE booster_id = ? AND character_name = ? AND character_realm = ?`,
                [characterData.class, characterData.spec, characterData.itemLevel, characterData.rioScore, boosterId, characterName, characterRealm]
            );
            logger.logAction('CHARACTER_UPDATED', boosterId, { characterName, characterRealm, itemLevel: characterData.itemLevel, rioScore: characterData.rioScore });
            return { success: true, message: `Character updated: ${characterName}-${characterRealm} (iLvl: ${characterData.itemLevel}, RIO: ${characterData.rioScore})`, characterData };
        } else {
            // Insert new character
            await Database.run(
                `INSERT INTO characters (booster_id, character_name, character_realm, class_name, spec_name, item_level, rio_score) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [boosterId, characterName, characterRealm, characterData.class, characterData.spec, characterData.itemLevel, characterData.rioScore]
            );
            logger.logAction('CHARACTER_REGISTERED', boosterId, { characterName, characterRealm, itemLevel: characterData.itemLevel, rioScore: characterData.rioScore });
            return { success: true, message: `Character registered: ${characterName}-${characterRealm} (iLvl: ${characterData.itemLevel}, RIO: ${characterData.rioScore})`, characterData };
        }
    } catch (error) {
        logger.logError(error, { context: 'REGISTER_CHARACTER', boosterId, characterName, characterRealm });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Get all characters for a booster
async function getBoosterCharacters(boosterId) {
    try {
        const characters = await Database.all(
            `SELECT * FROM characters WHERE booster_id = ? ORDER BY registered_at DESC`,
            [boosterId]
        );
        return characters;
    } catch (error) {
        logger.logError(error, { context: 'GET_BOOSTER_CHARACTERS', boosterId });
        return [];
    }
}

// Refresh all registered characters for a booster from Raider.IO
async function refreshBoosterCharacters(boosterId) {
    try {
        const characters = await getBoosterCharacters(boosterId);
        let refreshedCount = 0;

        for (const char of characters) {
            const result = await refreshCharacter(boosterId, char.character_name, char.character_realm);
            if (result.success) {
                refreshedCount++;
            }
        }

        return { success: true, refreshedCount, total: characters.length };
    } catch (error) {
        logger.logError(error, { context: 'REFRESH_BOOSTER_CHARACTERS', boosterId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Get available (unlocked) characters for a booster
async function getAvailableCharacters(boosterId, minItemLevel = 0, minRioScore = 0) {
    try {
        const now = new Date().toISOString();
        const characters = await Database.all(
            `SELECT c.* FROM characters c
             WHERE c.booster_id = ?
             AND c.item_level >= ?
             AND c.rio_score >= ?
             AND NOT EXISTS (
                 SELECT 1 FROM character_weekly_locks l
                 WHERE l.booster_id = c.booster_id
                 AND l.character_name = c.character_name
                 AND l.character_realm = c.character_realm
                 AND l.locked_until > ?
             )
             ORDER BY c.item_level DESC, c.rio_score DESC`,
            [boosterId, minItemLevel, minRioScore, now]
        );
        return characters;
    } catch (error) {
        logger.logError(error, { context: 'GET_AVAILABLE_CHARACTERS', boosterId });
        return [];
    }
}

// Lock a character for an event
async function lockCharacter(boosterId, characterName, characterRealm, eventId, options = {}) {
    try {
        const lockedUntil = options.lockedUntil || getNextWednesday();
        const lockReason = options.lockReason || 'this week';
        
        // Check if character is already locked
        const existing = await Database.get(
            `SELECT * FROM character_weekly_locks 
             WHERE booster_id = ? AND character_name = ? AND character_realm = ? AND locked_until > CURRENT_TIMESTAMP`,
            [boosterId, characterName, characterRealm]
        );
        
        if (existing) {
            return { success: false, message: `This character is already locked for ${lockReason}.` };
        }
        
        // Lock the character
        await Database.run(
            `INSERT INTO character_weekly_locks (booster_id, character_name, character_realm, event_id, locked_until) VALUES (?, ?, ?, ?, ?)`,
            [boosterId, characterName, characterRealm, eventId, lockedUntil]
        );
        
        logger.logAction('CHARACTER_LOCKED', boosterId, { characterName, characterRealm, eventId, lockedUntil, lockReason });
        return { success: true };
    } catch (error) {
        logger.logError(error, { context: 'LOCK_CHARACTER', boosterId, characterName, characterRealm });
        return { success: false, message: `Error: ${error.message}` };
    }
}

function getMythicPlusLockUntil() {
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + 90);
    return lockUntil.toISOString();
}

// Unlock a character (for admin use)
async function unlockCharacter(boosterId, characterName, characterRealm) {
    try {
        await Database.run(
            `UPDATE character_weekly_locks SET locked_until = CURRENT_TIMESTAMP WHERE booster_id = ? AND character_name = ? AND character_realm = ?`,
            [boosterId, characterName, characterRealm]
        );
        logger.logAction('CHARACTER_UNLOCKED', boosterId, { characterName, characterRealm });
        return { success: true };
    } catch (error) {
        logger.logError(error, { context: 'UNLOCK_CHARACTER', boosterId, characterName, characterRealm });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Get next Wednesday (weekly reset day)
function getNextWednesday() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 3 = Wednesday
    const daysUntilWednesday = (3 - day + 7) % 7 || 7; // Days until next Wednesday
    
    const nextWednesday = new Date(now);
    nextWednesday.setDate(now.getDate() + daysUntilWednesday);
    nextWednesday.setHours(9, 0, 0, 0); // Reset at 9 AM (adjust as needed)
    
    return nextWednesday;
}

// Clean up expired locks (should be called periodically)
async function cleanupExpiredLocks() {
    try {
        const now = new Date().toISOString();
        await Database.run(
            `DELETE FROM character_weekly_locks WHERE locked_until < ?`,
            [now]
        );
        logger.logInfo('Expired character locks cleaned up');
    } catch (error) {
        logger.logError(error, { context: 'CLEANUP_EXPIRED_LOCKS' });
    }
}

// Refresh character data from Raider.IO
async function refreshCharacter(boosterId, characterName, characterRealm) {
    try {
        const characterData = await fetchCharacterData(characterName, characterRealm);
        
        if (!characterData) {
            return { success: false, message: 'Character not found on Raider.IO.' };
        }

        await Database.run(
            `UPDATE characters SET class_name = ?, spec_name = ?, item_level = ?, rio_score = ?, last_updated = CURRENT_TIMESTAMP WHERE booster_id = ? AND character_name = ? AND character_realm = ?`,
            [characterData.class, characterData.spec, characterData.itemLevel, characterData.rioScore, boosterId, characterName, characterRealm]
        );

        logger.logAction('CHARACTER_REFRESHED', boosterId, { characterName, characterRealm, itemLevel: characterData.itemLevel, rioScore: characterData.rioScore });
        return { success: true, message: `Character refreshed: ${characterName}-${characterRealm} (iLvl: ${characterData.itemLevel}, RIO: ${characterData.rioScore})`, characterData };
    } catch (error) {
        logger.logError(error, { context: 'REFRESH_CHARACTER', boosterId, characterName, characterRealm });
        return { success: false, message: `Error: ${error.message}` };
    }
}

module.exports = {
    registerCharacter,
    getBoosterCharacters,
    refreshBoosterCharacters,
    getAvailableCharacters,
    lockCharacter,
    unlockCharacter,
    refreshCharacter,
    cleanupExpiredLocks,
    getNextWednesday,
    getMythicPlusLockUntil
};
