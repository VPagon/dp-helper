import React, { useMemo, useState } from 'react';
import HomeButton from '../components/common/HomeButtom';
import { executeQuery } from '../services/sqlService';
import {
    executionStatusBadgeClass,
    fetchMrmDleCompareData,
    flattenEntityDiffs,
    parseMrmId,
} from '../utils/mrmDleCompare';
import '../styles/pages/_mrm-dle-compare.scss';

const ENVIRONMENT = 'dev';

function statusBadgeClass(status) {
    switch (status) {
        case 'match':
            return 'mdc-status--match';
        case 'diff':
            return 'mdc-status--diff';
        case 'missing_dle':
        case 'only_mrm':
            return 'mdc-status--missing-mrm';
        case 'missing_mrm':
        case 'only_dle':
            return 'mdc-status--missing-dle';
        default:
            return 'mdc-status--neutral';
    }
}

function statusLabel(status) {
    switch (status) {
        case 'match':
            return 'Match';
        case 'diff':
            return 'Diff';
        case 'missing_dle':
        case 'only_mrm':
            return 'Only MRM';
        case 'missing_mrm':
        case 'only_dle':
            return 'Only DLE';
        default:
            return status;
    }
}

function ExecutionStatusBadge({ executionStatus }) {
    if (!executionStatus) return null;

    const badgeClass = executionStatusBadgeClass(executionStatus.status);

    return (
        <div className="mdc-exec-badge" title="MRM execution status from log_mrm_execution">
            <span className="mdc-exec-badge__label">Execution status</span>
            <span className={`mdc-exec-badge__value ${badgeClass}`}>
                {executionStatus.label}
            </span>
        </div>
    );
}

function SummaryBadges({ summary }) {
    if (!summary) return null;
    return (
        <div className="mdc-summary">
            <span className="mdc-summary__item mdc-summary__item--match">
                {summary.matched} matched
            </span>
            <span className="mdc-summary__item mdc-summary__item--diff">
                {summary.differ} differ
            </span>
            <span className="mdc-summary__item mdc-summary__item--missing-mrm">
                {summary.onlyMrm} only MRM
            </span>
            <span className="mdc-summary__item mdc-summary__item--missing-dle">
                {summary.onlyDle} only DLE
            </span>
        </div>
    );
}

