import { rowToRecord } from './metadataDiffSql';

export const TABLE_KEY_FIELDS = ['zone_name', 'schema_name', 'table_name'];

export const TABLE_COMPARE_FIELDS = [
    'directory',
    'alias',
    'partition_format',
    'table_type',
    'optimizing_schedule',
    'table_format',
    'key_dle_tbe',
];

export const JOB_COMPARE_FIELDS = [
    'job_type',
    'filter',
    'transformation_script',
    'load_type',
    'check_source_deleted_records',
    'gld_delete_non_existing_records',
];

export const JOB_TABLE_REF_FIELDS = ['src_dle_tbe_id', 'tgt_dle_tbe_id'];

export const COLUMN_COMPARE_FIELDS = ['mapping'];

export const COLUMN_TABLE_REF_FIELD = 'dle_tbe_id';

/** Zones excluded from column comparison (per MRM/DLE spec SQL). */
export const EXCLUDED_COLUMN_ZONES = ['ODS', 'SLR_STG'];

/** @returns {number|null} */
export function parseMrmId(value) {
    const trimmed = String(value ?? '').trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    return n;
}

export function rowsToRecords(columns, rows) {
    if (!Array.isArray(columns) || !Array.isArray(rows)) return [];
    return rows.map((row) => rowToRecord(columns, row)).filter(Boolean);
}

function normalizeKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

/** @param {object|null|undefined} row @param {string[]} keyFields */
export function buildEntityKey(row, keyFields) {
    if (!row || !keyFields?.length) return '';
    return keyFields.map((field) => normalizeKey(row[field])).join('|');
}

function buildEntityLabel(row, keyFields) {
    if (!row || !keyFields?.length) return '';
    return keyFields.map((field) => row[field] ?? '?').join(' / ');
}

function normalizeValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).trim();
}

function valuesEqual(a, b) {
    const normA = normalizeValue(a);
    const normB = normalizeValue(b);
    if (normA === normB) return true;
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
    return normA.toLowerCase() === normB.toLowerCase();
}

export function isExcludedColumnZone(zone) {
    return EXCLUDED_COLUMN_ZONES.includes(String(zone ?? '').trim().toUpperCase());
}

function isActiveRow(row) {
    return row?.is_active == 1 || row?.is_active === true;
}

function resolveTableRef(value, dleTableById, dleTableByName, refKeyFields = ['table_name']) {
    if (value === null || value === undefined || value === '') return '';

    const asString = String(value).trim();
    const asNumber = Number(asString);
    if (Number.isFinite(asNumber) && dleTableById.has(asNumber)) {
        const tableRow = dleTableById.get(asNumber);
        return buildEntityKey(tableRow, refKeyFields) || normalizeKey(tableRow.table_name);
    }

    const byName = dleTableByName.get(normalizeKey(asString));
    if (byName) {
        return buildEntityKey(byName, refKeyFields) || normalizeKey(byName.table_name);
    }

    return normalizeKey(asString);
}

function formatDisplayValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function compareFieldList(mrmRow, dleRow, fields, options = {}) {
    const {
        resolveRefs = false,
        dleTableById,
        dleTableByName,
        refKeyFields = ['table_name'],
        resolveMrmRef,
        resolveDleRef,
    } = options;

    return fields.map((field) => {
        const mrmRaw = mrmRow?.[field];
        const dleRaw = dleRow?.[field];
        const mrmHas = mrmRow != null && Object.prototype.hasOwnProperty.call(mrmRow, field);
        const dleHas = dleRow != null && Object.prototype.hasOwnProperty.call(dleRow, field);

        let mrmValue = mrmRaw;
        let dleValue = dleRaw;
        let status = 'match';

        if (!mrmHas && !dleHas) {
            status = 'match';
        } else if (!mrmHas) {
            status = 'missing_mrm';
        } else if (!dleHas) {
            status = 'missing_dle';
        } else if (resolveRefs) {
            const mrmResolved =
                resolveMrmRef?.(mrmRaw, mrmRow) ??
                resolveTableRef(mrmRaw, dleTableById, dleTableByName, refKeyFields);
            const dleResolved =
                resolveDleRef?.(dleRaw, dleRow) ??
                resolveTableRef(dleRaw, dleTableById, dleTableByName, refKeyFields);
            mrmValue = mrmResolved || formatDisplayValue(mrmRaw);
            dleValue = dleResolved || formatDisplayValue(dleRaw);
            if (mrmResolved !== dleResolved) status = 'diff';
        } else if (!valuesEqual(mrmRaw, dleRaw)) {
            status = 'diff';
        }

        return {
            field,
            mrmValue: formatDisplayValue(mrmValue),
            dleValue: formatDisplayValue(dleValue),
            status,
        };
    });
}

