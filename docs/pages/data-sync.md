# Data Sync

## Route

`/data-sync`

## Purpose

Migrate data between configured database environments (default: `dev-sqldb-kup-app` → `prod-sqldb-kup-app`). Preview source/target rows, optionally create target table from source schema, batch-sync with filters, or clear target data.

## How to Use

1. Confirm **Source** and **Target** environments (loaded from API or defaults).
2. Select a **table** from source (`schema.table`).
3. Optionally configure **Fetch Batch Size** (default 1000) and **Insert Batch Size** (default 100).
4. Optionally set per-column **LIKE filters**.
5. **Preview Source Data** / **Preview Target Data** (TOP 100).
6. **Create Table in Target** if missing (from INFORMATION_SCHEMA).
7. **Sync to Target** — batch read + insert with progress bar.
8. **Clear Target Table** — DELETE all rows (confirmed).

## UI Sections

- Source/target environment dropdowns
- Table selector
- Batch size controls
- Collapsible filters grid
- Preview and action buttons
- Sync progress bar
- Preview results table

## SQL Queries

**List tables:**

```sql
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME
```

**Column metadata:**

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = '${table}' AND TABLE_SCHEMA = '${schema}'
ORDER BY ORDINAL_POSITION
```

**Preview:**

```sql
SELECT TOP 100 * FROM ${selectedTable} ${whereClause}
```

**Count for sync:**

```sql
SELECT COUNT(*) as total FROM ${selectedTable} ${whereClause}
```

**Batch fetch:**

```sql
SELECT * FROM ${selectedTable} 
${whereClause}
ORDER BY (SELECT NULL)
OFFSET ${offset} ROWS 
FETCH NEXT ${batchSize} ROWS ONLY
```

**Batch insert:**

```sql
INSERT INTO ${selectedTable} ([col1], [col2], ...) VALUES (...), (...), ...
```

**Create table** — dynamically built `CREATE TABLE [schema].[name] (...)` from INFORMATION_SCHEMA + PK from `INFORMATION_SCHEMA.KEY_COLUMN_USAGE`.

**Clear target:**

```sql
DELETE FROM ${selectedTable}
```

**Check target exists:**

```sql
SELECT COUNT(*) as table_count 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${tableName}'
```

## Business Logic

- Filters use `column LIKE '%value%'` (AND).
- Sync creates target table if missing before insert.
- Batch insert failure falls back to row-by-row insert (warnings logged).
- Environments from `GET http://localhost:5000/api/environments` with hardcoded fallback list.
- Default pair: dev-sqldb-kup-app → prod-sqldb-kup-app.

## API / Storage

- **executeQuery** — multi-environment (sqldb-kup-app, metadata, mes, itac, sig-etl)
- **GET /api/environments**

## Related Files

- `src/pages/DataSyncPage.js`
- `src/styles/pages/_data-sync.scss`

## Edge Cases

- API unavailable → default environments + warning message.
- Sync uses `ORDER BY (SELECT NULL)` — row order non-deterministic.
- No duplicate detection; re-sync may insert duplicates unless target cleared.
- Large tables may take long time; progress updates per insert batch.
- Filter values not SQL-escaped beyond string concat.
