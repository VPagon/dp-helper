import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { executeQuery } from 'services/sqlService';
import { buildMetadataDiffSql, normalizeStatus, rowToRecord } from 'utils/metadataDiffSql';
import { buildMetadataDiffReverseSql } from 'utils/queryReverse';
import { logGeneratedQuery } from 'services/queryHistoryLogger';
import '../styles/pages/GetMetadataDifferences.css';
import HomeButton from 'components/common/HomeButtom';
import DiffJsonPopup from 'components/common/DiffJsonPopup';

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
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        rowIndex: null
    });
    const [generatedSQL, setGeneratedSQL] = useState('');
    const [showSqlPopup, setShowSqlPopup] = useState(false);
    const [sqlTargetEnvironment, setSqlTargetEnvironment] = useState('dev');
    const [sqlError, setSqlError] = useState(null);
    const [executingSql, setExecutingSql] = useState(false);
    const [diffJsonPopup, setDiffJsonPopup] = useState({
        visible: false,
        diffJson: null,
        diffField: null
    });
    const [sqlLogContext, setSqlLogContext] = useState(null);

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
        XLSX.utils.book_append_sheet(wb, ws, 'Metadata Differences');
        XLSX.writeFile(wb, 'metadata_differences.xlsx');
    };

    const closeContextMenu = () => {
        setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
    };

    const handleRowContextMenu = (event, rowIndex) => {
        event.preventDefault();
        setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            rowIndex
        });
    };

    const handleContextMenuAction = (targetEnv) => {
        const rowIndex = contextMenu.rowIndex;
        closeContextMenu();

        if (rowIndex === null || !Array.isArray(results.rows[rowIndex])) {
            setSqlError('Selected row is no longer available');
            setShowSqlPopup(true);
            return;
        }

        try {
            setSqlError(null);
            const record = rowToRecord(results.columns, results.rows[rowIndex]);
            const sql = buildMetadataDiffSql(record, targetEnv);
            setGeneratedSQL(sql);
            setSqlTargetEnvironment(targetEnv);
            const metadata = {
                metadataDiffRecord: record,
                targetEnv,
            };
            setSqlLogContext(metadata);
            let reverseSql = null;
            try {
                reverseSql = buildMetadataDiffReverseSql(record, targetEnv);
            } catch {
                reverseSql = null;
            }
            logGeneratedQuery({
                source: 'metadata-differences',
                environment: targetEnv,
                sql,
                metadata,
                reverseSql,
            }).catch(() => {});
            setShowSqlPopup(true);
        } catch (err) {
            setGeneratedSQL('');
            setSqlError(err.message);
            setShowSqlPopup(true);
        }
    };

    const executeGeneratedSQL = async () => {
        if (!generatedSQL) return;

        try {
            setExecutingSql(true);
            setSqlError(null);
            let reverseSql = null;
            if (sqlLogContext?.metadataDiffRecord) {
                try {
                    reverseSql = buildMetadataDiffReverseSql(
                        sqlLogContext.metadataDiffRecord,
                        sqlLogContext.targetEnv || sqlTargetEnvironment
                    );
                } catch {
                    reverseSql = null;
                }
            }
            await executeQuery(sqlTargetEnvironment, generatedSQL, {
                source: 'metadata-differences',
                metadata: sqlLogContext,
                reverseSql,
            });
            setShowSqlPopup(false);
            setGeneratedSQL('');
            await handleExecute();
        } catch (err) {
            setSqlError(err.message);
        } finally {
            setExecutingSql(false);
        }
    };

    const closeSqlPopup = () => {
        setShowSqlPopup(false);
        setGeneratedSQL('');
        setSqlError(null);
    };

    const openDiffJsonPopup = (diffJson, diffField) => {
        setDiffJsonPopup({ visible: true, diffJson, diffField });
    };

    const closeDiffJsonPopup = () => {
        setDiffJsonPopup({ visible: false, diffJson: null, diffField: null });
    };

    const getColumnIndex = (columnName) => (
        results.columns.findIndex((col) => String(col).toLowerCase() === columnName)
    );

    const renderDiffJsonCell = (cell, diffField) => {
        if (cell === null || cell === undefined) {
            return <span className="cell-empty">—</span>;
        }

        const text = String(cell);
        const displayText = text.length > 120 ? `${text.slice(0, 120)}…` : text;

        return (
            <span
                className="cell-json cell-json-clickable"
                title="Click to view JSON"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                    event.stopPropagation();
                    openDiffJsonPopup(cell, diffField);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDiffJsonPopup(cell, diffField);
                    }
                }}
            >
                {displayText}
            </span>
        );
    };

    useEffect(() => {
        const handleClickOutside = () => closeContextMenu();
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const getStatusClassName = (status) => {
        const normalized = normalizeStatus(status);
        if (normalized === 'Difference in data') return 'status-badge status-difference';
        if (normalized === 'Missing on dev') return 'status-badge status-missing-dev';
        if (normalized === 'Missing on prod') return 'status-badge status-missing-prod';
        return 'status-badge status-unknown';
    };

    const formatCellValue = (cell, columnName) => {
        if (columnName && String(columnName).toLowerCase() === 'status') {
            return (
                <span className={getStatusClassName(cell)}>
                    {cell}
                </span>
            );
        }

        if (cell === null || cell === undefined) {
            return <span className="cell-empty">—</span>;
        }

        const text = String(cell);
        return text;
    };

    return (
        <div className="metadata-differences-page">
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
                    <div className="metadata-results-table-wrapper">
                        <table className="metadata-results-table">
                            <thead>
                                <tr>
                                    {Array.isArray(results.columns) && results.columns.map((col, i) => (
                                        <th key={i}>{col}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(results.rows) && results.rows.map((row, i) => {
                                    const diffColIndex = getColumnIndex('diff');
                                    const diffField = diffColIndex >= 0 ? row[diffColIndex] : null;

                                    return (
                                        <tr
                                            key={i}
                                            onContextMenu={(e) => handleRowContextMenu(e, i)}
                                            className={contextMenu.rowIndex === i ? 'selected-row' : ''}
                                        >
                                            {Array.isArray(row) ? (
                                                row.map((cell, j) => {
                                                    const columnName = results.columns[j];
                                                    const isDiffJson = String(columnName).toLowerCase() === 'diff_json';

                                                    return (
                                                        <td key={j}>
                                                            {isDiffJson
                                                                ? renderDiffJsonCell(cell, diffField)
                                                                : formatCellValue(cell, columnName)}
                                                        </td>
                                                    );
                                                })
                                            ) : (
                                                <td colSpan={results.columns.length}>Invalid row data</td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {results.rows.length === 0 && (
                        <p className="no-results-message">No results found</p>
                    )}
                </div>
            )}

            {contextMenu.visible && (
                <div
                    className="metadata-context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className="context-menu-item"
                        onClick={() => handleContextMenuAction('dev')}
                    >
                        Update DEV
                    </button>
                    <button
                        type="button"
                        className="context-menu-item"
                        onClick={() => handleContextMenuAction('prod')}
                    >
                        Update PROD
                    </button>
                </div>
            )}

            {diffJsonPopup.visible && (
                <DiffJsonPopup
                    diffJson={diffJsonPopup.diffJson}
                    diffField={diffJsonPopup.diffField}
                    onClose={closeDiffJsonPopup}
                />
            )}

            {showSqlPopup && (
                <div className="sql-popup">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>{generatedSQL ? 'Generated SQL' : 'SQL Generation Error'}</h3>
                            <button type="button" className="close-btn" onClick={closeSqlPopup}>×</button>
                        </div>
                        {generatedSQL ? (
                            <pre className="sql-code">{generatedSQL}</pre>
                        ) : (
                            <div className="sql-generation-error">{sqlError}</div>
                        )}
                        {sqlError && generatedSQL && (
                            <div className="sql-generation-error">{sqlError}</div>
                        )}
                        <div className="popup-actions">
                            {generatedSQL && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(generatedSQL);
                                            if (sqlLogContext) {
                                                logGeneratedQuery({
                                                    source: 'metadata-differences',
                                                    environment: sqlTargetEnvironment,
                                                    sql: generatedSQL,
                                                    metadata: sqlLogContext,
                                                    reverseSql: (() => {
                                                        try {
                                                            return buildMetadataDiffReverseSql(
                                                                sqlLogContext.metadataDiffRecord,
                                                                sqlLogContext.targetEnv || sqlTargetEnvironment
                                                            );
                                                        } catch {
                                                            return null;
                                                        }
                                                    })(),
                                                }).catch(() => {});
                                            }
                                        }}
                                    >
                                        Copy to Clipboard
                                    </button>
                                    <button
                                        type="button"
                                        onClick={executeGeneratedSQL}
                                        disabled={executingSql}
                                    >
                                        {executingSql ? 'Executing...' : `Execute on ${sqlTargetEnvironment.toUpperCase()}`}
                                    </button>
                                </>
                            )}
                            <button type="button" onClick={closeSqlPopup}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default GetMetadataDifferences;
