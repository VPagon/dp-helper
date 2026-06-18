import { addQueryHistoryEntry } from '../utils/queryHistoryStorage';
import { buildReverseSql } from '../utils/queryReverse';

/**
 * Log SQL that was generated but not executed (modal open, copy, etc.).
 */
export async function logGeneratedQuery({
    source,
    environment = 'dev',
    sql,
    metadata = null,
    reverseSql = null,
}) {
    if (!sql || !String(sql).trim()) {
        return null;
    }

    let resolvedReverse = reverseSql;
    if (!resolvedReverse && metadata) {
        const { sql: computed } = buildReverseSql({
            sql,
            metadata,
            reverseSql: null,
            environment,
        });
        resolvedReverse = computed;
    }

    return addQueryHistoryEntry({
        source,
        status: 'generated',
        environment,
        sql,
        metadata,
        reverseSql: resolvedReverse,
    });
}

/**
 * Log a completed or failed execute (called from sqlService wrapper).
 */
export async function logExecutedQuery({
    source,
    environment,
    sql,
    success,
    errorMessage = null,
    metadata = null,
    reverseSql = null,
}) {
    if (!sql || !String(sql).trim()) {
        return null;
    }

    let resolvedReverse = reverseSql;
    if (!resolvedReverse && metadata) {
        const { sql: computed } = buildReverseSql({
            sql,
            metadata,
            reverseSql: null,
            environment,
        });
        resolvedReverse = computed;
    }

    return addQueryHistoryEntry({
        source,
        status: success ? 'success' : 'fail',
        environment,
        sql,
        errorMessage: success ? null : errorMessage,
        metadata,
        reverseSql: resolvedReverse,
    });
}
