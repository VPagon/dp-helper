require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sql = require('mssql');

const app = express();
app.use(cors());
app.use(bodyParser.json({
	strict: false, // Allow single quotes
	type: 'application/json' // Explicit content type
}));
app.use((err, req, res, next) => {
	if (err instanceof SyntaxError) {
		console.error('Bad JSON:', err);
		return res.status(400).json({ error: 'Invalid JSON format' });
	}
	next();
});

// Database config
const dbConfig = (env) => ({
	server:
		env === 'dev'
			? process.env.DEV_DB_SERVER
			: env === 'deploy'
				? process.env.DEPLOY_DB_SERVER
				: process.env.PROD_DB_SERVER,

	database:
		env === 'dev'
			? process.env.DEV_DB_NAME
			: env === 'deploy'
				? process.env.DEPLOY_DB_NAME
				: process.env.PROD_DB_NAME,

	user:
		env === 'dev'
			? process.env.DEV_DB_USER
			: env === 'deploy'
				? process.env.DEPLOY_DB_USER
				: process.env.PROD_DB_USER,

	password:
		env === 'dev'
			? process.env.DEV_DB_PASSWORD
			: env === 'deploy'
				? process.env.DEPLOY_DB_PASSWORD
				: process.env.PROD_DB_PASSWORD,

	options: {
		encrypt: true,
		trustServerCertificate: false,
		requestTimeout: 60000,
	},
});

// API endpoint
app.post('/api/query', async (req, res) => {
	const { environment, query } = req.body;
	console.log("Incoming request headers:", req.headers);
	console.log("Request body:", req.body);
	try {
		const config = dbConfig(environment);

		// Log the config here instead
		console.log(`DB Config for ${environment}:`, {
			server: config.server,
			database: config.database,
			user: config.user,
			password: config.password ? '*****' : 'undefined',
			options: config.options
		});

		const pool = await sql.connect(config);
		const result = await pool.request().query(query);

		// For UPDATE/INSERT/DELETE queries
		if (/^\s*(UPDATE|INSERT|DELETE)/i.test(query)) {
			return res.json({
				success: true,
				message: `Query executed successfully. Rows affected: ${result.rowsAffected}`,
				rowsAffected: result.rowsAffected
			});
		}

		// Extract column names from the first record
		// const columns = result.recordset.length > 0
		// 	? Object.keys(result.recordset[0])
		// 	: [];

		// For SELECT queries
		const responseData = {
			success: true,
			columns: result.recordset.length > 0 ? Object.keys(result.recordset[0]) : [],
			rows: result.recordset.map(row => Object.values(row))
		};

		// Log the response before sending it
		console.log("Response data:", responseData);

		// Send the response
		res.json(responseData);
	} catch (err) {
		console.error("Database error:", err);
		res.status(500).json({ 
			success: false,
			error: err.message 
		});
	} finally {
		sql.close();
	}
});

const PORT = 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));