// database-adapter.js - Abstract layer for easy migration
class DatabaseAdapter {
    constructor(config) {
        if (config.type === 'sqlite') {
            this.db = new SQLiteAdapter(config);
        } else if (config.type === 'postgres') {
            this.db = new PostgresAdapter(config);
        }
        // Add more adapters as needed
    }

    async query(sql, params) {
        return this.db.query(sql, params);
    }
}