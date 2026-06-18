import { rowToRecord } from './metadataDiffSql';

export const TABLE_COMPARE_FIELDS = [
    'zone_name',
    'schema_name',
    'directory',
    'alias',
    'partition_format',
    'table_type',
    'is_active',
    'key_dle_tbe',
    'table_format',
    'optimizing_schedule',
];

export const JOB_COMPARE_FIELDS = [
    'filter',
    'transformation_script',
    'load_type',
    'job_type',
];

export const JOB_TABLE_REF_FIELDS = ['tgt_dle_tbe_id', 'src_dle_tbe_id'];

export const COLUMN_COMPARE_FIELDS = [
    'mapping',
    'flags',
    'is_active',
    'column_type',
    'nullable',
    'default_value',
];

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

function formatDisplayValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function resolveTableRef(value, dleTableById, dleTableByName) {
    if (value === null || value === undefined || value === '') return '';

    const asString = String(value).trim();
    const asNumber = Number(asString);
    if (Number.isFinite(asNumber) && dleTableById.has(asNumber)) {
        return normalizeKey(dleTableById.get(asNumber));
    }

    const byName = dleTableByName.get(normalizeKey(asString));
    if (byName?.table_name) {
        return normalizeKey(byName.table_name);
    }

    return normalizeKey(asString);
}

function compareFieldList(mrmRow, dleRow, fields, options = {}) {
    const { resolveRefs = false, dleTableById, dleTableByName } = options;

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
            const mrmResolved = resolveTableRef(mrmRaw, dleTableById, dleTableByName);
            const dleResolved = resolveTableRef(dleRaw, dleTableById, dleTableByName);
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
 * @param {string} params.keyField
 * @param {string[]} params.compareFields
 * @param {object} [params.options]
 */
export function compareEntitySets({
    mrmRows,
    dleRows,
    keyField,
    compareFields,
    options = {},
}) {
    const mrmMap = new Map();
    const dleMap = new Map();

    (mrmRows || []).forEach((row) => {
        const key = normalizeKey(row[keyField]);
        if (key) mrmMap.set(key, row);
    });

    (dleRows || []).forEach((row) => {
        const key = normalizeKey(row[keyField]);
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

        if (mrmRow && !dleRow) {
            onlyMrm += 1;
            entities.push({
                key,
                label: mrmRow[keyField] ?? key,
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
                label: dleRow[keyField] ?? key,
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
            label: mrmRow[keyField] ?? dleRow[keyField] ?? key,
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
        if (id != null) dleTableById.set(Number(id), row.table_name);
        if (row.table_name) dleTableByName.set(normalizeKey(row.table_name), row);
    });

    return { dleTableById, dleTableByName };
}

function enrichDleColumnsWithTableName(dleColumnRows, dleTableById) {
    return (dleColumnRows || []).map((row) => {
        const tableId = row.dle_tbe_id;
        const tableName =
            tableId != null && dleTableById.has(Number(tableId))
                ? dleTableById.get(Number(tableId))
                : row.table_name;
        return { ...row, table_name: tableName };
    });
}

export function compareColumns(mrmColumnRows, dleColumnRows, dleTableById) {
    const enrichedDle = enrichDleColumnsWithTableName(dleColumnRows, dleTableById);

    const mrmMap = new Map();
    const dleMap = new Map();

    (mrmColumnRows || []).forEach((row) => {
        const tableName = row.dle_tbe_id ?? row.table_name;
        const key = `${normalizeKey(tableName)}|${normalizeKey(row.column_name)}`;
        if (key !== '|') mrmMap.set(key, { ...row, table_name: tableName });
    });

    enrichedDle.forEach((row) => {
        const key = `${normalizeKey(row.table_name)}|${normalizeKey(row.column_name)}`;
        if (key !== '|') dleMap.set(key, row);
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
        const [tablePart, columnPart] = key.split('|');
        const label = `${tablePart || '?'} · ${columnPart || '?'}`;

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

        const fields = compareFieldList(mrmRow, dleRow, COLUMN_COMPARE_FIELDS);
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

function compareJobs(mrmJobRows, dleJobRows, dleTableById, dleTableByName) {
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
WHERE table_name IN (
  SELECT table_name FROM rep_mda.mda_mrm_tables WHERE mrm_id = ${mrmId}
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
  SELECT id FROM rep_mda.mda_dle_tables
  WHERE table_name IN (SELECT table_name FROM rep_mda.mda_mrm_tables WHERE mrm_id = ${mrmId})
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
    const mrmTables = mrmTablesResult.records;
    const dleTables = dleTablesResult.records;
    const mrmJobs = mrmJobsResult.records;
    const dleJobs = dleJobsResult.records;
    const mrmColumns = mrmColumnsResult.records;
    const dleColumns = dleColumnsResult.records;

    const { dleTableById, dleTableByName } = buildDleTableLookups(dleTables);

    const tables = compareEntitySets({
        mrmRows: mrmTables,
        dleRows: dleTables,
        keyField: 'table_name',
        compareFields: TABLE_COMPARE_FIELDS,
    });

    const jobs = compareJobs(mrmJobs, dleJobs, dleTableById, dleTableByName);
    const columns = compareColumns(mrmColumns, dleColumns, dleTableById);
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