/**
 * @param {object} params
 * @param {Array<object>} params.mrmRows
 * @param {Array<object>} params.dleRows
 * @param {string} [params.keyField]
 * @param {string[]} [params.keyFields]
 * @param {string[]} params.compareFields
 * @param {object} [params.options]
 */
export function compareEntitySets({
    mrmRows,
    dleRows,
    keyField,
    keyFields,
    compareFields,
    options = {},
}) {
    const entityKeyFields = keyFields ?? (keyField ? [keyField] : []);
    const mrmMap = new Map();
    const dleMap = new Map();

    (mrmRows || []).forEach((row) => {
        const key = buildEntityKey(row, entityKeyFields);
        if (key) mrmMap.set(key, row);
    });

    (dleRows || []).forEach((row) => {
        const key = buildEntityKey(row, entityKeyFields);
        if (key) dleMap.set(key, row);
    });

    const allKeys = new Set([...mrmMap.keys(), ...dleMap.keys()]);
    const entities = [];
    let matched = 0;
    let differ = 0;
    let onlyMrm = 0;
    let onlyDle = 0;

    [...allKeys].sort().forEach((key) => {
        const mrmRow = mrmMap.get(key);
        const dleRow = dleMap.get(key);

        const labelRow = mrmRow ?? dleRow;

        if (mrmRow && !dleRow) {
            onlyMrm += 1;
            entities.push({
                key,
                label: buildEntityLabel(labelRow, entityKeyFields) || key,
                entityStatus: 'only_mrm',
                fields: [],
                mrmRow,
                dleRow: null,
            });
            return;
        }

        if (!mrmRow && dleRow) {
            onlyDle += 1;
            entities.push({
                key,
                label: buildEntityLabel(labelRow, entityKeyFields) || key,
                entityStatus: 'only_dle',
                fields: [],
                mrmRow: null,
                dleRow,
            });
            return;
        }

        const fields = compareFieldList(mrmRow, dleRow, compareFields, options);
        const hasDiff = fields.some((f) => f.status !== 'match');

        if (hasDiff) {
            differ += 1;
        } else {
            matched += 1;
        }

        entities.push({
            key,
            label: buildEntityLabel(labelRow, entityKeyFields) || key,
            entityStatus: hasDiff ? 'diff' : 'match',
            fields,
            mrmRow,
            dleRow,
        });
    });

    return {
        summary: { matched, differ, onlyMrm, onlyDle },
        entities,
    };
}

function buildDleTableLookups(dleTableRows) {
    const dleTableById = new Map();
    const dleTableByName = new Map();

    (dleTableRows || []).forEach((row) => {
        const id = row.id;
        if (id != null) dleTableById.set(Number(id), row);
        if (row.table_name) {
            const nameKey = normalizeKey(row.table_name);
            if (!dleTableByName.has(nameKey)) dleTableByName.set(nameKey, row);
        }
    });

    return { dleTableById, dleTableByName };
}

function resolveMrmColumnTableContext(mrmColumn, mrmTableRows) {
    const tableNameKey = normalizeKey(mrmColumn.dle_tbe_id);
    if (!tableNameKey) {
        return { zone_name: mrmColumn.zone_name ?? '', table_name: mrmColumn.table_name ?? '' };
    }

    const candidates = (mrmTableRows || []).filter((tableRow) => {
        if (normalizeKey(tableRow.table_name) !== tableNameKey) return false;
        if (isExcludedColumnZone(tableRow.zone_name)) return false;
        if (!isActiveRow(tableRow)) return false;
        if (
            mrmColumn.zone_name &&
            normalizeKey(mrmColumn.zone_name) !== normalizeKey(tableRow.zone_name)
        ) {
            return false;
        }
        return true;
    });

    if (candidates.length === 1) {
        return {
            zone_name: candidates[0].zone_name,
            table_name: candidates[0].table_name,
        };
    }

    return {
        zone_name: mrmColumn.zone_name ?? '',
        table_name: mrmColumn.dle_tbe_id ?? mrmColumn.table_name ?? '',
    };
}

