// components/crud/CrudTable.js
import React, { useState, useEffect } from 'react';
import { executeQuery } from '../../services/sqlService';

const CrudTable = ({
    environment,
    selectedTable,
    filters,
    onEditRow,
    onDeleteRow,
    onInsert,
    onResultsUpdate
}) => {
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [pagination, setPagination] = useState({ page: 1, pageSize: 50 });
    const [contextMenu, setContextMenu] = useState({ visible: false, row: null, x: 0, y: 0 });

    // Build WHERE clause from filters (extracted to a separate function)
    const buildWhereClause = () => {
        const whereConditions = [];
        Object.entries(filters).forEach(([column, value]) => {
            if (value && value.trim() !== '') {
                whereConditions.push(`${column} LIKE '%${value}%'`);
            }
        });
        return whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    };

    // Build ORDER BY clause from sort config
    const buildOrderByClause = () => {
        if (sortConfig.key) {
            return `ORDER BY ${sortConfig.key} ${sortConfig.direction}`;
        }
        return results && results.columns.length > 0 ? `ORDER BY ${results.columns[0]} ASC` : '';
    };

    // Fetch data with filters, sorting, and pagination
    const fetchData = async () => {
        if (!selectedTable) return;

        try {
            setLoading(true);
            setError(null);

            const whereClause = buildWhereClause();
            const orderByClause = buildOrderByClause();

            // Get total count for pagination
            const countQuery = `SELECT COUNT(*) as total FROM rep_mda.${selectedTable} ${whereClause}`;
            const countResult = await executeQuery(environment, countQuery);
            const totalCount = countResult.rows[0][0];

            // Use ROW_NUMBER() for pagination (more compatible)
            const offset = (pagination.page - 1) * pagination.pageSize;
            
            // First, get all column names to use in the query
            const columnsQuery = `SELECT TOP 1 * FROM rep_mda.${selectedTable}`;
            const columnsResult = await executeQuery(environment, columnsQuery);
            const columnNames = columnsResult.columns.join(', ');

            const query = `
                SELECT ${columnNames} FROM (
                    SELECT ${columnNames}, 
                    ROW_NUMBER() OVER (${orderByClause || 'ORDER BY (SELECT NULL)'}) as row_num
                    FROM rep_mda.${selectedTable} 
                    ${whereClause}
                ) AS numbered_rows
                WHERE row_num > ${offset} AND row_num <= ${offset + pagination.pageSize}
                ${orderByClause ? orderByClause.replace('ORDER BY', 'ORDER BY numbered_rows.') : ''}
            `;

            const result = await executeQuery(environment, query);

            const newResults = {
                columns: result.columns,
                rows: result.rows,
                totalCount: totalCount,
                query: query
            };

            setResults(newResults);

            // Call the callback function to pass results back to parent
            if (onResultsUpdate) {
                onResultsUpdate(newResults);
            }
        } catch (err) {
            // If ROW_NUMBER approach fails, try simple approach
            console.error('Error with paginated query:', err);
            await fetchDataSimple();
        } finally {
            setLoading(false);
        }
    };

    // Alternative simpler approach
    const fetchDataSimple = async () => {
        if (!selectedTable) return;

        try {
            const whereClause = buildWhereClause();
            const orderByClause = buildOrderByClause();

            setError('Using simple query approach (pagination limited)');
            
            // Simple query with limited results
            const query = `SELECT TOP ${pagination.pageSize} * FROM rep_mda.${selectedTable} ${whereClause} ${orderByClause}`;
            const result = await executeQuery(environment, query);

            // Get total count
            const countQuery = `SELECT COUNT(*) as total FROM rep_mda.${selectedTable} ${whereClause}`;
            const countResult = await executeQuery(environment, countQuery);
            const totalCount = countResult.rows[0][0];

            const newResults = {
                columns: result.columns,
                rows: result.rows,
                totalCount: totalCount,
                query: query
            };

            setResults(newResults);

            if (onResultsUpdate) {
                onResultsUpdate(newResults);
            }
        } catch (fallbackErr) {
            setError(`Database error: ${fallbackErr.message}`);
        }
    };

    // Even simpler approach without any pagination
    const fetchDataNoPagination = async () => {
        if (!selectedTable) return;

        try {
            const whereClause = buildWhereClause();
            const orderByClause = buildOrderByClause();

            // Simple query without pagination
            const query = `SELECT * FROM rep_mda.${selectedTable} ${whereClause} ${orderByClause}`;
            const result = await executeQuery(environment, query);

            const newResults = {
                columns: result.columns,
                rows: result.rows,
                totalCount: result.rows.length,
                query: query
            };

            setResults(newResults);
            setError('Showing all records (pagination disabled)');

            if (onResultsUpdate) {
                onResultsUpdate(newResults);
            }
        } catch (err) {
            setError(`Database error: ${err.message}`);
        }
    };

    // Handle sorting
    const handleSort = (columnKey, event) => {
        if (event.type === 'contextmenu') {
            event.preventDefault();
            // Right-click: reset to default sorting
            setSortConfig({ key: null, direction: 'asc' });
            return;
        }

        // Left-click: toggle sorting
        setSortConfig(prevConfig => ({
            key: columnKey,
            direction: prevConfig.key === columnKey && prevConfig.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Handle pagination
    const handlePageChange = (newPage) => {
        setPagination(prev => ({ ...prev, page: newPage }));
    };

    const handlePageSizeChange = (newSize) => {
        setPagination({ page: 1, pageSize: parseInt(newSize) });
    };

    // Handle right-click for editing
    const handleRightClick = (event, row) => {
        event.preventDefault();
        setContextMenu({
            visible: true,
            row: row,
            x: event.clientX,
            y: event.clientY
        });
    };

    // Format cell value (pretty print JSON)
    const formatCellValue = (value) => {
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
            try {
                const parsed = JSON.parse(value);
                return JSON.stringify(parsed, null, 2);
            } catch {
                return value;
            }
        }
        return value;
    };

    // Close context menu
    const closeContextMenu = () => {
        setContextMenu({ ...contextMenu, visible: false });
    };

    useEffect(() => {
        // Start with the simple approach first
        fetchDataNoPagination();
    }, [selectedTable, filters, sortConfig, pagination.pageSize]);

    // Handle page changes separately
    useEffect(() => {
        if (pagination.page > 1) {
            fetchData();
        }
    }, [pagination.page]);

    useEffect(() => {
        const handleClick = () => closeContextMenu();
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    if (!selectedTable) {
        return <div className="no-table-selected">Please select a table to view data</div>;
    }

    const totalPages = Math.ceil((results?.totalCount || 0) / pagination.pageSize);

    return (
        <div className="crud-table-component">
            <div className="table-header">
                <div className="results-info">
                    {results && `Showing ${results.rows.length} of ${results.totalCount} records`}
                    {error && <span className="warning"> - {error}</span>}
                </div>

                <div className="table-controls">
                    <select
                        value={pagination.pageSize}
                        onChange={(e) => handlePageSizeChange(e.target.value)}
                    >
                        <option value="50">50 per page</option>
                        <option value="100">100 per page</option>
                        <option value="200">200 per page</option>
                        <option value="500">500 per page</option>
                        <option value="0">All records</option>
                    </select>

                    <button onClick={onInsert} className="insert-btn">
                        Insert New Record
                    </button>
                </div>
            </div>

            {error && error.includes('Database error') && (
                <div className="error-message">{error}</div>
            )}

            <div className="table-container">
                {loading ? (
                    <div className="loading">Loading data...</div>
                ) : results && results.rows.length > 0 ? (
                    <table className="data-table">
                        <thead>
                            <tr>
                                {results.columns.map((column, index) => (
                                    <th
                                        key={index}
                                        onClick={(e) => handleSort(column, e)}
                                        onContextMenu={(e) => handleSort(column, e)}
                                        className={sortConfig.key === column ? `sorted-${sortConfig.direction}` : ''}
                                    >
                                        {column}
                                        {sortConfig.key === column && (
                                            <span className="sort-indicator">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </th>
                                ))}
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.rows.map((row, rowIndex) => (
                                <tr
                                    key={rowIndex}
                                    onContextMenu={(e) => handleRightClick(e, row)}
                                    className={contextMenu.row === row ? 'selected-row' : ''}
                                >
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex}>
                                            <pre className="cell-content">
                                                {formatCellValue(cell)}
                                            </pre>
                                        </td>
                                    ))}
                                    <td className="actions-cell">
                                        <button
                                            onClick={() => onDeleteRow(row)}
                                            className="delete-btn"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="no-results">No records found</div>
                )}
            </div>

            {/* Simplified pagination */}
            {results && results.totalCount > pagination.pageSize && pagination.pageSize > 0 && (
                <div className="pagination">
                    <button
                        onClick={() => handlePageChange(1)}
                        disabled={pagination.page === 1}
                    >
                        First
                    </button>
                    <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                    >
                        Previous
                    </button>

                    <span className="page-info">
                        Page {pagination.page} of {totalPages}
                    </span>

                    <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= totalPages}
                    >
                        Next
                    </button>
                    <button
                        onClick={() => handlePageChange(totalPages)}
                        disabled={pagination.page >= totalPages}
                    >
                        Last
                    </button>
                </div>
            )}
            {/* Context Menu for Editing */}
            {contextMenu.visible && (
                <div
                    className="context-menu"
                    style={{
                        position: 'fixed',
                        left: contextMenu.x,
                        top: contextMenu.y,
                        zIndex: 1000
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={() => onEditRow(contextMenu.row)}>
                        Edit Row
                    </button>
                    <button onClick={closeContextMenu}>
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};

export default CrudTable;