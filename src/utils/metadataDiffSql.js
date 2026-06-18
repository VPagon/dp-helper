const OBJECT_IDENTIFIER_COLUMNS = {
    mda_dle_columns: 'column_name',
    mda_dle_tables: 'key_dle_tbe',
    mda_dle_jobs: 'job_name',
    mda_rdl_tables: 'key_rdl_tbe',
};

const STATUS_DIFFERENCE_IN_DATA = 'Difference in data';
const STATUS_MISSING_ON_DEV = 'Missing on dev';
const STATUS_MISSING_ON_PROD = 'Missing on prod';

export function normalizeStatus(status) {
    if (status === null || status === undefined) return '';
    return String(status).replace(/^\s+|\s+$/g, '');
}

export function rowToRecord(columns, row) {
    if (!Array.isArray(columns) || !Array.isArray(row)) {
        return null;
    }

    const record = {};
    columns.forEach((column, index) => {
        record[String(column).toLowerCase()] = row[index];
    });
    return record;
}

/** Split `diff` into one or more column names (`;` primary, `,` also accepted). */
export function parseDiffColumns(diffColumn) {
    const raw = String(diffColumn || '').trim();
    if (!raw) {
        return [];
    }

    return raw
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter(Boolean);
}

export function parseDiffJson(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        throw new Error('diff_json is empty');
    }

    if (typeof rawValue === 'object') {
        return rawValue;
    }

    const trimmed = String(rawValue).trim();
    if (!trimmed) {
        throw new Error('diff_json is empty');
    }

    try {
        return JSON.parse(trimmed);
    } catch (err) {
        throw new Error(`Invalid JSON in diff_json: ${err.message}`);
    }
}

function escapeSqlStringLiteral(text) {
    return `'${String(text).replace(/'/g, "''")}'`;
}

function formatSqlValue(value) {
    if (value === null || value === undefined) {
        return 'NULL';
    }

    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === 'object') {
        return escapeSqlStringLiteral(JSON.stringify(value));
    }

    const stringValue = String(value).trim();
    if (stringValue === '') {
        return "''";
    }

    return escapeSqlStringLiteral(stringValue);
}

function getIdentifierColumn(objectName) {
    const normalized = String(objectName || '').trim().toLowerCase();
    const column = OBJECT_IDENTIFIER_COLUMNS[normalized];
    if (!column) {
        throw new Error(`Unknown object "${objectName}". Supported: ${Object.keys(OBJECT_IDENTIFIER_COLUMNS).join(', ')}`);
    }
    return column;
}

function normalizeEnvName(value) {
    return String(value || '').trim().toLowerCase();
}

function getSourceEnvForUpdate(targetEnv) {
    return targetEnv === 'prod' ? 'dev' : 'prod';
}

function findEnvArrayEntry(entries, envName) {
    const wanted = normalizeEnvName(envName);
    return entries.find(
        (entry) => entry && typeof entry === 'object' && !Array.isArray(entry) &&
            normalizeEnvName(entry.env) === wanted
    );
}

function readColumnFromEntry(entry, columnKey, envLabel) {
    const lowerColumn = columnKey.toLowerCase();
    const matchKey = Object.keys(entry).find((key) => key.toLowerCase() === lowerColumn);

    if (!matchKey) {
        throw new Error(
            `Column "${columnKey}" not found on ${envLabel} entry in diff_json.`
        );
    }

    return entry[matchKey];
}

function extractUpdateValueFromEnvArray(parsedArray, diffColumn, targetEnv) {
    const columnKey = String(diffColumn || '').trim();
    const sourceEnv = getSourceEnvForUpdate(targetEnv);
    const sourceEntry = findEnvArrayEntry(parsedArray, sourceEnv);

    if (!sourceEntry) {
        throw new Error(
            `Could not find "${sourceEnv}" entry in diff_json array. ` +
            `Update ${targetEnv.toUpperCase()} requires the ${sourceEnv} environment row as the source value.`
        );
    }

    return readColumnFromEntry(sourceEntry, columnKey, sourceEnv);
}