function resolveDleColumnTableContext(dleColumn, dleTableById) {
    const asNumber = Number(dleColumn.dle_tbe_id);
    if (Number.isFinite(asNumber) && dleTableById.has(asNumber)) {
        const tableRow = dleTableById.get(asNumber);
        return {
            zone_name: tableRow.zone_name,
            table_name: tableRow.table_name,
        };
    }

    return {
        zone_name: dleColumn.zone_name ?? '',
        table_name: dleColumn.table_name ?? '',
    };
}

function buildMrmColumnTableKeySet(mrmTableRows) {
    const keys = new Set();
    (mrmTableRows || []).forEach((row) => {
        if (!isActiveRow(row) || isExcludedColumnZone(row.zone_name)) return;
        const key = buildEntityKey(row, ['zone_name', 'table_name']);
        if (key) keys.add(key);
    });
    return keys;
}

function enrichMrmColumnsWithTableContext(mrmColumnRows, mrmTableRows) {
    return (mrmColumnRows || [])
        .map((row) => {
            const tableContext = resolveMrmColumnTableContext(row, mrmTableRows);
            return { ...row, ...tableContext };
        })
        .filter((row) => {
            if (!normalizeKey(row.column_name)) return false;
            if (isExcludedColumnZone(row.zone_name)) return false;
            return isActiveRow(row);
        });
}

function enrichDleColumnsWithTableContext(dleColumnRows, dleTableById, mrmTableKeySet) {
    return (dleColumnRows || [])
        .map((row) => {
            const tableContext = resolveDleColumnTableContext(row, dleTableById);
            return { ...row, ...tableContext };
        })
        .filter((row) => {
            if (!normalizeKey(row.column_name)) return false;
            if (isExcludedColumnZone(row.zone_name)) return false;
            const tableKey = buildEntityKey(row, ['zone_name', 'table_name']);
            return tableKey && mrmTableKeySet.has(tableKey);
        });
}

const COLUMN_KEY_FIELDS = ['zone_name', 'table_name', 'column_name'];

export function compareColumns(
    mrmColumnRows,
    dleColumnRows,
    dleTableById,
    mrmTableRows = [],
    dleTableByName = new Map()
) {
    const mrmTableKeySet = buildMrmColumnTableKeySet(mrmTableRows);
    const enrichedMrm = enrichMrmColumnsWithTableContext(mrmColumnRows, mrmTableRows);
    const enrichedDle = enrichDleColumnsWithTableContext(
        dleColumnRows,
        dleTableById,
        mrmTableKeySet
    );

    const mrmMap = new Map();
    const dleMap = new Map();

    enrichedMrm.forEach((row) => {
        const key = buildEntityKey(row, COLUMN_KEY_FIELDS);
        if (key) mrmMap.set(key, row);
    });

    enrichedDle.forEach((row) => {
        const key = buildEntityKey(row, COLUMN_KEY_FIELDS);
        if (key) dleMap.set(key, row);
    });

    const refOptions = {
        resolveRefs: true,
        refKeyFields: ['table_name'],
        resolveMrmRef: (value, row) => normalizeKey(value ?? row?.table_name),
        resolveDleRef: (value) =>
            resolveTableRef(value, dleTableById, dleTableByName, ['table_name']),
    };

    const allKeys = new Set([...mrmMap.keys(), ...dleMap.keys()]);
    const entities = [];
    let matched = 0;
    let differ = 0;
    let onlyMrm = 0;
    let onlyDle = 0;

    [...allKeys].sort().forEach((key) => {
        const mrmRow = mrmMap.get(key);
        const dleRow = dleMap.get(key);
        const [zonePart, tablePart, columnPart] = key.split('|');
        const tableLabel =
            zonePart && tablePart ? `${zonePart} / ${tablePart}` : tablePart || zonePart || '?';
        const label = `${tableLabel} · ${columnPart || '?'}`;

        if (mrmRow && !dleRow) {
            onlyMrm += 1;
            entities.push({
                key,
                label,
                entityStatus: 'only_mrm',
                fields: [],
                mrmRow,
                dleRow: null,
            });
            return;
        }

        if (!mrmRow && dleRow) {
            onlyDle += 1;
            entities.push({
                key,
                label,
                entityStatus: 'only_dle',
                fields: [],
                mrmRow: null,
                dleRow,
            });
            return;
        }

        const mrmRefRow = {
            ...mrmRow,
            dle_tbe_id: mrmRow.dle_tbe_id ?? mrmRow.table_name,
        };
        const fields = [
            ...compareFieldList(mrmRow, dleRow, COLUMN_COMPARE_FIELDS),
            ...compareFieldList(mrmRefRow, dleRow, [COLUMN_TABLE_REF_FIELD], refOptions),
        ];
        const hasDiff = fields.some((f) => f.status !== 'match');

        if (hasDiff) differ += 1;
        else matched += 1;

        entities.push({
            key,
            label,
            entityStatus: hasDiff ? 'diff' : 'match',
            fields,
            mrmRow,
            dleRow,
        });
    });

    return {
        summary: { matched, differ, onlyMrm, onlyDle },
        entities,
    };
}

