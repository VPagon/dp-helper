# MRM vs DLE Compare

## Route

`/mrm-dle-compare`

## Purpose

Compare Metadaterium repository (MRM) definitions with live DLE metadata for a given **MRM_ID**. Shows specification logs, field-level diffs for tables/jobs/columns, and MRM execution status.

**Important:** Queries run against **dev only** (`ENVIRONMENT = 'dev'` hardcoded). No environment selector in UI.

## How to Use

1. Enter numeric **MRM_ID** (e.g. `761`).
2. Click **Search**.
3. Review **MRM specification checks / logs** section.
4. Expand/collapse **Tables**, **Jobs**, **Columns** sections.
5. Toggle **Show matching fields** to include `match` rows in diff tables.
6. Read summary badges (matched / differ / only MRM / only DLE).

## UI Sections

- **MRM_ID** input and Search button
- **Execution status badge** (from `log_mrm_execution`)
- **Show matching fields** checkbox
- **Logs** — read-only table
- **Tables / Jobs / Columns** — collapsible diff sections with summary badges

## SQL Queries

All executed in parallel via `fetchMrmDleCompareData()` (`skipHistory: true`):

```sql
SELECT * FROM rep_mda.log_mrm_specification_check
WHERE mrm_id = ${mrmId}
ORDER BY log_status, log_type

SELECT TOP 1 execution_status
FROM [rep_mda].[log_mrm_execution]
WHERE mrm_id = ${mrmId}
ORDER BY mrm_id DESC

SELECT * FROM rep_mda.mda_mrm_tables WHERE mrm_id = ${mrmId}

SELECT * FROM rep_mda.mda_dle_tables
WHERE table_name IN (
  SELECT table_name FROM rep_mda.mda_mrm_tables WHERE mrm_id = ${mrmId}
)

SELECT * FROM rep_mda.mda_mrm_jobs WHERE mrm_id = ${mrmId}

SELECT * FROM rep_mda.mda_dle_jobs
WHERE job_name IN (
  SELECT job_name FROM rep_mda.mda_mrm_jobs WHERE mrm_id = ${mrmId}
)

SELECT * FROM rep_mda.mda_mrm_columns WHERE mrm_id = ${mrmId}

SELECT * FROM rep_mda.mda_dle_columns
WHERE dle_tbe_id IN (
  SELECT id FROM rep_mda.mda_dle_tables
  WHERE table_name IN (SELECT table_name FROM rep_mda.mda_mrm_tables WHERE mrm_id = ${mrmId})
)
```

## Business Logic

**Match keys:**

| Entity | Key |
|--------|-----|
| Tables | `table_name` (case-insensitive) |
| Jobs | `job_name`; target/source refs resolved to DLE table names |
| Columns | `table_name` + `column_name` |

**Compared fields:**

- Tables: `zone_name`, `schema_name`, `directory`, `alias`, `partition_format`, `table_type`, `is_active`, `key_dle_tbe`, `table_format`, `optimizing_schedule`
- Jobs: `filter`, `transformation_script`, `load_type`, `job_type`, plus `tgt_dle_tbe_id` / `src_dle_tbe_id` as resolved table names
- Columns: `mapping`, `flags`, `is_active`, `column_type`, `nullable`, `default_value`

Default diff view hides `match` status rows unless checkbox enabled.

## API / Storage

- **executeQuery** — dev only, source `mrm-dle-compare`, history skipped
- Comparison logic in `src/utils/mrmDleCompare.js`

## Related Files

- `src/pages/MrmDleComparePage.jsx`
- `src/utils/mrmDleCompare.js`
- `src/utils/mrmDleCompare.test.js`
- `src/styles/pages/_mrm-dle-compare.scss`

## Edge Cases

- Non-numeric MRM_ID → validation error before query.
- No MRM rows → empty comparisons; DLE-only entities shown as "Only DLE".
- Execution status `No execution log` when `log_mrm_execution` empty.
- Prod comparison not supported without code change.
