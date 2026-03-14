const MIDNIGHT_DUNGEONS = [
    { id: 'windrunner_spire', label: 'Windrunner Spire' },
    { id: 'magisters_terrace', label: 'Magister\'s Terrace' },
    { id: 'murder_row', label: 'Murder Row' },
    { id: 'den_of_nalorakk', label: 'Den of Nalorakk' },
    { id: 'maisara_caverns', label: 'Maisara Caverns' },
    { id: 'blinding_vale', label: 'Blinding Vale' },
    { id: 'nexus_point_xenas', label: 'Nexus-Point Xenas' },
    { id: 'voidscar_arena', label: 'Voidscar Arena' },
];

const MIDNIGHT_RAIDS = [
    { id: 'the_voidspire', label: 'The Voidspire' },
    { id: 'the_dreamrift', label: 'The Dreamrift' },
    { id: 'march_on_queldanas', label: 'March on Quel\'Danas' },
];

const RAID_DIFFICULTIES = [
    { id: 'normal', label: 'Normal' },
    { id: 'heroic', label: 'Heroic' },
    { id: 'mythic', label: 'Mythic' },
];

const RAID_BOOST_TYPES = [
    { id: 'vip', label: 'VIP' },
    { id: 'lootshare', label: 'LootShare' },
    { id: 'saved', label: 'Saved' },
];

function findRaidById(raidId) {
    return MIDNIGHT_RAIDS.find(raid => raid.id === raidId) || null;
}

function findDifficultyById(difficultyId) {
    return RAID_DIFFICULTIES.find(difficulty => difficulty.id === difficultyId) || null;
}

function findRaidBoostTypeById(boostTypeId) {
    return RAID_BOOST_TYPES.find(boostType => boostType.id === boostTypeId) || null;
}

function buildRaidEventName(raidId, difficultyId) {
    const raid = findRaidById(raidId);
    const difficulty = findDifficultyById(difficultyId);

    if (!raid || !difficulty) {
        return null;
    }

    return `${raid.label} - ${difficulty.label}`;
}

module.exports = {
    MIDNIGHT_DUNGEONS,
    MIDNIGHT_RAIDS,
    RAID_DIFFICULTIES,
    RAID_BOOST_TYPES,
    findRaidById,
    findDifficultyById,
    findRaidBoostTypeById,
    buildRaidEventName,
};