export function compareJobs(mrmJobRows, dleJobRows, dleTableById, dleTableByName) {
    const base = compareEntitySets({
        mrmRows: mrmJobRows,
        dleRows: dleJobRows,
        keyField: 'job_name',
        compareFields: JOB_COMPARE_FIELDS,
    });

    const refOptions = {
        resolveRefs: true,
        dleTableById,
        dleTableByName,
        refKeyFields: ['table_name'],
    };

    let matched = 0;
    let differ = 0;
    const entities = base.entities.map((entity) => {
        if (entity.entityStatus === 'only_mrm' || entity.entityStatus === 'only_dle') {
            return entity;
        }

        const refFields = compareFieldList(
            entity.mrmRow,
            entity.dleRow,
            JOB_TABLE_REF_FIELDS,
            refOptions
        );
        const fields = [...entity.fields, ...refFields];
        const hasDiff = fields.some((f) => f.status !== 'match');
        const entityStatus = hasDiff ? 'diff' : 'match';

        if (entityStatus === 'match') matched += 1;
        else differ += 1;

        return {
            ...entity,
            entityStatus,
            fields,
        };
    });

    return {
        summary: {
            matched,
            differ,
            onlyMrm: base.summary.onlyMrm,
            onlyDle: base.summary.onlyDle,
        },
        entities,
    };
}

export function buildMrmLogsSql(mrmId) {
    return `SELECT * FROM rep_mda.log_mrm_specification_check
WHERE mrm_id = ${mrmId}
ORDER BY log_status, log_type`;
}

export function buildMrmExecutionStatusSql(mrmId) {
    return `SELECT TOP 1 execution_status
FROM [rep_mda].[log_mrm_execution]
WHERE mrm_id = ${mrmId}
ORDER BY mrm_id DESC`;
}

/** @typedef {{ status: string|null, label: string }} MrmExecutionStatus */

/** @returns {MrmExecutionStatus} */
export function parseMrmExecutionStatus(records) {
    if (!records?.length) {
        return { status: null, label: 'No execution log' };
    }

    const row = records[0];
    const raw =
        row.execution_status ??
        row.EXECUTION_STATUS ??
        Object.values(row).find((value) => value != null && value !== '');

    const normalized = String(raw ?? '').trim();
    if (!normalized) {
        return { status: null, label: 'Unknown' };
    }

    return { status: normalized, label: normalized };
}

export function executionStatusBadgeClass(status) {
    switch (String(status ?? '').trim().toLowerCase()) {
        case 'deployed':
            return 'mdc-exec--deployed';
        case 'ready':
            return 'mdc-exec--ready';
        case 'staged':
            return 'mdc-exec--staged';
        case 'failed':
            return 'mdc-exec--failed';
        default:
            return 'mdc-exec--unknown';
    }
}

export function buildMrmTablesSql(mrmId) {
    return `SELECT * FROM rep_mda.mda_mrm_tables WHERE mrm_id = ${mrmId}`;
}

export function buildDleTablesSql(mrmId) {
    return `SELECT * FROM rep_mda.mda_dle_tables
WHERE EXISTS (
  SELECT 1 FROM rep_mda.mda_mrm_tables m
  WHERE m.mrm_id = ${mrmId}
    AND m.is_active = 1
    AND m.zone_name = mda_dle_tables.zone_name
    AND m.schema_name = mda_dle_tables.schema_name
    AND m.table_name = mda_dle_tables.table_name
)`;
}

export function buildMrmJobsSql(mrmId) {
    return `SELECT * FROM rep_mda.mda_mrm_jobs WHERE mrm_id = ${mrmId}`;
}

export function buildDleJobsSql(mrmId) {
    return `SELECT * FROM rep_mda.mda_dle_jobs
WHERE job_name IN (
  SELECT job_name FROM rep_mda.mda_mrm_jobs WHERE mrm_id = ${mrmId}
)`;
}

export function buildMrmColumnsSql(mrmId) {
    return `SELECT * FROM rep_mda.mda_mrm_columns WHERE mrm_id = ${mrmId}`;
}

