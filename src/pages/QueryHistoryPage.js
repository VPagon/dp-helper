import React, { useCallback, useEffect, useMemo, useState } from 'react';
import HomeButton from '../components/common/HomeButtom';
import { executeQuery } from '../services/sqlService';
import {
    clearQueryHistory,
    getQueryHistoryEntries,
    MAX_ENTRIES,
    sqlPreview,
} from '../utils/queryHistoryStorage';
import { buildReverseSql, REVERT_UNAVAILABLE } from '../utils/queryReverse';
import '../styles/pages/_query-history.scss';

const SOURCE_OPTIONS = [
    { value: 'all', label: 'All sources' },
    { value: 'metadata-differences', label: 'Metadata differences' },
    { value: 'database-crud', label: 'Database CRUD' },
    { value: 'insert-data', label: 'Insert data' },
    { value: 'execution-log', label: 'Execution log' },
    { value: 'query-metadata', label: 'Query metadata' },
    { value: 'execute-query', label: 'Other / API' },
];

const STATUS_OPTIONS = [
    { value: 'all', label: 'All statuses' },
    { value: 'generated', label: 'Generated' },
    { value: 'success', label: 'Success' },
    { value: 'fail', label: 'Fail' },
    { value: 'executed', label: 'Executed' },
];

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];
const DEFAULT_PAGE_SIZE = 100;

function formatTimestamp(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
}

function statusClass(status) {
    switch (status) {
        case 'success':
            return 'qh-status--success';
        case 'fail':
            return 'qh-status--fail';
        case 'generated':
            return 'qh-status--generated';
        default:
            return 'qh-status--neutral';
    }
}