function extractUpdateValue(parsedJson, diffColumn, targetEnv) {
    const columnKey = String(diffColumn || '').trim();
    if (!columnKey) {
        throw new Error('diff column is empty');
    }

    if (parsedJson === null || parsedJson === undefined) {
        throw new Error('diff_json did not contain a value to update');
    }

    if (Array.isArray(parsedJson)) {
        return extractUpdateValueFromEnvArray(parsedJson, diffColumn, targetEnv);
    }

    if (typeof parsedJson !== 'object') {
        return parsedJson;
    }

    const entries = Object.entries(parsedJson);
    const lowerColumn = columnKey.toLowerCase();

    const directMatch = entries.find(([key]) => key.toLowerCase() === lowerColumn);
    if (directMatch) {
        return directMatch[1];
    }

    const sourceEnv = getSourceEnvForUpdate(targetEnv);
    const envKeys = sourceEnv === 'prod'
        ? ['prod', 'prod_value', 'target_prod', 'production']
        : ['dev', 'dev_value', 'target_dev', 'development'];

    for (const envKey of envKeys) {
        if (Object.prototype.hasOwnProperty.call(parsedJson, envKey)) {
            return parsedJson[envKey];
        }
    }

    const genericKeys = ['value', 'new_value', 'target_value'];
    for (const genericKey of genericKeys) {
        if (Object.prototype.hasOwnProperty.call(parsedJson, genericKey)) {
            return parsedJson[genericKey];
        }
    }

    if (entries.length === 1) {
        return entries[0][1];
    }

    throw new Error(
        `Could not resolve update value from diff_json for column "${columnKey}". ` +
        `Expected key "${columnKey}" or environment-specific value.`
    );
}

function readIdFromEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
    }

    const idKey = Object.keys(entry).find((key) => key.toLowerCase() === 'id');
    if (!idKey) {
        return null;
    }

    const id = entry[idKey];
    if (id === null || id === undefined || String(id).trim() === '') {
        return null;
    }

    return id;
}

function resolveUpdateWhereClause(parsedJson, targetEnv, objectName, objectKey) {
    if (Array.isArray(parsedJson)) {
        const targetEntry = findEnvArrayEntry(parsedJson, targetEnv);
        if (targetEntry) {
            const id = readIdFromEntry(targetEntry);
            if (id !== null) {
                return `id = ${formatSqlValue(id)}`;
            }
        }
    }

    const hasObjectKey = objectKey !== null && objectKey !== undefined &&
        String(objectKey).trim() !== '';

    if (!hasObjectKey) {
        throw new Error(
            'Cannot build UPDATE WHERE clause: target environment entry in diff_json has no id and object_key is missing'
        );
    }

    const identifierColumn = getIdentifierColumn(objectName);
    return `${identifierColumn} = ${formatSqlValue(objectKey)}`;
}

function buildUpdateSql(objectName, diffColumn, diffJson, objectKey, targetEnv) {
    const diffColumns = parseDiffColumns(diffColumn);
    if (diffColumns.length === 0) {
        throw new Error('diff column is empty');
    }

    const parsedJson = parseDiffJson(diffJson);
    const whereClause = resolveUpdateWhereClause(parsedJson, targetEnv, objectName, objectKey);

    const setAssignments = diffColumns.map((columnName) => {
        const newValue = extractUpdateValue(parsedJson, columnName, targetEnv);
        return `${columnName} = ${formatSqlValue(newValue)}`;
    });

    const tableName = String(objectName).trim();

    return `-- Target environment: ${targetEnv.toUpperCase()}\n` +
        `UPDATE rep_mda.${tableName}\n` +
        `SET ${setAssignments.join(', ')}\n` +
        `WHERE ${whereClause};`;
}

function buildInsertSql(objectName, diffJson, targetEnv) {
    const parsedJson = parseDiffJson(diffJson);

    if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
        throw new Error('diff_json must be a JSON object for INSERT statements');
    }

    const columns = [];
    const values = [];

    Object.entries(parsedJson).forEach(([column, value]) => {
        if (value === undefined) {
            return;
        }
        columns.push(column);
        values.push(formatSqlValue(value));
    });

    if (columns.length === 0) {
        throw new Error('diff_json does not contain any insertable columns');
    }

    const tableName = String(objectName).trim();

    return `-- Target environment: ${targetEnv.toUpperCase()}\n` +
        `INSERT INTO rep_mda.${tableName} (${columns.join(', ')})\n` +
        `VALUES (${values.join(', ')});`;
}

export function buildMetadataDiffSql(record, targetEnv) {
    if (!record) {
        throw new Error('Row data is missing');
    }

    const objectName = record.object;
    const diffColumn = record.diff;
    const diffJson = record.diff_json;
    const objectKey = record.object_key;
    const status = normalizeStatus(record.status);

    if (!objectName) {
        throw new Error('Missing required column: object');
    }

    if (!status) {
        throw new Error('Missing required column: status');
    }

    const env = targetEnv === 'prod' ? 'prod' : 'dev';

    if (status === STATUS_DIFFERENCE_IN_DATA) {
        if (!diffColumn) {
            throw new Error('Missing required column: diff');
        }
        return buildUpdateSql(objectName, diffColumn, diffJson, objectKey, env);
    }

    if (status === STATUS_MISSING_ON_DEV) {
        return buildInsertSql(objectName, diffJson, env);
    }

    if (status === STATUS_MISSING_ON_PROD) {
        return buildInsertSql(objectName, diffJson, env);
    }

    throw new Error(
        `Unsupported status "${status}". Supported: "${STATUS_DIFFERENCE_IN_DATA}", "${STATUS_MISSING_ON_DEV}".`
    );
}
