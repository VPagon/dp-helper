const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
require('dotenv').config({ path: `${__dirname}/.env` });

const codeSnippetsStore = require('./codeSnippetsStore');
const { CONNECTION_CONFIGS, dbConfig } = require('./dbConfig');

const { getLocalDatabase } = require('../src/database/local-db');
// Initialize local database
let localDb;
try {
	localDb = getLocalDatabase();
	console.log('✅ Local SQLite database initialized');
} catch (err) {
	console.warn('⚠️  Local database not available:', err.message);
}


const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create a connection pool cache
const poolCache = new Map();

// Get or create a connection pool
async function getPool(environment) {
	if (!poolCache.has(environment)) {
		const config = dbConfig(environment);
		const pool = new sql.ConnectionPool(config);
		const close = pool.close.bind(pool);

		// Override pool.close to remove from cache
		pool.close = async () => {
			await close();
			poolCache.delete(environment);
		};

		// Store the connecting promise in cache
		poolCache.set(environment, pool.connect().catch(err => {
			// Remove from cache if connection fails
			poolCache.delete(environment);
			throw err;
		}));
	}

	return poolCache.get(environment);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
	res.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		connections: Array.from(poolCache.keys())
	});
});

// Get all available environments
app.get('/api/environments', (req, res) => {
	const environments = Object.keys(CONNECTION_CONFIGS).map(env => ({
		name: env,
		type: CONNECTION_CONFIGS[env].type,
		configured: CONNECTION_CONFIGS[env].envPattern.every(key => process.env[key])
	}));

	res.json({ success: true, environments });
});

// Test connection endpoint
app.post('/api/test-connection', async (req, res) => {
	const { environment } = req.body;

	try {
		const pool = await getPool(environment);
		const result = await pool.request().query('SELECT 1 as test');
		res.json({
			success: true,
			message: `Connection to ${environment} successful`,
			testResult: result.recordset[0]
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: `Connection test failed for ${environment}: ${err.message}`
		});
	}
});

// API endpoint
app.post('/api/query', async (req, res) => {
	const { environment, query } = req.body;

	console.log(query)

	if (!environment || !query) {
		return res.status(400).json({
			success: false,
			error: 'Missing environment or query parameters'
		});
	}

	try {
		// Get the connection pool
		const pool = await getPool(environment);
		const result = await pool.request().query(query);

		// For UPDATE/INSERT/DELETE queries
		if (/^\s*(UPDATE|INSERT|DELETE)/i.test(query)) {
			return res.json({
				success: true,
				message: `Query executed successfully. Rows affected: ${result.rowsAffected}`,
				rowsAffected: result.rowsAffected
			});
		}

		// For SELECT queries
		res.json({
			success: true,
			columns: result.recordset.length > 0 ? Object.keys(result.recordset[0]) : [],
			rows: result.recordset.map(row => Object.values(row)),
			rowCount: result.recordset.length
		});
	} catch (err) {
		console.error("Database error:", err);
		res.status(500).json({
			success: false,
			error: err.message,
			environment: environment
		});
	}
});

