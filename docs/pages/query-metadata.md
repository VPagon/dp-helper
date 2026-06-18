# Query Metadata

## Route

`/query-metadata`

## Purpose

Ad-hoc SQL console for the metadata database (`rep_mda` and related schemas). Run read queries against dev or prod and view tabular results.

## How to Use

1. Select **Environment**: Development or Production.
2. Edit the SQL in the textarea (default: `SELECT TOP 10 * FROM dbo.d_kup_employees`).
3. Click **Execute Query**.
4. Review results in the table below; errors appear in a red banner.

## UI Sections

- **Home button** — return to `/`
- **Environment selector** — `dev` | `prod`
- **Query textarea** — editable SQL
- **Execute Query** button — disabled while loading
- **Results table** — dynamic columns from server response; shows "No results found" when empty

## SQL Queries

Default query:

```sql
SELECT TOP 10 * FROM dbo.d_kup_employees
```

Any user-supplied SELECT (or other statements allowed by the backend) is sent via `executeQuery(environment, query, { source: 'query-metadata' })`.

## Business Logic

- Results expect `{ columns: string[], rows: any[][] }` from the API.
- Row/column rendering guards against non-array data.
- Executions are logged to query history with source `query-metadata`.

## API / Storage

- **Backend**: `POST` via `src/services/sqlService.js` → `http://localhost:5000/api/execute-query`
- **Query history**: logged through `queryHistoryLogger` (IndexedDB)

## Related Files

- `src/pages/QueryMetadataPage.js`
- `src/services/sqlService.js`
- `src/styles/pages/QueryMetadataPage.css`

## Edge Cases

- No query validation on the client; malformed SQL returns server error message.
- No pagination or export; large result sets may be slow or truncated by server limits.
- Writes are possible if the backend allows them; use with caution on prod.
