import { formatCrudSqlValue } from './crudSql';
import {
    parseDiffColumns,
    parseDiffJson,
} from './metadataDiffSql';

const REVERT_UNAVAILABLE = 'Revert not available — before state not captured';

export function detectSqlOperation(sql) {
    const stripped = String(sql || '')
        .replace(/--[^\n]*/g, '')
        .trim()
        .toUpperCase();

    if (stripped.startsWith('INSERT')) return 'INSERT';
    if (stripped.startsWith('UPDATE')) return 'UPDATE';
    if (stripped.startsWith('DELETE')) return 'DELETE';
    if (stripped.startsWith('SELECT')) return 'SELECT';
    return 'OTHER';
}

function formatValueForSql(value, dataType) {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    return formatCrudSqlValue(value, dataType);
}

function fullTableName(tableName) {
    const name = String(tableName || '').trim();
    if (!name) return '';
    if (name.includes('.')) return name;
    return `rep_mda.${name}`;
}

function buildWhereFromPrimaryKey(primaryKey) {
    if (!primaryKey?.column) {
        return null;
    }
    const col = primaryKey.column;
    const val = formatValueForSql(primaryKey.value);
    return `${col} = ${val}`;
}

/**
 * Build reverse SQL from stored metadata / reverseSql on a history entry.
 * @returns {{ sql: string | null, error: string | null }}
 */
export function buildReverseSql(entry) {
    if (!entry) {
        return { sql: null, error: REVERT_UNAVAILABLE };
    }

    if (entry.reverseSql) {
        return { sql: entry.reverseSql, error: null };
    }

    const meta = entry.metadata;
    if (!meta) {
        return { sql: null, error: REVERT_UNAVAILABLE };
    }

    if (meta.metadataDiffRecord) {
        try {
            const sql = buildMetadataDiffReverseSql(
                meta.metadataDiffRecord,
                meta.targetEnv || entry.environment
            );
            return { sql, error: null };
        } catch (err) {
            return { sql: null, error: err.message || REVERT_UNAVAILABLE };
        }
    }

    const operation = meta.operation || detectSqlOperation(entry.sql);

    if (operation === 'UPDATE' && meta.before && meta.tableName) {
        const table = fullTableName(meta.tableName);
        const where = buildWhereFromPrimaryKey(meta.primaryKey) ||
            buildWhereFromRowKeys(meta.before, meta.primaryKeyColumn);
        if (!where) {
            return { sql: null, error: REVERT_UNAVAILABLE };
        }

        const setParts = Object.entries(meta.before).map(([col, val]) => {
            const type = meta.columnTypes?.[col];
            return `${col} = ${formatValueForSql(val, type)}`;
        });

        if (setParts.length === 0) {
            return { sql: null, error: REVERT_UNAVAILABLE };
        }

        return {
            sql: `UPDATE ${table}\nSET ${setParts.join(',\n    ')}\nWHERE ${where};`,
            error: null,
        };
    }

    if (operation === 'DELETE' && meta.beforeRow && meta.tableName) {
        const table = fullTableName(meta.tableName);
        const columns = meta.columns || Object.keys(meta.beforeRow);
        const values = columns.map((col) => formatValueForSql(
            meta.beforeRow[col],
            meta.columnTypes?.[col]
        ));

        return {
            sql: `INSERT INTO ${table} (${columns.join(', ')})\nVALUES (${values.join(', ')});`,
            error: null,
        };
    }

    if (operation === 'INSERT') {
        const table = fullTableName(meta.tableName);
        const where = buildWhereFromPrimaryKey(meta.primaryKey) ||
            buildWhereFromInsertMetadata(meta);
        if (!where || !table) {
            return { sql: null, error: REVERT_UNAVAILABLE };
        }
        return {
            sql: `DELETE FROM ${table}\nWHERE ${where};`,
            error: null,
        };
    }

    return { sql: null, error: REVERT_UNAVAILABLE };
}

function buildWhereFromRowKeys(row, primaryKeyColumn) {
    if (primaryKeyColumn && row && Object.prototype.hasOwnProperty.call(row, primaryKeyColumn)) {
        return `${primaryKeyColumn} = ${formatValueForSql(row[primaryKeyColumn])}`;
    }
    return null;
}

function buildWhereFromInsertMetadata(meta) {
    if (meta.primaryKey?.column && meta.insertedValues) {
        const val = meta.insertedValues[meta.primaryKey.column];
        if (val !== undefined) {
            return `${meta.primaryKey.column} = ${formatValueForSql(val)}`;
        }
    }
    if (meta.keyColumns?.length && meta.insertedValues) {
        const parts = meta.keyColumns
            .filter((col) => meta.insertedValues[col] !== undefined)
            .map((col) => `${col} = ${formatValueForSql(meta.insertedValues[col])}`);
        if (parts.length > 0) {
            return parts.join(' AND ');
        }
    }
    return null;
}

