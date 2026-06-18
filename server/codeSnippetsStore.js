/**
 * Code snippets persisted on the host filesystem.
 * User data file: <project-root>/data/code-snippets.json (gitignored).
 * Example template: <project-root>/data/code-snippets.example.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
// Persisted snippets live here — survives restarts and redeploys on the same machine.
const SNIPPETS_FILE = path.join(DATA_DIR, 'code-snippets.json');

const SNIPPET_LANGUAGES = ['sql', 'pyspark', 'python', 'other'];

const SEED_SNIPPET = {
	title: 'Filter and overwrite Delta table (dl_unified_key)',
	description:
		'Read a Silver Delta table, inspect rows where dl_unified_key contains N/A, filter them out, and optionally overwrite the table. Uses Util.get_storage_account_name and abfss path for Infor sze_item_groups.',
	language: 'pyspark',
	code: `storage_account_name = Util.get_storage_account_name(spark)
path = f"abfss://02-silver@{storage_account_name}.dfs.core.windows.net/01_infor/01_dbo/sze_item_groups"

# Read Delta table
df = spark.read.format("delta").load(path)
display(df.filter("dl_unified_key like '%N/A%'"))
print(df.count())

# Remove unwanted rows
df_filtered = df.filter(col("dl_unified_key") != "N/A")
display(df_filtered.filter("dl_unified_key like '%N/A%'"))
print(df_filtered.count())

# Overwrite same Delta table
# df_filtered.write \\
#     .format("delta") \\
#     .mode("overwrite") \\
#     .option("overwriteSchema", "false") \\
#     .save(path)`,
};

let writeQueue = Promise.resolve();

function createId() {
	if (typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeLanguage(language) {
	const value = String(language || 'other').trim().toLowerCase();
	return SNIPPET_LANGUAGES.includes(value) ? value : 'other';
}

function ensureDataDir() {
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}
}

function readSnippetsRaw() {
	ensureDataDir();
	if (!fs.existsSync(SNIPPETS_FILE)) {
		return [];
	}

	const raw = fs.readFileSync(SNIPPETS_FILE, 'utf8').trim();
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch (err) {
		throw new Error(`Invalid code snippets file (${SNIPPETS_FILE}): ${err.message}`);
	}
}

function writeSnippetsRaw(snippets) {
	ensureDataDir();
	const tmpFile = `${SNIPPETS_FILE}.tmp`;
	fs.writeFileSync(tmpFile, `${JSON.stringify(snippets, null, 2)}\n`, 'utf8');
	fs.renameSync(tmpFile, SNIPPETS_FILE);
}

function queueWrite(fn) {
	writeQueue = writeQueue.then(fn, fn);
	return writeQueue;
}

function sortSnippets(snippets) {
	return [...snippets].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function buildRecord(snippet, existing) {
	const now = Date.now();
	return {
		id: snippet.id || existing?.id || createId(),
		title: String(snippet.title || '').trim() || 'Untitled snippet',
		description: String(snippet.description || '').trim(),
		language: normalizeLanguage(snippet.language),
		code: String(snippet.code || ''),
		createdAt: snippet.createdAt || existing?.createdAt || now,
		updatedAt: now,
	};
}

function seedIfEmpty() {
	const snippets = readSnippetsRaw();
	if (snippets.length > 0) {
		return { snippets, seeded: false };
	}

	const now = Date.now();
	const record = {
		id: createId(),
		title: SEED_SNIPPET.title,
		description: SEED_SNIPPET.description,
		language: SEED_SNIPPET.language,
		code: SEED_SNIPPET.code,
		createdAt: now,
		updatedAt: now,
	};

	writeSnippetsRaw([record]);
	return { snippets: [record], seeded: true };
}

function getAllSnippets() {
	const { snippets } = seedIfEmpty();
	return sortSnippets(snippets);
}

function getSnippetById(id) {
	return getAllSnippets().find((snippet) => snippet.id === id) || null;
}

function createSnippet(snippet) {
	return queueWrite(async () => {
		seedIfEmpty();
		const snippets = readSnippetsRaw();
		const record = buildRecord(snippet);
		snippets.push(record);
		writeSnippetsRaw(snippets);
		return record;
	});
}

function updateSnippet(id, snippet) {
	return queueWrite(async () => {
		seedIfEmpty();
		const snippets = readSnippetsRaw();
		const index = snippets.findIndex((item) => item.id === id);

		if (index === -1) {
			const err = new Error(`Snippet not found: ${id}`);
			err.statusCode = 404;
			throw err;
		}

		const record = buildRecord({ ...snippet, id }, snippets[index]);
		snippets[index] = record;
		writeSnippetsRaw(snippets);
		return record;
	});
}

function deleteSnippet(id) {
	return queueWrite(async () => {
		seedIfEmpty();
		const snippets = readSnippetsRaw();
		const index = snippets.findIndex((item) => item.id === id);

		if (index === -1) {
			const err = new Error(`Snippet not found: ${id}`);
			err.statusCode = 404;
			throw err;
		}

		snippets.splice(index, 1);
		writeSnippetsRaw(snippets);
		return { id };
	});
}

/**
 * Merge snippets by id (used for one-time IndexedDB migration).
 * @param {object[]} incoming
 */
function importSnippets(incoming) {
	return queueWrite(async () => {
		seedIfEmpty();
		const snippets = readSnippetsRaw();
		const byId = new Map(snippets.map((item) => [item.id, item]));

		for (const item of incoming) {
			if (!item || !item.id) {
				continue;
			}
			const record = buildRecord(item, byId.get(item.id));
			byId.set(record.id, record);
		}

		writeSnippetsRaw(Array.from(byId.values()));
		return sortSnippets(Array.from(byId.values()));
	});
}


module.exports = {
	SNIPPETS_FILE,
	SNIPPET_LANGUAGES,
	getAllSnippets,
	getSnippetById,
	createSnippet,
	updateSnippet,
	deleteSnippet,
	importSnippets,
};
