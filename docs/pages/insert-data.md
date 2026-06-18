# Insert Data

## Route

`/insert-data`

## Purpose

Generate SQL `INSERT` statements from tab-separated clipboard data (e.g. copied from Excel). Strips audit/watermark columns automatically.

## How to Use

1. Enter **Table Name** (e.g. `dbo.customers` or `schema.table`).
2. Paste tab-separated data: **first line = headers**, following lines = rows.
3. Click **Generate SQL**.
4. Review generated statements; click **Copy to Clipboard** to copy all.

## UI Sections

- **Table Name** input
- **Data textarea** — tab-separated values
- **Generate SQL** button
- **Generated SQL** — one `<pre>` block per INSERT
- **Copy to Clipboard** button

## SQL Queries

Output format (one per data row):

```sql
INSERT INTO ${tableName} (
    col1,
    col2)
VALUES (
    val1,
    val2);
```

**Excluded columns** (case-insensitive header match):

- `date_last_modified`, `dat_last_modified`, `user_last_modified`
- `highest_watermark`, `date_of_insert`, `date_insert`

**Value formatting:**

| Input | SQL output |
|-------|------------|
| `NULL` | `NULL` |
| digits only | unquoted number |
| `Y`/`N`/`y`/`n` | quoted uppercase |
| `YYYY-MM-DD HH:MM:SS...` | quoted datetime string |
| other strings | quoted with `'` escaped as `''` |

## Business Logic

- Rows with column count ≠ header count are **skipped** silently.
- Requires at least 2 lines (header + one data row).
- Logs to query history on generate and on copy (source `insert-data`, environment `dev`).
- Does **not** execute SQL against any database.

## API / Storage

- **Query history** only (IndexedDB via `logGeneratedQuery`)
- No `executeQuery` calls

## Related Files

- `src/pages/InsertDataPage.js`
- `src/services/queryHistoryLogger.js`
- `src/utils/queryReverse.js` (`detectSqlOperation`)

## Edge Cases

- Empty table name still generates `INSERT INTO ` with blank target.
- No environment selector; history always logged as `dev`.
- Tab delimiter only — CSV comma-separated input will fail column alignment.
- All columns excluded → error message in output.
