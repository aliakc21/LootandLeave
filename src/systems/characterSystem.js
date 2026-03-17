const Database = require('../database/database');
const { fetchCharacterData } = require('../utils/wowApi');
const logger = require('../utils/logger');

function getCharacterRefreshIntervalMinutes() {
    const parsed = parseInt(process.env.CHARACTER_REFRESH_INTERVAL_MINUTES || '60', 10);
    return Number.isNaN(parsed) || parsed <= 0 ? 60 : parsed;
}

function getCharacterRefreshBatchSize() {
    const parsed = parseInt(process.env.CHARACTER_REFRESH_BATCH_SIZE || '25', 10);
    return Number.isNaN(parsed) || parsed <= 0 ? 25 : parsed;
}

function isCharacterStale(lastUpdated, maxAgeMinutes = getCharacterRefreshIntervalMinutes()) {
    if (!lastUpdated) {
        return true;
    }

    const updatedAt = new Date(lastUpdated);
    if (Number.isNaN(updatedAt.getTime())) {
        return true;
    }

    return Date.now() - updatedAt.getTime() > maxAgeMinutes * 60 * 1000;
}

async function findExistingCharacterCaseInsensitive(boosterId, characterName, characterRealm) {
    return Database.get(
        `SELECT *
         FROM characters
         WHERE booster_id = ?
         AND LOWER(character_name) = LOWER(?)
         AND LOWER(character_realm) = LOWER(?)
         LIMIT 1`,
        [boosterId, characterName, characterRealm]
    );
}

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

        const resolvedCharacterName = characterData.characterName || characterName;
        const resolvedCharacterRealm = characterData.realm || characterRealm;

        // Check if character already exists
        const existing = await findExistingCharacterCaseInsensitive(boosterId, resolvedCharacterName, resolvedCharacterRealm);

        if (existing) {
            // Update the existing row and normalize casing to Raider.IO's canonical values.
            await Database.run(
                `UPDATE characters
                 SET character_name = ?, character_realm = ?, class_name = ?, spec_name = ?, item_level = ?, rio_score = ?, last_updated = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [resolvedCharacterName, resolvedCharacterRealm, characterData.class, characterData.spec, characterData.itemLevel, characterData.rioScore, existing.id]
            );
            logger.logAction('CHARACTER_UPDATED', boosterId, { characterName: resolvedCharacterName, characterRealm: resolvedCharacterRealm, itemLevel: characterData.itemLevel, rioScore: characterData.rioScore });
            return { success: true, message: `Character updated: ${resolvedCharacterName}-${resolvedCharacterRealm} (iLvl: ${characterData.itemLevel}, RIO: ${characterData.rioScore})`, characterData };
        } else {
            // Insert new character
            await Database.run(
                `INSERT INTO characters (booster_id, character_name, character_realm, class_name, spec_name, item_level, rio_score) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [boosterId, resolvedCharacterName, resolvedCharacterRealm, characterData.class, characterData.spec, characterData.itemLevel, characterData.rioScore]
            );
            logger.logAction('CHARACTER_REGISTERED', boosterId, { characterName: resolvedCharacterName, characterRealm: resolvedCharacterRealm, itemLevel: characterData.itemLevel, rioScore: characterData.rioScore });
            return { success: true, message: `Character registered: ${resolvedCharacterName}-${resolvedCharacterRealm} (iLvl: ${characterData.itemLevel}, RIO: ${characterData.rioScore})`, characterData };
        }
    } catch (error) {
        logger.logError(error, { context: 'REGISTER_CHARACTER', boosterId, characterName, characterRealm });
        return { success: false, message: `Error: ${error.message}` };
    }
}

function parseBulkCharacterEntries(rawInput) {
    return rawInput
        .split(/\r?\n|,/)
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
            const separatorIndex = entry.indexOf('-');
            if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
                return { raw: entry, valid: false };
            }

            return {
                raw: entry,
                valid: true,
                characterName: entry.slice(0, separatorIndex).trim(),
                characterRealm: entry.slice(separatorIndex + 1).trim(),
            };
        });
}

