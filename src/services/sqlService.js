// src/services/sqlService.js
const sqlConfig = {
  dev: {
    server: 'sql-dev-rmc-dtp-we.database.windows.net',
    database: 'sqldb-metadata',
    username: 'sqlserveradmin',
    password: 'QYl/sYEgKA5EKJzxiea.8',
    driver: 'ODBC Driver 17 for SQL Server'
  },
  prod: {
    server: 'sql-prod-rmc-dtp-we.database.windows.net',
    database: 'sqldb-metadata',
    username: 'sqlserveradmin',
    password: '6P1+4I8+ASzK2.?hjk',
    driver: 'ODBC Driver 17 for SQL Server'
  }
};

export async function executeQuery(environment, query) {
  try {
    console.log("[DEBUG] Sending query:", { environment, query });

    const response = await fetch('http://localhost:5000/api/query', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        environment, 
        query 
      })
    });

    console.log("[DEBUG] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[DEBUG] Error response:", errorText);
      throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("[DEBUG] Response data:", data);
    // return data;
    
    // Ensure proper response structure
    return {
      columns: Array.isArray(data.columns) ? data.columns : [],
      rows: Array.isArray(data.rows) ? data.rows : []
    };
  } catch (err) {
    console.error("[DEBUG] Full error:", err);
    throw new Error(`API Error: ${err.message}`);
  }
}