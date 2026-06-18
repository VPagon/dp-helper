# Metadaterium

## Route

`/metadaterium`

## Purpose

Multi-step wizard to generate SQL for loading data through the Metadaterium framework: ingestion → raw → silver → gold. Produces large scripted INSERT batches for pipelines, MRM tables, DLE metadata, data ingestion, and related objects.

## How to Use

1. Walk steps: **Ingestion** → **Raw** → **Silver** → **Gold** (step tabs).
2. Fill form fields: environment, table name, companies, owner, primary key, server, MRM domain, specification location, excel sheets, MRM_ID.
3. Use **Get Latest MRM_ID** to pull from `log_mrm_execution`.
4. Generate SQL per step (Snapshot, Delta ingestion, Landing to Raw, Silver, Gold buttons — see page for exact actions).
5. Copy generated SQL from popups/previews; execute manually in metadata DB.

## UI Sections

- **Step navigator** — Ingestion, Raw, Silver, Gold
- **Form fields** per step
- **Generate** buttons exposing SQL popups
- **MRM tables/jobs** loaders for silver/gold steps
- Success/error banners

## SQL Queries

**Latest MRM_ID:**

```sql
SELECT TOP 1 * FROM [rep_mda].[log_mrm_execution] ORDER BY 1 DESC
```

**Generated SQL** (examples — full templates in source):

- `INSERT INTO [rep_mda].[mda_data_ingestion]` — snapshot ingestion with JSON_OBJECT settings
- `INSERT INTO rep_mda.mda_ocn_pipelines` — pipeline registration
- MRM table/job/column inserts into `mda_mrm_*` tables
- DLE table/job/column inserts into `mda_dle_*` tables
- RDL, serving layer, and orchestration dependency inserts (step-dependent)

Job naming pattern example:

```
MS_SQL_INFOR_DBO_${TABLE}${COMPANY}_TO_BRONZE_ZONE
```

Primary key formatting: single column → `t_${column}`; multiple → `concat(col1,'#',col2,...)`.

## Business Logic

- Company checkboxes (e.g. 220); defaults to `['220']` if none selected.
- Table name parsing via `getTableParts()` for pipeline short names.
- `formatPrimaryKey()` builds SQL concat expressions for composite keys.
- Loads MRM/DLE data by MRM_ID for silver/gold configuration steps.
- Large file (~1400+ lines) — each step has dedicated generator functions.

## API / Storage

- **executeQuery** — dev/prod for MRM_ID lookup and loading MRM/DLE reference data
- Generated SQL not auto-executed from page

## Related Files

- `src/pages/MetadateriumPage.js`
- `src/styles/pages/_metadaterium.scss`

## Edge Cases

- Typo in home page description ("throuhm") — route is `/metadaterium`.
- Generated SQL contains placeholder server names if not filled.
- Manual execution required — no built-in execute or history logging on most generators.
- Multi-company loops duplicate entire INSERT blocks per company.
