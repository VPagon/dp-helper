// migration-helper.js
const fs = require('fs');
const path = require('path');

class MigrationHelper {
    constructor(db) {
        this.db = db;
        this.migrationsDir = './migrations';
        this.ensureMigrationsTable();
    }

    ensureMigrationsTable() {
        const sql = `
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        this.db.query(sql);
    }

    async createMigration(name, sqlContent) {
        if (!fs.existsSync(this.migrationsDir)) {
            fs.mkdirSync(this.migrationsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const fileName = `${timestamp}_${name}.sql`;
        const filePath = path.join(this.migrationsDir, fileName);

        fs.writeFileSync(filePath, sqlContent);
        console.log(`Migration created: ${fileName}`);
        return fileName;
    }

    async runMigrations() {
        if (!fs.existsSync(this.migrationsDir)) {
            console.log('No migrations directory found');
            return;
        }

        const files = fs.readdirSync(this.migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        const applied = await this.db.query('SELECT name FROM migrations');
        const appliedNames = applied.rows.map(row => row.name);

        for (const file of files) {
            if (!appliedNames.includes(file)) {
                console.log(`Running migration: ${file}`);
                const sql = fs.readFileSync(path.join(this.migrationsDir, file), 'utf8');
                
                try {
                    await this.db.query(sql);
                    await this.db.query('INSERT INTO migrations (name) VALUES (?)', [file]);
                    console.log(`✓ Migration ${file} applied`);
                } catch (err) {
                    console.error(`✗ Migration ${file} failed:`, err.message);
                    throw err;
                }
            }
        }
    }
}

module.exports = MigrationHelper;