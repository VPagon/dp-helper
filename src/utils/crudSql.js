/** User input that should become SQL NULL (unquoted). */
export function isSqlNullInput(value) {
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' || trimmed.toUpperCase() === 'NULL';
    }
    return false;
}

function escapeSqlStringLiteral(text) {
    return `'${String(text).replace(/'/g, "''")}'`;
}

/** Format a CRUD field value for SQL SET/VALUES (display strings from inputs). */
export function formatCrudSqlValue(value, dataType) {
    if (isSqlNullInput(value)) {
        return 'NULL';
    }

    const normalizedType = String(dataType || '').toLowerCase();
    if (normalizedType === 'bit' || normalizedType === 'boolean') {
        const s = String(value).trim().toLowerCase();
        if (s === '1' || s === 'true') {
            return '1';
        }
        if (s === '0' || s === 'false') {
            return '0';
        }
    }

    return escapeSqlStringLiteral(String(value).trim());
}

const BOOLEAN_TYPES = new Set(['bit', 'boolean']);

export function isBooleanColumnType(dataType) {
    return BOOLEAN_TYPES.has(String(dataType || '').toLowerCase());
}

/** Display layer: show bit/boolean as 0/1 in the results table. */
export function formatCrudDisplayValue(cell, dataType) {
    if (!isBooleanColumnType(dataType)) {
        return cell;
    }
    if (cell === null || cell === undefined) {
        return '';
    }
    if (typeof cell === 'boolean') {
        return cell ? 1 : 0;
    }
    const s = String(cell).trim().toLowerCase();
    if (s === 'true') {
        return 1;
    }
    if (s === 'false') {
        return 0;
    }
    return cell;
}
