import React, { useState, useEffect } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/_data-sync.scss';

export default function DataSyncPage() {
    const [availableEnvironments, setAvailableEnvironments] = useState([]);
    const [sourceEnv, setSourceEnv] = useState('dev-sqldb-kup-app');
    const [targetEnv, setTargetEnv] = useState('prod-sqldb-kup-app');
    const [sourceTables, setSourceTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [tableColumns, setTableColumns] = useState([]);
    const [filters, setFilters] = useState({});
    const [previewData, setPreviewData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [syncProgress, setSyncProgress] = useState({});
    const [batchSize, setBatchSize] = useState(1000);
    const [insertBatchSize, setInsertBatchSize] = useState(100);
    const [showFilters, setShowFilters] = useState(false); // New state for filters visibility

    // Default environments in case API fails
    const defaultEnvironments = [
        { name: 'dev-sqldb-kup-app', type: 'sqldb-kup-app', configured: true },
        { name: 'prod-sqldb-kup-app', type: 'sqldb-kup-app', configured: true },
        { name: 'dev', type: 'metadata', configured: true },
        { name: 'prod', type: 'metadata', configured: true },
        { name: 'dev-mes', type: 'mes', configured: true },
        { name: 'prod-mes', type: 'mes', configured: true },
        { name: 'dev-itac', type: 'itac', configured: true },
        { name: 'prod-itac', type: 'itac', configured: true },
        { name: 'dev-sig-etl', type: 'sig-etl', configured: true },
        { name: 'prod-sig-etl', type: 'sig-etl', configured: true }
    ];

    // Fetch available environments with better error handling
    const fetchEnvironments = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/environments');

            // Check if response is HTML (error page) instead of JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned HTML instead of JSON. API endpoint may not be available.');
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                setAvailableEnvironments(result.environments);
            } else {
                throw new Error(result.error || 'Failed to fetch environments');
            }
        } catch (err) {
            console.warn('Failed to fetch environments from API, using defaults:', err.message);
            setAvailableEnvironments(defaultEnvironments);
            setError(`Note: Using default environments. API unavailable: ${err.message}`);
        }
    };

    // Fetch tables from source database
    const fetchSourceTables = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await executeQuery(
                sourceEnv,
                `SELECT 
                    TABLE_SCHEMA,
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_SCHEMA, TABLE_NAME`
            );
            setSourceTables(result.rows);
        } catch (err) {
            setError(`Failed to fetch tables from ${sourceEnv}: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Fetch columns for selected table
    const fetchTableColumns = async (tableName) => {
        if (!tableName) return;

        try {
            setLoading(true);
            setError(null);
            const [schema, table] = tableName.split('.');
            const result = await executeQuery(
                sourceEnv,
                `SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT,
                    CHARACTER_MAXIMUM_LENGTH
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = '${table}'
                AND TABLE_SCHEMA = '${schema}'
                ORDER BY ORDINAL_POSITION`
            );
            setTableColumns(result.rows);

            // Initialize filters
            const initialFilters = {};
            result.rows.forEach(column => {
                initialFilters[column[0]] = '';
            });
            setFilters(initialFilters);
        } catch (err) {
            setError(`Failed to fetch columns: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Preview data from source or target database
    const previewDataFromEnv = async (environment) => {
        if (!selectedTable) {
            setError('Please select a table first');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Build WHERE clause from filters
            const whereConditions = [];
            Object.entries(filters).forEach(([column, value]) => {
                if (value && value.trim() !== '') {
                    whereConditions.push(`${column} LIKE '%${value}%'`);
                }
            });

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            const query = `SELECT TOP 100 * FROM ${selectedTable} ${whereClause}`;
            const result = await executeQuery(environment, query);

            setPreviewData({
                columns: result.columns,
                rows: result.rows,
                totalCount: result.rows.length,
                query: query,
                environment: environment
            });
        } catch (err) {
            setError(`Failed to preview data from ${environment}: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Get table creation script from source database
    const getTableCreationScript = async () => {
        if (!selectedTable) return null;

        try {
            const [schema, tableName] = selectedTable.split('.');

            // Get column definitions
            const columnsResult = await executeQuery(
                sourceEnv,
                `SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    CHARACTER_MAXIMUM_LENGTH,
                    NUMERIC_PRECISION,
                    NUMERIC_SCALE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = '${schema}' 
                AND TABLE_NAME = '${tableName}'
                ORDER BY ORDINAL_POSITION`
            );

            // Get primary keys
            const pkResult = await executeQuery(
                sourceEnv,
                `SELECT 
                    COLUMN_NAME
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = '${schema}' 
                AND TABLE_NAME = '${tableName}'
                AND CONSTRAINT_NAME LIKE 'PK_%'`
            );

            const columnDefinitions = columnsResult.rows.map(col => {
                let definition = `[${col[0]}] ${col[1]}`;

                // Add length/precision for certain data types
                if (col[2] !== null) {
                    definition += `(${col[2]})`;
                } else if (col[3] !== null) {
                    definition += col[4] !== null ? `(${col[3]},${col[4]})` : `(${col[3]})`;
                }

                definition += col[5] === 'NO' ? ' NOT NULL' : ' NULL';

                if (col[6]) {
                    definition += ` DEFAULT ${col[6]}`;
                }

                return definition;
            });

            // Add primary key constraint if exists
            const constraints = [];
            if (pkResult.rows.length > 0) {
                const pkColumns = pkResult.rows.map(row => `[${row[0]}]`).join(', ');
                constraints.push(`PRIMARY KEY (${pkColumns})`);
            }

            const allDefinitions = [...columnDefinitions, ...constraints];
            const createTableScript = `CREATE TABLE [${schema}].[${tableName}] (\n    ${allDefinitions.join(',\n    ')}\n)`;

            return createTableScript;
        } catch (err) {
            setError(`Failed to get table creation script: ${err.message}`);
            return null;
        }
    };

    // Check if table exists in target database
    const checkTableExistsInTarget = async () => {
        if (!selectedTable) return false;

        try {
            const [schema, tableName] = selectedTable.split('.');
            const result = await executeQuery(
                targetEnv,
                `SELECT COUNT(*) as table_count 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = '${schema}' 
                 AND TABLE_NAME = '${tableName}'`
            );
            return result.rows[0][0] > 0;
        } catch (err) {
            return false;
        }
    };

    // Create table in target database
    const createTableInTarget = async () => {
        if (!selectedTable) {
            setError('Please select a table first');
            return false;
        }

        try {
            setLoading(true);
            setError(null);
            const createScript = await getTableCreationScript();
            if (!createScript) {
                throw new Error('Could not generate table creation script');
            }

            await executeQuery(targetEnv, createScript);
            setSuccess(`Table ${selectedTable} created successfully in target database`);
            return true;
        } catch (err) {
            setError(`Failed to create table in target: ${err.message}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Get total count of records to sync
    const getTotalCount = async () => {
        if (!selectedTable) return 0;

        try {
            const whereConditions = [];
            Object.entries(filters).forEach(([column, value]) => {
                if (value && value.trim() !== '') {
                    whereConditions.push(`${column} LIKE '%${value}%'`);
                }
            });

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            const countQuery = `SELECT COUNT(*) as total FROM ${selectedTable} ${whereClause}`;
            const result = await executeQuery(sourceEnv, countQuery);
            return result.rows[0][0];
        } catch (err) {
            setError(`Failed to get record count: ${err.message}`);
            return 0;
        }
    };

    // Sync data from source to target
    const syncDataToTarget = async () => {
        if (!selectedTable) {
            setError('Please select a table first');
            return;
        }

        try {
            setLoading(true);
            setError(null);
            setSuccess(null);
            setSyncProgress({ current: 0, total: 0, percentage: 0 });

            // Check if table exists in target, create if not
            const tableExists = await checkTableExistsInTarget();
            if (!tableExists) {
                setSuccess('Table does not exist in target. Creating table...');
                const created = await createTableInTarget();
                if (!created) {
                    setError('Failed to create table in target database');
                    return;
                }
            }

            // Get total count
            const totalCount = await getTotalCount();
            if (totalCount === 0) {
                setError('No records found to sync');
                return;
            }

            setSyncProgress({ current: 0, total: totalCount, percentage: 0 });

            // Build WHERE clause from filters
            const whereConditions = [];
            Object.entries(filters).forEach(([column, value]) => {
                if (value && value.trim() !== '') {
                    whereConditions.push(`${column} LIKE '%${value}%'`);
                }
            });

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            // Process in batches
            let offset = 0;
            let processedCount = 0;

            while (offset < totalCount) {
                const batchQuery = `
                    SELECT * FROM ${selectedTable} 
                    ${whereClause}
                    ORDER BY (SELECT NULL)
                    OFFSET ${offset} ROWS 
                    FETCH NEXT ${batchSize} ROWS ONLY
                `;

                // Get batch data from source
                const sourceResult = await executeQuery(sourceEnv, batchQuery);
                const batchData = sourceResult.rows;

                if (batchData.length === 0) break;

                // Process insert in batches of insertBatchSize
                for (let i = 0; i < batchData.length; i += insertBatchSize) {
                    const insertBatch = batchData.slice(i, i + insertBatchSize);

                    if (insertBatch.length > 0) {
                        const columns = sourceResult.columns.map(col => `[${col}]`).join(', ');
                        const valuesBatches = [];

                        for (const row of insertBatch) {
                            const values = row.map(value => {
                                if (value === null) return 'NULL';
                                if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                                if (value instanceof Date) return `'${value.toISOString()}'`;
                                return value;
                            }).join(', ');
                            valuesBatches.push(`(${values})`);
                        }

                        const insertQuery = `INSERT INTO ${selectedTable} (${columns}) VALUES ${valuesBatches.join(', ')}`;

                        try {
                            await executeQuery(targetEnv, insertQuery);
                        } catch (insertErr) {
                            console.warn(`Failed to insert batch: ${insertErr.message}`);
                            // Fallback to individual inserts if batch insert fails
                            for (let j = 0; j < insertBatch.length; j++) {
                                const singleRow = insertBatch[j];
                                const singleValues = singleRow.map(value => {
                                    if (value === null) return 'NULL';
                                    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                                    if (value instanceof Date) return `'${value.toISOString()}'`;
                                    return value;
                                }).join(', ');
                                const singleInsertQuery = `INSERT INTO ${selectedTable} (${columns}) VALUES (${singleValues})`;

                                try {
                                    await executeQuery(targetEnv, singleInsertQuery);
                                } catch (singleErr) {
                                    console.warn(`Failed to insert individual record: ${singleErr.message}`);
                                }
                            }
                        }

                        processedCount += insertBatch.length;
                        const percentage = Math.round((processedCount / totalCount) * 100);
                        setSyncProgress({
                            current: processedCount,
                            total: totalCount,
                            percentage: percentage
                        });
                    }
                }

                offset += batchSize;
            }

            setSuccess(`Successfully synced ${processedCount} records from ${selectedTable} to ${targetEnv}`);
            setSyncProgress({ current: 0, total: 0, percentage: 0 });

            // Refresh preview
            await previewDataFromEnv(sourceEnv);

        } catch (err) {
            setError(`Sync failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Clear data in target table
    const clearTargetTable = async () => {
        if (!selectedTable || !window.confirm(`Are you sure you want to clear all data in ${selectedTable} on ${targetEnv}? This action cannot be undone.`)) {
            return;
        }

        try {
            setLoading(true);
            setError(null);
            await executeQuery(targetEnv, `DELETE FROM ${selectedTable}`);
            setSuccess(`Cleared all data from ${selectedTable} in ${targetEnv}`);
        } catch (err) {
            setError(`Failed to clear table: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEnvironments();
    }, []);

    useEffect(() => {
        if (sourceEnv) {
            fetchSourceTables();
        }
    }, [sourceEnv]);

    useEffect(() => {
        if (selectedTable) {
            fetchTableColumns(selectedTable);
            setPreviewData(null);
        }
    }, [selectedTable]);

    // Add a function to clear all filters
    const clearAllFilters = () => {
        const clearedFilters = {};
        Object.keys(filters).forEach(key => {
            clearedFilters[key] = '';
        });
        setFilters(clearedFilters);
    };

    return (
        <div className="data-sync-page">
            <HomeButton />
            <br />
            <br />
            <h1>Data Sync Tool</h1>
            <p className="page-description">
                Sync data between different database environments
            </p>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <div className="controls-section">
                <div className="environment-selection">
                    <div className="env-group">
                        <label>Source Environment:</label>
                        <select
                            value={sourceEnv}
                            onChange={(e) => setSourceEnv(e.target.value)}
                            disabled={loading}
                        >
                            {availableEnvironments.filter(env => env.configured).map((env, index) => (
                                <option key={index} value={env.name}>
                                    {env.name} ({env.type})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="env-group">
                        <label>Target Environment:</label>
                        <select
                            value={targetEnv}
                            onChange={(e) => setTargetEnv(e.target.value)}
                            disabled={loading}
                        >
                            {availableEnvironments.filter(env => env.configured).map((env, index) => (
                                <option key={index} value={env.name}>
                                    {env.name} ({env.type})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="table-selection">
                    <label>Select Table:</label>
                    <select
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                        disabled={loading || !sourceEnv}
                    >
                        <option value="">-- Select Table --</option>
                        {sourceTables.map((table, index) => (
                            <option key={index} value={table[0] + '.' + table[1]}>
                                {table[0]}.{table[1]} ({table[2]})
                            </option>
                        ))}
                    </select>
                </div>

                {selectedTable && (
                    <div className="sync-controls">
                        <div className="batch-controls">
                            <div className="batch-size-control">
                                <label>Fetch Batch Size:</label>
                                <input
                                    type="number"
                                    value={batchSize}
                                    onChange={(e) => setBatchSize(parseInt(e.target.value) || 1000)}
                                    min="100"
                                    max="10000"
                                    step="100"
                                    disabled={loading}
                                />
                            </div>

                            <div className="batch-size-control">
                                <label>Insert Batch Size:</label>
                                <input
                                    type="number"
                                    value={insertBatchSize}
                                    onChange={(e) => setInsertBatchSize(parseInt(e.target.value) || 100)}
                                    min="1"
                                    max="1000"
                                    step="10"
                                    disabled={loading}
                                />
                                <span className="help-text">Rows per INSERT statement</span>
                            </div>
                        </div>

                        {/* Updated Filters Section */}
                        <div className="filters-header" onClick={() => setShowFilters(!showFilters)}>
                            <h3>
                                {showFilters ? '🔽' : '▶️'} Data Filters (Optional)
                                {Object.values(filters).some(filter => filter.trim() !== '') && (
                                    <span style={{
                                        marginLeft: '10px',
                                        fontSize: '12px',
                                        color: '#d32f2f',
                                        background: '#ffebee',
                                        padding: '2px 8px',
                                        borderRadius: '12px'
                                    }}>
                                        Active Filters
                                    </span>
                                )}
                            </h3>
                            <button
                                className="filter-toggle"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowFilters(!showFilters);
                                }}
                            >
                                {showFilters ? '▲ Hide' : '▼ Show'} Filters
                            </button>
                        </div>

                        <div className={`filters-content ${showFilters ? '' : 'hidden'}`}>
                            <div className="filters-section">
                                <div className="filters-grid">
                                    {tableColumns.map((column) => (
                                        <div key={column[0]} className="filter-group">
                                            <label>{column[0]} ({column[1]}):</label>
                                            <input
                                                type="text"
                                                value={filters[column[0]] || ''}
                                                onChange={(e) => setFilters(prev => ({
                                                    ...prev,
                                                    [column[0]]: e.target.value
                                                }))}
                                                placeholder={`Filter ${column[0]}`}
                                                disabled={loading}
                                            />
                                        </div>
                                    ))}
                                </div>
                                {showFilters && (
                                    <div className="filter-actions" style={{
                                        marginTop: '20px',
                                        paddingTop: '15px',
                                        borderTop: '1px solid #dee2e6',
                                        display: 'flex',
                                        gap: '10px',
                                        justifyContent: 'flex-end'
                                    }}>
                                        <button
                                            onClick={clearAllFilters}
                                            disabled={loading}
                                            style={{
                                                padding: '8px 16px',
                                                background: '#6c757d',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            🗑️ Clear All
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="button-groups">
                            <div className="preview-buttons">
                                <button
                                    onClick={() => previewDataFromEnv(sourceEnv)}
                                    disabled={loading}
                                    className="preview-btn"
                                >
                                    📊 Preview Source Data
                                </button>
                                <button
                                    onClick={() => previewDataFromEnv(targetEnv)}
                                    disabled={loading}
                                    className="preview-btn secondary"
                                >
                                    📋 Preview Target Data
                                </button>
                            </div>

                            <div className="action-buttons">
                                <button
                                    onClick={syncDataToTarget}
                                    disabled={loading}
                                    className="sync-btn"
                                >
                                    🔄 Sync to Target
                                </button>
                                <button
                                    onClick={createTableInTarget}
                                    disabled={loading}
                                    className="create-btn"
                                >
                                    🏗️ Create Table in Target
                                </button>
                                <button
                                    onClick={clearTargetTable}
                                    disabled={loading}
                                    className="clear-btn"
                                >
                                    🗑️ Clear Target Table
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {syncProgress.total > 0 && (
                <div className="progress-section">
                    <h3>Sync Progress</h3>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${syncProgress.percentage}%` }}
                        ></div>
                    </div>
                    <div className="progress-text">
                        {syncProgress.current} / {syncProgress.total} records ({syncProgress.percentage}%)
                    </div>
                </div>
            )}

            {previewData && (
                <div className="preview-section">
                    <h3>Preview Data ({previewData.environment})</h3>
                    <div className="preview-info">
                        Showing {previewData.totalCount} records from {selectedTable}
                        {previewData.query && (
                            <div className="query-preview">
                                <strong>Query:</strong> <code>{previewData.query}</code>
                            </div>
                        )}
                    </div>
                    <div className="results-table-container">
                        <table className="results-table">
                            <thead>
                                <tr>
                                    {previewData.columns.map((column, index) => (
                                        <th key={index}>{column}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.rows.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {row.map((cell, cellIndex) => (
                                            <td key={cellIndex}>
                                                {cell === null ? <em>NULL</em> :
                                                    typeof cell === 'string' ? cell :
                                                        cell instanceof Date ? cell.toISOString() :
                                                            String(cell)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}