import React, { useState } from 'react';
import '../styles/pages/_recreate-table.scss';
import HomeButton from '../components/common/HomeButtom';

function RecreateTablePage() {
  const [database, setDatabase] = useState('');
  const [table, setTable] = useState('');
  const [environment, setEnvironment] = useState('dev');
  const [path, setPath] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState('');

  const generateSQL = () => {
    try {
      // Transform database name to container format
      const container = database
        .replace(/^(\d{2})0_/, '$1-') // Keep first two digits, remove last zero, replace _ with -
        .split('_')[0]; // Take only the first part before any remaining underscores

      const location = `abfss://${container}@st0${environment}0rmc0dtp0we.dfs.core.windows.net/${path}`;
      
      const sql = `%%sql\ndrop table ${database}.${table};\ncreate table ${database}.${table} USING DELTA LOCATION "${location}";`;
      
      setGeneratedSQL(sql);
    } catch (error) {
      setGeneratedSQL(`Error: ${error.message}`);
    }
  };

  return (
    <div className="recreate-table-page">
      <HomeButton />
      <h1>Recreate Table</h1>
      <div className="input-section">
        <div className="form-group">
          <label>Database Name:</label>
          <input
            type="text"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            placeholder="e.g., 020_silver"
          />
        </div>
        <div className="form-group">
          <label>Table Name:</label>
          <input
            type="text"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="e.g., s_jira_dbo_jira_service_desk_tickets"
          />
        </div>
        <div className="form-group">
          <label>Environment:</label>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                value="dev"
                checked={environment === 'dev'}
                onChange={() => setEnvironment('dev')}
              />
              dev
            </label>
            <label>
              <input
                type="radio"
                value="prod"
                checked={environment === 'prod'}
                onChange={() => setEnvironment('prod')}
              />
              prod
            </label>
          </div>
        </div>
        <div className="form-group">
          <label>Path:</label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="e.g., 06_jira/01_rest/sze_servicedesk_tickets"
          />
        </div>
        <button onClick={generateSQL}>Generate SQL</button>
      </div>
      {generatedSQL && (
        <div className="output-section">
          <h2>Generated SQL:</h2>
          <pre className="sql-output">{generatedSQL}</pre>
          <button onClick={() => navigator.clipboard.writeText(generatedSQL)}>
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}

export default RecreateTablePage;