import React, { useState, useEffect } from 'react';
import Parameters from '../components/crud/Parameters';
import Filtering from '../components/crud/Filtering';
import CrudTable from '../components/crud/CrudTable';
import HomeButton from '../components/common/HomeButtom';
import { executeQuery } from '../services/sqlService';
import '../styles/pages/_database-crud-v2.scss';

export default function DatabaseCRUDPageV2() {
    const [environment, setEnvironment] = useState('dev');
    const [selectedTable, setSelectedTable] = useState('');
    const [filters, setFilters] = useState({});
    const [selectedRow, setSelectedRow] = useState(null);
    const [editData, setEditData] = useState({});
    const [tableColumns, setTableColumns] = useState([]);
    const [showEditPopup, setShowEditPopup] = useState(false);
    const [showDeletePopup, setShowDeletePopup] = useState(false);
    const [showInsertPopup, setShowInsertPopup] = useState(false);
    const [generatedSQL, setGeneratedSQL] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);

    // Fetch table columns when table is selected
    const fetchTableColumns = async () => {
        if (!selectedTable) return;

        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT
                    c.name AS column_name,
                    t.name AS data_type,
                    c.max_length,
                    c.is_nullable,
                    c.column_id
                FROM sys.columns c
                JOIN sys.types t ON c.user_type_id = t.user_type_id
                WHERE c.object_id = OBJECT_ID('rep_mda.${selectedTable}')
                ORDER BY c.column_id`
            );
            setTableColumns(result.rows);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle results update from CrudTable
    const handleResultsUpdate = (newResults) => {
        setResults(newResults);
    };

    // Handle row edit
    const handleEditRow = (row) => {
        if (!results || !results.columns) return;

        setSelectedRow(row);
        const editDataObj = {};
        results.columns.forEach((column, index) => {
            editDataObj[column] = row[index];
        });
        setEditData(editDataObj);
        setShowEditPopup(true);
    };

    // Handle field change in edit popup
    const handleFieldChange = (column, value) => {
        setEditData(prev => ({
            ...prev,
            [column]: value
        }));
    };

    // Generate update SQL
    const generateUpdateSQL = () => {
        if (!selectedRow || !results || results.columns.length === 0) {
            setError('No row selected or no results available');
            return;
        }

        const primaryKeyColumn = results.columns[0]; // Assuming first column is primary key
        const primaryKeyValue = selectedRow[0];

        const setClauses = [];
        results.columns.forEach((column, index) => {
            if (column !== primaryKeyColumn && editData[column] !== selectedRow[index]) {
                const value = editData[column] === null || editData[column] === '' ? 'NULL' : `'${editData[column]}'`;
                setClauses.push(`${column} = ${value}`);
            }
        });

        if (setClauses.length === 0) {
            setError('No changes detected');
            return;
        }

        const sql = `UPDATE rep_mda.${selectedTable}
SET ${setClauses.join(',\n    ')}
WHERE ${primaryKeyColumn} = '${primaryKeyValue}'`;

        setGeneratedSQL(sql);
        setError(null);
    };

    // Execute update
    const executeUpdate = async () => {
        try {
            setLoading(true);
            await executeQuery(environment, generatedSQL);
            setShowEditPopup(false);
            setSelectedRow(null);
            setEditData({});
            setGeneratedSQL('');
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle delete row
    const handleDeleteRow = (row) => {
        if (!results || !results.columns) return;

        setSelectedRow(row);
        const primaryKeyColumn = results.columns[0];
        const primaryKeyValue = row[0];

        const sql = `DELETE FROM rep_mda.${selectedTable}
WHERE ${primaryKeyColumn} = '${primaryKeyValue}'`;

        setGeneratedSQL(sql);
        setShowDeletePopup(true);
    };

    // Execute delete
    const executeDelete = async () => {
        try {
            setLoading(true);
            await executeQuery(environment, generatedSQL);
            setShowDeletePopup(false);
            setSelectedRow(null);
            setGeneratedSQL('');
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle insert
    const handleInsert = () => {
        if (!results || !results.columns) return;

        const insertData = {};
        results.columns.forEach((column, index) => {
            // Skip primary key and auto-populated columns
            if (index !== 0 &&
                !column.toLowerCase().includes('date') &&
                !column.toLowerCase().includes('user') &&
                !column.toLowerCase().includes('last_modified')) {
                insertData[column] = '';
            }
        });
        setEditData(insertData);
        setShowInsertPopup(true);
    };

    // Generate insert SQL
    const generateInsertSQL = () => {
        const columns = [];
        const values = [];

        Object.entries(editData).forEach(([column, value]) => {
            if (value && value.trim() !== '') {
                columns.push(column);
                values.push(`'${value}'`);
            }
        });

        if (columns.length === 0) {
            setError('Please fill at least one field');
            return;
        }

        const sql = `INSERT INTO rep_mda.${selectedTable} (${columns.join(', ')})
VALUES (${values.join(', ')})`;

        setGeneratedSQL(sql);
        setError(null);
    };

    // Execute insert
    const executeInsert = async () => {
        try {
            setLoading(true);
            await executeQuery(environment, generatedSQL);
            setShowInsertPopup(false);
            setEditData({});
            setGeneratedSQL('');
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle table selection from Parameters component
    const handleTableSelect = (tableName) => {
        setSelectedTable(tableName);
        setFilters({}); // Clear filters when table changes
        setResults(null); // Clear previous results
    };

    useEffect(() => {
        if (selectedTable) {
            fetchTableColumns();
        }
    }, [selectedTable, environment]);

    return (
        <div className="database-crud-page-v2">
            <HomeButton />
            <h1>Database CRUD Interface V2</h1>

            {/* Parameters Component */}
            <Parameters
                environment={environment}
                onEnvironmentChange={setEnvironment}
                selectedTable={selectedTable}
                onTableSelect={handleTableSelect}
                parameters={['environment', 'table']}
            />

            {/* Filtering Component */}
            <Filtering
                environment={environment}
                selectedTable={selectedTable}
                onFiltersChange={setFilters}
                onApplyFilters={() => { }} // Refresh handled by CrudTable internally
            />

            {/* CRUD Table Component */}
            <CrudTable
                environment={environment}
                selectedTable={selectedTable}
                filters={filters}
                onEditRow={handleEditRow}
                onDeleteRow={handleDeleteRow}
                onInsert={handleInsert}
                onResultsUpdate={handleResultsUpdate}  // Pass the callback function
            />

            {/* Popups for Edit, Delete, Insert */}

            {/* Edit Popup */}
            {showEditPopup && (
                <div className="popup-overlay">
                    <div className="popup-content large">
                        <div className="popup-header">
                            <h3>Edit Record</h3>
                            <button onClick={() => setShowEditPopup(false)}>×</button>
                        </div>
                        <div className="edit-form">
                            {results && results.columns.map((column, index) => (
                                <div key={column} className="form-group">
                                    <label>{column}:</label>
                                    <textarea
                                        value={editData[column] || ''}
                                        onChange={(e) => handleFieldChange(column, e.target.value)}
                                        disabled={index === 0} // Disable primary key
                                        rows={3}
                                        className="editable-field"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="popup-actions">
                            <button onClick={generateUpdateSQL} className="generate-btn">
                                Generate SQL
                            </button>
                            <button onClick={() => setShowEditPopup(false)} className="cancel-btn">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Popup */}
            {showDeletePopup && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Delete Record</h3>
                            <button onClick={() => setShowDeletePopup(false)}>×</button>
                        </div>
                        <div className="confirmation-message">
                            <p>Are you sure you want to delete this record?</p>
                            <div className="sql-preview">
                                <pre>{generatedSQL}</pre>
                            </div>
                        </div>
                        <div className="popup-actions">
                            <button onClick={() => navigator.clipboard.writeText(generatedSQL)}>
                                Copy to Clipboard
                            </button>
                            <button onClick={executeDelete} disabled={loading} className="delete-btn">
                                {loading ? 'Deleting...' : 'Delete Row'}
                            </button>
                            <button onClick={() => setShowDeletePopup(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Insert Popup */}
            {showInsertPopup && (
                <div className="popup-overlay">
                    <div className="popup-content large">
                        <div className="popup-header">
                            <h3>Insert New Record</h3>
                            <button onClick={() => setShowInsertPopup(false)}>×</button>
                        </div>
                        <div className="insert-form">
                            {results && results.columns.map((column, index) => {
                                // Skip primary key and auto-populated columns
                                if (index === 0 ||
                                    column.toLowerCase().includes('date') ||
                                    column.toLowerCase().includes('user') ||
                                    column.toLowerCase().includes('last_modified')) {
                                    return null;
                                }

                                return (
                                    <div key={column} className="form-group">
                                        <label>{column}:</label>
                                        <textarea
                                            value={editData[column] || ''}
                                            onChange={(e) => handleFieldChange(column, e.target.value)}
                                            placeholder={`Enter ${column}`}
                                            rows={3}
                                            className="editable-field"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="popup-actions">
                            <button onClick={generateInsertSQL} className="generate-btn">
                                Generate SQL
                            </button>
                            <button onClick={() => setShowInsertPopup(false)} className="cancel-btn">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SQL Preview Popup */}
            {generatedSQL && !showDeletePopup && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Generated SQL</h3>
                            <button onClick={() => setGeneratedSQL('')}>×</button>
                        </div>
                        <div className="sql-preview">
                            <pre>{generatedSQL}</pre>
                        </div>
                        <div className="popup-actions">
                            <button onClick={() => navigator.clipboard.writeText(generatedSQL)}>
                                Copy to Clipboard
                            </button>
                            <button onClick={showEditPopup ? executeUpdate : executeInsert} disabled={loading}>
                                {loading ? 'Executing...' : 'Execute Query'}
                            </button>
                            <button onClick={() => setGeneratedSQL('')}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="error-message global-error">
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}
        </div>
    );
}