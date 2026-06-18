# Metadata Differences

## Route

`/metadata-differences`

## Purpose

Compare dev vs prod metadata using pre-built comparison views in the **deploy** database. Browse differences, export to Excel, inspect `diff_json`, and generate/execute remediation SQL per row.

## How to Use

1. Review or edit the default UNION query in the textarea.
2. Click **Execute Query** (runs against environment `deploy` — no UI selector).
3. Scan the results table; status badges color-code difference types.
4. Click a **diff_json** cell to open the JSON popup.
5. **Right-click a row** → choose **Update DEV** or **Update PROD** to generate sync SQL.
6. In the SQL popup: copy, execute on target env, or close.
7. Optionally **Export to Excel** when rows exist.

## UI Sections

- **Query textarea** — editable comparison query
- **Execute Query** button
- **Results table** — columns from query; `status` badges; clickable `diff_json`
- **Export to Excel** — XLSX download (`metadata_differences.xlsx`)
- **Context menu** — Update DEV / Update PROD
- **DiffJsonPopup** — formatted JSON viewer
- **SQL popup** — generated remediation SQL, copy, execute

## SQL Queries

Default query (union of four comparison tables):

```sql
select 
    'mda_dle_columns' as object, 
    column_name as object_key, 
    status, diff, diff_json, pipeline_owner, orchestrated
from mda.cmp_mda_dle_columns
where status in ('Missing on dev', 'Difference in data')
union all
select 
    'mda_dle_tables' as object, 
    key_dle_tbe as object_key, 
    status, diff, diff_json, pipeline_owner, orchestrated
from mda.cmp_mda_dle_tables
where status in ('Missing on dev', 'Difference in data')
union all
select 
    'mda_dle_jobs' as object, 
    job_name as object_key, 
    status, diff, diff_json, pipeline_owner, orchestrated
from mda.cmp_mda_dle_jobs
where status in ('Missing on dev', 'Difference in data')
union all
select 
    'mda_rdl_tables' as object, 
    key_rdl_tbe as object_key, 
    status, diff, diff_json, pipeline_owner, orchestrated
from mda.cmp_mda_rdl_tables
where status in ('Missing on dev', 'Difference in data')
```

Generated remediation SQL is built by `buildMetadataDiffSql()` in `src/utils/metadataDiffSql.js` from row fields: `object`, `object_key`, `status`, `diff`, `diff_json`. Supported objects:

| object | identifier column |
|--------|-------------------|
| `mda_dle_columns` | `column_name` |
| `mda_dle_tables` | `key_dle_tbe` |
| `mda_dle_jobs` | `job_name` |
| `mda_rdl_tables` | `key_rdl_tbe` |

Statuses handled: `Difference in data`, `Missing on dev`, `Missing on prod`.

## Business Logic

- `rowToRecord()` maps result row to lowercase-key record for SQL generation.
- `buildMetadataDiffReverseSql()` produces undo SQL when possible; logged to query history.
- After successful execute, main query re-runs automatically.
- `logGeneratedQuery()` records generated and executed SQL with metadata for revert.

## API / Storage

- **executeQuery** with environments: `deploy` (fetch), `dev`/`prod` (remediation execute)
- **Query history**: source `metadata-differences`
- **Excel**: client-side via `xlsx` library

## Related Files

- `src/pages/GetMetadataDifferences.js`
- `src/utils/metadataDiffSql.js`
- `src/utils/queryReverse.js` (`buildMetadataDiffReverseSql`)
- `src/components/common/DiffJsonPopup.jsx`
- `src/services/queryHistoryLogger.js`

## Edge Cases

- No environment picker for the main query — always `deploy`.
- Context menu closes on document click; row must still exist when action fires.
- Empty `diff_json` throws during SQL generation.
- Unknown `object` type fails SQL generation with error popup.
- Export blocked when no rows (`alert`).
