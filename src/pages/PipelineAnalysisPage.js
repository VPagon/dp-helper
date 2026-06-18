import React, { useState, useEffect } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import PipelineEnableDisableModal from '../components/pipeline/PipelineEnableDisableModal';
import { collectDqDleTableIdsFromJobs, getDleJobIsActive, parseActiveValue } from '../utils/pipelineEnableDisable';
import '../styles/pages/PipelineAnalysisPage.css';

/** parameters row: [?, pipeline_id?, parameter_name, parameter_value] — name at index 2 */
function findPipelineParameter(parameters, parameterName) {
    const target = parameterName.toUpperCase();
    return parameters.find(
        (param) => String(param[2] ?? '').trim().toUpperCase() === target
    );
}

function escapeSqlLiteral(value) {
    return String(value ?? '').replace(/'/g, "''");
}

/** Escape token for LIKE '%token%' — quotes plus % and _ wildcards */
function escapeSqlLikeLiteral(value) {
    return escapeSqlLiteral(value)
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
}

const SERVING_LAYER_JSON_COLUMNS = new Set([
    'source_object_settings',
    'target_object_settings',
    'definition_parameters',
]);

const SERVING_LAYER_SCALAR_COLUMNS = [
    'definition_type',
    'max_columns',
    'key_slr_tbe',
    'target_template',
    'is_active',
];

const DQ_TABLES_JSON_COLUMNS = new Set([
    'table_definition',
    'kvs_connection_string',
]);

const DQ_TABLES_SCALAR_COLUMNS = [
    'id',
    'table_name',
    'table_type',
    'table_definition_location',
    'table_definition_key',
    'filter',
    'stage_dq_table_name',
    'dq_indicator_column_name',
    'dq_issues_column_name',
    'table_group',
    'is_active',
    'f_check_column_datatypes',
    'key_email',
    'f_stage_only_failed_rows',
    'f_check_na_row_existence',
    'unique_key',
];

const DQ_COMPARE_JSON_COLUMNS = new Set(['keys_json', 'mapping_json']);

const DQ_COMPARE_SCALAR_COLUMNS = [
    'id',
    'dq_rle_id',
    'dq_tbe_id',
    'dq_tbe_id_referential',
    'ignore_columns_csv',
    'active_columns_csv',
    'f_compare_data',
    'f_compare_counts',
    'f_compare_schema',
    'severity',
    'is_active',
    'rule_classification',
    'rule_owner',
    'key_dq_cmp',
];

const DQ_REFERENTIAL_SCALAR_COLUMNS = [
    'id',
    'dq_rle_id',
    'dq_tbe_id',
    'dq_tbe_id_lookup',
    'foreign_key_name',
    'unique_key_name',
    'severity',
    'is_active',
    'rule_classification',
    'rule_owner',
    'key_dq_ref',
];

const DQ_CUSTOM_JSON_COLUMNS = new Set(['rule_definition', 'parameters_json', 'rule_sql']);

const DQ_CUSTOM_SCALAR_COLUMNS = [
    'id',
    'dq_rle_id',
    'dq_tbe_id',
    'rule_name',
    'severity',
    'is_active',
    'rule_classification',
    'rule_owner',
];

function normalizeObjectToken(raw) {
    if (raw == null || raw === '') return null;
    let t = String(raw).trim().toLowerCase();
    t = t.replace(
        /^(gld_|slr_|silver_|gold_|ppe_|ms_sql_|mssql_|rdl_|rdl_r_ln_dbo_|mssql_infor_dbo_|mssql_cdc_infor_dbo_)/gi,
        ''
    );
    t = t.replace(/_to_(bronze|silver|gold|landing|zone|ods|raw)(_[a-z0-9_]*)?$/gi, '');
    t = t.replace(/_delta$/i, '');
    const dMatch = t.match(/\b(d_[a-z0-9_]+)\b/i);
    if (dMatch) return dMatch[1].toLowerCase();
    const pathSegments = t.split(/[/\\]+/).filter(Boolean);
    if (pathSegments.length > 0) {
        const last = pathSegments[pathSegments.length - 1];
        if (last.length >= 2) return last;
    }
    const underscoreSegments = t.split('_').filter(Boolean);
    if (underscoreSegments.length > 0) {
        const dSeg = underscoreSegments.find((s) => /^d_[a-z0-9_]+$/i.test(s));
        if (dSeg) return dSeg.toLowerCase();
        return underscoreSegments[underscoreSegments.length - 1];
    }
    return t || null;
}

function extractTokensFromJsonSettings(jsonString, sourceLabel) {
    const found = [];
    if (!jsonString) return found;
    try {
        const obj = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        const visit = (value, keyPath) => {
            if (value == null) return;
            if (typeof value === 'string') {
                if (/file_path|folderpath|folder_path/i.test(keyPath)) {
                    const normalizedPath = String(value).replace(/\\/g, '/').toLowerCase();
                    found.push({
                        token: normalizedPath,
                        source: `${sourceLabel}.${keyPath}`,
                        strategy: 'directory_table_path',
                    });
                    const lastSeg = normalizedPath.split('/').filter(Boolean).pop();
                    if (lastSeg) {
                        found.push({
                            token: lastSeg,
                            source: `${sourceLabel}.file_path`,
                            strategy: 'file_path',
                        });
                    }
                }
                const dInStr = value.match(/\b(d_[a-z0-9_]+)\b/gi);
                if (dInStr) {
                    dInStr.forEach((m) =>
                        found.push({
                            token: m.toLowerCase(),
                            source: `${sourceLabel}.path_pattern`,
                            strategy: 'file_path',
                        })
                    );
                }
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((item, i) => visit(item, `${keyPath}[${i}]`));
                return;
            }
            if (typeof value === 'object') {
                Object.entries(value).forEach(([k, v]) => visit(v, keyPath ? `${keyPath}.${k}` : k));
            }
        };
        visit(obj, '');
        if (obj.file_path) {
            const normalizedPath = String(obj.file_path).replace(/\\/g, '/').toLowerCase();
            found.unshift({
                token: normalizedPath,
                source: `${sourceLabel}.file_path`,
                strategy: 'directory_table_path',
            });
            const lastSeg = normalizedPath.split('/').filter(Boolean).pop();
            if (lastSeg) {
                found.unshift({
                    token: lastSeg,
                    source: `${sourceLabel}.file_path`,
                    strategy: 'file_path',
                });
            }
        }
        if (obj.object) {
            const norm = normalizeObjectToken(obj.object);
            if (norm) {
                found.push({
                    token: norm,
                    source: `${sourceLabel}.object`,
                    strategy: 'target_object',
                });
            }
        }
        if (obj.table) {
            const norm = normalizeObjectToken(obj.table);
            if (norm) {
                found.push({
                    token: norm,
                    source: `${sourceLabel}.table`,
                    strategy: 'file_path',
                });
            }
        }
    } catch {
        const dInRaw = String(jsonString).match(/\b(d_[a-z0-9_]+)\b/gi);
        if (dInRaw) {
            dInRaw.forEach((m) =>
                found.push({
                    token: m.toLowerCase(),
                    source: `${sourceLabel}.raw_pattern`,
                    strategy: 'file_path',
                })
            );
        }
    }
    return found;
}

/** Gold/silver folder segments like 03_controlling — too broad alone for serving-layer lookup */
function isDirectoryOnlyToken(token) {
    return /^\d{2}_[a-z0-9_]+$/i.test(String(token ?? '').trim());
}

function collectTableObjectNames({ pipelineName, pipelineShortName, dleTableRows }) {
    const names = new Set();
    const addName = (raw) => {
        const norm = normalizeObjectToken(raw);
        if (norm && norm.length >= 2) names.add(norm);
    };
    (dleTableRows || []).forEach((tableRow) => {
        addName(tableRow[2]);
        addName(tableRow[4]);
    });
    addName(pipelineName);
    addName(pipelineShortName);
    return names;
}

/**
 * Build ordered serving-layer lookup strategies (most specific first).
 * 1. dle_tbe_id  2. file_path table name  3. target object  4. directory/table path  5. broad source LIKE (never directory-only unless 1 row)
 */
function deriveServingLayerLookupCandidates({
    pipelineName,
    pipelineShortName,
    jobName,
    dleTableRows,
    dataIngestionRows,
}) {
    const strategies = [];
    const seen = new Set();
    const add = (strategy, token, source, extra = {}) => {
        const rawToken = String(token ?? '').trim();
        if (!rawToken || rawToken.length < 2) return;
        const key = `${strategy}:${rawToken.toLowerCase()}:${extra.dleTbeId ?? ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        strategies.push({ strategy, token: rawToken, source, ...extra });
    };

    // 1. dle_tbe_id — ids from mda_dle_tables linked via mda_dle_jobs
    (dleTableRows || []).forEach((tableRow) => {
        const id = tableRow[0];
        const schemaName = tableRow[1];
        if (id != null && id !== '') {
            add('dle_tbe_id', String(id), `mda_dle_tables.id (${schemaName || 'table'})`, { dleTbeId: id });
        }
    });

    const tableObjectNames = collectTableObjectNames({ pipelineName, pipelineShortName, dleTableRows });

    // 2. Full table object name in source file_path
    tableObjectNames.forEach((name) => {
        add('file_path', name, 'mda_dle_tables.table_name/pipeline_name');
    });

    // 3. target_object_settings object name
    tableObjectNames.forEach((name) => {
        add('target_object', name, 'target_object_settings.object');
    });

    // 4. directory + table combined path (never directory segment alone)
    (dleTableRows || []).forEach((tableRow) => {
        const tableName = tableRow[2];
        const directory = tableRow[3];
        const alias = tableRow[4];
        const schemaName = tableRow[1];
        const objectName =
            normalizeObjectToken(tableName) || normalizeObjectToken(alias);
        if (directory && objectName) {
            const dir = String(directory).replace(/[/\\]+$/, '').replace(/\\/g, '/');
            add(
                'directory_table_path',
                `${dir}/${objectName}`.toLowerCase(),
                `mda_dle_tables.directory+table (${schemaName || 'table'})`
            );
        }
    });

    (dataIngestionRows || []).forEach((ingestion, idx) => {
        extractTokensFromJsonSettings(
            ingestion[2],
            `data_ingestion[${idx}].source_object_settings`
        ).forEach(({ token, source, strategy }) => add(strategy || 'file_path', token, source));
        extractTokensFromJsonSettings(
            ingestion[5],
            `data_ingestion[${idx}].sink_object_settings`
        ).forEach(({ token, source, strategy }) => add(strategy || 'target_object', token, source));
    });

    if (jobName) {
        const norm = normalizeObjectToken(jobName);
        if (norm && !isDirectoryOnlyToken(norm)) {
            add('source_like', norm, 'JOB_NAME parameter');
        }
    }

    if (strategies.length === 0 && pipelineName) {
        const fallback = normalizeObjectToken(pipelineName) || String(pipelineName).trim().toLowerCase();
        add('source_like', fallback, 'pipeline_name_fallback');
    }

    return strategies;
}

function buildServingLayerQuery({ strategy, token, dleTbeId }) {
    const likeToken = escapeSqlLikeLiteral(token);
    switch (strategy) {
        case 'dle_tbe_id': {
            const id = Number(dleTbeId);
            return `SELECT * FROM rep_mda.mda_dle_serving_layer_tables 
             WHERE source_object_settings LIKE '%"dle_tbe_id":${id}%' 
                OR source_object_settings LIKE '%"dle_tbe_id": ${id}%'`;
        }
        case 'file_path':
            return `SELECT * FROM rep_mda.mda_dle_serving_layer_tables 
             WHERE source_object_settings LIKE '%/${likeToken}%' ESCAPE '\\'
                OR source_object_settings LIKE '%"file_path":"%/${likeToken}"%' ESCAPE '\\'
                OR source_object_settings LIKE '%"file_path": "%/${likeToken}"%' ESCAPE '\\'`;
        case 'target_object':
            return `SELECT * FROM rep_mda.mda_dle_serving_layer_tables 
             WHERE target_object_settings LIKE '%"object":"${likeToken}"%' ESCAPE '\\'
                OR target_object_settings LIKE '%"object": "${likeToken}"%' ESCAPE '\\'`;
        case 'directory_table_path':
            return `SELECT * FROM rep_mda.mda_dle_serving_layer_tables 
             WHERE source_object_settings LIKE '%${likeToken}%' ESCAPE '\\'`;
        case 'source_like':
        default:
            return `SELECT * FROM rep_mda.mda_dle_serving_layer_tables 
             WHERE source_object_settings LIKE '%${likeToken}%' ESCAPE '\\'`;
    }
}

function formatServingLayerLookupLabel({ strategy, token, dleTbeId }) {
    if (strategy === 'dle_tbe_id') return `dle_tbe_id:${dleTbeId ?? token}`;
    return token;
}

function buildDqTablesSql(dleTableIds) {
    const ids = dleTableIds.join(', ');
    return `SELECT * FROM rep_mda.mda_dq_tables
WHERE table_definition_key IN (${ids})`;
}

function buildDqCompareSql(dqTableIds) {
    const ids = dqTableIds.join(', ');
    return `SELECT * FROM rep_mda.mda_dq_compare_tables
WHERE dq_tbe_id IN (${ids})
   OR dq_tbe_id_referential IN (${ids})`;
}

function buildDqReferentialSql(dqTableIds) {
    const ids = dqTableIds.join(', ');
    return `SELECT * FROM rep_mda.mda_dq_referential_integrities
WHERE dq_tbe_id IN (${ids})
   OR dq_tbe_id_lookup IN (${ids})`;
}

function buildDqCustomRulesSql(dqTableIds) {
    const ids = dqTableIds.join(', ');
    return `SELECT * FROM rep_mda.mda_dq_custom_rules
WHERE dq_tbe_id IN (${ids})`;
}

async function fetchDqRulesData(environment, dleTableIds) {
    if (!dleTableIds?.length) {
        return {
            dleTableIds: [],
            dqTablesRows: [],
            dqTablesColumns: [],
            dqCompareRows: [],
            dqCompareColumns: [],
            dqReferentialRows: [],
            dqReferentialColumns: [],
            dqCustomRulesRows: [],
            dqCustomRulesColumns: [],
            dqError: null,
        };
    }

    let dqError = null;
    let dqTablesRows = [];
    let dqTablesColumns = [];
    let dqCompareRows = [];
    let dqCompareColumns = [];
    let dqReferentialRows = [];
    let dqReferentialColumns = [];
    let dqCustomRulesRows = [];
    let dqCustomRulesColumns = [];

    try {
        const dqTablesResult = await executeQuery(environment, buildDqTablesSql(dleTableIds));
        dqTablesRows = dqTablesResult.rows ?? [];
        dqTablesColumns = dqTablesResult.columns ?? [];

        const dqTableIds = dqTablesRows
            .map((row) => rowByColumns(dqTablesColumns, row).id ?? row[0])
            .filter((id) => id != null && id !== '');

        if (dqTableIds.length > 0) {
            const [compareResult, referentialResult, customResult] = await Promise.all([
                executeQuery(environment, buildDqCompareSql(dqTableIds)),
                executeQuery(environment, buildDqReferentialSql(dqTableIds)),
                executeQuery(environment, buildDqCustomRulesSql(dqTableIds)),
            ]);
            dqCompareRows = compareResult.rows ?? [];
            dqCompareColumns = compareResult.columns ?? [];
            dqReferentialRows = referentialResult.rows ?? [];
            dqReferentialColumns = referentialResult.columns ?? [];
            dqCustomRulesRows = customResult.rows ?? [];
            dqCustomRulesColumns = customResult.columns ?? [];
        }
    } catch (err) {
        dqError = err.message;
    }

    return {
        dleTableIds,
        dqTablesRows,
        dqTablesColumns,
        dqCompareRows,
        dqCompareColumns,
        dqReferentialRows,
        dqReferentialColumns,
        dqCustomRulesRows,
        dqCustomRulesColumns,
        dqError,
    };
}

function isActiveValue(value) {
    return value === true || value === 1 || value === '1';
}

function isServingLayerRecordInactive(record) {
    const value = record.is_active;
    if (value === false || value === 0 || value === '0') return true;
    if (typeof value === 'string' && value.trim().toLowerCase() === 'false') return true;
    return false;
}

function isJsonLikeValue(value) {
    if (value == null || value === '') return false;
    const str = String(value).trim();
    return str.startsWith('{') || str.startsWith('[');
}

function isLongFieldValue(value) {
    if (value == null || value === '') return false;
    return String(value).length > 120;
}

function DqActiveBadge({ value }) {
    const active = isActiveValue(value);
    return (
        <span className={`dq-status-badge ${active ? 'active' : 'inactive'}`}>
            {active ? 'Active' : 'Inactive'}
        </span>
    );
}

function DqJsonField({ label, value, formatJSON }) {
    const display = value == null || value === '' ? 'N/A' : formatJSON(String(value));
    const isLong = display.length > 120;
    if (!isLong) {
        return (
            <div className="dq-field dq-field-json">
                <strong>{label}</strong>
                <pre className="json-pre dq-json-pre">{display}</pre>
            </div>
        );
    }
    return (
        <details className="dq-json-details">
            <summary>{label}</summary>
            <pre className="json-pre dq-json-pre">{display}</pre>
        </details>
    );
}

function DqRecordCard({
    title,
    record,
    columns,
    scalarColumns,
    jsonColumns,
    formatJSON,
    titleExtra,
}) {
    const jsonCols = columns.filter(
        (col) =>
            col !== 'is_active' &&
            (jsonColumns.has(col) ||
                (typeof record[col] === 'string' &&
                    (isJsonLikeValue(record[col]) || isLongFieldValue(record[col]))))
    );
    const scalarCols = [
        ...scalarColumns.filter((col) => record[col] !== undefined && col !== 'is_active'),
        ...columns.filter(
            (col) =>
                !jsonColumns.has(col) &&
                !scalarColumns.includes(col) &&
                !jsonCols.includes(col) &&
                col !== 'is_active'
        ),
    ];

    return (
        <div className="dq-card">
            <div className="dq-card-header">
                <h4 className="dq-card-title">
                    {title}
                    {titleExtra}
                </h4>
                {record.is_active !== undefined && (
                    <DqActiveBadge value={record.is_active} />
                )}
            </div>
            <div className="dq-scalars">
                {scalarCols.map((col) => (
                    <div key={col} className="dq-scalar-item">
                        <strong>{col}</strong>
                        <span>
                            {record[col] == null || record[col] === ''
                                ? 'N/A'
                                : String(record[col])}
                        </span>
                    </div>
                ))}
            </div>
            {jsonCols.length > 0 && (
                <div className="dq-json-fields">
                    {jsonCols.map((col) => (
                        <DqJsonField
                            key={col}
                            label={col}
                            value={record[col]}
                            formatJSON={formatJSON}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function DqRulesSubsection({ title, count, children, emptyMessage }) {
    return (
        <div className="dq-subsection">
            <h3 className="dq-subsection-title">
                {title} ({count})
            </h3>
            {count > 0 ? children : <p className="no-data dq-subsection-empty">{emptyMessage}</p>}
        </div>
    );
}

function CollapsibleDetailSection({ title, count, sectionClassName = '', children }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="detail-row collapsible-detail-section">
            <div className={`detail-section full-width collapsible-detail-section__panel ${sectionClassName}`.trim()}>
                <button
                    type="button"
                    className="collapsible-detail-section__header"
                    onClick={() => setExpanded((prev) => !prev)}
                    aria-expanded={expanded}
                >
                    <span className="collapsible-detail-section__title">
                        {title} ({count})
                    </span>
                    <span
                        className={`collapsible-detail-section__chevron${expanded ? ' collapsible-detail-section__chevron--expanded' : ''}`}
                        aria-hidden="true"
                    />
                </button>
                {expanded && (
                    <div className="collapsible-detail-section__content">{children}</div>
                )}
            </div>
        </div>
    );
}

async function fetchServingLayerByStrategies(environment, strategies) {
    let lastError = null;
    for (const entry of strategies) {
        const { strategy, token, source, dleTbeId } = entry;
        if (strategy === 'source_like' && isDirectoryOnlyToken(token)) {
            continue;
        }
        try {
            const sql = buildServingLayerQuery(entry);
            const servingResult = await executeQuery(environment, sql);
            const rows = servingResult.rows ?? [];
            if (rows.length === 0) continue;
            if (strategy === 'source_like' && isDirectoryOnlyToken(token) && rows.length !== 1) {
                continue;
            }
            return {
                rows,
                columns: servingResult.columns ?? [],
                lookupToken: formatServingLayerLookupLabel(entry),
                lookupSource: source,
                lookupStrategy: strategy,
            };
        } catch (servingErr) {
            lastError = servingErr.message;
        }
    }
    const first = strategies[0];
    return {
        rows: [],
        columns: [],
        lookupToken: first ? formatServingLayerLookupLabel(first) : '',
        lookupSource: first?.source ?? 'pipeline_name_fallback',
        lookupStrategy: first?.strategy ?? 'source_like',
        error: lastError,
    };
}

function rowByColumns(columns, row) {
    if (!columns?.length) return {};
    return columns.reduce((acc, col, i) => {
        acc[col] = row[i];
        return acc;
    }, {});
}

function ServingLayerJsonField({ label, value, formatJSON }) {
    const display = value == null || value === '' ? 'N/A' : formatJSON(String(value));
    const isLong = display.length > 120;
    if (!isLong) {
        return (
            <div className="serving-layer-field serving-layer-field-json">
                <strong>{label}</strong>
                <pre className="json-pre serving-layer-json-pre">{display}</pre>
            </div>
        );
    }
    return (
        <details className="serving-layer-json-details">
            <summary>{label}</summary>
            <pre className="json-pre serving-layer-json-pre">{display}</pre>
        </details>
    );
}

function PipelineAnalysisPage() {
    const [environment, setEnvironment] = useState('dev');
    const [pipelines, setPipelines] = useState([]);
    const [selectedPipeline, setSelectedPipeline] = useState(null);
    const [pipelineDetails, setPipelineDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [tableInfoPopup, setTableInfoPopup] = useState(null);
    const [tableDetails, setTableDetails] = useState(null);
    const [tableColumns, setTableColumns] = useState(null);
    const [enableDisableModalOpen, setEnableDisableModalOpen] = useState(false);

    // Fetch all pipelines
    const fetchPipelines = async () => {
        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT pipeline_id, pipeline_name, pipeline_short_name, enabled, pipeline_type 
         FROM rep_mda.mda_ocn_pipelines 
         ORDER BY 1 DESC`
            );
            setPipelines(result.rows);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch complete pipeline details — returns true when details were stored
    const fetchPipelineDetails = async (pipelineId) => {
        try {
            setLoading(true);
            setError(null);

            // Get pipeline basic info
            const pipelineResult = await executeQuery(
                environment,
                `SELECT top 1 * FROM rep_mda.mda_ocn_pipelines WHERE pipeline_id = ${pipelineId}`
            );
            const pipelineRow = pipelineResult.rows?.[0];
            if (!pipelineRow) {
                setError(`No pipeline found for id ${pipelineId}`);
                setPipelineDetails(null);
                return false;
            }

            // Get pipeline parameters
            const paramsResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_ocn_pipeline_parameters WHERE pipeline_id = ${pipelineId}`
            );

            // Get dependencies where this pipeline is the parent
            const dependenciesResult = await executeQuery(
                environment,
                `SELECT d.*, p.pipeline_name as dependant_name 
         FROM rep_mda.mda_ocn_pipeline_dependencies d
         JOIN rep_mda.mda_ocn_pipelines p ON d.dependant_pipeline_id = p.pipeline_id
         WHERE d.pipeline_id = ${pipelineId}`
            );

            // Get dependencies where this pipeline is the dependant
            const dependantResult = await executeQuery(
                environment,
                `SELECT d.*, p.pipeline_name as parent_name 
         FROM rep_mda.mda_ocn_pipeline_dependencies d
         JOIN rep_mda.mda_ocn_pipelines p ON d.pipeline_id = p.pipeline_id
         WHERE d.dependant_pipeline_id = ${pipelineId}`
            );

            // Get execution history
            const executionResult = await executeQuery(
                environment,
                `SELECT TOP 5 * FROM rep_mda.mda_ocn_execution_log 
         WHERE pipeline_id = ${pipelineId} 
         AND extract_date >= DATEADD(DAY, -30, GETDATE())
         ORDER BY 1 DESC`
            );

            const pipelineName = pipelineRow[1];
            const pipelineShortName = pipelineRow[2];
            const parameters = paramsResult.rows ?? [];
            const jobNameParam = findPipelineParameter(parameters, 'JOB_NAME');
            const jobNameFromParam = jobNameParam?.[3]?.trim();

            // DLE job: prefer JOB_NAME parameter value; fallback to pipeline_name when absent
            let dleJobLookupSource;
            let dleJobLookupValue;
            if (jobNameFromParam) {
                dleJobLookupSource = 'JOB_NAME';
                dleJobLookupValue = jobNameFromParam;
            } else {
                dleJobLookupSource = 'pipeline_name_fallback';
                dleJobLookupValue = pipelineName;
            }

            const dleJobsResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_dle_jobs 
         WHERE job_name = '${escapeSqlLiteral(dleJobLookupValue)}'`
            );

            // Check if this pipeline is related to data ingestion
            const ingestionResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_data_ingestion 
         WHERE job_name = '${escapeSqlLiteral(pipelineName)}'`
            );

            const dleJobs = dleJobsResult.rows ?? [];
            const dleJobsColumns = dleJobsResult.columns ?? [];
            let dleTableRows = [];
            let dleTablesError = null;
            const dleTableIds = [
                ...new Set(
                    dleJobs.flatMap((job) => [job[1], job[2]].filter((id) => id != null && id !== ''))
                ),
            ];
            const dqDleTableIds = collectDqDleTableIdsFromJobs(dleJobs);
            if (dleTableIds.length > 0) {
                try {
                    const dleTablesResult = await executeQuery(
                        environment,
                        `SELECT id, schema_name, table_name, directory, alias, is_active 
                         FROM rep_mda.mda_dle_tables 
                         WHERE id IN (${dleTableIds.join(',')})`
                    );
                    dleTableRows = dleTablesResult.rows ?? [];
                } catch (dleErr) {
                    dleTablesError = dleErr.message;
                    dleTableRows = [];
                }
            }

            const servingLayerCandidates = deriveServingLayerLookupCandidates({
                pipelineName,
                pipelineShortName,
                jobName: jobNameFromParam || dleJobLookupValue,
                dleTableRows,
                dataIngestionRows: ingestionResult.rows ?? [],
            });

            const servingLayerResult = await fetchServingLayerByStrategies(
                environment,
                servingLayerCandidates
            );
            const servingLayerRows = servingLayerResult.rows;
            const servingLayerColumns = servingLayerResult.columns;
            const servingLayerError = servingLayerResult.error ?? null;
            const servingLayerLookupToken = servingLayerResult.lookupToken;
            const servingLayerLookupSource = servingLayerResult.lookupSource;
            const servingLayerLookupStrategy = servingLayerResult.lookupStrategy;

            const dqRulesResult = await fetchDqRulesData(environment, dqDleTableIds);

            setPipelineDetails({
                pipeline: pipelineRow,
                parameters,
                dependencies: dependenciesResult.rows ?? [],
                dependants: dependantResult.rows ?? [],
                executionHistory: executionResult.rows ?? [],
                dataIngestion: ingestionResult.rows ?? [],
                dleJobs,
                dleJobsColumns,
                dleTableRows,
                dleJobLookupSource,
                dleJobLookupValue,
                dleTablesError,
                servingLayerRows,
                servingLayerColumns,
                servingLayerLookupToken,
                servingLayerLookupSource,
                servingLayerLookupStrategy,
                servingLayerCandidates,
                servingLayerError,
                dqDleTableIds: dqRulesResult.dleTableIds,
                dqTablesRows: dqRulesResult.dqTablesRows,
                dqTablesColumns: dqRulesResult.dqTablesColumns,
                dqCompareRows: dqRulesResult.dqCompareRows,
                dqCompareColumns: dqRulesResult.dqCompareColumns,
                dqReferentialRows: dqRulesResult.dqReferentialRows,
                dqReferentialColumns: dqRulesResult.dqReferentialColumns,
                dqCustomRulesRows: dqRulesResult.dqCustomRulesRows,
                dqCustomRulesColumns: dqRulesResult.dqCustomRulesColumns,
                dqError: dqRulesResult.dqError,
            });
            return true;

        } catch (err) {
            setError(err.message);
            setPipelineDetails(null);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Fetch dependency tree for a pipeline
    const fetchDependencyTree = async (pipelineId) => {
        try {
            setLoading(true);

            // Recursive CTE to get all upstream dependencies
            const upstreamResult = await executeQuery(
                environment,
                `WITH UpstreamCTE AS (
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, 1 AS level
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
            WHERE d.dependant_pipeline_id = ${pipelineId}
            
            UNION ALL
            
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, u.level + 1
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
            JOIN UpstreamCTE u ON d.dependant_pipeline_id = u.pipeline_id
            WHERE u.level < 5
          )
          SELECT * FROM UpstreamCTE ORDER BY level`
            );

            // Recursive CTE to get all downstream dependencies
            const downstreamResult = await executeQuery(
                environment,
                `WITH DownstreamCTE AS (
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, 1 AS level
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.dependant_pipeline_id
            WHERE d.pipeline_id = ${pipelineId}
            
            UNION ALL
            
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, d.level + 1
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies dep ON p.pipeline_id = dep.dependant_pipeline_id
            JOIN DownstreamCTE d ON dep.pipeline_id = d.pipeline_id
            WHERE d.level < 5
          )
          SELECT * FROM DownstreamCTE ORDER BY level`
            );

            setPipelineDetails((prev) => {
                if (!prev?.pipeline) return prev;
                return {
                    ...prev,
                    upstreamTree: upstreamResult.rows ?? [],
                    downstreamTree: downstreamResult.rows ?? [],
                };
            });

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPipelines();
    }, [environment]);

    const handlePipelineSelect = async (pipeline) => {
        setSelectedPipeline(pipeline);
        setPipelineDetails(null);
        const pipelineId = pipeline?.[0];
        if (pipelineId == null) return;
        const ok = await fetchPipelineDetails(pipelineId);
        if (ok) {
            await fetchDependencyTree(pipelineId);
        }
    };

    const filteredPipelines = pipelines.filter(pipeline =>
        pipeline[1].toLowerCase().includes(searchTerm.toLowerCase())
    );

    const fetchTableDetails = async (tableId) => {
        try {
            setLoading(true);
            setError(null);

            console.log('Fetching table details for ID:', tableId);

            // Get table details
            const tableResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_dle_tables WHERE id = ${tableId}`
            );

            console.log('Table result:', tableResult);

            // Get table columns
            const columnsResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_dle_columns WHERE dle_tbe_id = ${tableId} ORDER BY position`
            );

            console.log('Columns result:', columnsResult);

            if (tableResult.rows?.length > 0) {
                setTableDetails({
                    row: tableResult.rows[0],
                    columns: tableResult.columns ?? [],
                });
            } else {
                setError('No table found with the specified ID');
            }

            if (columnsResult.rows && columnsResult.rows.length > 0) {
                setTableColumns(columnsResult.rows);
            } else {
                setTableColumns([]);
            }

        } catch (err) {
            console.error('Error fetching table details:', err);
            setError(`Failed to fetch table details: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Handle right-click on table IDs
    // Handle right-click on table IDs
    const handleTableIdRightClick = async (e, tableId, tableType) => {
        e.preventDefault();

        if (!tableId) {
            setError('Table ID is missing');
            return;
        }

        console.log('Right-click on table ID:', tableId, 'Type:', tableType);

        setTableInfoPopup({
            visible: true,
            tableId: tableId,
            tableType: tableType
        });

        // Reset previous data
        setTableDetails(null);
        setTableColumns(null);
        setError(null);

        await fetchTableDetails(tableId);
    };

    // Close table info popup
    const closeTableInfoPopup = () => {
        setTableInfoPopup(null);
        setTableDetails(null);
        setTableColumns(null);
    };

    // Helper function to check if pipeline is enabled (handles both boolean and 0/1 values)
    const isPipelineEnabled = (pipeline) => {
        if (!pipeline) return false;
        return parseActiveValue(pipeline[6]);
    };

    const formatJSON = (jsonString) => {
        try {
            const json = JSON.parse(jsonString);
            return JSON.stringify(json, null, 2);
        } catch (e) {
            return jsonString; // Return original if not valid JSON
        }
    };

    return (
        <div className="pipeline-analysis-page">
            <HomeButton />
            <br />
            <h1>Pipeline Analysis</h1>

            <div className="controls">
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

                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search pipelines..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <button onClick={fetchPipelines} disabled={loading}>
                    Refresh
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="content-container">
                {/* Pipeline List */}
                <div className="pipeline-list">
                    <h2>Pipelines</h2>
                    {loading && <div className="loading">Loading pipelines...</div>}
                    <div className="pipeline-items">
                        {filteredPipelines.map((pipeline) => {
                            const isEnabled = pipeline[3]
                            return (
                                <div
                                    key={pipeline[0]}
                                    className={`pipeline-item ${selectedPipeline?.[0] === pipeline[0] ? 'selected' : ''} ${!isEnabled ? 'disabled' : ''}`}
                                    onClick={() => handlePipelineSelect(pipeline)}
                                >
                                    <div className="pipeline-name">{pipeline[1]}</div>
                                    <div className="pipeline-type">{pipeline[4]}</div>
                                    <div className={`pipeline-status ${isEnabled ? 'enabled' : 'disabled'}`}>
                                        {isEnabled ? 'Enabled' : 'Disabled'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Pipeline Details in Rows */}
                <div className="pipeline-details-rows">
                    {selectedPipeline && pipelineDetails?.pipeline ? (
                        <>
                            <div className="pipeline-detail-header">
                                <h2>Pipeline: {selectedPipeline[1]}</h2>
                                <button
                                    type="button"
                                    className="pipeline-enable-disable-btn"
                                    onClick={() => setEnableDisableModalOpen(true)}
                                    disabled={loading}
                                >
                                    Enable / Disable
                                </button>
                            </div>

                            {/* Basic Information Row */}
                            <div className="detail-row">
                                <div className="detail-section full-width">
                                    <h3>Basic Information</h3>
                                    <div className="info-grid">
                                        <div className="info-item">
                                            <strong>Pipeline ID:</strong> {pipelineDetails.pipeline?.[0] ?? 'N/A'}
                                        </div>
                                        <div className="info-item">
                                            <strong>Status:</strong>
                                            <span className={`status-indicator ${isPipelineEnabled(pipelineDetails.pipeline) ? 'enabled' : 'disabled'}`}>
                                                {isPipelineEnabled(pipelineDetails.pipeline) ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        <div className="info-item">
                                            <strong>Pipeline Type:</strong> {pipelineDetails.pipeline[18]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Schedule Type:</strong> {pipelineDetails.pipeline[4]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Owner:</strong> {pipelineDetails.pipeline[5]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Load Category:</strong> {pipelineDetails.pipeline[19]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Pipeline Priority:</strong> {pipelineDetails.pipeline[20]}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Parameters Row */}
                            {(pipelineDetails.parameters?.length ?? 0) > 0 && (
                                <div className="detail-row">
                                    <div className="detail-section full-width">
                                        <h3>Parameters ({pipelineDetails.parameters?.length ?? 0})</h3>
                                        <div className="parameters-grid">
                                            {(pipelineDetails.parameters ?? []).map((param, index) => (
                                                <div key={index} className="parameter-item">
                                                    <div className="parameter-name"><strong>{param[2]}:</strong></div>
                                                    <div className="parameter-value">{param[3]}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DLE Jobs Row — lookup via JOB_NAME parameter, or pipeline_name fallback */}
                            {(pipelineDetails.dleJobLookupSource === 'JOB_NAME' ||
                                pipelineDetails.dleJobLookupSource === 'pipeline_name_fallback') && (
                                <div className="detail-row">
                                    <div className="detail-section full-width">
                                        <h3>DLE Job Information</h3>
                                        {pipelineDetails.dleJobLookupSource === 'JOB_NAME' && (
                                            <p className="lookup-hint">
                                                Resolved from JOB_NAME parameter: <strong>{pipelineDetails.dleJobLookupValue}</strong>
                                            </p>
                                        )}
                                        {pipelineDetails.dleJobLookupSource === 'pipeline_name_fallback' && (
                                            <p className="lookup-hint no-job-name-param">
                                                No JOB_NAME parameter — using pipeline name as job name: <strong>{pipelineDetails.dleJobLookupValue}</strong>
                                            </p>
                                        )}
                                        {pipelineDetails.dleTablesError && (
                                            <p className="error-message dle-tables-error">
                                                DLE table lookup failed: {pipelineDetails.dleTablesError}
                                            </p>
                                        )}
                                        {(pipelineDetails.dleJobs?.length ?? 0) > 0 ? (
                                            <div className="dle-jobs-container">
                                                {(pipelineDetails.dleJobs ?? []).map((job, index) => {
                                                    const jobActive = getDleJobIsActive(
                                                        job,
                                                        pipelineDetails.dleJobsColumns
                                                    );
                                                    return (
                                                    <div key={index} className="job-section">
                                                        <h4>DLE Job: {job[3]}</h4>
                                                        <div className="info-grid">
                                                            <div className="info-item">
                                                                <strong>Job ID:</strong> {job[0]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Target Table ID:</strong>
                                                                <span
                                                                    className="table-id-link"
                                                                    onContextMenu={(e) => handleTableIdRightClick(e, job[1], 'target')}
                                                                    title="Right-click for table details"
                                                                >
                                                                    {job[1]}
                                                                </span>
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Source Table ID:</strong>
                                                                <span
                                                                    className="table-id-link"
                                                                    onContextMenu={(e) => handleTableIdRightClick(e, job[2], 'source')}
                                                                    title="Right-click for table details"
                                                                >
                                                                    {job[2]}
                                                                </span>
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Job Type:</strong> {job[4]}
                                                            </div>
                                                            <div className="info-item full-width-item">
                                                                <strong>Filter:</strong>
                                                                <pre className="sql-code">{job[7] || 'N/A'}</pre>
                                                            </div>
                                                            <div className="info-item full-width-item">
                                                                <strong>Script:</strong>
                                                                <pre className="sql-code">{job[8] || 'N/A'}</pre>
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Load type:</strong> {job[9]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Check Source Deleted Records:</strong> {job[10]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>GLD Delete Non Existing Records:</strong> {job[11]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Active:</strong>
                                                                <span className={`status ${jobActive ? 'active' : 'inactive'}`}>
                                                                    {jobActive ? 'Yes' : 'No'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        ) : pipelineDetails.dleJobLookupSource === 'JOB_NAME' ? (
                                            <p className="no-data">
                                                No DLE job found for JOB_NAME &quot;{pipelineDetails.dleJobLookupValue}&quot;
                                            </p>
                                        ) : (
                                            <p className="no-data">
                                                No DLE job found for pipeline name &quot;{pipelineDetails.dleJobLookupValue}&quot;
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Data Ingestion Row - Show if RUN_ARRAY parameter exists or data ingestion job exists */}
                            {((pipelineDetails.parameters ?? []).some(param => param[2] === 'RUN_ARRAY') ||
                                (pipelineDetails.dataIngestion?.length ?? 0) > 0) && (
                                    <div className="detail-row">
                                        <div className="detail-section full-width">
                                            <h3>Data Ingestion Information</h3>
                                            {(pipelineDetails.dataIngestion?.length ?? 0) > 0 ? (
                                                <div className="ingestion-container">
                                                    {(pipelineDetails.dataIngestion ?? []).map((ingestion, index) => (
                                                        <div key={index} className="ingestion-section">
                                                            <h4>Data Ingestion: {ingestion[1]}</h4>
                                                            <div className="ingestion-info-rows">
                                                                <div className="ingestion-row">
                                                                    <strong>Ingestion ID:</strong> {ingestion[0]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Source Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[2])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Connection Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[3])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Copy Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[4])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Sink Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[5])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Copy Activity Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[8])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Calling Entity:</strong> {ingestion[9]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Triggering Entity:</strong> {ingestion[10]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Data Loading Behavior:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[11])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Task ID:</strong> {ingestion[12]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Task Name:</strong> {ingestion[13]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Enabled:</strong> {ingestion[14] ? 'Yes' : 'No'}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Last Modified:</strong> {ingestion[15]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>User Last Modified:</strong> {ingestion[16]}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (pipelineDetails.parameters ?? []).some(param => param[2] === 'RUN_ARRAY') ? (
                                                <p className="no-data">RUN_ARRAY parameter found but no data ingestion job exists</p>
                                            ) : (
                                                <p className="no-data">No data ingestion information available</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                            {/* Dependencies Row */}
                            <div className="detail-row">
                                <div className="detail-section full-width">
                                    <h3>Dependencies</h3>
                                    <div className="dependencies-container">
                                        <div className="dependency-column">
                                            <h4>↑ Downstream Dependencies (Executes Before) ({pipelineDetails.dependencies?.length ?? 0})</h4>
                                            {(pipelineDetails.dependencies?.length ?? 0) > 0 ? (
                                                <div className="dependency-list">
                                                    {(pipelineDetails.dependencies ?? []).map((dep, index) => (
                                                        <div key={index} className="dependency-item">
                                                            <div className="dependency-name">{dep[8]}</div>
                                                            <div className="dependency-details">
                                                                ID: {dep[2]} • Lag: {dep[3]}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="no-data">No downstream dependencies</p>
                                            )}
                                        </div>

                                        <div className="dependency-column">
                                            <h4>↓ Upstream Dependencies (Executes After) ({pipelineDetails.dependants?.length ?? 0})</h4>
                                            {(pipelineDetails.dependants?.length ?? 0) > 0 ? (
                                                <div className="dependency-list">
                                                    {(pipelineDetails.dependants ?? []).map((dep, index) => (
                                                        <div key={index} className="dependency-item">
                                                            <div className="dependency-name">{dep[8]}</div>
                                                            <div className="dependency-details">
                                                                ID: {dep[1]} • Lag: {dep[3]}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="no-data">No upstream dependencies</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Execution History Row */}
                            <div className="detail-row">
                                <div className="detail-section full-width">
                                    <h3>Recent Executions ({pipelineDetails.executionHistory?.length ?? 0})</h3>
                                    {(pipelineDetails.executionHistory?.length ?? 0) > 0 ? (
                                        <div className="execution-grid">
                                            {(pipelineDetails.executionHistory ?? []).map((exec, index) => (
                                                <div key={index} className="execution-item">
                                                    <div className="execution-header">
                                                        <span className={`status status-${exec[3]?.toLowerCase()}`}>
                                                            {exec[3]}
                                                        </span>
                                                        <span className="execution-date">
                                                            {exec[9] ? new Date(exec[10]).toLocaleDateString() : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="execution-details">
                                                        <strong>Extract Date: </strong>{exec[6] ? new Date(exec[6]).toLocaleString() : 'N/A'}    |    <strong>Start Date: </strong>{exec[9] ? new Date(exec[9]).toLocaleString() : 'N/A'}    |    <strong>End Date: </strong>{exec[10] ? new Date(exec[10]).toLocaleString() : 'N/A'}
                                                        {exec[9] && exec[10] && (
                                                            <div className="execution-duration">
                                                                Duration: {(new Date(exec[10]) - new Date(exec[9])) / 60000}min
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="no-data">No execution history found</p>
                                    )}
                                </div>
                            </div>

                            {/* Serving Layer View — after Recent Executions */}
                            <CollapsibleDetailSection
                                key={`serving-layer-${selectedPipeline[0]}`}
                                title="Serving Layer View"
                                count={pipelineDetails.servingLayerRows?.length ?? 0}
                                sectionClassName="serving-layer-section"
                            >
                                    {pipelineDetails.dleTablesError && (
                                        <p className="lookup-hint no-job-name-param">
                                            DLE tables unavailable for serving-layer tokens — using pipeline/job/ingestion only.
                                        </p>
                                    )}
                                    {pipelineDetails.servingLayerError && (
                                        <p className="error-message serving-layer-error">
                                            Serving layer query failed: {pipelineDetails.servingLayerError}
                                        </p>
                                    )}
                                    <p className="lookup-hint">
                                        Lookup: <strong>{pipelineDetails.servingLayerLookupToken || 'N/A'}</strong>
                                        {' '}
                                        via <code>{pipelineDetails.servingLayerLookupStrategy || 'source_like'}</code>
                                        {' '}
                                        (from {pipelineDetails.servingLayerLookupSource})
                                    </p>
                                    {(pipelineDetails.servingLayerRows?.length ?? 0) > 0 ? (
                                        <div className="serving-layer-container">
                                            {(pipelineDetails.servingLayerRows ?? []).map((row, index) => {
                                                const servingColumns = pipelineDetails.servingLayerColumns ?? [];
                                                const record = rowByColumns(servingColumns, row);
                                                const jsonCols = servingColumns.filter(
                                                    (col) =>
                                                        SERVING_LAYER_JSON_COLUMNS.has(col) ||
                                                        (typeof record[col] === 'string' &&
                                                            (record[col].trim().startsWith('{') ||
                                                                record[col].trim().startsWith('[')))
                                                );
                                                const scalarCols = [
                                                    ...SERVING_LAYER_SCALAR_COLUMNS.filter(
                                                        (col) => record[col] !== undefined
                                                    ),
                                                    ...servingColumns.filter(
                                                        (col) =>
                                                            !SERVING_LAYER_JSON_COLUMNS.has(col) &&
                                                            !SERVING_LAYER_SCALAR_COLUMNS.includes(col) &&
                                                            !jsonCols.includes(col)
                                                    ),
                                                ];
                                                const isInactive = isServingLayerRecordInactive(record);
                                                return (
                                                    <div
                                                        key={index}
                                                        className={`serving-layer-card${isInactive ? ' serving-layer-card--inactive' : ''}`}
                                                    >
                                                        <h4>
                                                            Serving layer entry {index + 1}
                                                            {record.key_slr_tbe != null && record.key_slr_tbe !== '' && (
                                                                <span className="serving-layer-key">
                                                                    {' '}
                                                                    · {record.key_slr_tbe}
                                                                </span>
                                                            )}
                                                        </h4>
                                                        <div className="serving-layer-scalars">
                                                            {scalarCols.map((col) => (
                                                                <div
                                                                    key={col}
                                                                    className={`serving-layer-scalar-item${col === 'is_active' && isInactive ? ' serving-layer-scalar-item--inactive' : ''}`}
                                                                >
                                                                    <strong>{col}</strong>
                                                                    <span
                                                                        className={
                                                                            col === 'is_active' && isInactive
                                                                                ? 'serving-layer-is-active-value--inactive'
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        {record[col] == null || record[col] === ''
                                                                            ? 'N/A'
                                                                            : String(record[col])}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="serving-layer-json-fields">
                                                            {jsonCols.map((col) => (
                                                                <ServingLayerJsonField
                                                                    key={col}
                                                                    label={col}
                                                                    value={record[col]}
                                                                    formatJSON={formatJSON}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="no-data">
                                            No serving layer tables found for lookup token &quot;
                                            {pipelineDetails.servingLayerLookupToken}&quot;
                                        </p>
                                    )}
                            </CollapsibleDetailSection>

                            {/* DQ Tables & Rules — after Serving Layer View */}
                            <CollapsibleDetailSection
                                key={`dq-rules-${selectedPipeline[0]}`}
                                title="DQ Tables & Rules"
                                count={
                                    (pipelineDetails.dqTablesRows?.length ?? 0) +
                                    (pipelineDetails.dqCompareRows?.length ?? 0) +
                                    (pipelineDetails.dqReferentialRows?.length ?? 0) +
                                    (pipelineDetails.dqCustomRulesRows?.length ?? 0)
                                }
                                sectionClassName="dq-section"
                            >
                                    {(pipelineDetails.dqDleTableIds?.length ?? 0) > 0 ? (
                                        <p className="lookup-hint">
                                            Resolved from target DLE table ids:{' '}
                                            <strong>{pipelineDetails.dqDleTableIds.join(', ')}</strong>
                                        </p>
                                    ) : (
                                        <p className="lookup-hint no-job-name-param">
                                            No DLE table ids — DQ rules cannot be resolved for this pipeline.
                                        </p>
                                    )}
                                    {pipelineDetails.dqError && (
                                        <p className="error-message dq-error">
                                            DQ rules query failed: {pipelineDetails.dqError}
                                        </p>
                                    )}
                                    {(pipelineDetails.dqTablesRows?.length ?? 0) === 0 &&
                                    !pipelineDetails.dqError ? (
                                        <p className="no-data">
                                            No DQ tables found for DLE table definition keys.
                                        </p>
                                    ) : (
                                        <div className="dq-container">
                                            <DqRulesSubsection
                                                title="DQ Tables"
                                                count={pipelineDetails.dqTablesRows?.length ?? 0}
                                                emptyMessage="No DQ table definitions matched."
                                            >
                                                <div className="dq-cards">
                                                    {(pipelineDetails.dqTablesRows ?? []).map((row, index) => {
                                                        const cols = pipelineDetails.dqTablesColumns ?? [];
                                                        const record = rowByColumns(cols, row);
                                                        return (
                                                            <DqRecordCard
                                                                key={record.id ?? index}
                                                                title={record.table_name || `DQ table ${index + 1}`}
                                                                record={record}
                                                                columns={cols}
                                                                scalarColumns={DQ_TABLES_SCALAR_COLUMNS}
                                                                jsonColumns={DQ_TABLES_JSON_COLUMNS}
                                                                formatJSON={formatJSON}
                                                                titleExtra={
                                                                    record.key_dq_tbe != null ? (
                                                                        <span className="dq-card-key">
                                                                            {' '}
                                                                            · {record.key_dq_tbe}
                                                                        </span>
                                                                    ) : null
                                                                }
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </DqRulesSubsection>

                                            <DqRulesSubsection
                                                title="Compare Tables"
                                                count={pipelineDetails.dqCompareRows?.length ?? 0}
                                                emptyMessage="No compare-table rules for matched DQ tables."
                                            >
                                                <div className="dq-cards">
                                                    {(pipelineDetails.dqCompareRows ?? []).map((row, index) => {
                                                        const cols = pipelineDetails.dqCompareColumns ?? [];
                                                        const record = rowByColumns(cols, row);
                                                        return (
                                                            <DqRecordCard
                                                                key={record.id ?? index}
                                                                title={
                                                                    record.key_dq_cmp ||
                                                                    `Compare rule ${index + 1}`
                                                                }
                                                                record={record}
                                                                columns={cols}
                                                                scalarColumns={DQ_COMPARE_SCALAR_COLUMNS}
                                                                jsonColumns={DQ_COMPARE_JSON_COLUMNS}
                                                                formatJSON={formatJSON}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </DqRulesSubsection>

                                            <DqRulesSubsection
                                                title="Referential Integrity"
                                                count={pipelineDetails.dqReferentialRows?.length ?? 0}
                                                emptyMessage="No referential integrity rules for matched DQ tables."
                                            >
                                                <div className="dq-cards">
                                                    {(pipelineDetails.dqReferentialRows ?? []).map((row, index) => {
                                                        const cols = pipelineDetails.dqReferentialColumns ?? [];
                                                        const record = rowByColumns(cols, row);
                                                        return (
                                                            <DqRecordCard
                                                                key={record.id ?? index}
                                                                title={
                                                                    record.key_dq_ref ||
                                                                    `Referential rule ${index + 1}`
                                                                }
                                                                record={record}
                                                                columns={cols}
                                                                scalarColumns={DQ_REFERENTIAL_SCALAR_COLUMNS}
                                                                jsonColumns={new Set()}
                                                                formatJSON={formatJSON}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </DqRulesSubsection>

                                            <DqRulesSubsection
                                                title="Custom Rules"
                                                count={pipelineDetails.dqCustomRulesRows?.length ?? 0}
                                                emptyMessage="No custom rules for matched DQ tables."
                                            >
                                                <div className="dq-cards">
                                                    {(pipelineDetails.dqCustomRulesRows ?? []).map((row, index) => {
                                                        const cols = pipelineDetails.dqCustomRulesColumns ?? [];
                                                        const record = rowByColumns(cols, row);
                                                        return (
                                                            <DqRecordCard
                                                                key={record.id ?? index}
                                                                title={
                                                                    record.rule_name ||
                                                                    `Custom rule ${index + 1}`
                                                                }
                                                                record={record}
                                                                columns={cols}
                                                                scalarColumns={DQ_CUSTOM_SCALAR_COLUMNS}
                                                                jsonColumns={DQ_CUSTOM_JSON_COLUMNS}
                                                                formatJSON={formatJSON}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </DqRulesSubsection>
                                        </div>
                                    )}
                            </CollapsibleDetailSection>
                        </>
                    ) : (
                        <div className="no-selection">
                            {selectedPipeline ? 'Loading pipeline details...' : 'Select a pipeline to view details'}
                        </div>
                    )}
                </div>
            </div>
            {/* Table Info Popup */}
            {tableInfoPopup?.visible && (
                <>
                    <div className="popup-overlay" onClick={closeTableInfoPopup} />
                    <div
                        className="table-info-popup"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="popup-header">
                            <h3>Table Details: {tableInfoPopup.tableType.toUpperCase()} Table ID {tableInfoPopup.tableId}</h3>
                            <button className="close-popup-btn" onClick={closeTableInfoPopup}>×</button>
                        </div>

                        {loading ? (
                            <div className="popup-loading">Loading table details...</div>
                        ) : error ? (
                            <div className="popup-error">{error}</div>
                        ) : tableDetails?.row ? (
                            <div className="table-details-content">
                                {/* Table Information */}
                                <div className="table-info-section">
                                    <h4>Table Information</h4>
                                    <div className="table-info-grid">
                                        {(() => {
                                            const t = rowByColumns(tableDetails.columns, tableDetails.row);
                                            const field = (key, label) => (
                                                <div key={key}>
                                                    <strong>{label}:</strong>{' '}
                                                    {t[key] == null || t[key] === '' ? 'N/A' : String(t[key])}
                                                </div>
                                            );
                                            return (
                                                <>
                                                    {field('id', 'ID')}
                                                    {field('zone_name', 'Zone')}
                                                    {field('schema_name', 'Schema')}
                                                    <div className="long-content-field" key="table_name">
                                                        <strong>Table Name:</strong>
                                                        <div className="scrollable-content">
                                                            {t.table_name ?? 'N/A'}
                                                        </div>
                                                    </div>
                                                    <div className="long-content-field" key="directory">
                                                        <strong>Directory:</strong>
                                                        <div className="scrollable-content">
                                                            {t.directory ?? 'N/A'}
                                                        </div>
                                                    </div>
                                                    {field('alias', 'Alias')}
                                                    {field('partition_format', 'Partition Format')}
                                                    {field('table_type', 'Table Type')}
                                                    <div key="is_active">
                                                        <strong>Active:</strong>{' '}
                                                        {parseActiveValue(t.is_active) ? 'Yes' : 'No'}
                                                    </div>
                                                    {field('key_dle_tbe', 'Key')}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Table Columns */}
                                {tableColumns && tableColumns.length > 0 ? (
                                    <div className="columns-section">
                                        <h4>Columns ({tableColumns.length})</h4>
                                        <div className="columns-table">
                                            <div className="columns-header">
                                                <span>Table ID</span>
                                                <span>Name</span>
                                                <span>Position</span>
                                                <span>Business Key</span>
                                                <span>Is Hash</span>
                                                <span>Is Audit</span>
                                                <span>Is Active</span>
                                                <span>Mapping</span>
                                            </div>
                                            {tableColumns.map((column, index) => (
                                                <div key={index} className="column-row">
                                                    <span>{column[1] || 'N/A'}</span>
                                                    <span>{column[2] || 'N/A'}</span>
                                                    <span>{column[4] || 'N/A'}</span>
                                                    <span>{column[5] ? 'Yes' : 'No'}</span>
                                                    <span>{column[6] ? 'Yes' : 'No'}</span>
                                                    <span>{column[7] ? 'Yes' : 'No'}</span>
                                                    <span>{column[8] ? 'Yes' : 'No'}</span>
                                                    <span>{column[12] || 'N/A'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="no-columns">No columns found for this table</div>
                                )}
                            </div>
                        ) : (
                            <div className="no-table-data">No table details available</div>
                        )}
                    </div>
                </>
            )}

            <PipelineEnableDisableModal
                visible={enableDisableModalOpen}
                onClose={() => setEnableDisableModalOpen(false)}
                environment={environment}
                pipelineName={selectedPipeline?.[1]}
                pipelineDetails={pipelineDetails}
                onStatusChanged={async () => {
                    await fetchPipelines();
                    if (selectedPipeline?.[0] != null) {
                        await fetchPipelineDetails(selectedPipeline[0]);
                    }
                }}
            />
        </div>
    );
}

export default PipelineAnalysisPage;