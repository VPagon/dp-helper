# Replicate to BR

## Route

`/replicate-to-br`

## Purpose

Generate SQL to replicate a raw Delta table from DP to the BR Azure SQL database: data ingestion job, RPN object/column metadata, orchestration pipeline, and dependency wiring.

## How to Use

1. Enter **Table Name** (Infor-style name, e.g. `TWHINH226222`).
2. **Check Table Exists on DP** — searches prod metadata pipelines matching name.
3. **Generate Replication SQL** — produces full script in preview.
4. Copy and execute manually in prod metadata (script targets prod resources).

## UI Sections

- Table name input
- Check / Generate buttons
- Check results table (pipeline search results)
- Generated SQL `<pre>` + Copy

## SQL Queries

**Check (prod metadata):**

```sql
SELECT * FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE '%${tableName}%'
```

**Generated script** (abbreviated structure):

```sql
INSERT [rep_mda].[mda_data_ingestion] (...) VALUES (
  'REPLICATION_RAW_R_LN_DBO_${TABLE}_TO_AZURE_SQL_BR',
  -- source: dbo.r_ln_dbo_${table}_delta on Synapse serverless
  -- sink: ln_br.${table} on sql-prod-br-dtp-we
  ...
);

INSERT INTO rep_mda.mda_rpn_objects (...) 
SELECT ... FROM [rep_mda].[mda_infor_columns_definition] WHERE table_name = '${table}';

INSERT INTO rep_mda.mda_rpn_object_columns(...)
SELECT ... FROM [rep_mda].[mda_infor_columns_definition] WHERE table_name='${table}';

UPDATE rep_mda.mda_ocn_pipeline_parameters 
SET parameter_value=REPLACE(parameter_value,']',', "REPLICATION_RAW_R_LN_DBO_${TABLE}_TO_AZURE_SQL_BR"]') 
WHERE parameter_id=921;

INSERT INTO rep_mda.mda_ocn_pipelines (...) VALUES ('REPLICATION_RAW_R_LN_DBO_${TABLE}_TO_AZURE_SQL_BR', ...);

INSERT INTO rep_mda.mda_ocn_pipeline_dependencies (...)
VALUES (1834, (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE '%${TABLE}%delta%'), 0, ...);
```

Hardcoded values include `parameter_id=921`, parent `pipeline_id=1834`, owner `Vilim Pagon`, Synapse/BR connection strings.

## Business Logic

- Check always uses **prod** environment for metadata query.
- Table name uppercased in pipeline names, lowercased in schema/table references.
- Dependency links replication pipeline to existing delta load pipeline by LIKE match.
- No execute button — copy only.

## API / Storage

- **executeQuery** — prod (check only)

## Related Files

- `src/pages/ReplicateToBRPage.js`
- `src/styles/pages/ReplicateToBRPage.css`

## Edge Cases

- Hardcoded pipeline IDs (921, 1834) may be wrong in other environments.
- LIKE '%table%' check may return unrelated pipelines.
- Multiple delta pipelines → ambiguous dependency subquery.
- Script assumes `mda_infor_columns_definition` has column metadata for table.
