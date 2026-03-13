function normalizeCutValue(value) {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value).trim());
    if (Number.isNaN(parsed) || parsed < 0) {
        return null;
    }

    return parsed > 1 ? parsed / 100 : parsed;
}

function parseCutConfig(input) {
    if (!input || !String(input).trim()) {
        return null;
    }

    const parts = String(input)
        .split(/[\/,]/)
        .map(part => normalizeCutValue(part))
        .filter(value => value !== null);

    if (parts.length !== 3) {
        throw new Error('Cut config must contain exactly 3 values in the format `30/10/60`.');
    }

    const [treasuryRate, advertiserRate, boosterRate] = parts;
    const total = treasuryRate + advertiserRate + boosterRate;
    if (Math.abs(total - 1) > 0.001) {
        throw new Error('Cut config must add up to 100%.');
    }

    return { treasuryRate, advertiserRate, boosterRate };
}

function getDefaultCutRates() {
    const treasuryRate = normalizeCutValue(process.env.DEFAULT_EVENT_CUT_TREASURY || process.env.COMMISSION_TREASURY || 0.30) ?? 0.30;
    const advertiserRate = normalizeCutValue(process.env.DEFAULT_EVENT_CUT_ADVERTISER || process.env.COMMISSION_ADVERTISER || 0.10) ?? 0.10;
    const boosterRate = normalizeCutValue(process.env.DEFAULT_EVENT_CUT_BOOSTER || process.env.COMMISSION_BOOSTER || 0.60) ?? 0.60;

    return { treasuryRate, advertiserRate, boosterRate };
}

function resolveEventCutRates(event) {
    if (
        event
        && typeof event.cut_treasury_rate === 'number'
        && typeof event.cut_advertiser_rate === 'number'
        && typeof event.cut_booster_rate === 'number'
    ) {
        return {
            treasuryRate: event.cut_treasury_rate,
            advertiserRate: event.cut_advertiser_rate,
            boosterRate: event.cut_booster_rate,
        };
    }

    return getDefaultCutRates();
}

function formatCutRates(rates) {
    return `Treasury ${Math.round(rates.treasuryRate * 100)}% | Advertiser ${Math.round(rates.advertiserRate * 100)}% | Booster ${Math.round(rates.boosterRate * 100)}%`;
}

module.exports = {
    parseCutConfig,
    getDefaultCutRates,
    resolveEventCutRates,
    formatCutRates,
};
