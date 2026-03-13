function createRemoteLabelImage(label, theme = 'raid') {
    const colors = theme === 'dungeon'
        ? { background: '1f4d3d', foreground: 'f4f7f5' }
        : { background: '2f2a56', foreground: 'f5f3ff' };

    return `https://placehold.co/1200x675/${colors.background}/${colors.foreground}.png?text=${encodeURIComponent(label)}`;
}

function getRaidImageUrl(raidName) {
    return createRemoteLabelImage(`Raid: ${raidName || 'Scheduled Raid'}`, 'raid');
}

function getDungeonImageUrl(dungeonName, keyLevel = null) {
    const suffix = keyLevel ? ` +${keyLevel}` : '';
    return createRemoteLabelImage(`Mythic+: ${dungeonName || 'Dungeon'}${suffix}`, 'dungeon');
}

function getBoostImageUrl(request) {
    if (!request) {
        return null;
    }

    const mythicRuns = parseMythicRuns(request);

    if (request.boost_type === 'raid') {
        return getRaidImageUrl(request.boost_label);
    }

    if (request.boost_type === 'raid_request') {
        return getRaidImageUrl(request.boost_label || 'Raid Request');
    }

    if (request.boost_type === 'mythic_plus') {
        if (mythicRuns.length > 0) {
            return getDungeonImageUrl(mythicRuns[0].label, mythicRuns[0].keyLevel);
        }
        return getDungeonImageUrl(request.boost_label, request.boost_key_level);
    }

    return null;
}

function parseMythicRuns(request) {
    if (!request?.boost_runs) {
        return [];
    }

    try {
        const runs = typeof request.boost_runs === 'string'
            ? JSON.parse(request.boost_runs)
            : request.boost_runs;
        return Array.isArray(runs) ? runs : [];
    } catch {
        return [];
    }
}

module.exports = {
    getRaidImageUrl,
    getDungeonImageUrl,
    getBoostImageUrl,
};