function ReadOnlyTable({ columns, rows }) {
    if (!rows?.length) {
        return <p className="mdc-empty">No rows returned.</p>;
    }

    return (
        <div className="mdc-table-wrap">
            <table className="mdc-table">
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col}>{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                            {columns.map((col) => (
                                <td key={col}>
                                    {row[col] === null || row[col] === undefined || row[col] === ''
                                        ? '—'
                                        : String(row[col])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DiffTable({ rows, showEntity = true }) {
    if (!rows?.length) {
        return <p className="mdc-empty">No differences to display.</p>;
    }

    return (
        <div className="mdc-table-wrap">
            <table className="mdc-table mdc-table--diff">
                <thead>
                    <tr>
                        {showEntity && <th>Entity</th>}
                        <th>Field</th>
                        <th>MRM value</th>
                        <th>DLE value</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr
                            key={`${row.entity}-${row.field}-${index}`}
                            className={`mdc-row--${row.status}`}
                        >
                            {showEntity && <td>{row.entity}</td>}
                            <td>{row.field}</td>
                            <td className="mdc-cell-mono">{row.mrmValue}</td>
                            <td className="mdc-cell-mono">{row.dleValue}</td>
                            <td>
                                <span className={`mdc-status ${statusBadgeClass(row.status)}`}>
                                    {statusLabel(row.status)}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function CompareSection({
    id,
    title,
    summary,
    expanded,
    onToggle,
    children,
}) {
    return (
        <section className="mdc-section" id={id}>
            <button
                type="button"
                className="mdc-section__header"
                onClick={onToggle}
                aria-expanded={expanded}
            >
                <span className="mdc-section__chevron">{expanded ? '▼' : '▶'}</span>
                <h2>{title}</h2>
                <SummaryBadges summary={summary} />
            </button>
            {expanded && <div className="mdc-section__body">{children}</div>}
        </section>
    );
}

export default function MrmDleComparePage() {
    const [mrmIdInput, setMrmIdInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [expanded, setExpanded] = useState({
        logs: true,
        tables: true,
        jobs: true,
        columns: true,
    });
    const [showMatches, setShowMatches] = useState(false);

    const toggleSection = (key) => {
        setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSearch = async () => {
        const mrmId = parseMrmId(mrmIdInput);
        if (mrmId === null) {
            setError('Enter a valid numeric MRM_ID.');
            setResult(null);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const data = await fetchMrmDleCompareData(ENVIRONMENT, mrmId, executeQuery);
            setResult(data);
        } catch (err) {
            setError(err.message || String(err));
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    const filterDiffRows = (entities) => {
        const rows = flattenEntityDiffs(entities);
        if (showMatches) return rows;
        return rows.filter((row) => row.status !== 'match');
    };

    const tableDiffRows = useMemo(
        () => (result ? filterDiffRows(result.tables.entities) : []),
        [result, showMatches]
    );
    const jobDiffRows = useMemo(
        () => (result ? filterDiffRows(result.jobs.entities) : []),
        [result, showMatches]
    );
    const columnDiffRows = useMemo(
        () => (result ? filterDiffRows(result.columns.entities) : []),
        [result, showMatches]
    );

    return (
        <div className="mrm-dle-compare-page">
            <HomeButton />
            <header className="mdc-header">
                <div>
                    <h1>MRM vs DLE Compare</h1>
                    <p className="mdc-subtitle">
                        Compare Metadaterium repository (MRM) definitions with live DLE metadata
                        for a given MRM_ID.
                    </p>
                </div>
            </header>

            <div className="mdc-controls">
                <label>
                    MRM_ID
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={mrmIdInput}
                        onChange={(e) => setMrmIdInput(e.target.value)}
                        placeholder="e.g. 761"
                    />
                </label>
                <button
                    type="button"
                    className="mdc-btn"
                    onClick={handleSearch}
                    disabled={loading}
                >
                    {loading ? 'Searching…' : 'Search'}
                </button>
                {result?.executionStatus && (
                    <ExecutionStatusBadge executionStatus={result.executionStatus} />
                )}
            </div>

            {error && <div className="mdc-error">{error}</div>}

            {result && (
                <>
                    <div className="mdc-options">
                        <label className="mdc-checkbox">
                            <input
                                type="checkbox"
                                checked={showMatches}
                                onChange={(e) => setShowMatches(e.target.checked)}
                            />
                            Show matching fields
                        </label>
                        <span className="mdc-meta">
                            MRM_ID {result.mrmId} · {result.rawCounts.mrmTables} MRM tables,{' '}
                            {result.rawCounts.dleTables} DLE tables
                        </span>
                    </div>

                    <CompareSection
                        id="mdc-logs"
                        title="MRM specification checks / logs"
                        summary={null}
                        expanded={expanded.logs}
                        onToggle={() => toggleSection('logs')}
                    >
                        <ReadOnlyTable
                            columns={result.logs.columns}
                            rows={result.logs.rows}
                        />
                    </CompareSection>

                    <CompareSection
                        id="mdc-tables"
                        title="MRM Tables vs DLE Tables"
                        summary={result.tables.summary}
                        expanded={expanded.tables}
                        onToggle={() => toggleSection('tables')}
                    >
                        <p className="mdc-match-key">
                            Match key: <code>table_name</code> (case-insensitive)
                        </p>
                        <DiffTable rows={tableDiffRows} />
                    </CompareSection>

                    <CompareSection
                        id="mdc-jobs"
                        title="MRM Jobs vs DLE Jobs"
                        summary={result.jobs.summary}
                        expanded={expanded.jobs}
                        onToggle={() => toggleSection('jobs')}
                    >
                        <p className="mdc-match-key">
                            Match key: <code>job_name</code>. Target/source refs resolved via DLE
                            table names.
                        </p>
                        <DiffTable rows={jobDiffRows} />
                    </CompareSection>

                    <CompareSection
                        id="mdc-columns"
                        title="MRM Columns vs DLE Columns"
                        summary={result.columns.summary}
                        expanded={expanded.columns}
                        onToggle={() => toggleSection('columns')}
                    >
                        <p className="mdc-match-key">
                            Match key: <code>table_name</code> + <code>column_name</code>
                        </p>
                        <DiffTable rows={columnDiffRows} />
                    </CompareSection>
                </>
            )}
        </div>
    );
}
