# Auto Deploy Metadata

## Route

`/auto-deploy`

## Purpose

Build a metadata **release** for promoting dev changes to production: select pipelines (optionally with dependency tree), discover related metadata entities, and generate deployment SQL against the deploy database (`mda.mda_releases`, release items, etc.).

## How to Use

1. Environment context: pipeline discovery uses **dev**; release numbering uses **deploy**.
2. Search and **select pipelines** to deploy.
3. Optional: **Auto-select dependencies** (exactly one pipeline selected) to add upstream/downstream tree.
4. Enter or **generate Release Name** (`RELEASE-NNNN`).
5. Click **Find Metadata** to resolve entity rows across many `rep_mda` tables.
6. Add custom entities manually if needed.
7. **Generate SQL** → review in popup → copy or execute.

## UI Sections

- Pipeline search + multi-select list
- Auto dependency checkbox / button
- Release name input + generate
- Entity list (type + identifier)
- Custom entity form (type dropdown + identifier)
- Generated SQL popup

## SQL Queries

**List pipelines (dev):**

```sql
SELECT pipeline_id, pipeline_name 
FROM rep_mda.mda_ocn_pipelines 
ORDER BY pipeline_name
```

**Next release name (deploy):**

```sql
SELECT MAX(release_name) as last_release 
FROM mda.mda_releases 
WHERE release_name LIKE 'RELEASE-%'
```

**Dependency tree** (dev, recursive CTE, max depth 10):

```sql
WITH UpstreamCTE AS ( ... ) SELECT DISTINCT pipeline_id, pipeline_name FROM UpstreamCTE
WITH DownstreamCTE AS ( ... ) SELECT DISTINCT pipeline_id, pipeline_name FROM DownstreamCTE
```

**Find metadata entities** (examples from `findMetadata()`):

```sql
SELECT 'MDA_OCN_PIPELINES_ROW' as entity_type, pipeline_name as identifier
FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name IN (...)

SELECT 'MDA_DATA_INGESTION_ROW' as entity_type, job_name as identifier
FROM rep_mda.mda_data_ingestion WHERE job_name IN (...)

SELECT 'MDA_DLE_JOBS_ROW' as entity_type, job_name as identifier
FROM rep_mda.mda_dle_jobs WHERE job_name IN (...)
-- Plus DLE tables, dependencies, DQ objects, RDL, RPN, etc.
```

**Generated deployment SQL** inserts into deploy schema (`mda.mda_releases`, release detail/item tables) — full template in `AutoDeployMetadata.js` `generateDeploymentSQL()`.

Supported entity types (18): `MDA_DLE_TABLES_ROW`, `MDA_DATA_INGESTION_ROW`, `MDA_DLE_JOBS_ROW`, `MDA_OCN_PIPELINES_ROW`, `MDA_OCN_PIPELINE_DEPENDENCIES_ROW`, and others listed in `entityTypes` array.

## Business Logic

- Pipeline list always fetched from dev regardless of UI environment state.
- Auto dependency requires exactly one selected pipeline.
- Entity discovery maps pipeline names/IDs to rows across metadata tables.
- Release name auto-increments numeric suffix with zero padding.

## API / Storage

- **executeQuery** — `dev` (discovery), `deploy` (release catalog), optional execute of generated script

## Related Files

- `src/pages/AutoDeployMetadata.js`
- `src/styles/pages/AutoDeployMetadata.css`

## Edge Cases

- Empty pipeline selection blocks metadata find.
- Large dependency trees may include many pipelines unexpectedly.
- Generated SQL complexity — always review before execute on deploy/prod.
- Custom entity types must match deploy tool expectations.
