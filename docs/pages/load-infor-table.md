# Load Infor Table

## Route

`/load-infor-table`

## Purpose

Generate a complete metadata SQL script to onboard an Infor table via CDC landing load and Raw Delta Framework (RDL): two pipelines, parameters, data ingestion, RDL table definition, and dependency.

## How to Use

1. Enter **Infor Table Name** (e.g. table base name without schema).
2. Click **Generate SQL**.
3. Review output; copy and execute in metadata DB.
4. Manually verify primary key comment in RDL insert (`CHECK FOR PRIMARY KEY ON INFOR`).

## UI Sections

- Table name input
- Generate button
- Generated SQL preview + Copy

## SQL Queries

Generated script includes:

**Pipeline 1 — CDC to landing:**

```sql
INSERT INTO rep_mda.mda_ocn_pipelines (...)
VALUES (
  'MS_SQL_CDC_INFOR_DBO_${TABLE}_TO_BRONZE_LANDING_ZONE',
  'CDC_${TABLE}_LNG',
  ...
  'METADATA_DRIVEN_INGESTION', ...);
```

**Pipeline 2 — RDL delta:**

```sql
INSERT INTO rep_mda.mda_ocn_pipelines (...)
VALUES (
  'RDL_R_LN_DBO_${TABLE}_DELTA',
  ...
  'LOAD_RAW_DELTA', ...);
```

**Parameters, ingestion, RDL, dependency:**

```sql
INSERT INTO rep_mda.mda_ocn_pipeline_parameters (...)
VALUES (... 'TABLE_NAME', 'BRONZE#R_LN_DBO_${TABLE}_DELTA', ...);

INSERT INTO rep_mda.mda_data_ingestion (...)
VALUES ('MS_SQL_CDC_INFOR_DBO_${TABLE}_TO_BRONZE_LANDING_ZONE', ...);

INSERT INTO rep_mda.mda_rdl_tables (...)
VALUES ('BRONZE', '012_raw', 'r_ln_dbo_${table}_delta', ...);

INSERT INTO rep_mda.mda_ocn_pipeline_dependencies (...)
VALUES (
  (RDL pipeline id subquery),
  (CDC pipeline id subquery),
  0, 'DEP_...', 'CHECK_DEPENDENCY_ROWCOUNT');
```

Hardcoded: Infor server `RT-VS-PR-085\\INFORTESTLN`, owner `Vilim Pagon`, initial_date ~1 month ago.

## Business Logic

- Pure generation — no `executeQuery`.
- Timestamps injected at generation time (`today`, `initialDateStr`).
- Table name case: UPPER in pipeline names, lower in paths/table names.

## API / Storage

None (client-side only).

## Related Files

- `src/pages/LoadInforTablePage.js`
- `src/styles/pages/LoadInforTablePage.css`

## Edge Cases

- Empty table name still generates invalid SQL placeholders.
- PK in RDL left as manual comment — must be verified on Infor source.
- Subqueries use LIKE on pipeline names — fails if names collide.
- CDC server name is test environment hardcoded.
