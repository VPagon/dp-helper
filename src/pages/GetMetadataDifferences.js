import React, { useState } from 'react';
import * as XLSX from 'xlsx'; // Add this import
import { executeQuery } from 'services/sqlService';
import '../styles/pages/GetMetadataDifferences.css';
import HomeButton from 'components/common/HomeButtom';

function GetMetadataDifferences() {
    const [environment, setEnvironment] = useState('deploy');
    const [query, setQuery] = useState(`select 
    'mda_dle_columns' as object, 
    column_name as object_key, 
    status, 
    diff, 
    diff_json, 
    pipeline_owner, 
    orchestrated
from mda.cmp_mda_dle_columns
where status in ('Missing on dev', 'Difference in data')
union all
select 
    'mda_dle_tables' as object, 
    key_dle_tbe as object_key, 
    status, 
    diff, 
    diff_json, 
    pipeline_owner, 
    orchestrated
from mda.cmp_mda_dle_tables
where status in ('Missing on dev', 'Difference in data')
union all
select 
    'mda_dle_jobs' as object, 
    job_name as object_key, 
    status, 
    diff, 
    diff_json, 
    pipeline_owner, 
    orchestrated
from mda.cmp_mda_dle_jobs
where status in ('Missing on dev', 'Difference in data')
union all
select 
    'mda_rdl_tables' as object, 
    key_rdl_tbe as object_key, 
    status, 
    diff, 
    diff_json, 
    pipeline_owner, 
    orchestrated
from mda.cmp_mda_rdl_tables
where status in ('Missing on dev', 'Difference in data')`);
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

    // Add this function to export data as XLSX
    const exportToExcel = () => {
        if (!results.rows.length) {
            alert('No data to export');
            return;
        }

        // Prepare data for Excel
        const excelData = [
            results.columns, // Header row
            ...results.rows // Data rows
        ];

        // Create a worksheet
        const ws = XLSX.utils.aoa_to_sheet(excelData);

        // Create a workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Metadata Differences");

        // Generate file and trigger download
        XLSX.writeFile(wb, "metadata_differences.xlsx");
    };

    return (
        <div className="query-metadata-page">
            <HomeButton />
            <br />
            <h1>Get Metadata Differences</h1>

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
                    <div className="results-header">
                        <h3>Differences:</h3>
                        {/* Add export button */}
                        {results.rows.length > 0 && (
                            <button
                                onClick={exportToExcel}
                                className="export-button"
                                title="Export to Excel"
                            >
                                Export to Excel
                            </button>
                        )}
                    </div>
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

export default GetMetadataDifferences;