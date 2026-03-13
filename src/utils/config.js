const Database = require('../database/database');

// Get configuration value from database, fallback to environment variable
async function getConfig(key, defaultValue = null) {
    try {
        const config = await Database.get(`SELECT value FROM bot_config WHERE key = ?`, [key]);
        if (config) {
            // Try to parse as number if it looks like a number
            const value = config.value;
            if (!isNaN(value) && value !== '') {
                return parseFloat(value);
            }
            return value;
        }
        
        // Fallback to environment variable
        if (process.env[key.toUpperCase()]) {
            return process.env[key.toUpperCase()];
        }
        
        return defaultValue;
    } catch (error) {
        console.error(`Error getting config ${key}:`, error);
        return defaultValue;
    }
}

// Set configuration value
async function setConfig(key, value, updatedBy = null) {
    try {
        await Database.run(
            `INSERT INTO bot_config (key, value, updated_at, updated_by) 
             VALUES (?, ?, CURRENT_TIMESTAMP, ?)
             ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?`,
            [key, value, updatedBy, value, updatedBy]
        );
        return true;
    } catch (error) {
        console.error(`Error setting config ${key}:`, error);
        throw error;
    }
}

// Get all configuration values
async function getAllConfig() {
    try {
        const configs = await Database.all(`SELECT key, value FROM bot_config`);
        const configMap = {};
        configs.forEach(config => {
            const value = config.value;
            configMap[config.key] = !isNaN(value) && value !== '' ? parseFloat(value) : value;
        });
        return configMap;
    } catch (error) {
        console.error('Error getting all config:', error);
        return {};
    }
}

module.exports = {
    getConfig,
    setConfig,
    getAllConfig
};
