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
  server: env === 'dev' ? process.env.DEV_DB_SERVER : process.env.PROD_DB_SERVER,
  database: process.env.DEV_DB_NAME, // Same for both in your case
  user: process.env.DEV_DB_USER,
  password: env === 'dev' ? process.env.DEV_DB_PASSWORD : process.env.PROD_DB_PASSWORD,
  options: {
    encrypt: true, // Required for Azure
    trustServerCertificate: false
  }
});

// API endpoint
app.post('/api/query', async (req, res) => {
  const { environment, query } = req.body;
  console.log("Incoming request headers:", req.headers);
  console.log("Request body:", req.body);


  try {
    const pool = await sql.connect(dbConfig(environment));
    const result = await pool.request().query(query);
    
    // Extract column names from the first record
    const columns = result.recordset.length > 0 
      ? Object.keys(result.recordset[0])
      : [];

    res.json({
      columns, // Now guaranteed to be an array
      rows: result.recordset.map(row => Object.values(row))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    sql.close();
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));