// Close all pools endpoint (for maintenance)
app.post('/api/close-connections', async (req, res) => {
	try {
		const environments = Array.from(poolCache.keys());
		await Promise.all(
			environments.map(env =>
				poolCache.get(env).then(pool => pool.close()).catch(console.error)
			)
		);
		poolCache.clear();

		res.json({
			success: true,
			message: `Closed connections for: ${environments.join(', ')}`
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Close all pools on shutdown
process.on('SIGINT', async () => {
	console.log('Shutting down gracefully...');

	// Close SQL Server connections
	await Promise.all(
		Array.from(poolCache.values()).map(poolPromise =>
			poolPromise.then(pool => pool.close()).catch(console.error)
		)
	);

	// Close local SQLite database
	if (localDb) {
		try {
			localDb.close();
			console.log('Local database closed');
		} catch (err) {
			console.error('Error closing local database:', err);
		}
	}

	process.exit(0);
});


app.post('/api/local/query', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	const { query, params = [] } = req.body;

	if (!query || typeof query !== 'string') {
		return res.status(400).json({
			success: false,
			error: 'Query parameter is required and must be a string'
		});
	}

	try {
		const result = await localDb.query(query, params);

		// Check if it's a SELECT query
		const isSelect = query.trim().toUpperCase().startsWith('SELECT');

		if (isSelect) {
			res.json({
				success: true,
				data: result.rows,
				rowCount: result.rowCount,
				columns: result.columns,
				executionTime: 'logged'
			});
		} else {
			res.json({
				success: true,
				message: 'Query executed successfully',
				lastID: result.lastID,
				changes: result.changes
			});
		}
	} catch (err) {
		console.error("Local database error:", err);
		res.status(500).json({
			success: false,
			error: err.message,
			query: query.substring(0, 100) + (query.length > 100 ? '...' : '')
		});
	}
});

// Get all tables
app.get('/api/local/tables', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const tables = await localDb.getTables();
		res.json({
			success: true,
			tables
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

// Get table schema
app.get('/api/local/table/:tableName/schema', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const result = await localDb.getTableSchema(req.params.tableName);
		res.json({
			success: true,
			schema: result.rows
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

// Insert data helper
app.post('/api/local/insert/:table', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	const { data } = req.body;

	if (!data || typeof data !== 'object') {
		return res.status(400).json({
			success: false,
			error: 'Data object is required'
		});
	}

	try {
		const result = await localDb.insert(req.params.table, data);
		res.json(result);
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

// Query logs
app.get('/api/local/logs', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const result = await localDb.query(
			'SELECT * FROM query_logs ORDER BY created_at DESC LIMIT 100'
		);
		res.json({
			success: true,
			logs: result.rows
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

// Database info
app.get('/api/local/info', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const info = await localDb.getInfo();
		res.json({
			success: true,
			...info
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.get('/api/local/health', (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	res.json({
		success: true,
		message: 'Local SQLite database is running',
		timestamp: new Date().toISOString()
	});
});

app.post('/api/local/store/:key', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	const { value, dataType = 'text' } = req.body;

	if (value === undefined) {
		return res.status(400).json({
			success: false,
			error: 'Value is required'
		});
	}

	try {
		const result = await localDb.setValue(req.params.key, value, dataType);
		res.json(result);
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.get('/api/local/store/:key', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const result = await localDb.getValue(req.params.key);
		res.json(result);
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.post('/api/local/cache/:key', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	const { value, ttl = 3600 } = req.body;

	if (value === undefined) {
		return res.status(400).json({
			success: false,
			error: 'Value is required'
		});
	}

	try {
		const result = await localDb.setCache(req.params.key, value, ttl);
		res.json(result);
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.get('/api/local/cache/:key', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const result = await localDb.getCache(req.params.key);
		res.json(result);
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.get('/api/local/test', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		// Test connection with a simple query - FIXED with single quotes
		const result = await localDb.query("SELECT 1 + 1 as sum, CURRENT_TIMESTAMP as timestamp");

		// Get tables count
		const tables = await localDb.getTables();

		res.json({
			success: true,
			message: 'Local SQLite database is working correctly',
			testResult: result.rows[0],
			tables: tables.length,
			databaseType: 'SQLite (better-sqlite3)'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.get('/api/local/export', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const dbPath = localDb.dbPath;
		const stats = fs.statSync(dbPath);

		res.json({
			success: true,
			path: dbPath,
			size: `${(stats.size / 1024).toFixed(2)} KB`,
			created: stats.birthtime,
			modified: stats.mtime,
			downloadUrl: `/api/local/download`
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.get('/api/local/download', async (req, res) => {
	if (!localDb) {
		return res.status(503).json({
			success: false,
			error: 'Local database not available'
		});
	}

	try {
		const dbPath = localDb.dbPath;
		res.download(dbPath, 'local-backup.db', (err) => {
			if (err) {
				console.error('Error downloading database:', err);
			}
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});


// Code snippets — persisted in data/code-snippets.json on the host filesystem
app.get('/api/code-snippets', async (req, res) => {
	try {
		const snippets = codeSnippetsStore.getAllSnippets();
		res.json({ success: true, snippets });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/code-snippets', async (req, res) => {
	try {
		const record = await codeSnippetsStore.createSnippet(req.body || {});
		res.status(201).json({ success: true, snippet: record });
	} catch (err) {
		res.status(err.statusCode || 500).json({ success: false, error: err.message });
	}
});

app.put('/api/code-snippets/:id', async (req, res) => {
	try {
		const record = await codeSnippetsStore.updateSnippet(req.params.id, req.body || {});
		res.json({ success: true, snippet: record });
	} catch (err) {
		res.status(err.statusCode || 500).json({ success: false, error: err.message });
	}
});

app.delete('/api/code-snippets/:id', async (req, res) => {
	try {
		const result = await codeSnippetsStore.deleteSnippet(req.params.id);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(err.statusCode || 500).json({ success: false, error: err.message });
	}
});

app.post('/api/code-snippets/import', async (req, res) => {
	const { snippets } = req.body || {};

	if (!Array.isArray(snippets)) {
		return res.status(400).json({
			success: false,
			error: 'snippets array is required',
		});
	}

	try {
		const merged = await codeSnippetsStore.importSnippets(snippets);
		res.json({ success: true, snippets: merged });
	} catch (err) {
		res.status(err.statusCode || 500).json({ success: false, error: err.message });
	}
});

// Production: serve React build from the same process so /api/* and the SPA share one origin.
const buildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(buildPath)) {
	app.use(express.static(buildPath));
	app.get(/^\/(?!api\/).*/, (req, res) => {
		res.sendFile(path.join(buildPath, 'index.html'));
	});
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));