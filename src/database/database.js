const { Pool } = require('pg');

class Database {
    constructor() {
        this.pool = null;
        this.isInitialized = false;
    }

    getPoolConfig() {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL is required. For Railway Postgres, copy the provided connection string into this environment variable.');
        }

        const useSsl = process.env.DATABASE_SSL === 'true'
            || (process.env.DATABASE_SSL !== 'false'
                && !connectionString.includes('localhost')
                && !connectionString.includes('127.0.0.1'));

        return {
            connectionString,
            ssl: useSsl ? { rejectUnauthorized: false } : false,
        };
    }

    ensurePool() {
        if (!this.pool) {
            this.pool = new Pool(this.getPoolConfig());
            this.pool.on('error', error => {
                console.error('Unexpected Postgres pool error:', error);
            });
        }
        return this.pool;
    }

    normalizeSql(sql) {
        let index = 0;
        return sql.replace(/\?/g, () => `$${++index}`);
    }

    async query(sql, params = []) {
        const pool = this.ensurePool();
        return pool.query(this.normalizeSql(sql), params);
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        const pool = this.ensurePool();
        const client = await pool.connect();

        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    discord_id TEXT UNIQUE NOT NULL,
                    role TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id BIGSERIAL PRIMARY KEY,
                    ticket_id TEXT UNIQUE NOT NULL,
                    client_id TEXT NOT NULL,
                    channel_id TEXT NOT NULL,
                    boost_type TEXT,
                    event_id TEXT,
                    boost_label TEXT,
                    boost_runs TEXT,
                    client_character_name TEXT,
                    client_character_realm TEXT,
                    requested_class TEXT,
                    requested_role TEXT,
                    boost_key_level INTEGER,
                    boost_amount INTEGER DEFAULT 1,
                    boost_scheduled_date TIMESTAMPTZ,
                    approval_status TEXT DEFAULT 'pending',
                    approved_at TIMESTAMPTZ,
                    approved_by TEXT,
                    settled_gold INTEGER,
                    status TEXT DEFAULT 'open',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    closed_at TIMESTAMPTZ,
                    assigned_to TEXT
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS jobs (
                    id BIGSERIAL PRIMARY KEY,
                    job_id TEXT UNIQUE NOT NULL,
                    ticket_id TEXT,
                    client_id TEXT NOT NULL,
                    message_id TEXT,
                    channel_id TEXT,
                    status TEXT DEFAULT 'open',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMPTZ
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS events (
                    id BIGSERIAL PRIMARY KEY,
                    event_id TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    scheduled_date TIMESTAMPTZ NOT NULL,
                    message_id TEXT,
                    channel_id TEXT,
                    event_type TEXT DEFAULT 'raid',
                    event_difficulty TEXT,
                    raid_boost_type TEXT DEFAULT 'vip',
                    status TEXT DEFAULT 'open',
                    min_item_level INTEGER DEFAULT 0,
                    min_rio_score INTEGER DEFAULT 0,
                    client_limit INTEGER DEFAULT 0,
                    balance_pool INTEGER DEFAULT 0,
                    cut_treasury_rate DOUBLE PRECISION,
                    cut_advertiser_rate DOUBLE PRECISION,
                    cut_booster_rate DOUBLE PRECISION,
                    created_by TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS event_applications (
                    id BIGSERIAL PRIMARY KEY,
                    event_id TEXT NOT NULL REFERENCES events(event_id),
                    booster_id TEXT NOT NULL,
                    character_name TEXT,
                    character_realm TEXT,
                    listing_channel_id TEXT,
                    listing_message_id TEXT,
                    status TEXT DEFAULT 'pending',
                    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    approved_at TIMESTAMPTZ,
                    approved_by TEXT
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS selection_cancel_requests (
                    id BIGSERIAL PRIMARY KEY,
                    application_id BIGINT REFERENCES event_applications(id),
                    event_id TEXT NOT NULL REFERENCES events(event_id),
                    booster_id TEXT NOT NULL,
                    character_name TEXT NOT NULL,
                    character_realm TEXT NOT NULL,
                    source_channel_id TEXT,
                    source_message_id TEXT,
                    requested_by TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    reviewed_at TIMESTAMPTZ,
                    reviewed_by TEXT
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS payouts (
                    id BIGSERIAL PRIMARY KEY,
                    payout_id TEXT UNIQUE NOT NULL,
                    event_id TEXT,
                    job_id TEXT,
                    total_gold INTEGER NOT NULL,
                    treasury_amount INTEGER NOT NULL,
                    advertiser_amount INTEGER NOT NULL,
                    booster_amount INTEGER NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT NOT NULL
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS payout_details (
                    id BIGSERIAL PRIMARY KEY,
                    payout_id TEXT NOT NULL REFERENCES payouts(payout_id),
                    booster_id TEXT NOT NULL,
                    amount INTEGER NOT NULL
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS payout_receipts (
                    id BIGSERIAL PRIMARY KEY,
                    payout_id TEXT NOT NULL REFERENCES payouts(payout_id),
                    booster_id TEXT NOT NULL,
                    event_id TEXT NOT NULL,
                    payment_amount INTEGER NOT NULL,
                    message_id TEXT,
                    status TEXT DEFAULT 'pending',
                    completed_at TIMESTAMPTZ,
                    completed_by TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (payout_id, booster_id)
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS booster_balances (
                    id BIGSERIAL PRIMARY KEY,
                    booster_id TEXT NOT NULL UNIQUE,
                    balance INTEGER DEFAULT 0,
                    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS booster_applications (
                    id BIGSERIAL PRIMARY KEY,
                    application_id TEXT UNIQUE NOT NULL,
                    applicant_id TEXT NOT NULL,
                    battletag TEXT,
                    last_season_rio DOUBLE PRECISION,
                    previous_communities TEXT,
                    years_playing INTEGER,
                    years_boosting INTEGER,
                    registered_characters TEXT,
                    character_name TEXT NOT NULL,
                    character_realm TEXT NOT NULL,
                    experience TEXT,
                    rio_score DOUBLE PRECISION,
                    item_level DOUBLE PRECISION,
                    class_name TEXT,
                    spec_name TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    reviewed_at TIMESTAMPTZ,
                    reviewed_by TEXT
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS characters (
                    id BIGSERIAL PRIMARY KEY,
                    booster_id TEXT NOT NULL,
                    character_name TEXT NOT NULL,
                    character_realm TEXT NOT NULL,
                    class_name TEXT,
                    spec_name TEXT,
                    item_level DOUBLE PRECISION,
                    rio_score DOUBLE PRECISION,
                    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    locked_until TIMESTAMPTZ,
                    locked_by_event TEXT,
                    UNIQUE (booster_id, character_name, character_realm)
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS character_weekly_locks (
                    id BIGSERIAL PRIMARY KEY,
                    booster_id TEXT NOT NULL,
                    character_name TEXT NOT NULL,
                    character_realm TEXT NOT NULL,
                    event_id TEXT REFERENCES events(event_id),
                    event_type TEXT DEFAULT 'raid',
                    lock_scope TEXT,
                    locked_until TIMESTAMPTZ NOT NULL,
                    locked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id BIGSERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    level TEXT NOT NULL,
                    action TEXT NOT NULL,
                    user_id TEXT,
                    details TEXT,
                    ip_address TEXT,
                    user_agent TEXT
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS bot_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    description TEXT,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_by TEXT
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS channel_visibility_rules (
                    id BIGSERIAL PRIMARY KEY,
                    role_id TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    allow_view BOOLEAN DEFAULT TRUE,
                    allow_send BOOLEAN DEFAULT FALSE,
                    allow_history BOOLEAN DEFAULT TRUE,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_by TEXT,
                    UNIQUE (role_id, target_type, target_id)
                )
            `);

            await client.query(`
                INSERT INTO bot_config (key, value, description) VALUES
                ('min_item_level', '0', 'Minimum item level for character filtering'),
                ('min_rio_score', '0', 'Minimum RIO score for character filtering'),
                ('commission_treasury', '0.30', 'Treasury commission rate (as decimal)'),
                ('commission_advertiser', '0.10', 'Advertiser commission rate (as decimal)'),
                ('commission_booster', '0.60', 'Booster commission rate (as decimal)')
                ON CONFLICT (key) DO NOTHING
            `);

            await client.query(`CREATE INDEX IF NOT EXISTS idx_character_locks_booster ON character_weekly_locks (booster_id, locked_until)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_character_locks_character ON character_weekly_locks (character_name, character_realm, locked_until)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_characters_booster_lower_name_realm ON characters (booster_id, LOWER(character_name), LOWER(character_realm))`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_event_applications_event ON event_applications (event_id, status)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_selection_cancel_requests_status ON selection_cancel_requests (status, event_id, booster_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_channel_visibility_rules_role ON channel_visibility_rules (role_id, target_type, target_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id, timestamp)`);

            await this.runMigrations(client);
            await this.cleanupCaseVariantCharacterDuplicates(client);
            await this.ensureCharacterCaseInsensitiveUniqueIndex(client);
            this.isInitialized = true;
            console.log('Connected to PostgreSQL database');
        } finally {
            client.release();
        }
    }

    async runMigrations(client = null) {
        const executor = client || this.ensurePool();
        const migrations = [
            `CREATE TABLE IF NOT EXISTS selection_cancel_requests (
                id BIGSERIAL PRIMARY KEY,
                application_id BIGINT REFERENCES event_applications(id),
                event_id TEXT NOT NULL REFERENCES events(event_id),
                booster_id TEXT NOT NULL,
                character_name TEXT NOT NULL,
                character_realm TEXT NOT NULL,
                source_channel_id TEXT,
                source_message_id TEXT,
                requested_by TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMPTZ,
                reviewed_by TEXT
            )`,
            `ALTER TABLE characters ADD COLUMN spec_name TEXT`,
            `ALTER TABLE characters ADD COLUMN locked_until TIMESTAMPTZ`,
            `ALTER TABLE characters ADD COLUMN locked_by_event TEXT`,
            `ALTER TABLE characters ADD COLUMN last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
            `ALTER TABLE events ADD COLUMN balance_pool INTEGER DEFAULT 0`,
            `ALTER TABLE events ADD COLUMN min_item_level INTEGER DEFAULT 0`,
            `ALTER TABLE events ADD COLUMN min_rio_score INTEGER DEFAULT 0`,
            `ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'raid'`,
            `ALTER TABLE events ADD COLUMN event_difficulty TEXT`,
            `ALTER TABLE events ADD COLUMN raid_boost_type TEXT DEFAULT 'vip'`,
            `ALTER TABLE events ADD COLUMN client_limit INTEGER DEFAULT 0`,
            `ALTER TABLE events ADD COLUMN cut_treasury_rate DOUBLE PRECISION`,
            `ALTER TABLE events ADD COLUMN cut_advertiser_rate DOUBLE PRECISION`,
            `ALTER TABLE events ADD COLUMN cut_booster_rate DOUBLE PRECISION`,
            `ALTER TABLE tickets ADD COLUMN boost_type TEXT`,
            `ALTER TABLE tickets ADD COLUMN event_id TEXT`,
            `ALTER TABLE tickets ADD COLUMN boost_label TEXT`,
            `ALTER TABLE tickets ADD COLUMN boost_runs TEXT`,
            `ALTER TABLE tickets ADD COLUMN client_character_name TEXT`,
            `ALTER TABLE tickets ADD COLUMN client_character_realm TEXT`,
            `ALTER TABLE tickets ADD COLUMN requested_class TEXT`,
            `ALTER TABLE tickets ADD COLUMN requested_role TEXT`,
            `ALTER TABLE tickets ADD COLUMN boost_key_level INTEGER`,
            `ALTER TABLE tickets ADD COLUMN boost_amount INTEGER DEFAULT 1`,
            `ALTER TABLE tickets ADD COLUMN boost_scheduled_date TIMESTAMPTZ`,
            `ALTER TABLE tickets ADD COLUMN approval_status TEXT DEFAULT 'pending'`,
            `ALTER TABLE tickets ADD COLUMN approved_at TIMESTAMPTZ`,
            `ALTER TABLE tickets ADD COLUMN approved_by TEXT`,
            `ALTER TABLE tickets ADD COLUMN settled_gold INTEGER`,
            `ALTER TABLE character_weekly_locks ADD COLUMN event_type TEXT DEFAULT 'raid'`,
            `ALTER TABLE character_weekly_locks ADD COLUMN lock_scope TEXT`,
            `ALTER TABLE booster_applications ADD COLUMN battletag TEXT`,
            `ALTER TABLE booster_applications ADD COLUMN last_season_rio DOUBLE PRECISION`,
            `ALTER TABLE booster_applications ADD COLUMN previous_communities TEXT`,
            `ALTER TABLE booster_applications ADD COLUMN years_playing INTEGER`,
            `ALTER TABLE booster_applications ADD COLUMN years_boosting INTEGER`,
            `ALTER TABLE booster_applications ADD COLUMN registered_characters TEXT`,
            `ALTER TABLE event_applications ADD COLUMN listing_channel_id TEXT`,
            `ALTER TABLE event_applications ADD COLUMN listing_message_id TEXT`,
            `CREATE TABLE IF NOT EXISTS channel_visibility_rules (
                id BIGSERIAL PRIMARY KEY,
                role_id TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                allow_view BOOLEAN DEFAULT TRUE,
                allow_send BOOLEAN DEFAULT FALSE,
                allow_history BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_by TEXT,
                UNIQUE (role_id, target_type, target_id)
            )`,
            `ALTER TABLE booster_applications ALTER COLUMN last_season_rio TYPE DOUBLE PRECISION USING last_season_rio::DOUBLE PRECISION`,
            `ALTER TABLE booster_applications ALTER COLUMN rio_score TYPE DOUBLE PRECISION USING rio_score::DOUBLE PRECISION`,
            `ALTER TABLE booster_applications ALTER COLUMN item_level TYPE DOUBLE PRECISION USING item_level::DOUBLE PRECISION`,
            `ALTER TABLE characters ALTER COLUMN item_level TYPE DOUBLE PRECISION USING item_level::DOUBLE PRECISION`,
            `ALTER TABLE characters ALTER COLUMN rio_score TYPE DOUBLE PRECISION USING rio_score::DOUBLE PRECISION`,
            `CREATE INDEX IF NOT EXISTS idx_characters_booster_lower_name_realm ON characters (booster_id, LOWER(character_name), LOWER(character_realm))`,
            `CREATE INDEX IF NOT EXISTS idx_selection_cancel_requests_status ON selection_cancel_requests (status, event_id, booster_id)`,
            `CREATE INDEX IF NOT EXISTS idx_channel_visibility_rules_role ON channel_visibility_rules (role_id, target_type, target_id)`,
        ];

        for (const migration of migrations) {
            try {
                await executor.query(migration);
            } catch (error) {
                if (!['42701', '42P07', '42804'].includes(error.code)) {
                    console.warn('Migration warning:', error.message);
                }
            }
        }
    }

    async cleanupCaseVariantCharacterDuplicates(client = null) {
        const executor = client || this.ensurePool();

        try {
            const result = await executor.query(`
                SELECT id, booster_id, character_name, character_realm, class_name, spec_name, item_level, rio_score, last_updated, registered_at
                FROM characters
                ORDER BY
                    booster_id ASC,
                    LOWER(character_name) ASC,
                    LOWER(character_realm) ASC,
                    last_updated DESC NULLS LAST,
                    registered_at ASC NULLS LAST,
                    id ASC
            `);

            const groups = new Map();
            for (const row of result.rows) {
                const key = `${row.booster_id}|${String(row.character_name).toLowerCase()}|${String(row.character_realm).toLowerCase()}`;
                const group = groups.get(key) || [];
                group.push(row);
                groups.set(key, group);
            }

            let mergedGroups = 0;
            let removedRows = 0;

            for (const group of groups.values()) {
                if (group.length <= 1) {
                    continue;
                }

                const canonical = group[0];
                const duplicateIds = group.slice(1).map(entry => entry.id);

                await executor.query(
                    `UPDATE character_weekly_locks
                     SET character_name = $1, character_realm = $2
                     WHERE booster_id = $3
                     AND LOWER(character_name) = LOWER($4)
                     AND LOWER(character_realm) = LOWER($5)`,
                    [canonical.character_name, canonical.character_realm, canonical.booster_id, canonical.character_name, canonical.character_realm]
                );

                await executor.query(
                    `UPDATE event_applications
                     SET character_name = $1, character_realm = $2
                     WHERE booster_id = $3
                     AND LOWER(character_name) = LOWER($4)
                     AND LOWER(character_realm) = LOWER($5)`,
                    [canonical.character_name, canonical.character_realm, canonical.booster_id, canonical.character_name, canonical.character_realm]
                );

                await executor.query(
                    `UPDATE selection_cancel_requests
                     SET character_name = $1, character_realm = $2
                     WHERE booster_id = $3
                     AND LOWER(character_name) = LOWER($4)
                     AND LOWER(character_realm) = LOWER($5)`,
                    [canonical.character_name, canonical.character_realm, canonical.booster_id, canonical.character_name, canonical.character_realm]
                );

                await executor.query(
                    `UPDATE booster_applications
                     SET character_name = $1, character_realm = $2
                     WHERE applicant_id = $3
                     AND LOWER(character_name) = LOWER($4)
                     AND LOWER(character_realm) = LOWER($5)`,
                    [canonical.character_name, canonical.character_realm, canonical.booster_id, canonical.character_name, canonical.character_realm]
                );

                const boosterApplications = await executor.query(
                    `SELECT id, registered_characters
                     FROM booster_applications
                     WHERE applicant_id = $1
                     AND registered_characters IS NOT NULL`,
                    [canonical.booster_id]
                );

                for (const application of boosterApplications.rows) {
                    try {
                        const parsed = JSON.parse(application.registered_characters);
                        if (!Array.isArray(parsed)) {
                            continue;
                        }

                        let changed = false;
                        const updatedCharacters = parsed.map(entry => {
                            if (!entry?.characterName || !entry?.characterRealm) {
                                return entry;
                            }

                            if (
                                String(entry.characterName).toLowerCase() === String(canonical.character_name).toLowerCase()
                                && String(entry.characterRealm).toLowerCase() === String(canonical.character_realm).toLowerCase()
                            ) {
                                changed = true;
                                return {
                                    ...entry,
                                    characterName: canonical.character_name,
                                    characterRealm: canonical.character_realm,
                                };
                            }

                            return entry;
                        });

                        if (changed) {
                            await executor.query(
                                `UPDATE booster_applications SET registered_characters = $1 WHERE id = $2`,
                                [JSON.stringify(updatedCharacters), application.id]
                            );
                        }
                    } catch {
                        // Keep malformed historical JSON untouched.
                    }
                }

                await executor.query(`DELETE FROM characters WHERE id = ANY($1::bigint[])`, [duplicateIds]);
                mergedGroups++;
                removedRows += duplicateIds.length;
            }

            if (mergedGroups > 0) {
                console.log(`Merged ${removedRows} duplicate character row(s) across ${mergedGroups} case-insensitive group(s).`);
            }
        } catch (error) {
            console.warn('Character duplicate cleanup warning:', error.message);
        }
    }

    async ensureCharacterCaseInsensitiveUniqueIndex(client = null) {
        const executor = client || this.ensurePool();

        try {
            await executor.query(
                `CREATE UNIQUE INDEX IF NOT EXISTS uniq_characters_booster_lower_name_realm
                 ON characters (booster_id, LOWER(character_name), LOWER(character_realm))`
            );
        } catch (error) {
            console.warn('Character unique index warning:', error.message);
        }
    }

    async run(sql, params = []) {
        const result = await this.query(sql, params);
        return {
            lastID: result.rows?.[0]?.id || null,
            changes: result.rowCount,
            rows: result.rows,
        };
    }

    async get(sql, params = []) {
        const result = await this.query(sql, params);
        return result.rows[0];
    }

    async all(sql, params = []) {
        const result = await this.query(sql, params);
        return result.rows;
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isInitialized = false;
        }
    }
}

const db = new Database();
module.exports = db;
