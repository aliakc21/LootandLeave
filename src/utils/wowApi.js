const axios = require('axios');
const logger = require('./logger');

// Fetch character data from Raider.IO API
async function fetchCharacterData(characterName, realm) {
    try {
        const apiUrl = `https://raider.io/api/v1/characters/profile`;
        const formattedRealm = realm.toLowerCase().replace(/\s+/g, '-'); // Raider.IO expects slugged realm
        const formattedName = characterName; // Raider.IO handles special chars in name directly

        const params = {
            region: 'eu',
            realm: formattedRealm,
            name: formattedName,
            fields: 'mythic_plus_scores_by_season:current,gear,raid_progression'
        };

        console.log(`[Raider.IO] Fetching: ${formattedName}-${formattedRealm} (EU)`);
        
        const response = await axios.get(apiUrl, { 
            params,
            timeout: 10000 // 10 second timeout
        });

        if (response.data && response.data.name) {
            const data = response.data;
            
            let rioScore = 0;
            if (data.mythic_plus_scores_by_season && data.mythic_plus_scores_by_season.length > 0) {
                const currentSeason = data.mythic_plus_scores_by_season[0];
                if (currentSeason.scores) {
                    rioScore = currentSeason.scores.all || currentSeason.scores.dps || currentSeason.scores.healer || currentSeason.scores.tank || 0;
                }
            }
            
            let itemLevel = 0;
            if (data.gear) {
                itemLevel = data.gear.item_level_equipped || data.gear.item_level_total || 0;
            }
            
            const className = data.class || 'Unknown';
            const specName = data.active_spec_name || 'N/A';
            
            console.log(`[Raider.IO] Success: ${data.name} - iLvl: ${itemLevel}, RIO: ${rioScore}, Class: ${className}, Spec: ${specName}`);
            
            return {
                rioScore: rioScore,
                itemLevel: itemLevel,
                progression: formatProgression(data.raid_progression),
                characterName: data.name,
                realm: data.realm,
                class: className,
                spec: specName
            };
        }
        console.warn(`[Raider.IO] No data returned for ${characterName}-${realm}`);
        return null;
    } catch (error) {
        if (error.response) {
            console.error(`[Raider.IO] API Error ${error.response.status}:`, error.response.data);
            if (error.response.status === 404) {
                return null;
            }
        } else if (error.request) {
            console.error('[Raider.IO] Network Error:', error.message);
        } else {
            console.error('[Raider.IO] Error:', error.message);
        }
        return null;
    }
}

// Format raid progression for display
function formatProgression(progression) {
    if (!progression) return 'No progression data';
    
    const raids = Object.keys(progression).slice(0, 3); // Show top 3 raids
    return raids.map(raid => {
        const prog = progression[raid];
        return `${raid}: ${prog.summary || 'N/A'}`;
    }).join(', ');
}

module.exports = {
    fetchCharacterData,
    formatProgression
};
