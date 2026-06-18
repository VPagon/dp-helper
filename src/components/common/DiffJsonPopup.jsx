import React, { useEffect, useMemo } from 'react';
import { parseDiffJson, parseDiffColumns } from 'utils/metadataDiffSql';

function normalizeEnvName(value) {
    return String(value || '').trim().toLowerCase();
}

function valuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function findEnvEntries(parsed) {
    if (!Array.isArray(parsed)) {
        return { dev: null, prod: null, isEnvArray: false, raw: parsed };
    }

    const dev = parsed.find(
        (entry) => entry && typeof entry === 'object' && normalizeEnvName(entry.env) === 'dev'
    );
    const prod = parsed.find(
        (entry) => entry && typeof entry === 'object' && normalizeEnvName(entry.env) === 'prod'
    );

    if (dev || prod) {
        return { dev, prod, isEnvArray: true, raw: null };
    }

    return { dev: null, prod: null, isEnvArray: false, raw: parsed };
}

function getBoldKeys(devEntry, prodEntry, diffFieldName) {
    const boldKeys = new Set();

    if (diffFieldName) {
        for (const columnName of parseDiffColumns(diffFieldName)) {
            boldKeys.add(columnName.toLowerCase());
        }
    }

    if (devEntry && prodEntry) {
        const allKeys = new Set([
            ...Object.keys(devEntry).filter((k) => k !== 'env'),
            ...Object.keys(prodEntry).filter((k) => k !== 'env'),
        ]);

        for (const key of allKeys) {
            if (!valuesEqual(devEntry[key], prodEntry[key])) {
                boldKeys.add(key.toLowerCase());
            }
        }
    }

    return boldKeys;
}

function JsonValue({ data, boldKeys, depth = 0 }) {
    if (data === null) {
        return <span className="json-null">null</span>;
    }

    if (data === undefined) {
        return <span className="json-undefined">—</span>;
    }

    if (typeof data !== 'object') {
        return (
            <span className={`json-primitive json-${typeof data}`}>
                {typeof data === 'string' ? JSON.stringify(data) : String(data)}
            </span>
        );
    }

    if (Array.isArray(data)) {
        if (data.length === 0) {
            return <span className="json-empty">[]</span>;
        }

        return (
            <ul className="json-array">
                {data.map((item, index) => (
                    <li key={index}>
                        <JsonValue data={item} boldKeys={boldKeys} depth={depth + 1} />
                    </li>
                ))}
            </ul>
        );
    }

    const entries = Object.entries(data);
    if (entries.length === 0) {
        return <span className="json-empty">{'{}'}</span>;
    }

    return (
        <dl className="json-object">
            {entries.map(([key, value]) => (
                <div key={key} className="json-entry">
                    <dt className={depth === 0 && boldKeys.has(key.toLowerCase()) ? 'json-key-bold' : ''}>
                        {key}
                    </dt>
                    <dd>
                        <JsonValue data={value} boldKeys={boldKeys} depth={depth + 1} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function EnvPanel({ label, data, boldKeys }) {
    if (!data) {
        return (
            <div className="diff-json-env-panel">
                <h4 className="diff-json-env-label">{label}</h4>
                <p className="diff-json-missing">No {label} entry in diff_json</p>
            </div>
        );
    }

    return (
        <div className="diff-json-env-panel">
            <h4 className="diff-json-env-label">{label}</h4>
            <div className="diff-json-viewer">
                <JsonValue data={data} boldKeys={boldKeys} />
            </div>
        </div>
    );
}

function DiffJsonPopup({ diffJson, diffField, onClose }) {
    const { parsed, parseError, comparison } = useMemo(() => {
        try {
            const parsedJson = parseDiffJson(diffJson);
            const envEntries = findEnvEntries(parsedJson);
            const boldKeys = envEntries.isEnvArray
                ? getBoldKeys(envEntries.dev, envEntries.prod, diffField)
                : getBoldKeys(null, null, diffField);

            return {
                parsed: parsedJson,
                parseError: null,
                comparison: { ...envEntries, boldKeys },
            };
        } catch (err) {
            return { parsed: null, parseError: err.message, comparison: null };
        }
    }, [diffJson, diffField]);

    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    return (
        <div className="diff-json-popup" onClick={onClose} role="presentation">
            <div
                className="popup-content diff-json-popup-content"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="diff-json-popup-title"
            >
                <div className="popup-header">
                    <h3 id="diff-json-popup-title">diff_json</h3>
                    <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                {parseError ? (
                    <div className="sql-generation-error">{parseError}</div>
                ) : comparison?.isEnvArray ? (
                    <>
                        {diffField && (
                            <p className="diff-json-field-hint">
                                Diff field: <strong>{diffField}</strong>
                            </p>
                        )}
                        <div className="diff-json-comparison">
                            <EnvPanel label="DEV" data={comparison.dev} boldKeys={comparison.boldKeys} />
                            <EnvPanel label="PROD" data={comparison.prod} boldKeys={comparison.boldKeys} />
                        </div>
                    </>
                ) : (
                    <div className="diff-json-single">
                        <div className="diff-json-viewer">
                            <JsonValue data={parsed} boldKeys={comparison?.boldKeys ?? new Set()} />
                        </div>
                    </div>
                )}

                <div className="popup-actions">
                    <button type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export default DiffJsonPopup;
