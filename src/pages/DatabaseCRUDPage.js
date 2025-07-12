// DatabaseCRUDPage.js
import React, { useState } from 'react';
import TableSearch from '../components/common/TableSearch';
import ResultsTable from '../components/common/ResultsTable';
import RowEditor from '../components/common/RowEditor';
import HomeButton from '../components/common/HomeButtom';
import { executeQuery } from 'services/sqlService';
import '../styles/pages/_database-crud.scss';

export default function DatabaseCRUDPage() {
    const [results, setResults] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);
    const [error, setError] = useState(null);
    const [tableName, setTableName] = useState('');
    const [environment, setEnvironment] = useState('dev');

    const handleSearchResults = (data) => {
        setResults(data);
        setSelectedRow(null);
        setError(null);
        setTableName(data.tableName);
        setEnvironment(data.environment);

        // More robust table name extraction
        const fromIndex = data.query.toUpperCase().indexOf(' FROM ');
        if (fromIndex !== -1) {
            const afterFrom = data.query.slice(fromIndex + 6);
            const tableName = afterFrom.split(/[\s,;]/)[0].trim();
            setTableName(tableName);
        } else {
            setTableName('');
            console.error("Could not extract table name from query:", data.query);
        }
    };

    const handleUpdate = async (updateQuery) => {
        try {
            setError(null);
            
            // 1. Execute the update query
            const updateResult = await executeQuery(environment, updateQuery);
            
            if (!updateResult.success) {
            throw new Error(updateResult.message || 'Update failed');
            }

            // 2. Re-fetch the data using the original query
            try {
            const refreshResponse = await executeQuery(environment, results.query);
            
            // 3. Update the UI with refreshed data
            setResults({
                columns: refreshResponse.columns || results.columns,
                rows: refreshResponse.rows || results.rows,
                environment,
                tableName,
                query: results.query
            });
            
            return true; // Indicate success
            } catch (refreshError) {
            // The update worked but refresh failed - show warning but not error
            setError(`Update succeeded but refresh failed: ${refreshError.message}`);
            return true;
            }
            
        } catch (err) {
            setError(`Update failed: ${err.message}`);
            return false;
        }
        };


    return (
        <div className="database-crud-page">
            <HomeButton />
            <h1>Database CRUD Interface</h1>

            {/* Show current environment */}
            <div className="current-environment">
            Current Environment: <strong>{environment.toUpperCase()}</strong>
            </div>

            <TableSearch
                onResults={handleSearchResults}
                onError={setError}
            />

            {error && <div className="error-message">{error}</div>}

            {results?.rows && results?.columns && (
                <div className="results-container">
                    <ResultsTable
                    columns={results.columns}
                    rows={results.rows}
                    onRowSelect={setSelectedRow}
                    />
                </div>
                )}

            {selectedRow && (
                <RowEditor
                    row={selectedRow}
                    columns={results.columns}
                    tableName={tableName}
                    onClose={() => setSelectedRow(null)}
                    onUpdate={handleUpdate}
                />
            )}
        </div>
    );
}