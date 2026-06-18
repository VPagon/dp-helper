/**
 * Query history persisted in IndexedDB (preferred over localStorage for volume).
 * Typical browser quota: hundreds of MB+ per origin; entries capped at MAX_ENTRIES.
 */

const DB_NAME = 'dp-helper-query-history';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
/** Soft cap — oldest entries trimmed after insert when exceeded. */
export const MAX_ENTRIES = 10000;

let dbPromise = null;

function openDatabase() {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available in this browser'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(request.error || new Error('Failed to open query history database'));
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('source', 'source', { unique: false });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('environment', 'environment', { unique: false });
            }
        };
    });

    return dbPromise;
}

function runTransaction(mode, fn) {
    return openDatabase().then(
        (db) => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            const store = tx.objectStore(STORE_NAME);

            Promise.resolve()
                .then(() => fn(store))
                .then((result) => {
                    tx.oncomplete = () => resolve(result);
                    tx.onerror = () => reject(tx.error || new Error('Query history transaction failed'));
                    tx.onabort = () => reject(tx.error || new Error('Query history transaction aborted'));
                })
                .catch(reject);
        })
    );
}

function createEntryId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function trimOldEntries(store) {
    const all = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    if (all.length <= MAX_ENTRIES) {
        return;
    }

    all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const toRemove = all.slice(MAX_ENTRIES);

    await Promise.all(
        toRemove.map(
            (entry) => new Promise((resolve, reject) => {
                const del = store.delete(entry.id);
                del.onsuccess = () => resolve();
                del.onerror = () => reject(del.error);
            })
        )
    );
}

/**
 * @param {object} entry
 * @returns {Promise<object>}
 */
export async function addQueryHistoryEntry(entry) {
    const record = {
        id: entry.id || createEntryId(),
        timestamp: entry.timestamp || Date.now(),
        source: entry.source || 'unknown',
        status: entry.status || 'executed',
        environment: normalizeEnvironment(entry.environment),
        sql: String(entry.sql || ''),
        reverseSql: entry.reverseSql ?? null,
        errorMessage: entry.errorMessage ?? null,
        metadata: entry.metadata ?? null,
    };

    await runTransaction('readwrite', async (store) => {
        await new Promise((resolve, reject) => {
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        await trimOldEntries(store);
    });

    return record;
}

function normalizeEnvironment(env) {
    const value = String(env || 'dev').trim().toLowerCase();
    if (value === 'prod' || value === 'production') {
        return 'prod';
    }
    if (value === 'deploy') {
        return 'deploy';
    }
    return 'dev';
}

/**
 * @param {{ source?: string, status?: string, environment?: string, search?: string }} filters
 * @returns {Promise<object[]>}
 */
export async function getQueryHistoryEntries(filters = {}) {
    const entries = await runTransaction('readonly', (store) => new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    }));

    entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const sourceFilter = filters.source && filters.source !== 'all' ? filters.source : null;
    const statusFilter = filters.status && filters.status !== 'all' ? filters.status : null;
    const envFilter = filters.environment && filters.environment !== 'all' ? filters.environment : null;
    const search = (filters.search || '').trim().toLowerCase();

    return entries.filter((entry) => {
        if (sourceFilter) {
            const matchesSource =
                entry.source === sourceFilter
                || (sourceFilter === 'database-crud' && entry.source === 'database-crud-v2');
            if (!matchesSource) {
                return false;
            }
        }
        if (statusFilter && entry.status !== statusFilter) {
            return false;
        }
        if (envFilter && entry.environment !== envFilter) {
            return false;
        }
        if (search) {
            const haystack = [
                entry.sql,
                entry.errorMessage,
                entry.source,
                entry.reverseSql,
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(search)) {
                return false;
            }
        }
        return true;
    });
}

export async function deleteQueryHistoryEntry(id) {
    await runTransaction('readwrite', (store) => new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

export async function clearQueryHistory() {
    await runTransaction('readwrite', (store) => new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

export function sqlPreview(sql, maxLen = 120) {
    const oneLine = String(sql || '').replace(/\s+/g, ' ').trim();
    if (oneLine.length <= maxLen) {
        return oneLine;
    }
    return `${oneLine.slice(0, maxLen)}…`;
}
