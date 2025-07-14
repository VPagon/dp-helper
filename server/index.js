const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sql = require('mssql');
require('dotenv').config({ path: `${__dirname}/.env` }); // Adjust path if needed

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create a connection pool cache
const poolCache = new Map();

const dbConfig = (environment) => {
	// Helper function to get env var or throw meaningful error
	const getEnv = (key) => {
		const value = process.env[key];
		if (!value) throw new Error(`Missing environment variable: ${key}`);
		return value;
	};

	// Handle simple environments (dev, prod) - metadata databases
	if (['dev', 'prod'].includes(environment)) {
		try {
			return {
				server: getEnv(`${environment.toUpperCase()}_METADATA_DB_SERVER`),
				database: getEnv(`${environment.toUpperCase()}_METADATA_DB_NAME`),
				user: getEnv(`${environment.toUpperCase()}_METADATA_DB_USER`),
				password: getEnv(`${environment.toUpperCase()}_METADATA_DB_PASSWORD`),
				options: {
					encrypt: true,
					trustServerCertificate: false,
					requestTimeout: 60000,
				},
				pool: {
					max: 10,
					min: 0,
					idleTimeoutMillis: 30000
				}
			};
		} catch (err) {
			throw new Error(`Metadata configuration error for ${environment}: ${err.message}`);
		}
	}

	// Handle compound environments (dev-mes, prod-itac, etc.)
	if (environment.includes('-')) {
		const [env, dbType] = environment.split('-');
		try {
			return {
				server: getEnv(`${env.toUpperCase()}_${dbType.toUpperCase()}_DB_SERVER`),
				database: getEnv(`${env.toUpperCase()}_${dbType.toUpperCase()}_DB_NAME`),
				user: getEnv(`${env.toUpperCase()}_${dbType.toUpperCase()}_DB_USER`),
				password: getEnv(`${env.toUpperCase()}_${dbType.toUpperCase()}_DB_PASSWORD`),
				options: {
					encrypt: true,
					trustServerCertificate: false,
					requestTimeout: 60000,
				},
				pool: {
					max: 10,
					min: 0,
					idleTimeoutMillis: 30000
				}
			};
		} catch (err) {
			throw new Error(`Configuration error for ${environment}: ${err.message}`);
		}
	}

	throw new Error(`Invalid environment format: ${environment}. Expected 'dev', 'prod', or format like 'dev-mes'`);
};


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
		poolCache.set(environment, pool.connect());
	}

	return poolCache.get(environment);
}

// API endpoint
app.post('/api/query', async (req, res) => {
	const { environment, query } = req.body;

	try {
		// Get the connection pool
		const poolPromise = getPool(environment);
		const pool = await poolPromise;

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
			rows: result.recordset.map(row => Object.values(row))
		});
	} catch (err) {
		console.error("Database error:", err);
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

app.get('/api/test-config', (req, res) => {
	try {
		const devConfig = dbConfig('dev');
		const devMesConfig = dbConfig('dev-mes');
		res.json({
			success: true,
			devConfig: { ...devConfig, password: '*****' },
			devMesConfig: { ...devMesConfig, password: '*****' }
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Close all pools on shutdown
process.on('SIGINT', async () => {
	await Promise.all(
		Array.from(poolCache.values()).map(poolPromise =>
			poolPromise.then(pool => pool.close()).catch(console.error)
		)
	);
	process.exit(0);
});

const PORT = 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));