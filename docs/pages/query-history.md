# Query History

## Route

`/query-history`

## Purpose

Audit log of generated and executed SQL from across DP Helper tools. Filter, paginate, expand full SQL, and revert changes via reverse SQL (copy or execute on dev/prod).

## How to Use

1. Filter by **Source**, **Status**, **Environment**, or search SQL text.
2. Click **Refresh** to reload from IndexedDB.
3. Click a row to expand full SQL and stored reverse SQL.
4. **Right-click a row** → Copy reverse SQL, Execute reverse on DEV, or Execute reverse on PROD.
5. **Clear history** removes all entries (with confirmation).

## UI Sections

- **Header** — title, max entries note, Clear history button
- **Filters** — source, status, environment, SQL search, Refresh
- **Paginated table** — Time, Source, Status, Env, SQL preview, Error
- **Expanded detail row** — full SQL + reverse SQL
- **Context menu** — revert actions

## SQL Queries

This page does not define fixed queries. It displays logged SQL from other tools. Reverse SQL is rebuilt via `buildReverseSql(entry)` from stored metadata:

- Metadata differences → `buildMetadataDiffReverseSql`
- Database CRUD → INSERT/UPDATE/DELETE revert from row snapshots
- Other sources may not support revert

Executing reverse:

```javascript
executeQuery(environment, reverseSql, {
  source: 'query-history-revert',
  metadata: { revertsEntryId, originalSource }
})
```

## Business Logic

- Storage: **IndexedDB** database `dp-helper-query-history`, store `entries`.
- Soft cap: **10,000 entries** (`MAX_ENTRIES`); oldest trimmed on insert.
- Sources tracked: `metadata-differences`, `database-crud`, `insert-data`, `execution-log`, `query-metadata`, `execute-query`, `query-history-revert`.
- Status values: `generated`, `success`, `fail`, `executed`.
- Reverse execute requires browser `confirm()` dialog.

## API / Storage

- **IndexedDB** — `src/utils/queryHistoryStorage.js`
- **executeQuery** — for reverse execution only
- **Logging** — `src/services/queryHistoryLogger.js` (writes from other pages)

## Related Files

- `src/pages/QueryHistoryPage.js`
- `src/utils/queryHistoryStorage.js`
- `src/utils/queryReverse.js`
- `src/services/queryHistoryLogger.js`
- `src/styles/pages/_query-history.scss`

## Edge Cases

- IndexedDB unavailable → load error.
- Entries without revert metadata show `REVERT_UNAVAILABLE` in context menu.
- `mrm-dle-compare` uses `skipHistory: true` — those queries never appear here.
- Clear history is irreversible.
- Environment filter does not include all backend env names (e.g. `dev-mes` may appear as stored value but filter is dev/prod/deploy only).
