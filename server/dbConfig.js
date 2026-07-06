// Shared Azure SQL connection configuration, used by both the Express API (server/index.js)
// and the read-only MCP server (mcp-server/index.js) so credentials/environment
// definitions live in exactly one place.

// Connection configuration mapping
const CONNECTION_CONFIGS = {
	// Metadata databases
	'dev': {
		envPattern: ['DEV_METADATA_DB_SERVER', 'DEV_METADATA_DB_NAME', 'DEV_METADATA_DB_USER', 'DEV_METADATA_DB_PASSWORD'],
		type: 'metadata'
	},
	'prod': {
		envPattern: ['PROD_METADATA_DB_SERVER', 'PROD_METADATA_DB_NAME', 'PROD_METADATA_DB_USER', 'PROD_METADATA_DB_PASSWORD'],
		type: 'metadata'
	},
	'deploy': {
		envPattern: ['DEPLOY_DB_SERVER', 'DEPLOY_DB_NAME', 'DEPLOY_DB_USER', 'DEPLOY_DB_PASSWORD'],
		type: 'deploy'
	},

	// MES databases
	'dev-mes': {
		envPattern: ['DEV_MES_DB_SERVER', 'DEV_MES_DB_NAME', 'DEV_MES_DB_USER', 'DEV_MES_DB_PASSWORD'],
		type: 'mes'
	},
	'prod-mes': {
		envPattern: ['PROD_MES_DB_SERVER', 'PROD_MES_DB_NAME', 'PROD_MES_DB_USER', 'PROD_MES_DB_PASSWORD'],
		type: 'mes'
	},

	// ITAC databases
	'dev-itac': {
		envPattern: ['DEV_ITAC_DB_SERVER', 'DEV_ITAC_DB_NAME', 'DEV_ITAC_DB_USER', 'DEV_ITAC_DB_PASSWORD'],
		type: 'itac'
	},
	'prod-itac': {
		envPattern: ['PROD_ITAC_DB_SERVER', 'PROD_ITAC_DB_NAME', 'PROD_ITAC_DB_USER', 'PROD_ITAC_DB_PASSWORD'],
		type: 'itac'
	},

	// MES databases
	'dev-sig-etl': {
		envPattern: ['DEV_SIG_ETL_DB_SERVER', 'DEV_SIG_ETL_DB_NAME', 'DEV_SIG_ETL_DB_USER', 'DEV_SIG_ETL_DB_PASSWORD'],
		type: 'sig-etl'
	},
	'prod-sig-etl': {
		envPattern: ['PROD_SIG_ETL_DB_SERVER', 'PROD_SIG_ETL_DB_NAME', 'PROD_SIG_ETL_DB_USER', 'PROD_SIG_ETL_DB_PASSWORD'],
		type: 'sig-etl'
	},
	'dev-sqldb-kup-app': {
		envPattern: ['DEV_SQLDB_KUP_APP_SERVER', 'DEV_SQLDB_KUP_APP_NAME', 'DEV_SQLDB_KUP_APP_USER', 'DEV_SQLDB_KUP_APP_PASSWORD'],
		type: 'sqldb-kup-app'
	},
	'prod-sqldb-kup-app': {
		envPattern: ['PROD_SQLDB_KUP_APP_SERVER', 'PROD_SQLDB_KUP_APP_NAME', 'PROD_SQLDB_KUP_APP_USER', 'PROD_SQLDB_KUP_APP_PASSWORD'],
		type: 'sqldb-kup-app'
	},
};

// Helper function to get env var or throw meaningful error
const getEnv = (key) => {
	const value = process.env[key];
	if (!value) throw new Error(`Missing environment variable: ${key}`);
	return value;
};

const dbConfig = (environment) => {
	if (!CONNECTION_CONFIGS[environment]) {
		throw new Error(`Unknown environment: ${environment}. Available: ${Object.keys(CONNECTION_CONFIGS).join(', ')}`);
	}

	const config = CONNECTION_CONFIGS[environment];

	try {
		const [serverKey, databaseKey, userKey, passwordKey] = config.envPattern;

		return {
			server: getEnv(serverKey),
			database: getEnv(databaseKey),
			user: getEnv(userKey),
			password: getEnv(passwordKey),
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
};

module.exports = { CONNECTION_CONFIGS, getEnv, dbConfig };
