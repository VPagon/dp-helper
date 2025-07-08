// src/pages/QueryMetadataPage.js
import React, { useState } from 'react';
import { executeQuery } from '../services/sqlService';
import '../styles/pages/QueryMetadataPage.css';
import HomeButton from '../components/common/HomeButtom';

function QueryMetadataPage() {
  const [environment, setEnvironment] = useState('dev');
  const [query, setQuery] = useState('SELECT TOP 10 * FROM dbo.d_kup_employees');
  const [results, setResults] = useState({
        columns: [],
        rows: []
    });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleExecute = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await executeQuery(environment, query);
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="query-metadata-page">
      <HomeButton />
      <br />
      <h1>Query Metadata Database</h1>
      
      <div className="connection-settings">
        <div className="form-group">
          <label>Environment:</label>
          <select 
            value={environment} 
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="dev">Development</option>
            <option value="prod">Production</option>
          </select>
        </div>
      </div>

      <div className="query-input">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your SQL query here..."
          rows={8}
        />
        <button onClick={handleExecute} disabled={loading}>
          {loading ? 'Executing...' : 'Execute Query'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {results && (
        <div className="query-results">
            <h3>Results</h3>
            <div className="results-table">
            <table>
                <thead>
                <tr>
                    {/* Safely handle columns */}
                    {Array.isArray(results.columns) && results.columns.map((col, i) => (
                    <th key={i}>{col}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {/* Safely handle rows */}
                {Array.isArray(results.rows) && results.rows.map((row, i) => (
                    <tr key={i}>
                    {Array.isArray(row) ? (
                        row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                        ))
                    ) : (
                        <td colSpan={results.columns.length}>Invalid row data</td>
                    )}
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
            {results.rows.length === 0 && (
            <p>No results found</p>
            )}
        </div>
        )}
    </div>
  );
}

export default QueryMetadataPage;