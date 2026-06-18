# Pipeline Analysis

## Route

`/pipeline-analysis`

## Purpose

Deep-dive into a single orchestration pipeline: parameters, DLE jobs, data ingestion, dependencies, recent executions, serving-layer metadata, and DQ rules. Includes enable/disable workflow via modal.

## How to Use

1. Select **Environment** (dev | prod).
2. Search or scroll the **Pipelines** list; click a pipeline.
3. Review detail sections (Basic Info, Parameters, DLE Jobs, Data Ingestion, Dependencies, Recent Executions).
4. Expand **Serving Layer View** and **DQ Tables & Rules** collapsible sections.
5. **Right-click** target/source table IDs in DLE Jobs to open table/column popup.
6. Click **Enable / Disable** to open `PipelineEnableDisableModal`.

## UI Sections

- **Controls** — environment, search, Refresh
- **Pipeline list** — enabled/disabled styling
- **Pipeline details** — multi-row layout
- **Collapsible sections** — Serving Layer, DQ Tables & Rules
- **Table info popup** — DLE table + columns on right-click
- **PipelineEnableDisableModal**

## SQL Queries

**List pipelines:**

```sql
SELECT pipeline_id, pipeline_name, pipeline_short_name, enabled, pipeline_type 
FROM rep_mda.mda_ocn_pipelines 
ORDER BY 1 DESC
```

**Pipeline detail bundle** (on select):

```sql
SELECT top 1 * FROM rep_mda.mda_ocn_pipelines WHERE pipeline_id = ${pipelineId}
SELECT * FROM rep_mda.mda_ocn_pipeline_parameters WHERE pipeline_id = ${pipelineId}
SELECT d.*, p.pipeline_name as dependant_name 
FROM rep_mda.mda_ocn_pipeline_dependencies d
JOIN rep_mda.mda_ocn_pipelines p ON d.dependant_pipeline_id = p.pipeline_id
WHERE d.pipeline_id = ${pipelineId}
SELECT d.*, p.pipeline_name as parent_name 
FROM rep_mda.mda_ocn_pipeline_dependencies d
JOIN rep_mda.mda_ocn_pipelines p ON d.pipeline_id = p.pipeline_id
WHERE d.dependant_pipeline_id = ${pipelineId}
SELECT TOP 5 * FROM rep_mda.mda_ocn_execution_log 
WHERE pipeline_id = ${pipelineId} 
AND extract_date >= DATEADD(DAY, -30, GETDATE())
ORDER BY 1 DESC
SELECT * FROM rep_mda.mda_dle_jobs WHERE job_name = '${jobNameOrPipelineName}'
SELECT * FROM rep_mda.mda_data_ingestion WHERE job_name = '${pipelineName}'
SELECT id, schema_name, table_name, directory, alias, is_active 
FROM rep_mda.mda_dle_tables WHERE id IN (${dleTableIds})
```

**Serving layer** (strategy-specific, examples):

```sql
-- dle_tbe_id strategy
SELECT * FROM rep_mda.mda_dle_serving_layer_tables 
WHERE source_object_settings LIKE '%"dle_tbe_id":${id}%' 
   OR source_object_settings LIKE '%"dle_tbe_id": ${id}%'

-- file_path strategy
SELECT * FROM rep_mda.mda_dle_serving_layer_tables 
WHERE source_object_settings LIKE '%/${token}%' ESCAPE '\'
   OR source_object_settings LIKE '%"file_path":"%/${token}"%' ESCAPE '\'
```

**DQ rules:**

```sql
SELECT * FROM rep_mda.mda_dq_tables WHERE table_definition_key IN (${dleTableIds})
SELECT * FROM rep_mda.mda_dq_compare_tables WHERE dq_tbe_id IN (${ids}) OR dq_tbe_id_referential IN (${ids})
SELECT * FROM rep_mda.mda_dq_referential_integrities WHERE dq_tbe_id IN (${ids}) OR dq_tbe_id_lookup IN (${ids})
SELECT * FROM rep_mda.mda_dq_custom_rules WHERE dq_tbe_id IN (${ids})
```

**Dependency trees** (recursive CTE, max depth 5):

```sql
WITH UpstreamCTE AS ( ... ) SELECT * FROM UpstreamCTE ORDER BY level
WITH DownstreamCTE AS ( ... ) SELECT * FROM DownstreamCTE ORDER BY level
```

**Table popup:**

```sql
SELECT * FROM rep_mda.mda_dle_tables WHERE id = ${tableId}
SELECT * FROM rep_mda.mda_dle_columns WHERE dle_tbe_id = ${tableId} ORDER BY position
```

## Business Logic

- DLE job lookup: `JOB_NAME` parameter value, else pipeline name fallback.
- Serving-layer lookup tries strategies in order: `dle_tbe_id` → `file_path` → `target_object` → `directory_table_path` → `source_like` (skips directory-only tokens unless single match).
- DQ scope uses target DLE table IDs from jobs via `collectDqDleTableIdsFromJobs()`.
- Downstream deps labeled "Executes Before"; upstream deps "Executes After" (orchestration direction).

## API / Storage

- **executeQuery** — dev/prod
- Enable/disable modal may execute UPDATE statements (see `src/utils/pipelineEnableDisable.js`)

## Related Files

- `src/pages/PipelineAnalysisPage.js`
- `src/components/pipeline/PipelineEnableDisableModal.jsx`
- `src/utils/pipelineEnableDisable.js`
- `src/styles/pages/PipelineAnalysisPage.css`

## Edge Cases

- Pipelines without JOB_NAME show fallback hint and may miss DLE job match.
- Serving layer may return 0 rows after all strategies exhausted.
- Recursive dependency CTE capped at level 5.
- Large JSON fields truncated in UI with expandable `<details>`.