async function registerMultipleCharacters(boosterId, rawInput) {
    try {
        const parsedEntries = parseBulkCharacterEntries(rawInput);
        const validEntries = parsedEntries.filter(entry => entry.valid);
        const invalidEntries = parsedEntries.filter(entry => !entry.valid).map(entry => entry.raw);

        if (validEntries.length === 0) {
            return {
                success: false,
                message: 'No valid characters found. Use the format `Character-Realm`, separated by commas or new lines.',
            };
        }

        const uniqueEntries = [];
        const seen = new Set();
        for (const entry of validEntries.slice(0, 20)) {
            const key = `${entry.characterName.toLowerCase()}|${entry.characterRealm.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueEntries.push(entry);
            }
        }

        const successes = [];
        const failures = [];
        for (const entry of uniqueEntries) {
            const result = await registerCharacter(boosterId, entry.characterName, entry.characterRealm);
            if (result.success) {
                successes.push(`${entry.characterName}-${entry.characterRealm}`);
            } else {
                failures.push(`${entry.characterName}-${entry.characterRealm}: ${result.message}`);
            }
        }

        return {
            success: successes.length > 0,
            successes,
            failures: [...failures, ...invalidEntries.map(entry => `${entry}: invalid format`)],
        };
    } catch (error) {
        logger.logError(error, { context: 'REGISTER_MULTIPLE_CHARACTERS', boosterId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function registerCharacterEntries(boosterId, entries) {
    try {
        const uniqueEntries = [];
        const seen = new Set();

        for (const entry of entries.slice(0, 20)) {
            if (!entry?.characterName || !entry?.characterRealm) {
                continue;
            }

            const key = `${entry.characterName.toLowerCase()}|${entry.characterRealm.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueEntries.push(entry);
            }
        }

        if (uniqueEntries.length === 0) {
            return {
                success: false,
                message: 'No valid character entries were provided.',
            };
        }

        const successes = [];
        const failures = [];
        for (const entry of uniqueEntries) {
            const result = await registerCharacter(boosterId, entry.characterName, entry.characterRealm);
            if (result.success) {
                successes.push(`${entry.characterName}-${entry.characterRealm}`);
            } else {
                failures.push(`${entry.characterName}-${entry.characterRealm}: ${result.message}`);
            }
        }

        return {
            success: successes.length > 0,
            successes,
            failures,
        };
    } catch (error) {
        logger.logError(error, { context: 'REGISTER_CHARACTER_ENTRIES', boosterId });
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
    return ensureBoosterCharactersFresh(boosterId, { force: true });
}

async function ensureBoosterCharactersFresh(boosterId, options = {}) {
    try {
        const characters = await getBoosterCharacters(boosterId);
        const maxAgeMinutes = options.maxAgeMinutes || getCharacterRefreshIntervalMinutes();
        const force = Boolean(options.force);
        const limit = options.limit || null;
        const candidates = (force ? characters : characters.filter(char => isCharacterStale(char.last_updated, maxAgeMinutes)))
            .sort((a, b) => new Date(a.last_updated || 0).getTime() - new Date(b.last_updated || 0).getTime());

        const selectedCharacters = typeof limit === 'number' ? candidates.slice(0, limit) : candidates;
        let refreshedCount = 0;
        let failedCount = 0;

        for (const char of selectedCharacters) {
            const result = await refreshCharacter(boosterId, char.character_name, char.character_realm);
            if (result.success) {
                refreshedCount++;
            } else {
                failedCount++;
            }
        }

        return {
            success: true,
            refreshedCount,
            failedCount,
            total: characters.length,
            checked: selectedCharacters.length,
        };
    } catch (error) {
        logger.logError(error, { context: 'REFRESH_BOOSTER_CHARACTERS', boosterId });
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function refreshStaleCharactersBatch(limit = getCharacterRefreshBatchSize()) {
    try {
        const refreshThreshold = new Date(Date.now() - getCharacterRefreshIntervalMinutes() * 60 * 1000).toISOString();
        const staleCharacters = await Database.all(
            `SELECT booster_id, character_name, character_realm, last_updated
             FROM characters
             WHERE last_updated IS NULL OR last_updated < ?
             ORDER BY last_updated ASC NULLS FIRST
             LIMIT ?`,
            [refreshThreshold, limit]
        );

        let refreshedCount = 0;
        let failedCount = 0;
        for (const character of staleCharacters) {
            const result = await refreshCharacter(character.booster_id, character.character_name, character.character_realm);
            if (result.success) {
                refreshedCount++;
            } else {
                failedCount++;
            }
        }

        return {
            success: true,
            checked: staleCharacters.length,
            refreshedCount,
            failedCount,
        };
    } catch (error) {
        logger.logError(error, { context: 'REFRESH_STALE_CHARACTERS_BATCH' });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Get available (unlocked) characters for a booster
function isLockBlockingEvent(lock, options = {}) {
    const eventType = options.eventType || null;
    const eventDifficulty = options.eventDifficulty || null;
    const raidBoostType = options.raidBoostType || null;
    const eventScheduledDate = options.eventScheduledDate ? new Date(options.eventScheduledDate) : null;
    const lockEventType = lock.event_type || 'raid';
    const lockScope = lock.lock_scope || 'raid';

    if (!eventType) {
        return true;
    }

    if (eventType === 'mythic_plus') {
        return false;
    }

    if (eventType === 'raid') {
        if (raidBoostType === 'saved') {
            return false;
        }

        // External locks (e.g. /savelock) always block VIP / LootShare raids for this reset
        if (lockEventType === 'raid' && lockScope === 'external') {
            return true;
        }

        if (lockEventType !== 'raid' || lockScope !== (eventDifficulty || 'raid')) {
            return false;
        }

        const lockUntil = new Date(lock.locked_until);
        if (Number.isNaN(lockUntil.getTime())) {
            return true;
        }

        if (!eventScheduledDate || Number.isNaN(eventScheduledDate.getTime())) {
            return true;
        }

        return eventScheduledDate < lockUntil;
    }

    return true;
}

async function getAvailableCharacters(boosterId, minItemLevel = 0, minRioScore = 0, options = {}) {
    try {
        const now = new Date().toISOString();
        const characters = await Database.all(
            `SELECT c.* FROM characters c
             WHERE c.booster_id = ?
             AND c.item_level >= ?
             AND c.rio_score >= ?
             ORDER BY c.item_level DESC, c.rio_score DESC`,
            [boosterId, minItemLevel, minRioScore]
        );
        const activeLocks = await Database.all(
            `SELECT * FROM character_weekly_locks
             WHERE booster_id = ?
             AND locked_until > ?`,
            [boosterId, now]
        );

        return characters.filter(character => {
            const characterLocks = activeLocks.filter(lock =>
                lock.character_name === character.character_name
                && lock.character_realm === character.character_realm
            );

            return !characterLocks.some(lock => isLockBlockingEvent(lock, options));
        });
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
        const eventType = options.eventType || 'raid';
        const lockScope = options.lockScope || null;
        const allowExistingLock = Boolean(options.allowExistingLock);
        
        // Check if character is already locked
        const existingLocks = await Database.all(
            `SELECT * FROM character_weekly_locks 
             WHERE booster_id = ? AND character_name = ? AND character_realm = ? AND locked_until > CURRENT_TIMESTAMP`,
            [boosterId, characterName, characterRealm]
        );
        const existing = existingLocks.find(lock => isLockBlockingEvent(lock, {
            eventType,
            eventDifficulty: eventType === 'raid' ? lockScope : null,
            eventScheduledDate: options.eventScheduledDate || null,
            raidBoostType: options.raidBoostType || null,
        }));
        
        if (existing && !allowExistingLock) {
            return { success: false, message: `This character is already locked for ${lockReason}.` };
        }
        
        // Lock the character
        await Database.run(
            `INSERT INTO character_weekly_locks (booster_id, character_name, character_realm, event_id, event_type, lock_scope, locked_until) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [boosterId, characterName, characterRealm, eventId, eventType, lockScope, lockedUntil]
        );
        
        logger.logAction('CHARACTER_LOCKED', boosterId, { characterName, characterRealm, eventId, lockedUntil, lockReason, eventType, lockScope });
        return { success: true };
    } catch (error) {
        logger.logError(error, { context: 'LOCK_CHARACTER', boosterId, characterName, characterRealm });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Unlock a character (for admin use)
async function unlockCharacter(boosterId, characterName, characterRealm, options = {}) {
    try {
        const filters = [
            `booster_id = ?`,
            `character_name = ?`,
            `character_realm = ?`,
        ];
        const params = [boosterId, characterName, characterRealm];

        if (options.eventId) {
            filters.push(`event_id = ?`);
            params.push(options.eventId);
        }
        if (options.eventType) {
            filters.push(`event_type = ?`);
            params.push(options.eventType);
        }
        if (options.lockScope) {
            filters.push(`lock_scope = ?`);
            params.push(options.lockScope);
        }

        await Database.run(
            `UPDATE character_weekly_locks SET locked_until = CURRENT_TIMESTAMP WHERE ${filters.join(' AND ')}`,
            params
        );
        logger.logAction('CHARACTER_UNLOCKED', boosterId, { characterName, characterRealm, ...options });
        return { success: true };
    } catch (error) {
        logger.logError(error, { context: 'UNLOCK_CHARACTER', boosterId, characterName, characterRealm });
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Get the next weekly reset relative to the provided time (Wednesday 09:00).
function getNextWednesday(referenceDate = new Date()) {
    const base = new Date(referenceDate);
    const reset = new Date(base);
    reset.setHours(9, 0, 0, 0);

    let daysUntilWednesday = (3 - base.getDay() + 7) % 7;
    if (daysUntilWednesday === 0 && base >= reset) {
        daysUntilWednesday = 7;
    }

    reset.setDate(base.getDate() + daysUntilWednesday);
    return reset;
}

async function normalizeLegacyRaidLocks() {
    const legacyLocks = await Database.all(
        `SELECT l.id, l.locked_until, e.scheduled_date
         FROM character_weekly_locks l
         LEFT JOIN events e ON e.event_id = l.event_id
         WHERE l.event_type = 'raid'
         AND l.locked_until >= '2090-01-01'`
    );

    for (const lock of legacyLocks) {
        const scheduledDate = lock.scheduled_date ? new Date(lock.scheduled_date) : null;
        const correctedLockUntil = scheduledDate && !Number.isNaN(scheduledDate.getTime())
            ? getNextWednesday(scheduledDate).toISOString()
            : new Date().toISOString();

        await Database.run(
            `UPDATE character_weekly_locks SET locked_until = ? WHERE id = ?`,
            [correctedLockUntil, lock.id]
        );
    }
}

// Clean up expired locks (should be called periodically)
async function cleanupExpiredLocks() {
    try {
        await normalizeLegacyRaidLocks();
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
    ensureBoosterCharactersFresh,
    getBoosterCharacters,
    refreshBoosterCharacters,
    refreshStaleCharactersBatch,
    getAvailableCharacters,
    lockCharacter,
    unlockCharacter,
    refreshCharacter,
    cleanupExpiredLocks,
    getNextWednesday,
    registerMultipleCharacters,
    registerCharacterEntries,
    getCharacterRefreshIntervalMinutes,
};
