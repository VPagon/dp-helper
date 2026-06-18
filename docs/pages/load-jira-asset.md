# Load Jira Asset

## Route

`/load-jira-asset`

## Purpose

Generate SQL to configure Jira Asset loading from REST API to landing zone, parse to raw, silver/gold layers, and deploy metadata. Multi-stage wizard with separate SQL generators and optional execute on dev/prod.

## How to Use

1. Enter **Asset Name**, **Folder Name**, **Environment** (dev | prod — affects auth secret), and **Release Name** (for deploy step).
2. Generate SQL for each stage:
   - **REST to Landing** — ingestion + pipeline + parameters
   - **Parse to Raw** — `mda_jira_assets`, parse pipeline, parameters
   - **Silver/Gold** — DLE/serving layer scripts (see page)
   - **Deploy Metadata** — release deployment inserts
3. Review SQL in popup; copy or execute via page actions where available.

## UI Sections

- Parameter inputs (asset, folder, environment, release)
- Stage buttons opening SQL popups
- Execute/copy controls per popup (where implemented)
- Success/error messages

## SQL Queries

**REST to Landing** (excerpt):

```sql
INSERT INTO rep_mda.mda_data_ingestion (...)
VALUES (
  'JIRA_ASSETS_REST_${ASSET}_TO_LANDING',
  '{"jiraAsset":"${assetName}"}',
  '{"DatastoreType": "JiraRestApi", "jiraWorkspaceId":"...", "authUser":"service.dp.${environment}@rimac-technology.com", ...}',
  ...
);

INSERT INTO rep_mda.mda_ocn_pipelines (...) VALUES ('JIRA_ASSETS_REST_${ASSET}_TO_LANDING', ...);

INSERT INTO rep_mda.mda_ocn_pipeline_parameters (...) VALUES
  (..., 'LOG_ORCHESTRATION', 'true', NULL),
  (..., 'RUN_JOB_ARRAY', '["JIRA_ASSETS_REST_..."]', NULL);
```

**Parse to Raw:**

```sql
INSERT INTO rep_mda.mda_jira_assets (asset_name, asset_jira_column_key, landing_folder, raw_folder, is_active)
VALUES ('${asset_snake}', 'jira_id', '01_landing/06_jira/01_rest/${folder}', '02_raw/06_jira/01_rest/rze_jira...', 1);

INSERT INTO rep_mda.mda_ocn_pipelines (...) VALUES ('PPE_MDAINGESTIONJIRAASSETS_${ASSET}', ...);
```

Additional generators produce raw delta, silver, gold, and auto-deploy release SQL (see `LoadJiraAssetPage.js` for full templates). Some steps call `executeQuery(environment, sql)` when user confirms execution.

## Business Logic

- Asset/folder names normalized: spaces → underscores; case varies by field (upper in pipeline names, lower in asset_name).
- `initial_date` typically 7 days before generation.
- Environment drives Jira auth user email (`service.dp.dev@...` vs prod).
- Multiple modal popups manage generated SQL state separately.

## API / Storage

- **executeQuery** — optional execution on dev/prod for some stages
- Mostly copy-to-clipboard workflow

## Related Files

- `src/pages/LoadJiraAssetPage.js`
- `src/styles/pages/LoadJiraAssetPage.css`

## Edge Cases

- Missing asset or folder blocks generation with validation error.
- Long multi-statement scripts require manual review before prod execute.
- Hardcoded workspace ID and pipeline owners in templates.
- Silver/gold section complexity — run generators in order.
