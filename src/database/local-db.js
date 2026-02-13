// src/database/local-db.js - FIXED VERSION
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class LocalDatabase {
    constructor(dbPath = './local-data.db') {
        this.dbPath = path.join(__dirname, '../../', dbPath);
        this.db = null;
        this.initializeDatabase();
    }

    initializeDatabase() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Create database connection
            this.db = new Database(this.dbPath);

            // Enable WAL mode for better concurrency and performance
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('synchronous = NORMAL');

            console.log('✅ Connected to SQLite database at:', this.dbPath);

            // Create tables
            this.createTables();

        } catch (err) {
            console.error('❌ Error opening database:', err.message);
            throw err;
        }
    }

    createTables() {
        const statements = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Application data table (for key-value storage)
            `CREATE TABLE IF NOT EXISTS app_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                data_type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Query logs for audit
            `CREATE TABLE IF NOT EXISTS query_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                environment TEXT,
                success BOOLEAN,
                error_message TEXT,
                execution_time_ms INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Generic data table (for any structured data)
            `CREATE TABLE IF NOT EXISTS dp_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cache_key TEXT UNIQUE NOT NULL,
                cache_value TEXT NOT NULL,
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Settings table
            `CREATE TABLE IF NOT EXISTS dp_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        // Create triggers for updated_at
        const triggers = [
            `CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
             AFTER UPDATE ON users 
             BEGIN
                UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
             END`,

            `CREATE TRIGGER IF NOT EXISTS update_app_data_timestamp 
             AFTER UPDATE ON app_data 
             BEGIN
                UPDATE app_data SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
             END`,

            `CREATE TRIGGER IF NOT EXISTS update_dp_settings_timestamp 
             AFTER UPDATE ON dp_settings 
             BEGIN
                UPDATE dp_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
             END`
        ];

        // Run all statements
        [...statements, ...triggers].forEach(sql => {
            try {
                this.db.prepare(sql).run();
            } catch (err) {
                console.error('Error executing SQL:', err.message);
            }
        });

        console.log('✅ Database tables created/verified');
    }

    query(sql, params = []) {
        const startTime = Date.now();

        try {
            // Clean and validate SQL - reject GraphQL queries
            const cleanedSql = sql.trim();

            // Check if it's a GraphQL query (starts with "query" or has GraphQL patterns)
            if (this._isGraphQLQuery(cleanedSql)) {
                throw new Error('GraphQL queries are not supported. Please use SQL queries only.');
            }

            // Log the query (excluding query_logs inserts to avoid recursion)
            const shouldLog = !cleanedSql.includes('query_logs');

            let result;
            const sqlUpper = cleanedSql.toUpperCase();

            if (sqlUpper.startsWith('SELECT') || sqlUpper.startsWith('PRAGMA')) {
                const stmt = this.db.prepare(cleanedSql);
                const rows = stmt.all(...params);

                result = {
                    rows,
                    rowCount: rows.length,
                    columns: rows.length > 0 ? Object.keys(rows[0]) : []
                };
            } else if (sqlUpper.startsWith('INSERT') || sqlUpper.startsWith('UPDATE') ||
                sqlUpper.startsWith('DELETE') || sqlUpper.startsWith('CREATE') ||
                sqlUpper.startsWith('DROP') || sqlUpper.startsWith('ALTER')) {
                const stmt = this.db.prepare(cleanedSql);
                const info = stmt.run(...params);

                result = {
                    lastID: info.lastInsertRowid,
                    changes: info.changes
                };
            } else {
                throw new Error(`Unsupported SQL operation. Query must start with SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, or PRAGMA`);
            }

            const executionTime = Date.now() - startTime;

            // Log the query
            if (shouldLog) {
                this._logQuery(cleanedSql, 'local', true, null, executionTime);
            }

            return result;

        } catch (err) {
            const executionTime = Date.now() - startTime;
            this._logQuery(sql, 'local', false, err.message, executionTime);
            throw err;
        }
    }

    _isGraphQLQuery(sql) {
        const lowerSql = sql.toLowerCase();
        return (
            lowerSql.includes('query ') ||
            lowerSql.includes('mutation ') ||
            lowerSql.includes('subscription ') ||
            lowerSql.includes('__schema') ||
            lowerSql.includes('__type') ||
            lowerSql.includes('...fragment') ||
            lowerSql.includes('fragment ') ||
            lowerSql.trim().startsWith('{') ||
            lowerSql.trim().endsWith('}')
        );
    }

    _logQuery(query, environment, success, errorMessage, executionTime) {
        try {
            // Truncate very long queries for logging
            const truncatedQuery = query.length > 1000 ? query.substring(0, 1000) + '... [truncated]' : query;

            const stmt = this.db.prepare(
                'INSERT INTO query_logs (query, environment, success, error_message, execution_time_ms) VALUES (?, ?, ?, ?, ?)'
            );
            stmt.run(truncatedQuery, environment, success ? 1 : 0, errorMessage, executionTime);
        } catch (err) {
            console.error('Error logging query:', err.message);
        }
    }

    async getTables() {
        try {
            // Use single quotes for string literals
            const result = this.query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            );
            return result.rows.map(row => row.name);
        } catch (err) {
            console.error('Error getting tables:', err);
            return [];
        }
    }

    async getTableSchema(tableName) {
        try {
            // Use backticks or quotes for table names with special characters
            const sanitizedTableName = this._sanitizeTableName(tableName);
            return this.query(`PRAGMA table_info(${sanitizedTableName})`);
        } catch (err) {
            console.error(`Error getting schema for ${tableName}:`, err);
            throw err;
        }
    }

    _sanitizeTableName(tableName) {
        // If table name contains special characters or spaces, wrap in backticks
        if (/[^a-zA-Z0-9_]/.test(tableName)) {
            return `\`${tableName}\``;
        }
        return tableName;
    }

    insert(table, data) {
        const sanitizedTable = this._sanitizeTableName(table);
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');

        const sql = `INSERT INTO ${sanitizedTable} (${keys.join(', ')}) VALUES (${placeholders})`;
        const result = this.query(sql, values);

        return {
            success: true,
            id: result.lastID,
            changes: result.changes
        };
    }

    update(table, data, whereClause, whereParams = []) {
        const sanitizedTable = this._sanitizeTableName(table);
        const setClause = Object.keys(data)
            .map(key => `${key} = ?`)
            .join(', ');

        const values = [...Object.values(data), ...whereParams];
        const sql = `UPDATE ${sanitizedTable} SET ${setClause} WHERE ${whereClause}`;

        const result = this.query(sql, values);
        return {
            success: true,
            changes: result.changes
        };
    }

    delete(table, whereClause, whereParams = []) {
        const sanitizedTable = this._sanitizeTableName(table);
        const sql = `DELETE FROM ${sanitizedTable} WHERE ${whereClause}`;
        const result = this.query(sql, whereParams);
        return {
            success: true,
            changes: result.changes
        };
    }

    // Helper methods for key-value storage - FIXED with single quotes
    async setValue(key, value, dataType = 'text') {
        try {
            // Use CURRENT_TIMESTAMP instead of datetime("now")
            const updateResult = this.query(
                'UPDATE app_data SET value = ?, data_type = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
                [value, dataType, key]
            );

            // If no rows were updated, insert new
            if (updateResult.changes === 0) {
                this.query(
                    'INSERT INTO app_data (key, value, data_type) VALUES (?, ?, ?)',
                    [key, value, dataType]
                );
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getValue(key) {
        try {
            const result = this.query(
                'SELECT value, data_type FROM app_data WHERE key = ?',
                [key]
            );

            if (result.rowCount === 0) {
                return { success: false, error: 'Key not found' };
            }

            return {
                success: true,
                value: result.rows[0].value,
                dataType: result.rows[0].data_type
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // Cache methods - FIXED with single quotes
    async setCache(key, value, ttlSeconds = 3600) {
        try {
            const expiresAt = ttlSeconds > 0
                ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
                : null;

            // Delete old cache if exists
            this.query('DELETE FROM dp_cache WHERE cache_key = ?', [key]);

            // Insert new cache
            this.query(
                'INSERT INTO dp_cache (cache_key, cache_value, expires_at) VALUES (?, ?, ?)',
                [key, value, expiresAt]
            );

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getCache(key) {
        try {
            // Clean expired cache first - use CURRENT_TIMESTAMP
            this.query('DELETE FROM dp_cache WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP');

            const result = this.query(
                'SELECT cache_value FROM dp_cache WHERE cache_key = ?',
                [key]
            );

            if (result.rowCount === 0) {
                return { success: false, error: 'Cache key not found or expired' };
            }

            return {
                success: true,
                value: result.rows[0].cache_value
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // Database info
    async getInfo() {
        try {
            const tables = await this.getTables();
            const stats = this.query(
                'SELECT COUNT(*) as total_queries, AVG(execution_time_ms) as avg_time FROM query_logs'
            );

            // Get file size
            let fileSize = 'N/A';
            try {
                const stats = fs.statSync(this.dbPath);
                fileSize = `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
            } catch (err) {
                // Ignore
            }

            // Get database stats
            const tableCounts = {};
            for (const table of tables) {
                try {
                    const countResult = this.query(`SELECT COUNT(*) as count FROM ${this._sanitizeTableName(table)}`);
                    tableCounts[table] = countResult.rows[0]?.count || 0;
                } catch (err) {
                    tableCounts[table] = 'error';
                }
            }

            return {
                database: 'SQLite (better-sqlite3)',
                path: this.dbPath,
                tables,
                tableCounts,
                stats: stats.rows[0] || {},
                fileSize,
                walEnabled: true
            };
        } catch (err) {
            console.error('Error getting database info:', err);
            throw err;
        }
    }

    // Simple test query - FIXED with single quotes
    async testConnection() {
        try {
            const result = this.query("SELECT 1 + 1 as sum, CURRENT_TIMESTAMP as timestamp");
            return {
                success: true,
                result: result.rows[0]
            };
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    close() {
        try {
            if (this.db) {
                this.db.close();
                console.log('Database connection closed');
            }
        } catch (err) {
            console.error('Error closing database:', err.message);
            throw err;
        }
    }
}

// Singleton pattern with lazy initialization
let localDbInstance = null;

function getLocalDatabase() {
    if (!localDbInstance) {
        try {
            localDbInstance = new LocalDatabase();
            console.log('✅ Local database instance created');
        } catch (err) {
            console.error('❌ Failed to create local database instance:', err.message);
            throw err;
        }
    }
    return localDbInstance;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    if (localDbInstance) {
        localDbInstance.close();
    }
});

module.exports = { LocalDatabase, getLocalDatabase };