export default function QueryHistoryPage() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({
        source: 'all',
        status: 'all',
        environment: 'all',
        search: '',
    });
    const [expandedId, setExpandedId] = useState(null);
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        entry: null,
        reverseSql: null,
        reverseError: null,
    });
    const [actionMessage, setActionMessage] = useState(null);
    const [executing, setExecuting] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    const loadEntries = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getQueryHistoryEntries(filters);
            setEntries(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadEntries();
    }, [loadEntries]);

    useEffect(() => {
        setPage(1);
    }, [filters]);

    const totalCount = entries.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 0);
    const canGoNext = totalCount > 0 && page < Math.ceil(totalCount / pageSize);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const paginatedEntries = useMemo(() => {
        const start = (page - 1) * pageSize;
        return entries.slice(start, start + pageSize);
    }, [entries, page, pageSize]);

    useEffect(() => {
        const closeMenu = () => setContextMenu((m) => ({ ...m, visible: false }));
        window.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
        return () => {
            window.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
        };
    }, []);

    const handleRowContextMenu = (event, entry) => {
        event.preventDefault();
        event.stopPropagation();
        const { sql, error: reverseError } = buildReverseSql(entry);
        setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            entry,
            reverseSql: sql,
            reverseError,
        });
    };

    const copyReverseSql = async () => {
        const { reverseSql, reverseError } = contextMenu;
        setContextMenu((m) => ({ ...m, visible: false }));
        if (!reverseSql) {
            setActionMessage(reverseError || REVERT_UNAVAILABLE);
            return;
        }
        try {
            await navigator.clipboard.writeText(reverseSql);
            setActionMessage('Reverse SQL copied to clipboard');
        } catch (err) {
            setActionMessage(err.message);
        }
    };

    const executeReverse = async (environment) => {
        const { reverseSql, reverseError, entry } = contextMenu;
        setContextMenu((m) => ({ ...m, visible: false }));

        if (!reverseSql) {
            setActionMessage(reverseError || REVERT_UNAVAILABLE);
            return;
        }

        const confirmed = window.confirm(
            `Execute reverse SQL on ${environment.toUpperCase()}?\n\n${reverseSql.slice(0, 500)}${reverseSql.length > 500 ? '…' : ''}`
        );
        if (!confirmed) return;

        try {
            setExecuting(true);
            setActionMessage(null);
            await executeQuery(environment, reverseSql, {
                source: 'query-history-revert',
                metadata: {
                    revertsEntryId: entry?.id,
                    originalSource: entry?.source,
                },
            });
            setActionMessage(`Reverse executed on ${environment.toUpperCase()}`);
            await loadEntries();
        } catch (err) {
            setActionMessage(err.message);
        } finally {
            setExecuting(false);
        }
    };

    const handleClearHistory = async () => {
        if (!window.confirm('Clear all query history? This cannot be undone.')) {
            return;
        }
        try {
            await clearQueryHistory();
            setExpandedId(null);
            await loadEntries();
            setActionMessage('History cleared');
        } catch (err) {
            setActionMessage(err.message);
        }
    };

    return (
        <div className="query-history-page">
            <HomeButton />
            <header className="qh-header">
                <div>
                    <h1>Query History</h1>
                    <p className="qh-subtitle">
                        Audit log stored in IndexedDB (up to {MAX_ENTRIES} entries). Survives refresh.
                    </p>
                </div>
                <button type="button" className="qh-btn qh-btn--danger" onClick={handleClearHistory}>
                    Clear history
                </button>
            </header>

            <div className="qh-filters">
                <label>
                    Source
                    <select
                        value={filters.source}
                        onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
                    >
                        {SOURCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Status
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                    >
                        {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Environment
                    <select
                        value={filters.environment}
                        onChange={(e) => setFilters((f) => ({ ...f, environment: e.target.value }))}
                    >
                        <option value="all">All</option>
                        <option value="dev">DEV</option>
                        <option value="prod">PROD</option>
                        <option value="deploy">Deploy</option>
                    </select>
                </label>
                <label className="qh-search">
                    Search SQL
                    <input
                        type="search"
                        value={filters.search}
                        onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                        placeholder="Filter by SQL text…"
                    />
                </label>
                <button type="button" className="qh-btn" onClick={loadEntries} disabled={loading}>
                    Refresh
                </button>
            </div>

            {actionMessage && (
                <div className="qh-banner" role="status">{actionMessage}</div>
            )}
            {error && <div className="qh-banner qh-banner--error">{error}</div>}

            {!loading && entries.length > 0 && (
                <div className="qh-results-header">
                    <h3>Entries ({totalCount} total)</h3>
                    <div className="qh-pagination-controls">
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(parseInt(e.target.value, 10));
                                setPage(1);
                            }}
                            aria-label="Entries per page"
                        >
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>{size} per page</option>
                            ))}
                        </select>

                        <span className="qh-pagination-info">
                            Page {page} of {totalPages}
                        </span>

                        <button
                            type="button"
                            className="qh-pagination-btn"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            Previous
                        </button>

                        <button
                            type="button"
                            className="qh-pagination-btn"
                            onClick={() => setPage((p) => p + 1)}
                            disabled={!canGoNext}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            <div className="qh-table-wrap">
                {loading && <p className="qh-loading">Loading…</p>}
                {!loading && entries.length === 0 && (
                    <p className="qh-empty">No query history yet. Execute or generate SQL from other tools.</p>
                )}
                {!loading && entries.length > 0 && (
                    <table className="qh-table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Source</th>
                                <th>Status</th>
                                <th>Env</th>
                                <th>SQL preview</th>
                                <th>Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedEntries.map((entry) => {
                                const expanded = expandedId === entry.id;
                                return (
                                    <React.Fragment key={entry.id}>
                                        <tr
                                            className={`qh-row ${expanded ? 'qh-row--expanded' : ''}`}
                                            onClick={() => setExpandedId(expanded ? null : entry.id)}
                                            onContextMenu={(e) => handleRowContextMenu(e, entry)}
                                        >
                                            <td className="qh-cell-time">{formatTimestamp(entry.timestamp)}</td>
                                            <td><code className="qh-source">{entry.source}</code></td>
                                            <td>
                                                <span className={`qh-status ${statusClass(entry.status)}`}>
                                                    {entry.status}
                                                </span>
                                            </td>
                                            <td>{entry.environment || '—'}</td>
                                            <td className="qh-cell-sql" title={entry.sql}>
                                                {sqlPreview(entry.sql)}
                                            </td>
                                            <td className="qh-cell-error">
                                                {entry.errorMessage ? (
                                                    <span title={entry.errorMessage}>
                                                        {sqlPreview(entry.errorMessage, 60)}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                        </tr>
                                        {expanded && (
                                            <tr className="qh-detail-row">
                                                <td colSpan={6}>
                                                    <pre className="qh-sql-full">{entry.sql}</pre>
                                                    {entry.reverseSql && (
                                                        <>
                                                            <h4>Stored reverse SQL</h4>
                                                            <pre className="qh-sql-full qh-sql-reverse">{entry.reverseSql}</pre>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {contextMenu.visible && (
                <div
                    className="qh-context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button type="button" onClick={copyReverseSql} disabled={!contextMenu.reverseSql}>
                        Copy reverse SQL
                    </button>
                    {!contextMenu.reverseSql && (
                        <span className="qh-context-hint">
                            {contextMenu.reverseError || REVERT_UNAVAILABLE}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => executeReverse('dev')}
                        disabled={!contextMenu.reverseSql || executing}
                    >
                        Execute reverse on DEV
                    </button>
                    <button
                        type="button"
                        onClick={() => executeReverse('prod')}
                        disabled={!contextMenu.reverseSql || executing}
                    >
                        Execute reverse on PROD
                    </button>
                </div>
            )}
        </div>
    );
}
