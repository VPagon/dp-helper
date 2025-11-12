const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sql = require('mssql');
require('dotenv').config({ path: `${__dirname}/.env` });

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create a connection pool cache
const poolCache = new Map();

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
  }
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
  await Promise.all(
    Array.from(poolCache.values()).map(poolPromise =>
      poolPromise.then(pool => pool.close()).catch(console.error)
    )
  );
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));