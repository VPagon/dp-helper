import React, { useState } from 'react';
import HomeButton from '../components/common/HomeButtom';
import { logGeneratedQuery } from '../services/queryHistoryLogger';
import { detectSqlOperation } from '../utils/queryReverse';

function InsertDataPage() {
  const [tableName, setTableName] = useState('');
  const [inputData, setInputData] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState([]);

  const formatSqlValue = (value) => {
    if (value.toUpperCase() === 'NULL') {
      return 'NULL';
    } else if (/^\d+$/.test(value)) {
      return value;
    } else if (['Y', 'N', 'y', 'n'].includes(value)) {
      return `'${value.toUpperCase()}'`;
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
      return `'${value}'`;
    } else {
      const escaped = value.replace(/'/g, "''");
      return `'${escaped}'`;
    }
  };

  const generateInserts = () => {
    const EXCLUDED_COLUMNS = new Set([
      'date_last_modified',
      'dat_last_modified',
      'user_last_modified',
      'highest_watermark',
      'date_of_insert',
      'date_insert'
    ]);

    const lines = inputData.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      setGeneratedSQL(['Error: Input must have at least 2 lines (header + data)']);
      return;
    }

    const originalHeaders = lines[0].split('\t').map(h => h.trim());
    const includedIndices = [];
    const headers = [];

    for (let i = 0; i < originalHeaders.length; i++) {
      const header = originalHeaders[i].toLowerCase();
      if (!EXCLUDED_COLUMNS.has(header)) {
        headers.push(originalHeaders[i]);
        includedIndices.push(i);
      }
    }

    if (headers.length === 0) {
      setGeneratedSQL(['Error: No columns to insert after excluded columns filter']);
      return;
    }

    const results = [];

    for (let j = 1; j < lines.length; j++) {
      const values = lines[j].split('\t').map(v => v.trim());
      if (values.length !== originalHeaders.length) continue;

      const filteredValues = includedIndices.map(i => values[i]);
      const formattedValues = filteredValues.map(formatSqlValue);

      const columnsStr = headers.join(',\n\t');
      const valuesStr = formattedValues.join(',\n\t');

      results.push(`INSERT INTO ${tableName} (\n\t${columnsStr}) \nVALUES (\n\t${valuesStr});`);
    }

    if (results.length === 0) {
      setGeneratedSQL(['Error: No valid data rows found']);
      return;
    }

    setGeneratedSQL(results);
    const sql = results.join('\n\n');
    logGeneratedQuery({
      source: 'insert-data',
      environment: 'dev',
      sql,
      metadata: {
        operation: 'INSERT',
        tableName: tableName.trim(),
      },
    }).catch(() => {});
  };

  const logCopy = () => {
    const copyText = generatedSQL.join('\n\n');
    if (generatedSQL.length > 0 && !generatedSQL[0].startsWith('Error:')) {
      logGeneratedQuery({
        source: 'insert-data',
        environment: 'dev',
        sql: copyText,
        metadata: {
          operation: detectSqlOperation(copyText),
          tableName: tableName.trim(),
        },
      }).catch(() => {});
    }
    navigator.clipboard.writeText(copyText);
  };

  return (
    <div className="insert-data-page">
      <HomeButton />
      <h1>Insert Data</h1>
      <div className="input-section">
        <div className="form-group">
          <label>Table Name (schema.table):</label>
          <input
            type="text"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g., dbo.customers"
          />
        </div>
        <div className="form-group">
          <label>Paste tab-separated data (first line = headers):</label>
          <textarea
            value={inputData}
            onChange={(e) => setInputData(e.target.value)}
            rows={10}
            placeholder="dq_ise_log_id	dq_batch_id	dq_rle_id	rule_name	dq_tbe_id&#10;191849	1143	5	Custom rule conditions	1387"
          />
        </div>
        <button onClick={generateInserts}>Generate SQL</button>
      </div>
      {generatedSQL.length > 0 && (
        <div className="output-section">
          <h2>Generated SQL:</h2>
          <div className="sql-output">
            {generatedSQL.map((sql, index) => (
              <pre key={index}>{sql}</pre>
            ))}
          </div>
          <button onClick={logCopy}>
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}

export default InsertDataPage;