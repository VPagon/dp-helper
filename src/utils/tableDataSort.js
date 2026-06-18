import { isBooleanColumnType } from './crudSql';

/** Normalize a cell to a number for bit/boolean columns (0/1). */
export function booleanSortValue(cell) {
    if (cell === null || cell === undefined) {
        return null;
    }
    if (typeof cell === 'boolean') {
        return cell ? 1 : 0;
    }
    const s = String(cell).trim().toLowerCase();
    if (s === 'true' || s === '1') {
        return 1;
    }
    if (s === 'false' || s === '0') {
        return 0;
    }
    const n = Number(cell);
    return Number.isNaN(n) ? 0 : n;
}

function isNumericString(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
        return false;
    }
    return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed);
}

function compareNonNull(a, b, dataType) {
    if (isBooleanColumnType(dataType)) {
        return booleanSortValue(a) - booleanSortValue(b);
    }

    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }

    if (typeof a === 'number' && isNumericString(b)) {
        return a - Number(b);
    }
    if (typeof b === 'number' && isNumericString(a)) {
        return Number(a) - b;
    }

    if (isNumericString(a) && isNumericString(b)) {
        return Number(a) - Number(b);
    }

    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Client-side sort of table rows. NULL/undefined always sort last.
 * @param {Array<Array>} rows
 * @param {number} columnIndex
 * @param {'asc'|'desc'} direction
 * @param {(columnName: string) => string} [getDataType]
 * @param {string} [columnName]
 */
export function sortTableRows(rows, columnIndex, direction, getDataType, columnName) {
    if (!rows?.length || columnIndex < 0) {
        return rows ?? [];
    }

    const dataType = columnName && getDataType ? getDataType(columnName) : '';

    return [...rows].sort((rowA, rowB) => {
        const aVal = rowA[columnIndex];
        const bVal = rowB[columnIndex];
        const aNull = aVal === null || aVal === undefined;
        const bNull = bVal === null || bVal === undefined;

        if (aNull && bNull) {
            return 0;
        }
        if (aNull) {
            return 1;
        }
        if (bNull) {
            return -1;
        }

        const cmp = compareNonNull(aVal, bVal, dataType);
        return direction === 'desc' ? -cmp : cmp;
    });
}
