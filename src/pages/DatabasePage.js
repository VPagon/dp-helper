import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { executeQuery } from 'services/sqlService';
import '../styles/pages/DatabasePage.css';
import HomeButton from 'components/common/HomeButtom';

function DatabaseManagement() {
    const [environment, setEnvironment] = useState('dev');
    const [tables, setTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [filters, setFilters] = useState([]);
    const [results, setResults] = useState({
        columns: [],
        rows: []
    });
    const [editedData, setEditedData] = useState({});
    const [query, setQuery] = useState('');
    const [showPopup, setShowPopup] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Load available tables
    useEffect(() => {
        const fetchTables = async () => {
            try {
                setLoading(true);
                // Example API call to get tables - adjust based on your backend
                const data = await executeQuery(environment, "SELECT table_name FROM information_schema.tables WHERE table_schema='rep_mda' order by table_name");
                setTables(data.rows.map(row => row[0]));
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchTables();
    }, [environment]);

    // Execute query when table or filters change
    useEffect(() => {
        if (selectedTable) {
            executeTableQuery();
        }
    }, [selectedTable, filters]);

    const executeTableQuery = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const whereClause = filters.length > 0 ? ` WHERE ${filters.join(' AND ')}` : '';
            const sql = `SELECT TOP 20 * FROM rep_mda.${selectedTable}${whereClause}`;

            const data = await executeQuery(environment, sql);
            setResults(data);
            setQuery(sql); // Store the executed query
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [environment, selectedTable, filters]); // All dependencies the function uses

    const handleTableSelect = (table) => {
        setSelectedTable(table);
        setFilters([]);
    };

    const handleAddFilter = (filter) => {
        setFilters([...filters, filter]);
    };

    const handleRemoveFilter = (index) => {
        const newFilters = [...filters];
        newFilters.splice(index, 1);
        setFilters(newFilters);
    };

    const handleCellEdit = (rowId, columnName, value) => {
        setEditedData({
            ...editedData,
            [rowId]: {
                ...editedData[rowId],
                [columnName]: value
            }
        });
    };

    const handleUpdateRow = (row) => {
        if (!results.columns.length) return;

        const primaryKey = results.columns[0]; // First column as primary key
        const primaryKeyValue = row[0]; // First value in row array

        const updatedFields = editedData[primaryKeyValue] || {};
        const setClause = Object.keys(updatedFields)
            .map(key => `${key} = '${updatedFields[key]}'`)
            .join(', ');

        const updateQuery = `UPDATE ${selectedTable} SET ${setClause} WHERE ${primaryKey} = '${primaryKeyValue}';`;

        setQuery(updateQuery);
        setShowPopup(true);

        // Reset edited data for this row
        const newEditedData = { ...editedData };
        delete newEditedData[primaryKeyValue];
        setEditedData(newEditedData);
    };

    const executeUpdateQuery = async () => {
        try {
            setLoading(true);
            setError(null);
            await executeQuery(environment, query);
            setShowPopup(false);
            executeTableQuery(); // Refresh data
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const exportToExcel = () => {
        if (!results.rows.length) {
            alert('No data to export');
            return;
        }

        const excelData = [
            results.columns,
            ...results.rows
        ];

        const ws = XLSX.utils.aoa_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, selectedTable || "Data");
        XLSX.writeFile(wb, `${selectedTable || "export"}.xlsx`);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(query);
        alert('Query copied to clipboard!');
    };

    return (
        <div className="query-metadata-page">
            <HomeButton />
            <br />
            <h1>Database Management</h1>

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

            <div className="controls">
                <div className="table-selector">
                    <label htmlFor="table-select">Select Table:</label>
                    <select
                        id="table-select"
                        value={selectedTable}
                        onChange={(e) => handleTableSelect(e.target.value)}
                        disabled={loading}
                    >
                        <option value="">-- Select a table --</option>
                        {tables.map(table => (
                            <option key={table} value={table}>{table}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-builder">
                    <h3>Filters</h3>

                    <div className="active-filters">
                        {filters.map((filter, index) => (
                            <div key={index} className="filter-item">
                                {filter}
                                <button onClick={() => handleRemoveFilter(index)}>×</button>
                            </div>
                        ))}
                    </div>

                    {selectedTable && (
                        <div className="filter-controls">
                            <select
                                value={""}
                                onChange={(e) => {
                                    const column = e.target.value;
                                    if (column) {
                                        const operator = "=";
                                        const value = prompt(`Enter value for ${column}:`);
                                        if (value !== null) {
                                            handleAddFilter(`${column} ${operator} '${value}'`);
                                        }
                                    }
                                }}
                                disabled={loading}
                            >
                                <option value="">Add filter...</option>
                                {results.columns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            {results && (
                <div className="query-results">
                    <div className="results-header">
                        <h3>Results for: {selectedTable || "No table selected"}</h3>
                        {results.rows.length > 0 && (
                            <>
                                <button
                                    onClick={exportToExcel}
                                    className="export-button"
                                    title="Export to Excel"
                                    disabled={loading}
                                >
                                    Export to Excel
                                </button>
                                <button
                                    onClick={executeTableQuery}
                                    className="refresh-button"
                                    title="Refresh Data"
                                    disabled={loading}
                                >
                                    {loading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </>
                        )}
                    </div>

                    <div className="query-display">
                        <code>
                            {query || "No query executed yet"}
                        </code>
                    </div>

                    <div className="results-table">
                        <table>
                            <thead>
                                <tr>
                                    {Array.isArray(results.columns) && results.columns.map((col, i) => (
                                        <th key={i}>{col}</th>
                                    ))}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(results.rows) && results.rows.map((row, i) => {
                                    const primaryKey = results.columns[0];
                                    const rowKey = row[0];

                                    return (
                                        <tr key={i}>
                                            {Array.isArray(row) ? (
                                                row.map((cell, j) => {
                                                    const columnName = results.columns[j];
                                                    const isEdited = editedData[rowKey] && editedData[rowKey][columnName] !== undefined;

                                                    return (
                                                        <td key={j}>
                                                            {isEdited ? (
                                                                <input
                                                                    type="text"
                                                                    value={editedData[rowKey][columnName]}
                                                                    onChange={(e) => handleCellEdit(rowKey, columnName, e.target.value)}
                                                                    disabled={loading}
                                                                />
                                                            ) : (
                                                                cell
                                                            )}
                                                        </td>
                                                    );
                                                })
                                            ) : (
                                                <td colSpan={results.columns.length}>Invalid row data</td>
                                            )}
                                            <td>
                                                {(editedData[rowKey] && Object.keys(editedData[rowKey]).length > 0) && (
                                                    <button
                                                        onClick={() => handleUpdateRow(row)}
                                                        disabled={loading}
                                                    >
                                                        Update
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {results.rows.length === 0 && selectedTable && (
                        <p>No results found for {selectedTable}</p>
                    )}
                </div>
            )}

            {showPopup && (
                <div className="popup-overlay">
                    <div className="query-popup">
                        <h3>Update Query</h3>
                        <div className="query-content">
                            <code>{query}</code>
                        </div>
                        <div className="popup-actions">
                            <button onClick={copyToClipboard}>Copy to Clipboard</button>
                            <button onClick={executeUpdateQuery} disabled={loading}>
                                {loading ? 'Executing...' : 'Execute Update'}
                            </button>
                            <button onClick={() => setShowPopup(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DatabaseManagement;