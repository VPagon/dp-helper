# Pipeline Branch Out (Visualization)

## Route

`/pipeline-branch-out`

## Purpose

Visualize upstream and downstream pipeline dependency trees for a named pipeline (max 5 levels). Right-click pipelines to view recent execution logs.

## How to Use

1. Select **Environment** (dev | prod).
2. Enter exact **pipeline name**.
3. Click search/fetch (trigger dependency load).
4. Review **Base pipeline**, **Upstream**, and **Downstream** lists with level and enabled status.
5. **Right-click** any pipeline → context menu shows last 5 execution log rows.
6. Use **Add Dependency** button (component) to jump to orchestration workflow if configured.

## UI Sections

- Environment + pipeline name input
- Base / upstream / downstream dependency lists (level-N CSS classes)
- Context menu with execution log snippet
- `AddDependancyButton` component

## SQL Queries

**Find base pipeline:**

```sql
SELECT pipeline_id, pipeline_name, cast(enabled as varchar) as enabled 
FROM rep_mda.mda_ocn_pipelines 
WHERE pipeline_name = '${pipelineName}'
```

**Upstream tree (recursive CTE, max level 5):**

```sql
WITH UpstreamCTE AS (
  SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, 1 AS level
  FROM rep_mda.mda_ocn_pipelines p
  JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
  WHERE d.dependant_pipeline_id = ${basePipelineId}
  UNION ALL
  SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, u.level + 1
  FROM rep_mda.mda_ocn_pipelines p
  JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
  JOIN UpstreamCTE u ON d.dependant_pipeline_id = u.pipeline_id
  WHERE u.level < 5
)
SELECT * FROM UpstreamCTE ORDER BY level
```

**Downstream tree:** same pattern with reversed join direction on `mda_ocn_pipeline_dependencies`.

**Execution logs (context menu):**

```sql
SELECT TOP 5 
  log_id, pipeline_id, pipeline_name, pipeline_status,
  extract_date, start_date_time, end_date_time,
  DATEDIFF(SECOND, start_date_time, end_date_time) AS duration_seconds,
  ocn_tool_batch_id
FROM rep_mda.mda_ocn_execution_log 
WHERE pipeline_name = '${pipelineName}'
AND extract_date >= DATEADD(DAY, -15, GETDATE())
ORDER BY 1 DESC
```

## Business Logic

- Pipeline name match is **exact** equality, not LIKE.
- Enabled shown as `✓ Enabled` when `enabled === '1'`.
- Context menu closes on document click.
- Upstream = pipelines that must run before base; downstream = pipelines that wait on base.

## API / Storage

- **executeQuery** — dev/prod

## Related Files

- `src/pages/PipelineBranchOutPage.js`
- `src/components/common/AddDependancyButton.js`
- `src/styles/pages/PipelineBranchOutPage.css`

## Edge Cases

- Typo in pipeline name → "Pipeline not found" error.
- Trees deeper than 5 levels truncated silently.
- SQL injection risk if pipeline name contains quotes.
- Log fetch errors return empty array (silent in UI).