/** Reverse for metadata-diff generated SQL (UPDATE / INSERT). */
export function buildMetadataDiffReverseSql(record, targetEnv) {
    const normalized = record || {};

    const status = String(normalized.status || '').trim();
    const objectName = normalized.object;
    const objectKey = normalized.object_key;
    const diffJson = normalized.diff_json;
    const diffColumn = normalized.diff;
    const env = targetEnv === 'prod' ? 'prod' : 'dev';
    const table = fullTableName(objectName);

    if (status === 'Difference in data') {
        const parsed = parseDiffJson(diffJson);
        const diffColumns = parseDiffColumns(diffColumn);
        const sourceEnv = env === 'prod' ? 'dev' : 'prod';
        const setParts = diffColumns.map((col) => {
            const oldValue = readEnvValueFromDiffJson(parsed, col, sourceEnv);
            return `${col} = ${formatCrudSqlValue(oldValue)}`;
        });
        const where = resolveMetadataWhere(parsed, env, objectName, objectKey);
        return `UPDATE ${table}\nSET ${setParts.join(', ')}\nWHERE ${where};`;
    }

    if (status === 'Missing on dev' || status === 'Missing on prod') {
        const parsed = parseDiffJson(diffJson);
        const where = resolveMetadataInsertReverseWhere(parsed, objectName, objectKey);
        return `DELETE FROM ${table}\nWHERE ${where};`;
    }

    throw new Error(`Unsupported metadata diff status for revert: ${status}`);
}

function readEnvValueFromDiffJson(parsed, column, envName) {
    const wanted = String(envName).toLowerCase();
    if (Array.isArray(parsed)) {
        const entry = parsed.find(
            (e) => e && typeof e === 'object' && String(e.env || '').toLowerCase() === wanted
        );
        if (!entry) {
            throw new Error(`No "${envName}" entry in diff_json for revert`);
        }
        const key = Object.keys(entry).find((k) => k.toLowerCase() === column.toLowerCase());
        if (!key) {
            throw new Error(`Column "${column}" missing on ${envName} entry`);
        }
        return entry[key];
    }

    if (typeof parsed === 'object' && parsed !== null) {
        const direct = Object.entries(parsed).find(([k]) => k.toLowerCase() === column.toLowerCase());
        if (direct) {
            return direct[1];
        }
    }

    throw new Error(REVERT_UNAVAILABLE);
}

function resolveMetadataWhere(parsedJson, targetEnv, objectName, objectKey) {
    if (Array.isArray(parsedJson)) {
        const targetEntry = parsedJson.find(
            (e) => e && typeof e === 'object' && String(e.env || '').toLowerCase() === targetEnv
        );
        if (targetEntry) {
            const idKey = Object.keys(targetEntry).find((k) => k.toLowerCase() === 'id');
            if (idKey && targetEntry[idKey] != null && String(targetEntry[idKey]).trim() !== '') {
                return `id = ${formatCrudSqlValue(targetEntry[idKey])}`;
            }
        }
    }

    const identifiers = {
        mda_dle_columns: 'column_name',
        mda_dle_tables: 'key_dle_tbe',
        mda_dle_jobs: 'job_name',
        mda_rdl_tables: 'key_rdl_tbe',
    };
    const idCol = identifiers[String(objectName || '').toLowerCase()];
    if (idCol && objectKey != null && String(objectKey).trim() !== '') {
        return `${idCol} = ${formatCrudSqlValue(objectKey)}`;
    }

    throw new Error(REVERT_UNAVAILABLE);
}

function resolveMetadataInsertReverseWhere(parsedJson, objectName, objectKey) {
    if (typeof parsedJson === 'object' && parsedJson !== null && !Array.isArray(parsedJson)) {
        const id = parsedJson.id ?? parsedJson.Id ?? parsedJson.ID;
        if (id != null && String(id).trim() !== '') {
            return `id = ${formatCrudSqlValue(id)}`;
        }
    }
    return resolveMetadataWhere(parsedJson, 'dev', objectName, objectKey);
}

/** Build metadata payload for CRUD V2 UPDATE execute. */
export function buildCrudUpdateMetadata({
    tableName,
    columns,
    columnTypes,
    selectedRow,
    editData,
    primaryKeyColumn,
}) {
    const before = {};
    const after = {};
    columns.forEach((col, index) => {
        if (col === primaryKeyColumn) return;
        const oldVal = selectedRow[index];
        const newVal = editData[col];
        if (newVal !== oldVal) {
            before[col] = oldVal;
            after[col] = newVal;
        }
    });

    return {
        operation: 'UPDATE',
        tableName,
        primaryKey: {
            column: primaryKeyColumn,
            value: selectedRow[columns.indexOf(primaryKeyColumn)],
        },
        before,
        after,
        columnTypes,
        columns,
    };
}

/** Build metadata for CRUD V2 DELETE. */
export function buildCrudDeleteMetadata({
    tableName,
    columns,
    columnTypes,
    row,
}) {
    const beforeRow = {};
    columns.forEach((col, index) => {
        beforeRow[col] = row[index];
    });
    const primaryKeyColumn = columns[0];

    return {
        operation: 'DELETE',
        tableName,
        columns,
        columnTypes,
        beforeRow,
        primaryKey: {
            column: primaryKeyColumn,
            value: row[0],
        },
    };
}

/** Build metadata for CRUD V2 INSERT. */
export function buildCrudInsertMetadata({
    tableName,
    columns,
    columnTypes,
    editData,
    primaryKeyColumn,
}) {
    const insertedValues = { ...editData };
    const keyColumns = primaryKeyColumn ? [primaryKeyColumn] : [];

    return {
        operation: 'INSERT',
        tableName,
        insertedValues,
        keyColumns,
        primaryKey: primaryKeyColumn && insertedValues[primaryKeyColumn] !== undefined
            ? { column: primaryKeyColumn, value: insertedValues[primaryKeyColumn] }
            : null,
        columnTypes,
        columns: Object.keys(insertedValues),
    };
}

export { REVERT_UNAVAILABLE };
