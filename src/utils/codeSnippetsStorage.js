/**
 * Code snippets persisted on the server host filesystem (data/code-snippets.json).
 * One-time migration from legacy IndexedDB on first load when applicable.
 */

// Dev: CRA proxy (package.json) forwards /api/* to localhost:5000.
// Prod: set REACT_APP_API_URL to the API origin, or serve build/ from the same Express app.
const API_BASE = process.env.REACT_APP_API_URL ?? '';
const MIGRATION_FLAG_KEY = 'dp-helper-code-snippets-migrated-to-server';

const LEGACY_DB_NAME = 'dp-helper-code-snippets';
const LEGACY_STORE_NAME = 'snippets';

export const SNIPPET_LANGUAGES = ['sql', 'pyspark', 'python', 'other'];

let migrationPromise = null;

function apiUnavailableMessage() {
	return 'Cannot reach the API server. Start it with `npm run server` (default port 5000).';
}

async function apiRequest(path, options = {}) {
	let response;
	try {
		response = await fetch(`${API_BASE}${path}`, {
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...(options.headers || {}),
			},
			...options,
		});
	} catch {
		throw new Error(apiUnavailableMessage());
	}

	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		if (response.status === 404 && path.startsWith('/api/code-snippets')) {
			throw new Error(
				'Code snippets API not found. Restart the backend with `npm run server` so it loads the latest routes.',
			);
		}
		throw new Error(data.error || `Server responded with ${response.status}`);
	}

	return data;
}

function readLegacyIndexedDbSnippets() {
	if (typeof indexedDB === 'undefined') {
		return Promise.resolve([]);
	}

	return new Promise((resolve) => {
		const request = indexedDB.open(LEGACY_DB_NAME, 1);

		request.onerror = () => resolve([]);
		request.onupgradeneeded = () => resolve([]);
		request.onsuccess = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
				db.close();
				resolve([]);
				return;
			}

			const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
			const store = tx.objectStore(LEGACY_STORE_NAME);
			const getAll = store.getAll();

			getAll.onsuccess = () => {
				db.close();
				resolve(getAll.result || []);
			};
			getAll.onerror = () => {
				db.close();
				resolve([]);
			};
		};
	});
}

async function migrateLegacySnippetsIfNeeded(serverSnippets) {
	if (typeof window !== 'undefined' && window.localStorage.getItem(MIGRATION_FLAG_KEY) === '1') {
		return serverSnippets;
	}

	const legacySnippets = await readLegacyIndexedDbSnippets();
	if (legacySnippets.length === 0) {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(MIGRATION_FLAG_KEY, '1');
		}
		return serverSnippets;
	}

	const serverIds = new Set(serverSnippets.map((item) => item.id));
	const toImport = legacySnippets.filter((item) => item?.id && !serverIds.has(item.id));

	if (toImport.length === 0) {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(MIGRATION_FLAG_KEY, '1');
		}
		return serverSnippets;
	}

	const data = await apiRequest('/api/code-snippets/import', {
		method: 'POST',
		body: JSON.stringify({ snippets: toImport }),
	});

	if (typeof window !== 'undefined') {
		window.localStorage.setItem(MIGRATION_FLAG_KEY, '1');
	}

	return data.snippets || serverSnippets;
}

async function runMigrationOnce(serverSnippets) {
	if (migrationPromise) {
		return migrationPromise;
	}

	migrationPromise = migrateLegacySnippetsIfNeeded(serverSnippets);
	return migrationPromise;
}

/**
 * Ensures snippets are loaded (server seeds default example when store is empty).
 */
export async function ensureCodeSnippetsSeeded() {
	await getCodeSnippets();
}

/**
 * @returns {Promise<object[]>}
 */
export async function getCodeSnippets() {
	const data = await apiRequest('/api/code-snippets');
	const snippets = data.snippets || [];
	return runMigrationOnce(snippets);
}

/**
 * @param {object} snippet
 * @returns {Promise<object>}
 */
export async function saveCodeSnippet(snippet) {
	const isUpdate = Boolean(snippet.id);
	const path = isUpdate ? `/api/code-snippets/${encodeURIComponent(snippet.id)}` : '/api/code-snippets';
	const data = await apiRequest(path, {
		method: isUpdate ? 'PUT' : 'POST',
		body: JSON.stringify(snippet),
	});
	return data.snippet;
}

export async function deleteCodeSnippet(id) {
	await apiRequest(`/api/code-snippets/${encodeURIComponent(id)}`, {
		method: 'DELETE',
	});
}

export function descriptionPreview(text, maxLen = 120) {
	const oneLine = String(text || '').replace(/\s+/g, ' ').trim();
	if (oneLine.length <= maxLen) {
		return oneLine;
	}
	return `${oneLine.slice(0, maxLen)}…`;
}
