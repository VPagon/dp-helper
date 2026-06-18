# Monitor Offloading

## Route

`/monitor-offloading`

## Purpose

Track scheduled data offloading jobs: show active offloading configuration from metadata DB and count records eligible for offload in source operational databases (MES, ITAC, SIG-ETL).

## How to Use

1. Select **Environment** (e.g. MES DEV, MES PROD, ITAC, SIG-ETL variants).
2. Set **Extract Date** (used in retention count queries).
3. Click **Refresh** to reload config and counts.
4. Browse job groups; each card shows schema.table, retention settings, count, and resolved SQL template preview.

## UI Sections

- **Environment selector** — 6 combined env keys (`dev-mes`, `prod-mes`, etc.)
- **Extract Date** picker
- **Refresh** button
- **Offloading groups** — grouped by `job_group`; table cards with counts and SQL preview

## SQL Queries

**Config** (always metadata dev or prod based on env prefix):

```sql
SELECT 
  job_name, job_group, job_group_ordering,
  JSON_VALUE(source_object_settings, '$.schema') as schema_name,
  JSON_VALUE(source_object_settings, '$.table') as table_name,
  data_retention_value, data_retention_unit, data_retention_column,
  source_business_key, template_id
FROM rep_mda.mda_dta_ofg_tables
WHERE is_active = 1
AND job_group like '%${envSuffix}%'   -- mes, itac, or sig-etl from env key
ORDER BY job_group, job_group_ordering
```

**Templates:**

```sql
SELECT id, template_name, template_string
FROM rep_mda.mda_dta_ofg_templates
WHERE is_active = 1
```

**Dimension table count** (has `source_business_key`):

```sql
SELECT COUNT(1) as cnt 
FROM (
  SELECT ${businessKey} AS business_key,
    ROW_NUMBER() OVER (
      PARTITION BY ${businessKey} 
      ORDER BY ${retentionColumn} DESC
    ) AS rn
  FROM ${schema}.${table}
  WHERE ${retentionColumn} < DATEADD(DAY, -1, DATEADD(DAY, -1, '${extractDate}'))
) AS RankedRecords
WHERE rn > 1
```

**Fact table count:**

```sql
SELECT COUNT(1) as cnt 
FROM ${schema}.${table}
WHERE ${retentionColumn} < DATEADD(
  ${retentionUnit}, 
  -${retentionValue}, 
  '${extractDate}'
)
```

Count queries run against the **full environment key** (e.g. `dev-mes`), not metadata.

## Business Logic

- Config fetched from metadata (`dev` or `prod`); counts from operational DB matching env selector.
- `job_group like '%mes%'` derived from second segment of env key (`dev-mes` → `mes`).
- Failed count query stores `-1` for that job (displayed as count).
- Template placeholders replaced in preview: `#schema#`, `#table#`, `#data_retention_column#`, etc.
- Auto-fetch on environment change; extract date change requires Refresh.

## API / Storage

- **executeQuery** — metadata + operational environments

## Related Files

- `src/pages/MonitorOffloadingPage.js`
- `src/styles/pages/_monitor-offloading.scss`

## Edge Cases

- Many sequential count queries — slow for large config lists.
- SQL identifiers (schema, table, columns) not quoted — unusual names may fail.
- Count `-1` indicates query error for that table.
- Extract date not auto-refreshed on change until user clicks Refresh.
