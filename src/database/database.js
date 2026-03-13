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
                    status TEXT DEFAULT 'open',
                    min_item_level INTEGER DEFAULT 0,
                    min_rio_score INTEGER DEFAULT 0,
                    client_limit INTEGER DEFAULT 0,
                    balance_pool INTEGER DEFAULT 0,
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
                    status TEXT DEFAULT 'pending',
                    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    approved_at TIMESTAMPTZ,
                    approved_by TEXT
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
                    character_name TEXT NOT NULL,
                    character_realm TEXT NOT NULL,
                    experience TEXT,
                    rio_score INTEGER,
                    item_level INTEGER,
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
                    item_level INTEGER,
                    rio_score INTEGER,
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
            await client.query(`CREATE INDEX IF NOT EXISTS idx_event_applications_event ON event_applications (event_id, status)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id, timestamp)`);

            await this.runMigrations(client);
            this.isInitialized = true;
            console.log('Connected to PostgreSQL database');
        } finally {
            client.release();
        }
    }

    async runMigrations(client = null) {
        const executor = client || this.ensurePool();
        const migrations = [
            `ALTER TABLE characters ADD COLUMN spec_name TEXT`,
            `ALTER TABLE characters ADD COLUMN locked_until TIMESTAMPTZ`,
            `ALTER TABLE characters ADD COLUMN locked_by_event TEXT`,
            `ALTER TABLE characters ADD COLUMN last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
            `ALTER TABLE events ADD COLUMN balance_pool INTEGER DEFAULT 0`,
            `ALTER TABLE events ADD COLUMN min_item_level INTEGER DEFAULT 0`,
            `ALTER TABLE events ADD COLUMN min_rio_score INTEGER DEFAULT 0`,
            `ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'raid'`,
            `ALTER TABLE events ADD COLUMN client_limit INTEGER DEFAULT 0`,
            `ALTER TABLE tickets ADD COLUMN boost_type TEXT`,
            `ALTER TABLE tickets ADD COLUMN event_id TEXT`,
            `ALTER TABLE tickets ADD COLUMN boost_label TEXT`,
            `ALTER TABLE tickets ADD COLUMN requested_class TEXT`,
            `ALTER TABLE tickets ADD COLUMN requested_role TEXT`,
            `ALTER TABLE tickets ADD COLUMN boost_key_level INTEGER`,
            `ALTER TABLE tickets ADD COLUMN boost_amount INTEGER DEFAULT 1`,
            `ALTER TABLE tickets ADD COLUMN boost_scheduled_date TIMESTAMPTZ`,
            `ALTER TABLE tickets ADD COLUMN approval_status TEXT DEFAULT 'pending'`,
            `ALTER TABLE tickets ADD COLUMN approved_at TIMESTAMPTZ`,
            `ALTER TABLE tickets ADD COLUMN approved_by TEXT`,
            `ALTER TABLE tickets ADD COLUMN settled_gold INTEGER`,
        ];

        for (const migration of migrations) {
            try {
                await executor.query(migration);
            } catch (error) {
                if (error.code !== '42701') {
                    console.warn('Migration warning:', error.message);
                }
            }
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