export function buildDleColumnsSql(mrmId) {
    return `SELECT * FROM rep_mda.mda_dle_columns
WHERE dle_tbe_id IN (
  SELECT d.id FROM rep_mda.mda_dle_tables d
  INNER JOIN rep_mda.mda_mrm_tables m
    ON m.table_name = d.table_name
   AND m.zone_name = d.zone_name
  WHERE m.mrm_id = ${mrmId}
    AND m.is_active = 1
    AND m.zone_name NOT IN ('ODS', 'SLR_STG')
)`;
}

async function runQuery(executeQuery, environment, query) {
    const result = await executeQuery(environment, query, {
        source: 'mrm-dle-compare',
        skipHistory: true,
    });
    return {
        columns: result.columns || [],
        records: rowsToRecords(result.columns, result.rows),
    };
}

/**
 * Fetch MRM/DLE data and run all comparisons for a given mrm_id.
 * @param {string} environment
 * @param {number} mrmId
 * @param {typeof import('../services/sqlService').executeQuery} executeQuery
 */
export async function fetchMrmDleCompareData(environment, mrmId, executeQuery) {
    const [
        logsResult,
        executionStatusResult,
        mrmTablesResult,
        dleTablesResult,
        mrmJobsResult,
        dleJobsResult,
        mrmColumnsResult,
        dleColumnsResult,
    ] = await Promise.all([
        runQuery(executeQuery, environment, buildMrmLogsSql(mrmId)),
        runQuery(executeQuery, environment, buildMrmExecutionStatusSql(mrmId)),
        runQuery(executeQuery, environment, buildMrmTablesSql(mrmId)),
        runQuery(executeQuery, environment, buildDleTablesSql(mrmId)),
        runQuery(executeQuery, environment, buildMrmJobsSql(mrmId)),
        runQuery(executeQuery, environment, buildDleJobsSql(mrmId)),
        runQuery(executeQuery, environment, buildMrmColumnsSql(mrmId)),
        runQuery(executeQuery, environment, buildDleColumnsSql(mrmId)),
    ]);

    const mrmLogs = logsResult.records;
    const mrmTables = mrmTablesResult.records.filter(isActiveRow);
    const dleTables = dleTablesResult.records;
    const mrmJobs = mrmJobsResult.records;
    const dleJobs = dleJobsResult.records;
    const mrmColumns = mrmColumnsResult.records;
    const dleColumns = dleColumnsResult.records;

    const { dleTableById, dleTableByName } = buildDleTableLookups(dleTables);

    const tables = compareEntitySets({
        mrmRows: mrmTables,
        dleRows: dleTables,
        keyFields: TABLE_KEY_FIELDS,
        compareFields: TABLE_COMPARE_FIELDS,
    });

    const jobs = compareJobs(mrmJobs, dleJobs, dleTableById, dleTableByName);
    const columns = compareColumns(mrmColumns, dleColumns, dleTableById, mrmTables, dleTableByName);
    const executionStatus = parseMrmExecutionStatus(executionStatusResult.records);

    return {
        mrmId,
        environment,
        executionStatus,
        logs: {
            rows: mrmLogs,
            columns: (logsResult.columns.length
                ? logsResult.columns
                : ['log_type', 'object_name', 'log_description', 'log_status']
            ).map((c) => String(c).toLowerCase()),
        },
        tables,
        jobs,
        columns,
        rawCounts: {
            mrmTables: mrmTables.length,
            dleTables: dleTables.length,
            mrmJobs: mrmJobs.length,
            dleJobs: dleJobs.length,
            mrmColumns: mrmColumns.length,
            dleColumns: dleColumns.length,
            logs: mrmLogs.length,
        },
    };
}

export function flattenEntityDiffs(entities, entityLabelField = 'label') {
    const rows = [];
    (entities || []).forEach((entity) => {
        if (entity.entityStatus === 'only_mrm' || entity.entityStatus === 'only_dle') {
            rows.push({
                entity: entity[entityLabelField] ?? entity.key,
                field: '—',
                mrmValue: entity.entityStatus === 'only_mrm' ? '(row present)' : '—',
                dleValue: entity.entityStatus === 'only_dle' ? '(row present)' : '—',
                status: entity.entityStatus,
            });
            return;
        }

        (entity.fields || []).forEach((field) => {
            rows.push({
                entity: entity[entityLabelField] ?? entity.key,
                field: field.field,
                mrmValue: field.mrmValue,
                dleValue: field.dleValue,
                status: field.status,
            });
        });
    });
    return rows;
}
