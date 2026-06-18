# Orchestrate Pipelines

## Route

`/orchestrate-pipelines`

## Purpose

Build `INSERT` statements for pipeline dependencies in `rep_mda.mda_ocn_pipeline_dependencies`. Configure one parent pipeline and multiple dependant pipelines per group, then generate and optionally execute SQL.

## How to Use

1. Select **Environment** (dev | prod).
2. Click **Add Dependency Group**.
3. In each group:
   - Search and select **Parent pipeline** (runs after dependants complete).
   - Add **Dependant pipelines** (must finish before parent).
4. Click **Generate SQL** to preview INSERT statements.
5. **Execute SQL** runs each statement sequentially on selected environment.
6. **Copy to Clipboard** to run manually.

## UI Sections

- Environment selector
- Dependency groups (add/remove)
- Parent pipeline search + selection
- Dependant pipeline search chips
- Generated SQL preview
- Generate / Execute / Copy buttons

## SQL Queries

**Load pipelines:**

```sql
SELECT pipeline_id, pipeline_name FROM rep_mda.mda_ocn_pipelines ORDER BY pipeline_name
```

**Generated INSERT** (per parent/dependant pair):

```sql
INSERT INTO rep_mda.mda_ocn_pipeline_dependencies (
  pipeline_id, dependant_pipeline_id, dependency_lag,
  key_dep, additional_checks
) VALUES (
  ${parentPipelineId}, ${dependantPipelineId}, 0,
  '${keyDep}', NULL
);
```

`key_dep` format:

```
DEP_${dependantPipelineName}_${parentPipelineName}
```

(non-alphanumeric → `_`, uppercased)

**Execute:** splits on `;\n\n` and runs each fragment via `executeQuery`.

## Business Logic

- `pipeline_id` = parent (orchestration parent — the pipeline that waits).
- `dependant_pipeline_id` = upstream job that must complete first.
- `dependency_lag` always `0`; `additional_checks` NULL.
- Search filters client-side from cached pipeline list.

## API / Storage

- **executeQuery** — dev/prod

## Related Files

- `src/pages/OrchestratePipelinesPage.js`
- `src/styles/pages/_orchestrate-pipelines.scss`

## Edge Cases

- Groups without both parent and dependants produce no SQL for that group.
- Execute splits SQL naively — malformed manual edits may fail mid-batch.
- Duplicate dependency inserts may fail on unique constraints.
- No query history logging.
