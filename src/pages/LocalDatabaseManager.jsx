// src/components/pages/LocalDatabaseManager.jsx
import React, { useState, useEffect } from 'react';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/_database-crud.scss';

const API_BASE_URL = 'http://localhost:5000'; // Change this to match your backend URL

export default function LocalDatabaseManager() {
    const [tables, setTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [tableData, setTableData] = useState([]);
    const [tableColumns, setTableColumns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Create table states
    const [showCreateTable, setShowCreateTable] = useState(false);
    const [newTableName, setNewTableName] = useState('');
    const [tableColumnsInput, setTableColumnsInput] = useState([{ name: '', type: 'TEXT', nullable: true }]);

    // Modify table states
    const [showModifyTable, setShowModifyTable] = useState(false);
    const [modifications, setModifications] = useState([]);

    // Data CRUD states
    const [showInsertData, setShowInsertData] = useState(false);
    const [showEditData, setShowEditData] = useState(false);
    const [showDeleteData, setShowDeleteData] = useState(false);
    const [formData, setFormData] = useState({});
    const [selectedRow, setSelectedRow] = useState(null);
    const [whereClause, setWhereClause] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // Search/filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);

    // Fetch all tables
    const fetchTables = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/api/local/tables`);
            const result = await response.json();

            if (result.success) {
                setTables(result.tables);
            } else {
                setError(result.error || 'Failed to fetch tables');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch table schema (columns)
    const fetchTableSchema = async (tableName) => {
        if (!tableName) return;

        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/api/local/table/${tableName}/schema`);
            const result = await response.json();

            if (result.success) {
                setTableColumns(result.schema);

                // Initialize filters
                const initialFilters = {};
                result.schema.forEach(column => {
                    initialFilters[column.name] = '';
                });
                setFilters(initialFilters);
            } else {
                setError(result.error || 'Failed to fetch table schema');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch table data
    const fetchTableData = async (tableName, page = 1) => {
        if (!tableName) return;

        try {
            setLoading(true);

            // Build WHERE clause from filters and search
            const whereConditions = [];
            const params = [];

            // Add search query if provided
            if (searchQuery.trim()) {
                const searchConditions = tableColumns.map(col =>
                    `${col.name} LIKE ?`
                );
                whereConditions.push(`(${searchConditions.join(' OR ')})`);
                tableColumns.forEach(() => params.push(`%${searchQuery}%`));
            }

            // Add filters
            Object.entries(filters).forEach(([column, value]) => {
                if (value && value.trim() !== '') {
                    whereConditions.push(`${column} LIKE ?`);
                    params.push(`%${value}%`);
                }
            });

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            // Calculate pagination
            const offset = (page - 1) * itemsPerPage;
            const limitClause = `LIMIT ${itemsPerPage} OFFSET ${offset}`;

            // Build query
            const query = `SELECT * FROM ${tableName} ${whereClause} ORDER BY rowid DESC ${limitClause}`;

            const response = await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, params })
            });

            const result = await response.json();

            if (result.success) {
                setTableData(result.data || []);
            } else {
                setError(result.error || 'Failed to fetch data');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle table selection
    const handleTableSelect = async (tableName) => {
        setSelectedTable(tableName);
        setError(null);
        setSuccess(null);
        setCurrentPage(1);
        await fetchTableSchema(tableName);
        await fetchTableData(tableName);
    };

    // Create new table
    const handleCreateTable = async () => {
        if (!newTableName.trim()) {
            setError('Table name is required');
            return;
        }

        // Validate columns
        const validColumns = tableColumnsInput.filter(col =>
            col.name && col.name.trim() && col.type
        );

        if (validColumns.length === 0) {
            setError('At least one column is required');
            return;
        }

        try {
            setLoading(true);

            // Build CREATE TABLE SQL
            const columnDefinitions = validColumns.map(col => {
                let definition = `${col.name} ${col.type}`;
                if (!col.nullable) definition += ' NOT NULL';
                if (col.primaryKey) definition += ' PRIMARY KEY';
                if (col.autoIncrement) definition += ' AUTOINCREMENT';
                return definition;
            }).join(', ');

            const query = `CREATE TABLE IF NOT EXISTS ${newTableName} (${columnDefinitions})`;

            const response = await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            const result = await response.json();

            if (result.success) {
                setSuccess(`Table "${newTableName}" created successfully`);
                setShowCreateTable(false);
                setNewTableName('');
                setTableColumnsInput([{ name: '', type: 'TEXT', nullable: true }]);
                fetchTables(); // Refresh table list
            } else {
                setError(result.error || 'Failed to create table');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Add column to table
    const addColumnToTable = async (tableName, columnName, columnType) => {
        try {
            const query = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;

            const response = await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            const result = await response.json();

            if (result.success) {
                setSuccess(`Column "${columnName}" added to "${tableName}"`);
                fetchTableSchema(tableName); // Refresh schema
                fetchTableData(tableName); // Refresh data
            } else {
                setError(result.error || 'Failed to add column');
            }
        } catch (err) {
            setError(err.message);
        }
    };

    // Rename column (SQLite doesn't support RENAME COLUMN, so we need to recreate table)
    const renameColumn = async (tableName, oldName, newName) => {
        // Note: This is a simplified version. In production, you'd need to handle data migration
        try {
            // Get table schema
            const schemaResponse = await fetch(`${API_BASE_URL}/api/local/table/${tableName}/schema`);
            const schemaResult = await schemaResponse.json();

            if (!schemaResult.success) {
                throw new Error('Failed to get table schema');
            }

            // Get all data
            const dataResponse = await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `SELECT * FROM ${tableName}` })
            });

            const dataResult = await dataResponse.json();

            if (!dataResult.success) {
                throw new Error('Failed to get table data');
            }

            // Create new table with renamed column
            const newColumns = schemaResult.schema.map(col => {
                if (col.name === oldName) {
                    return `${newName} ${col.type}`;
                }
                return `${col.name} ${col.type}`;
            });

            const createQuery = `CREATE TABLE ${tableName}_new (${newColumns.join(', ')})`;
            const dropQuery = `DROP TABLE ${tableName}`;
            const renameQuery = `ALTER TABLE ${tableName}_new RENAME TO ${tableName}`;

            // Execute in transaction
            await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: createQuery })
            });

            // Copy data
            if (dataResult.data && dataResult.data.length > 0) {
                const columns = schemaResult.schema.map(col => col.name);
                const placeholders = columns.map(() => '?').join(', ');

                for (const row of dataResult.data) {
                    const values = columns.map(col => row[col]);
                    const insertQuery = `INSERT INTO ${tableName}_new (${columns.join(', ')}) VALUES (${placeholders})`;

                    await fetch(`${API_BASE_URL}/api/local/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: insertQuery, params: values })
                    });
                }
            }

            // Drop old table and rename new one
            await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: dropQuery })
            });

            await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: renameQuery })
            });

            setSuccess(`Column "${oldName}" renamed to "${newName}"`);
            fetchTableSchema(tableName);
            fetchTableData(tableName);

        } catch (err) {
            setError(err.message);
        }
    };

    // Drop column (SQLite doesn't support DROP COLUMN, so we need to recreate table)
    const dropColumn = async (tableName, columnName) => {
        // Similar to renameColumn - simplified version
        if (window.confirm(`Are you sure you want to drop column "${columnName}"? This will recreate the table and may take time.`)) {
            try {
                // Get table schema
                const schemaResponse = await fetch(`${API_BASE_URL}/api/local/table/${tableName}/schema`);
                const schemaResult = await schemaResponse.json();

                if (!schemaResult.success) {
                    throw new Error('Failed to get table schema');
                }

                // Get all data
                const dataResponse = await fetch(`${API_BASE_URL}/api/local/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: `SELECT * FROM ${tableName}` })
                });

                const dataResult = await dataResponse.json();

                if (!dataResult.success) {
                    throw new Error('Failed to get table data');
                }

                // Create new table without the column
                const newColumns = schemaResult.schema
                    .filter(col => col.name !== columnName)
                    .map(col => `${col.name} ${col.type}`);

                const createQuery = `CREATE TABLE ${tableName}_new (${newColumns.join(', ')})`;

                // Execute in transaction
                await fetch(`${API_BASE_URL}/api/local/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: createQuery })
                });

                // Copy data
                if (dataResult.data && dataResult.data.length > 0) {
                    const columns = schemaResult.schema
                        .filter(col => col.name !== columnName)
                        .map(col => col.name);

                    const placeholders = columns.map(() => '?').join(', ');

                    for (const row of dataResult.data) {
                        const values = columns.map(col => row[col]);
                        const insertQuery = `INSERT INTO ${tableName}_new (${columns.join(', ')}) VALUES (${placeholders})`;

                        await fetch(`${API_BASE_URL}/api/local/query`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query: insertQuery, params: values })
                        });
                    }
                }

                // Drop old table and rename new one
                await fetch(`${API_BASE_URL}/api/local/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: `DROP TABLE ${tableName}` })
                });

                await fetch(`${API_BASE_URL}/api/local/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: `ALTER TABLE ${tableName}_new RENAME TO ${tableName}` })
                });

                setSuccess(`Column "${columnName}" dropped successfully`);
                fetchTableSchema(tableName);
                fetchTableData(tableName);

            } catch (err) {
                setError(err.message);
            }
        }
    };

    // Insert data
    const handleInsertData = async () => {
        try {
            setLoading(true);

            // Prepare columns and values
            const columns = [];
            const values = [];
            const placeholders = [];

            Object.entries(formData).forEach(([column, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    columns.push(column);
                    values.push(value);
                    placeholders.push('?');
                }
            });

            if (columns.length === 0) {
                setError('No data to insert');
                return;
            }

            const query = `INSERT INTO ${selectedTable} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

            const response = await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, params: values })
            });

            const result = await response.json();

            if (result.success) {
                setSuccess(`Data inserted successfully (ID: ${result.lastID})`);
                setShowInsertData(false);
                setFormData({});
                fetchTableData(selectedTable, currentPage);
            } else {
                setError(result.error || 'Failed to insert data');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Update data
    const handleUpdateData = async () => {
        try {
            setLoading(true);

            if (!whereClause.trim()) {
                setError('WHERE clause is required for update');
                return;
            }

            // Prepare SET clause
            const setClauses = [];
            const values = [];

            Object.entries(formData).forEach(([column, value]) => {
                if (column !== 'rowid' && value !== undefined) {
                    setClauses.push(`${column} = ?`);
                    values.push(value);
                }
            });

            if (setClauses.length === 0) {
                setError('No fields to update');
                return;
            }

            const query = `UPDATE ${selectedTable} SET ${setClauses.join(', ')} WHERE ${whereClause}`;

            const response = await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, params: values })
            });

            const result = await response.json();

            if (result.success) {
                setSuccess(`Data updated successfully (${result.changes} rows affected)`);
                setShowEditData(false);
                setFormData({});
                setWhereClause('');
                fetchTableData(selectedTable, currentPage);
            } else {
                setError(result.error || 'Failed to update data');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Delete data
    const handleDeleteData = async () => {
        try {
            setLoading(true);

            if (!whereClause.trim()) {
                setError('WHERE clause is required for delete');
                return;
            }

            const query = `DELETE FROM ${selectedTable} WHERE ${whereClause}`;

            const response = await fetch(`${API_BASE_URL}/api/local/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            const result = await response.json();

            if (result.success) {
                setSuccess(`Data deleted successfully (${result.changes} rows affected)`);
                setShowDeleteData(false);
                setWhereClause('');
                fetchTableData(selectedTable, currentPage);
            } else {
                setError(result.error || 'Failed to delete data');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Delete table
    const handleDeleteTable = async (tableName) => {
        if (window.confirm(`Are you sure you want to delete table "${tableName}"? This action cannot be undone.`)) {
            try {
                setLoading(true);
                const query = `DROP TABLE IF EXISTS ${tableName}`;

                const response = await fetch(`${API_BASE_URL}/api/local/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });

                const result = await response.json();

                if (result.success) {
                    setSuccess(`Table "${tableName}" deleted successfully`);
                    if (selectedTable === tableName) {
                        setSelectedTable('');
                        setTableColumns([]);
                        setTableData([]);
                    }
                    fetchTables();
                } else {
                    setError(result.error || 'Failed to delete table');
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
    };

    // Add new column input row
    const addColumnInput = () => {
        setTableColumnsInput([...tableColumnsInput, { name: '', type: 'TEXT', nullable: true }]);
    };

    // Remove column input row
    const removeColumnInput = (index) => {
        const newColumns = [...tableColumnsInput];
        newColumns.splice(index, 1);
        setTableColumnsInput(newColumns);
    };

    // Update column input
    const updateColumnInput = (index, field, value) => {
        const newColumns = [...tableColumnsInput];
        newColumns[index] = { ...newColumns[index], [field]: value };
        setTableColumnsInput(newColumns);
    };

    // Initialize form data for edit
    const initializeEditForm = (row) => {
        setSelectedRow(row);
        const initialData = {};
        tableColumns.forEach(col => {
            initialData[col.name] = row[col.name] || '';
        });
        setFormData(initialData);
        setShowEditData(true);
    };

    // Initialize form data for insert
    const initializeInsertForm = () => {
        const initialData = {};
        tableColumns.forEach(col => {
            initialData[col.name] = '';
        });
        setFormData(initialData);
        setShowInsertData(true);
    };

    // Handle pagination
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
        fetchTableData(selectedTable, newPage);
    };

    useEffect(() => {
        fetchTables();
    }, []);

    useEffect(() => {
        if (selectedTable) {
            fetchTableData(selectedTable, currentPage);
        }
    }, [searchQuery, filters, currentPage, itemsPerPage]);

    return (
        <div className="database-crud-page">
            <HomeButton />
            <br />
            <br />
            <h1>Local Database Manager</h1>

            {/* Error/Success Messages */}
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            {/* Main Controls */}
            <div className="controls-section">
                <div className="table-selector">
                    <label>Select Table:</label>
                    <div className="table-selection">
                        <select
                            value={selectedTable}
                            onChange={(e) => handleTableSelect(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">-- Select a table --</option>
                            {tables.map((table, index) => (
                                <option key={index} value={table}>
                                    {table}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => setShowCreateTable(true)}
                            className="create-btn"
                        >
                            + Create Table
                        </button>
                    </div>
                </div>

                {/* Search and Filters */}
                {selectedTable && (
                    <div className="search-controls">
                        <div className="search-box">
                            <input
                                type="text"
                                placeholder="Search in all columns..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                disabled={loading}
                            />
                            <button onClick={() => fetchTableData(selectedTable)}>
                                🔍
                            </button>
                        </div>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="filter-toggle"
                        >
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </button>
                    </div>
                )}

                {/* Filters Section */}
                {selectedTable && showFilters && (
                    <div className="filters-section">
                        <div className="filters-grid">
                            {tableColumns.map((column) => (
                                <div key={column.name} className="filter-group">
                                    <label>{column.name}:</label>
                                    <input
                                        type="text"
                                        value={filters[column.name] || ''}
                                        onChange={(e) => setFilters(prev => ({
                                            ...prev,
                                            [column.name]: e.target.value
                                        }))}
                                        placeholder={`Filter ${column.name}`}
                                        disabled={loading}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="filter-actions">
                            <button onClick={() => fetchTableData(selectedTable)}>
                                Apply Filters
                            </button>
                            <button
                                onClick={() => {
                                    const clearedFilters = {};
                                    tableColumns.forEach(col => {
                                        clearedFilters[col.name] = '';
                                    });
                                    setFilters(clearedFilters);
                                }}
                                className="secondary"
                            >
                                Clear Filters
                            </button>
                        </div>
                    </div>
                )}

                {/* Table Actions */}
                {selectedTable && (
                    <div className="table-actions">
                        <button
                            onClick={initializeInsertForm}
                            className="insert-btn"
                            disabled={loading}
                        >
                            + Insert Data
                        </button>
                        <button
                            onClick={() => setShowModifyTable(true)}
                            className="modify-btn"
                            disabled={loading}
                        >
                            ⚙ Modify Table
                        </button>
                        <button
                            onClick={() => handleDeleteTable(selectedTable)}
                            className="delete-btn"
                            disabled={loading}
                        >
                            🗑 Delete Table
                        </button>
                    </div>
                )}
            </div>

            {/* Table Data Display */}
            {selectedTable && (
                <div className="results-section">
                    <h3>
                        Data from "{selectedTable}"
                        <span className="record-count">
                            ({tableData.length} records)
                        </span>
                    </h3>

                    {/* Pagination Controls */}
                    <div className="pagination-controls">
                        <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1 || loading}
                        >
                            ← Previous
                        </button>

                        <span>Page {currentPage}</span>

                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={tableData.length < itemsPerPage || loading}
                        >
                            Next →
                        </button>

                        <select
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
                            disabled={loading}
                        >
                            <option value="10">10 per page</option>
                            <option value="25">25 per page</option>
                            <option value="50">50 per page</option>
                            <option value="100">100 per page</option>
                        </select>
                    </div>

                    <div className="results-table-container">
                        {tableData.length === 0 ? (
                            <div className="no-results">
                                {loading ? 'Loading...' : 'No data found'}
                            </div>
                        ) : (
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        {tableColumns.map((column) => (
                                            <th key={column.name}>{column.name}</th>
                                        ))}
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableData.map((row, rowIndex) => (
                                        <tr key={rowIndex}>
                                            <td>{rowIndex + 1}</td>
                                            {tableColumns.map((column) => (
                                                <td key={column.name}>
                                                    {row[column.name] !== null
                                                        ? String(row[column.name])
                                                        : <em>NULL</em>
                                                    }
                                                </td>
                                            ))}
                                            <td className="actions-cell">
                                                <button
                                                    onClick={() => initializeEditForm(row)}
                                                    className="edit-row-btn"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedRow(row);
                                                        setWhereClause(`rowid = ${row.rowid}`);
                                                        setShowDeleteData(true);
                                                    }}
                                                    className="delete-row-btn"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Create Table Popup */}
            {showCreateTable && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Create New Table</h3>
                            <button onClick={() => setShowCreateTable(false)}>×</button>
                        </div>
                        <div className="create-form">
                            <div className="form-group">
                                <label>Table Name:</label>
                                <input
                                    type="text"
                                    value={newTableName}
                                    onChange={(e) => setNewTableName(e.target.value)}
                                    placeholder="e.g., users, products, orders"
                                />
                            </div>

                            <h4>Table Columns</h4>
                            {tableColumnsInput.map((column, index) => (
                                <div key={index} className="column-input-row">
                                    <div className="form-group">
                                        <label>Column Name:</label>
                                        <input
                                            type="text"
                                            value={column.name}
                                            onChange={(e) => updateColumnInput(index, 'name', e.target.value)}
                                            placeholder="e.g., id, name, email"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Data Type:</label>
                                        <select
                                            value={column.type}
                                            onChange={(e) => updateColumnInput(index, 'type', e.target.value)}
                                        >
                                            <option value="TEXT">TEXT</option>
                                            <option value="INTEGER">INTEGER</option>
                                            <option value="REAL">REAL</option>
                                            <option value="BLOB">BLOB</option>
                                            <option value="NUMERIC">NUMERIC</option>
                                            <option value="BOOLEAN">BOOLEAN</option>
                                            <option value="DATE">DATE</option>
                                            <option value="DATETIME">DATETIME</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={column.nullable}
                                                onChange={(e) => updateColumnInput(index, 'nullable', e.target.checked)}
                                            />
                                            Nullable
                                        </label>
                                    </div>
                                    <div className="form-group">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={column.primaryKey}
                                                onChange={(e) => updateColumnInput(index, 'primaryKey', e.target.checked)}
                                            />
                                            Primary Key
                                        </label>
                                    </div>
                                    {column.primaryKey && (
                                        <div className="form-group">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={column.autoIncrement}
                                                    onChange={(e) => updateColumnInput(index, 'autoIncrement', e.target.checked)}
                                                />
                                                Auto Increment
                                            </label>
                                        </div>
                                    )}
                                    {index > 0 && (
                                        <button
                                            onClick={() => removeColumnInput(index)}
                                            className="remove-column-btn"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            ))}

                            <button onClick={addColumnInput} className="add-column-btn">
                                + Add Column
                            </button>
                        </div>
                        <div className="popup-actions">
                            <button onClick={handleCreateTable} disabled={loading}>
                                {loading ? 'Creating...' : 'Create Table'}
                            </button>
                            <button onClick={() => setShowCreateTable(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modify Table Popup */}
            {showModifyTable && selectedTable && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Modify Table: {selectedTable}</h3>
                            <button onClick={() => setShowModifyTable(false)}>×</button>
                        </div>
                        <div className="modify-form">
                            <h4>Current Columns</h4>
                            <table className="columns-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Nullable</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableColumns.map((column) => (
                                        <tr key={column.name}>
                                            <td>{column.name}</td>
                                            <td>{column.type}</td>
                                            <td>{column.notnull === 0 ? 'Yes' : 'No'}</td>
                                            <td className="actions-cell">
                                                <button
                                                    onClick={() => {
                                                        const newName = prompt('Enter new column name:', column.name);
                                                        if (newName && newName !== column.name) {
                                                            renameColumn(selectedTable, column.name, newName);
                                                        }
                                                    }}
                                                    className="rename-btn"
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    onClick={() => dropColumn(selectedTable, column.name)}
                                                    className="drop-btn"
                                                >
                                                    Drop
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <h4>Add New Column</h4>
                            <div className="add-column-form">
                                <div className="form-group">
                                    <label>Column Name:</label>
                                    <input
                                        type="text"
                                        id="newColumnName"
                                        placeholder="e.g., new_column"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Data Type:</label>
                                    <select id="newColumnType">
                                        <option value="TEXT">TEXT</option>
                                        <option value="INTEGER">INTEGER</option>
                                        <option value="REAL">REAL</option>
                                        <option value="BLOB">BLOB</option>
                                    </select>
                                </div>
                                <button
                                    onClick={() => {
                                        const name = document.getElementById('newColumnName').value;
                                        const type = document.getElementById('newColumnType').value;
                                        if (name && type) {
                                            addColumnToTable(selectedTable, name, type);
                                            document.getElementById('newColumnName').value = '';
                                        }
                                    }}
                                    className="add-btn"
                                >
                                    Add Column
                                </button>
                            </div>
                        </div>
                        <div className="popup-actions">
                            <button onClick={() => setShowModifyTable(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Insert Data Popup */}
            {showInsertData && selectedTable && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Insert Data into {selectedTable}</h3>
                            <button onClick={() => setShowInsertData(false)}>×</button>
                        </div>
                        <div className="insert-form">
                            {tableColumns.map((column) => {
                                // Skip auto-increment columns
                                if (column.pk === 1 && column.type.toUpperCase() === 'INTEGER') {
                                    return null;
                                }

                                return (
                                    <div key={column.name} className="form-group">
                                        <label>
                                            {column.name} ({column.type}):
                                            {column.notnull === 0 && ' *'}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData[column.name] || ''}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                [column.name]: e.target.value
                                            }))}
                                            placeholder={`Enter ${column.name}`}
                                            required={column.notnull === 0}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="popup-actions">
                            <button onClick={handleInsertData} disabled={loading}>
                                {loading ? 'Inserting...' : 'Insert Data'}
                            </button>
                            <button onClick={() => setShowInsertData(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Data Popup */}
            {showEditData && selectedTable && selectedRow && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Edit Data in {selectedTable}</h3>
                            <button onClick={() => setShowEditData(false)}>×</button>
                        </div>
                        <div className="edit-form">
                            {tableColumns.map((column) => (
                                <div key={column.name} className="form-group">
                                    <label>
                                        {column.name} ({column.type}):
                                    </label>
                                    <input
                                        type="text"
                                        value={formData[column.name] || ''}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            [column.name]: e.target.value
                                        }))}
                                        placeholder={`Enter ${column.name}`}
                                    />
                                </div>
                            ))}
                            <div className="form-group">
                                <label>WHERE Clause (identify the row to update):</label>
                                <input
                                    type="text"
                                    value={whereClause}
                                    onChange={(e) => setWhereClause(e.target.value)}
                                    placeholder="e.g., id = 1 or email = 'user@example.com'"
                                />
                                <small className="hint">
                                    Example: rowid = {selectedRow.rowid}
                                </small>
                            </div>
                        </div>
                        <div className="popup-actions">
                            <button onClick={handleUpdateData} disabled={loading}>
                                {loading ? 'Updating...' : 'Update Data'}
                            </button>
                            <button onClick={() => setShowEditData(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Data Popup */}
            {showDeleteData && selectedTable && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Delete Data from {selectedTable}</h3>
                            <button onClick={() => setShowDeleteData(false)}>×</button>
                        </div>
                        <div className="delete-form">
                            <div className="warning">
                                ⚠️ <strong>Warning:</strong> This action cannot be undone.
                            </div>
                            <div className="form-group">
                                <label>WHERE Clause (identify rows to delete):</label>
                                <input
                                    type="text"
                                    value={whereClause}
                                    onChange={(e) => setWhereClause(e.target.value)}
                                    placeholder="e.g., id = 1 or status = 'inactive'"
                                />
                                {selectedRow && (
                                    <small className="hint">
                                        Selected row: rowid = {selectedRow.rowid}
                                    </small>
                                )}
                            </div>
                            <div className="sql-preview">
                                <pre>
                                    DELETE FROM {selectedTable} WHERE {whereClause || '...'}
                                </pre>
                            </div>
                        </div>
                        <div className="popup-actions">
                            <button
                                onClick={handleDeleteData}
                                disabled={loading || !whereClause.trim()}
                                className="danger"
                            >
                                {loading ? 'Deleting...' : 'Delete Data'}
                            </button>
                            <button onClick={() => setShowDeleteData(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading Indicator */}
            {loading && (
                <div className="loading-overlay">
                    <div className="loading-spinner">Loading...</div>
                </div>
            )}
        </div>
    );
}