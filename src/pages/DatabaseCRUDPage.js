import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import TableAutocomplete from '../components/common/TableAutocomplete';
import {
    formatCrudDisplayValue,
    formatCrudSqlValue,
    isSqlNullInput,
} from '../utils/crudSql';
import {
    buildCrudDeleteMetadata,
    buildCrudInsertMetadata,
    buildCrudUpdateMetadata,
} from '../utils/queryReverse';
import { logGeneratedQuery } from '../services/queryHistoryLogger';
import { sortTableRows } from '../utils/tableDataSort';
import {
    useResizableColumns,
    DEFAULT_COLUMN_WIDTH,
} from '../hooks/useResizableColumns';
import '../styles/pages/_database-crud.scss';

const ACTIONS_COLUMN_WIDTH = 100;

export default function DatabaseCRUDPage() {
    const [environment, setEnvironment] = useState('dev');
    const [tables, setTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [tableColumns, setTableColumns] = useState([]);
    const [filters, setFilters] = useState({});
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);
    const [editData, setEditData] = useState({});
    const [showEditPopup, setShowEditPopup] = useState(false);
    const [showDeletePopup, setShowDeletePopup] = useState(false);
    const [showInsertPopup, setShowInsertPopup] = useState(false);
    const [generatedSQL, setGeneratedSQL] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, row: null });
    const [showInsertBasedOnPopup, setShowInsertBasedOnPopup] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

    const columnTypeByName = useMemo(() => {
        const map = {};
        tableColumns.forEach((column) => {
            map[column[0]] = column[1];
        });
        return map;
    }, [tableColumns]);

    const getColumnDataType = (columnName) => columnTypeByName[columnName] || '';

    const dataColumnNames = useMemo(
        () => results?.columns ?? [],
        [results?.columns]
    );

    const { columnWidths, startResize } = useResizableColumns(dataColumnNames, {
        defaultWidth: DEFAULT_COLUMN_WIDTH,
    });

    const getColumnWidth = useCallback(
        (columnName) => columnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH,
        [columnWidths]
    );

    const resultsTableWidth = useMemo(() => {
        if (!dataColumnNames.length) {
            return undefined;
        }
        const dataColumnsWidth = dataColumnNames.reduce(
            (sum, name) => sum + getColumnWidth(name),
            0
        );
        return dataColumnsWidth + ACTIONS_COLUMN_WIDTH;
    }, [dataColumnNames, getColumnWidth]);

    const displayRows = useMemo(() => {
        if (!results?.rows) {
            return [];
        }
        if (!sortConfig.key || !sortConfig.direction) {
            return results.rows;
        }
        const columnIndex = results.columns.indexOf(sortConfig.key);
        if (columnIndex < 0) {
            return results.rows;
        }
        return sortTableRows(
            results.rows,
            columnIndex,
            sortConfig.direction,
            (name) => columnTypeByName[name] || '',
            sortConfig.key
        );
    }, [results, sortConfig, columnTypeByName]);

    const handleColumnSort = useCallback((columnName) => {
        setSortConfig((prev) => {
            if (prev.key !== columnName) {
                return { key: columnName, direction: 'asc' };
            }
            if (prev.direction === 'asc') {
                return { key: columnName, direction: 'desc' };
            }
            if (prev.direction === 'desc') {
                return { key: null, direction: null };
            }
            return { key: columnName, direction: 'asc' };
        });
    }, []);

    const getSortAriaSort = (columnName) => {
        if (sortConfig.key !== columnName) {
            return 'none';
        }
        return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
    };

    // Fetch all tables
    const fetchTables = async () => {
        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT
                    s.name AS schema_name,
                    t.name AS table_name
                FROM sys.tables AS t
                JOIN sys.schemas AS s ON t.schema_id = s.schema_id
                WHERE s.name = 'rep_mda'
                ORDER BY s.name, t.name`
            );
            setTables(result.rows);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch columns for selected table
    const fetchTableColumns = async (tableName) => {
        if (!tableName) return;

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
                WHERE c.object_id = OBJECT_ID('rep_mda.${tableName}')
                ORDER BY c.column_id`
            );
            setTableColumns(result.rows);

            // Initialize filters
            const initialFilters = {};
            result.rows.forEach(column => {
                initialFilters[column[0]] = '';
            });
            setFilters(initialFilters);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleTableSelect = (table) => {
        const fullTableName = table[1];
        setSelectedTable(fullTableName);
        setResults(null);
        setSortConfig({ key: null, direction: null });
        fetchTableColumns(fullTableName);
    };

    // Execute search with filters
    const handleSearch = async () => {
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

            const query = `SELECT * FROM rep_mda.${selectedTable} ${whereClause} order by 1 desc`;
            const result = await executeQuery(environment, query);

            setResults({
                columns: result.columns,
                rows: result.rows,
                query: query
            });
            setSortConfig({ key: null, direction: null });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle row edit
    const handleEditRow = (row) => {
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

    const logCrudGenerated = (sql, metadata) => {
        logGeneratedQuery({
            source: 'database-crud',
            environment,
            sql,
            metadata,
        }).catch(() => {});
    };

    // Generate update SQL
    const generateUpdateSQL = () => {
        if (!selectedRow || !results || results.columns.length === 0) return;

        const primaryKeyColumn = results.columns[0]; // Assuming first column is primary key
        const primaryKeyValue = selectedRow[0];

        const setClauses = [];
        results.columns.forEach((column, index) => {
            if (column !== primaryKeyColumn && editData[column] !== selectedRow[index]) {
                const value = formatCrudSqlValue(
                    editData[column],
                    getColumnDataType(column)
                );
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
        logCrudGenerated(sql, buildCrudUpdateMetadata({
            tableName: selectedTable,
            columns: results.columns,
            columnTypes: columnTypeByName,
            selectedRow,
            editData,
            primaryKeyColumn,
        }));
    };

    // Execute update
    const executeUpdate = async () => {
        const primaryKeyColumn = results?.columns?.[0];
        const metadata = results && selectedRow && primaryKeyColumn
            ? buildCrudUpdateMetadata({
                tableName: selectedTable,
                columns: results.columns,
                columnTypes: columnTypeByName,
                selectedRow,
                editData,
                primaryKeyColumn,
            })
            : null;

        try {
            setLoading(true);
            await executeQuery(environment, generatedSQL, {
                source: 'database-crud',
                metadata,
            });
            setShowEditPopup(false);
            setSelectedRow(null);
            handleSearch(); // Refresh results
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle delete row
    const handleDeleteRow = (row) => {
        setSelectedRow(row);
        const primaryKeyColumn = results.columns[0];
        const primaryKeyValue = row[0];

        const sql = `DELETE FROM rep_mda.${selectedTable}
WHERE ${primaryKeyColumn} = '${primaryKeyValue}'`;

        setGeneratedSQL(sql);
        setShowDeletePopup(true);
        logCrudGenerated(sql, buildCrudDeleteMetadata({
            tableName: selectedTable,
            columns: results.columns,
            columnTypes: columnTypeByName,
            row,
        }));
    };

    // Execute delete
    const executeDelete = async () => {
        const metadata = results && selectedRow
            ? buildCrudDeleteMetadata({
                tableName: selectedTable,
                columns: results.columns,
                columnTypes: columnTypeByName,
                row: selectedRow,
            })
            : null;

        try {
            setLoading(true);
            await executeQuery(environment, generatedSQL, {
                source: 'database-crud',
                metadata,
            });
            setShowDeletePopup(false);
            setSelectedRow(null);
            handleSearch(); // Refresh results
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle insert
    const handleInsert = () => {
        const insertData = {};
        tableColumns.forEach(column => {
            // Skip primary key and auto-populated columns
            if (column[0] !== results.columns[0] &&
                !column[0].toLowerCase().includes('date') &&
                !column[0].toLowerCase().includes('user')) {
                insertData[column[0]] = '';
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
            if (isSqlNullInput(value)) {
                columns.push(column);
                values.push('NULL');
                return;
            }

            const stringValue = String(value).trim();
            if (stringValue !== '') {
                columns.push(column);
                values.push(formatCrudSqlValue(value, getColumnDataType(column)));
            }
        });

        if (columns.length === 0) {
            setError('Please fill at least one field');
            return;
        }

        const sql = `INSERT INTO rep_mda.${selectedTable} (${columns.join(', ')})
VALUES (${values.join(', ')})`;

        setGeneratedSQL(sql);
        const primaryKeyColumn = results?.columns?.[0];
        logCrudGenerated(sql, buildCrudInsertMetadata({
            tableName: selectedTable,
            columns: results?.columns || [],
            columnTypes: columnTypeByName,
            editData,
            primaryKeyColumn,
        }));
    };

    // Execute insert
    const executeInsert = async () => {
        const primaryKeyColumn = results?.columns?.[0];
        const metadata = buildCrudInsertMetadata({
            tableName: selectedTable,
            columns: results?.columns || [],
            columnTypes: columnTypeByName,
            editData,
            primaryKeyColumn,
        });

        try {
            setLoading(true);
            await executeQuery(environment, generatedSQL, {
                source: 'database-crud',
                metadata,
            });
            setShowInsertPopup(false);
            setEditData({});
            handleSearch(); // Refresh results
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setSelectedTable('');
        setTableColumns([]);
        setFilters({});
        setResults(null);
        setSortConfig({ key: null, direction: null });
        fetchTables();
    }, [environment]);

    // Handle right-click on table row
    const handleRowRightClick = (e, row) => {
        e.preventDefault(); // Prevent default browser context menu

        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            row: row
        });
    };

    // Update the context menu action handler
    const handleContextMenuAction = (action, row) => {
        setContextMenu({ visible: false, x: 0, y: 0, row: null });

        if (action === 'edit') {
            handleEditRow(row);
        } else if (action === 'delete') {
            handleDeleteRow(row);
        } else if (action === 'insertBasedOn') {
            handleInsertBasedOnRow(row);
        }
    };

    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu({ visible: false, x: 0, y: 0, row: null });
        };

        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);

    // Add this function to handle "Insert based on this row"
    const handleInsertBasedOnRow = (row) => {
        const insertData = {};
        results.columns.forEach((column, index) => {
            // Skip primary key and auto-populated columns
            if (column !== results.columns[0] &&
                !column.toLowerCase().includes('date') &&
                !column.toLowerCase().includes('user') &&
                !column.toLowerCase().includes('id')) {
                insertData[column] = row[index] || '';
            }
        });
        setEditData(insertData);
        setShowInsertBasedOnPopup(true);
    };

    return (
        <div className="database-crud-page database-crud-page--full-width">
            <HomeButton />
            <br />
            <br />
            <h1>Database CRUD</h1>

            <div className="controls-section">
                <div className="environment-selector">
                    <label>Environment:</label>
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                    >
                        <option value="dev">Development</option>
                        <option value="prod">Production</option>
                    </select>
                </div>

                <div className="table-selector">
                    <label htmlFor="crud-table-picker">Table:</label>
                    <TableAutocomplete
                        inputId="crud-table-picker"
                        tables={tables}
                        value={selectedTable}
                        onSelect={handleTableSelect}
                        disabled={loading && tables.length === 0}
                        placeholder="Type to search tables..."
                    />
                </div>

                {selectedTable && (
                    <div className="filters-section">
                        <div
                            className="filters-header"
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <h3>Filters</h3>
                            <span className={`arrow-icon ${showFilters ? 'up' : 'down'}`}>
                                ▼
                            </span>
                        </div>
                        {showFilters && (
                            <div className="filters-grid">
                                {tableColumns.map((column) => (
                                    <div key={column[0]} className="filter-group">
                                        <label>{column[0]}:</label>
                                        <input
                                            type="text"
                                            value={filters[column[0]] || ''}
                                            onChange={(e) => setFilters(prev => ({
                                                ...prev,
                                                [column[0]]: e.target.value
                                            }))}
                                            placeholder={`Filter by ${column[0]}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleSearch}
                    disabled={loading || !selectedTable}
                    className="search-btn"
                >
                    {loading ? 'Searching...' : 'Search'}
                </button>

                {selectedTable && (
                    <button
                        onClick={handleInsert}
                        className="insert-btn"
                    >
                        Insert New Record
                    </button>
                )}
            </div>

            {error && <div className="error-message">{error}</div>}

            {results && results.rows && (
                <div className="results-section">
                    <h3>Results ({results.rows.length} records)</h3>
                    <div className="results-table-container">
                        <table
                            className="results-table results-table--resizable"
                            style={
                                resultsTableWidth
                                    ? { width: resultsTableWidth, minWidth: '100%' }
                                    : undefined
                            }
                        >
                            <colgroup>
                                {results.columns.map((column) => (
                                    <col
                                        key={column}
                                        style={{ width: getColumnWidth(column) }}
                                    />
                                ))}
                                <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    {results.columns.map((column, index) => (
                                        <th
                                            key={index}
                                            title={column}
                                            style={{ width: getColumnWidth(column) }}
                                            aria-sort={getSortAriaSort(column)}
                                            className={
                                                sortConfig.key === column
                                                    ? `sorted-${sortConfig.direction}`
                                                    : ''
                                            }
                                        >
                                            <button
                                                type="button"
                                                className="th-sort-button"
                                                onClick={() => handleColumnSort(column)}
                                            >
                                                <span className="th-label">{column}</span>
                                                {sortConfig.key === column && sortConfig.direction && (
                                                    <span className="sort-indicator" aria-hidden="true">
                                                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                                    </span>
                                                )}
                                            </button>
                                            <span
                                                className="col-resize-handle"
                                                role="separator"
                                                aria-orientation="vertical"
                                                aria-label={`Resize ${column} column`}
                                                onMouseDown={(e) => startResize(column, e)}
                                            />
                                        </th>
                                    ))}
                                    <th
                                        className="actions-header"
                                        style={{ width: ACTIONS_COLUMN_WIDTH }}
                                    >
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayRows.map((row, rowIndex) => (
                                    <tr
                                        key={rowIndex}
                                        onContextMenu={(e) => handleRowRightClick(e, row)}
                                        className={selectedRow === row ? 'selected-row' : ''}
                                    >
                                        {row.map((cell, cellIndex) => {
                                            const columnName = results.columns[cellIndex];
                                            const displayValue = formatCrudDisplayValue(
                                                cell,
                                                getColumnDataType(columnName)
                                            );
                                            const cellTitle =
                                                displayValue === null || displayValue === undefined
                                                    ? undefined
                                                    : String(displayValue);

                                            return (
                                                <td key={cellIndex} title={cellTitle}>
                                                    {displayValue}
                                                </td>
                                            );
                                        })}
                                        <td className="actions-cell">
                                            <button
                                                onClick={() => handleDeleteRow(row)}
                                                className="delete-btn"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Edit Popup */}
            {showEditPopup && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Edit Record</h3>
                            <button onClick={() => setShowEditPopup(false)}>×</button>
                        </div>
                        <div className="edit-form">
                            {results.columns.map((column, index) => (
                                <div key={column} className="form-group">
                                    <label>{column}:</label>
                                    <input
                                        type="text"
                                        value={editData[column] || ''}
                                        onChange={(e) => handleFieldChange(column, e.target.value)}
                                        disabled={index === 0} // Disable primary key
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="popup-actions">
                            <button onClick={generateUpdateSQL}>Generate SQL</button>
                            <button onClick={() => setShowEditPopup(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu.visible && (
                <div
                    className="context-menu"
                    style={{
                        position: 'fixed',
                        left: contextMenu.x,
                        top: contextMenu.y,
                        zIndex: 1000
                    }}
                >
                    <div
                        className="context-menu-item"
                        onClick={() => handleContextMenuAction('edit', contextMenu.row)}
                    >
                        Edit Row
                    </div>
                    <div
                        className="context-menu-item"
                        onClick={() => handleContextMenuAction('insertBasedOn', contextMenu.row)}
                    >
                        Insert Based on This Row
                    </div>
                    <div
                        className="context-menu-item"
                        onClick={() => handleContextMenuAction('delete', contextMenu.row)}
                    >
                        Delete Row
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
                        <div className="sql-preview">
                            <pre>{generatedSQL}</pre>
                        </div>
                        <div className="popup-actions">
                            <button onClick={() => navigator.clipboard.writeText(generatedSQL)}>
                                Copy to Clipboard
                            </button>
                            <button onClick={executeDelete} disabled={loading}>
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
                    <div className="popup-content">
                        <div className="popup-header">
                            <br />
                            <h3>Insert New Record</h3>
                            <button onClick={() => setShowInsertPopup(false)}>×</button>
                        </div>
                        <div className="insert-form">
                            {tableColumns.map((column) => {
                                // Skip primary key and auto-populated columns
                                if (column[0] === results.columns[0] ||
                                    column[0].toLowerCase().includes('date') ||
                                    column[0].toLowerCase().includes('user')) {
                                    return null;
                                }

                                return (
                                    <div key={column[0]} className="form-group">
                                        <label>{column[0]}:</label>
                                        <input
                                            type="text"
                                            value={editData[column[0]] || ''}
                                            onChange={(e) => handleFieldChange(column[0], e.target.value)}
                                            placeholder={`Enter ${column[0]}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="popup-actions">
                            <button onClick={generateInsertSQL}>Generate SQL</button>
                            <button onClick={() => setShowInsertPopup(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SQL Preview Popup */}
            {generatedSQL && (
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
                            <button onClick={
                                showEditPopup ? executeUpdate :
                                    (showInsertPopup || showInsertBasedOnPopup) ? executeInsert :
                                        () => { }
                            } disabled={loading}>
                                {loading ? 'Executing...' : 'Execute Query'}
                            </button>
                            <button onClick={() => {
                                setGeneratedSQL('');
                                if (showInsertBasedOnPopup) setShowInsertBasedOnPopup(false);
                            }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Insert Based on Row Popup */}
            {showInsertBasedOnPopup && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Insert New Record (Based on Selected Row)</h3>
                            <button onClick={() => setShowInsertBasedOnPopup(false)}>×</button>
                        </div>
                        <div className="insert-form">
                            {tableColumns.map((column) => {
                                // Skip primary key and auto-populated columns
                                if (column[0] === results.columns[0] ||
                                    column[0].toLowerCase().includes('date') ||
                                    column[0].toLowerCase().includes('user') ||
                                    column[0].toLowerCase().includes('id')) {
                                    return null;
                                }

                                return (
                                    <div key={column[0]} className="form-group">
                                        <label>{column[0]}:</label>
                                        <input
                                            type="text"
                                            value={editData[column[0]] || ''}
                                            onChange={(e) => handleFieldChange(column[0], e.target.value)}
                                            placeholder={`Enter ${column[0]}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="popup-actions">
                            <button onClick={generateInsertSQL}>Generate SQL</button>
                            <button onClick={() => setShowInsertBasedOnPopup(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}