# Execution Log Dashboard

## Route

`/execution-logs`

## Purpose

Monitor pipeline execution logs and queue status, filter and paginate logs, change log status, and check dependency execution for a pipeline on a given extract date.

## How to Use

### Execution logs

1. Select **Environment** (dev | prod).
2. Set filters (defaults: extract date = yesterday).
3. Click **Apply Filters** to load logs.
4. Use pagination (20/50/100/200 per page) and Previous/Next.
5. Click **Change Status** on a row → pick new status → **Update Status**.

### Dependency check

1. Search pipeline by name → select from results.
2. Set **Extract Date**.
3. Click **Check Execution Dependencies**.

### Execution queue

1. Set queue filters → **Apply Queue Filters** (loads on demand, not on page load).

## UI Sections

- **Environment selector**
- **Execution Log Filters** — log_id, pipeline_id, pipeline_name, status, extract_date, start/end datetime
- **Execution Logs table** — paginated, color-coded by status
- **Status Change modal**
- **Pipeline Dependency Check** — search, extract date, dependency status table
- **Execution Queue** — separate filters and table

## SQL Queries

**Count logs:**

```sql
SELECT COUNT(*) as total FROM rep_mda.mda_ocn_execution_log ${whereClause}
```

**Fetch logs (paginated):**

```sql
SELECT 
  log_id, pipeline_id, pipeline_name, pipeline_status,
  ocn_tool_batch_id, extract_date, period_from, period_to,
  start_date_time, end_date_time, error_message, number_of_changed_rows
FROM rep_mda.mda_ocn_execution_log 
${whereClause}
ORDER BY log_id DESC
OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
```

**Update status:**

```sql
UPDATE rep_mda.mda_ocn_execution_log 
SET pipeline_status = '${newStatus}',
    date_last_modified = GETDATE()
WHERE log_id = ${log_id}
```

**Search pipelines:**

```sql
SELECT pipeline_id, pipeline_name 
FROM rep_mda.mda_ocn_pipelines 
WHERE pipeline_name LIKE '%${search}%'
ORDER BY pipeline_name
```

**Dependency check:**

```sql
DECLARE @extract_date datetime;
SET @extract_date = '${extractDate} 00:00:00.000';
SELECT DISTINCT
  pd.dependant_pipeline_id,
  p.pipeline_name,
  el.pipeline_status
FROM rep_mda.mda_ocn_pipeline_dependencies pd
INNER JOIN rep_mda.mda_ocn_pipelines p ON pd.dependant_pipeline_id = p.pipeline_id
OUTER APPLY (
  SELECT TOP 1 el_inner.pipeline_status
  FROM rep_mda.mda_ocn_execution_log el_inner
  WHERE el_inner.pipeline_id = pd.dependant_pipeline_id
    AND el_inner.extract_date >= @extract_date
    AND el_inner.extract_date < DATEADD(day, 1, @extract_date)
  ORDER BY el_inner.log_id DESC
) el
WHERE pd.pipeline_id = ${pipelineId}
ORDER BY p.pipeline_name
```

**Execution queue:**

```sql
SELECT 
  queue_id, pipeline_id, pipeline_name, queue_status, 
  date_last_modified, extract_date, date_of_insert, custom_params
FROM rep_mda.mda_ocn_execution_queue 
${whereClause}
ORDER BY date_of_insert DESC
```

Filter values are interpolated into SQL (LIKE/equality) — user input affects WHERE clauses directly.

## Business Logic

- Logs load only after **Apply Filters** (`hasAppliedFilters` gate).
- Status options: `Succeeded`, `In Progress`, `Failed`, `Cancelled`.
- Queue status options: `Blocked`, `Cancelled`, `Finished`, `Ready`, `Fired`.
- Duration computed client-side from start/end times.
- Datetimes formatted in UTC for display.
- Null dependency execution status shown as **Not executed**.

## API / Storage

- **executeQuery** — dev/prod
- No query history integration on this page

## Related Files

- `src/pages/ExecutionLogDashboard.js`
- `src/styles/pages/ExecutionLogDashboard.css`

## Edge Cases

- Changing environment clears applied filters and log results.
- Queue section shows "No pipelines in queue" until filters applied (initial queue empty).
- Filter strings not escaped — special characters in pipeline_name filter can break SQL.
- `period_from`/`period_to` selected in query but not displayed in UI table.
