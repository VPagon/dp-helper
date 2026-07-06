# Load Infor Table

## Route

`/load-infor-table`

## Purpose

Onboard an Infor (or ITAC) table family into the metadata-driven ingestion framework: for a base table name and one or more company codes, generate the full, correct set of `rep_mda.*` INSERT statements — CDC-landing pipeline, snapshot-bronze pipeline, RDL-delta pipeline, their ingestion jobs, the RDL table definition, and pipeline dependencies — each individually editable, executable, and copyable.

Superseded the earlier version of this page, which only generated 2 of the 3 real pipelines (missing the snapshot pipeline and its ingestion job entirely) and had no execution capability. The generation rules below were verified directly against live `dev` metadata for the `TQMPTC300220-223` table family (pipelines, ingestion jobs, parameters, RDL rows, and the dependency graph).

## How to Use

1. Enter **Base Infor Table Name** (e.g. `TQMPTC300` — without the company-code suffix).
2. Enter **Company Codes** (comma-separated, e.g. `220,221,222,223`) — one physical table is onboarded per code (`{base}{company}`, e.g. `TQMPTC300220`).
3. Pick **Target Metadata Environment** (dev/prod/deploy) — controls which DB the Execute buttons write to.
4. Pick **Infor / ITAC Source Server** — auto-fills Source Database Name and Source Connection Alias (editable).
5. Adjust **Source Schema**, **Primary Key Columns**, **Pipeline Owner**, **Load Category** (per pipeline type), and **Task ID** (per pipeline type) as needed.
6. Click **Generate SQL** — renders one collapsible section per company, each with 9 editable SQL statements.
7. Per statement: **Execute** runs it against the selected environment (via the same `/api/query` endpoint every other page uses), **Copy to Clipboard** copies the current (possibly hand-edited) text. **Execute All** runs a company's 9 statements in order.

## Generated Statements (per company)

For base `TQMPTC300` + company `220` → `FULL = TQMPTC300220`:

1. **CDC pipeline** (`rep_mda.mda_ocn_pipelines`) — `MS_SQL_CDC_INFOR_DBO_{FULL}_TO_BRONZE_LANDING_ZONE`, `pipeline_type='METADATA_DRIVEN_INGESTION'`, `load_category='standard_load'` (default), `pipeline_priority=90`, `execution_resource='AZURE_SYNAPSE_PIPELINE'` (explicit override — DB default is `SPARK_JOB`).
2. **Snapshot pipeline** — `MS_SQL_INFOR_DBO_{FULL}_TO_BRONZE_ZONE`, same pipeline_type, `load_category='irregular_dq'` (default), `execution_resource='AZURE_SYNAPSE_PIPELINE'` (same override) — this pipeline was missing from the old generator entirely.
3. **RDL pipeline** — `RDL_R_LN_DBO_{FULL}_DELTA`, `pipeline_type='LOAD_RAW_DELTA'`, `load_category='standard_load'`, `orchestrator_tool='Synapse Notebook'` (explicit override — DB default is `Synapse Pipeline`). `execution_resource` is left to its DB default (`SPARK_JOB`), which pairs correctly with `Synapse Notebook`.
4. **RDL pipeline parameter** (`rep_mda.mda_ocn_pipeline_parameters`) — `TABLE_NAME = 'BRONZE#R_LN_DBO_{FULL}_DELTA'`, `pipeline_id` resolved via subquery on the RDL pipeline name.
5. **CDC ingestion job** (`rep_mda.mda_data_ingestion`) — `DatastoreType='RimacOnPremSQLServerTableCdc'`. First insert uses `dataLoadingBehavior='FullLoad'` (seeds a full historical backfill before the pipeline is switched over to real incremental CDC delta capture — not `'DeltaLoad'`, which is what the pipeline settles into only after that first run). `sink_object_settings`/`copy_activity_settings` are fixed macro-only JSON (see below) with forward slashes escaped (`\/`), matching the live dev row. Default `task_id=3`.
6. **Snapshot ingestion job** — `DatastoreType='RimacOnPremSQLServerTable'`, `dataLoadingBehavior='FullLoad'`. RDL pipelines never get an ingestion job (confirmed empirically — only CDC and snapshot do). `source_copy_settings` and `triggering_entity_name` intentionally use the original hand-formatted legacy style (pretty-printed, unescaped slashes, no `<ANY>` trigger) — a verbatim match of the live dev row for `TQMPTC300220`, not the newer compact/escaped style seen on more recently-touched rows. Default `task_id=100`.
7. **RDL table definition** (`rep_mda.mda_rdl_tables`) — `table_name = r_ln_dbo_{full_lower}_delta`; `alias = r_ln_dbo_{base_lower}_delta` (no company suffix — shared across a table's company family, confirmed against real data); `unique_key` built from the pasted primary key columns: the bare column name if there's exactly one, otherwise `concat(col1,'#',col2,...)`.
8. **Dependency: CDC → RDL** (`rep_mda.mda_ocn_pipeline_dependencies`) — the RDL pipeline depends on its CDC landing pipeline (`pipeline_id` = RDL, `dependant_pipeline_id` = CDC, matching the live schema's semantics), `additional_checks='CHECK_DEPENDENCY_ROWCOUNT'`.
9. **Dependency: Snapshot → Weekly CDC Check** — the snapshot pipeline depends on a shared, pre-existing orchestrator pipeline named `CSM_PPE_RUNDQTESTBATCHCDCJOBSWEEKLY` ("Run weekly CDC checks"). Resolved **by name via subquery, not by a literal `pipeline_id`** — auto-increment IDs are not portable across dev/prod/deploy.

Folder-path/copy-activity JSON fields (`sink_object_settings`, `copy_activity_settings`) use literal macro placeholders (`#schema#`, `#table#`, `#source#`, `#pipeline#`, etc.) resolved by the Synapse pipeline engine at runtime — the wizard does not substitute these; for the CDC job they're fixed constants matching the live dev row byte-for-byte (escaped slashes included). Only `source_object_settings` (schema/table), `source_connection_settings` (server/database/alias), and `mda_rdl_tables` source/target directories use real substituted values.

## UI Sections

- Wizard form: base table, company codes, environment, source server/database/alias/schema, PK columns, owner, load categories (×3), task IDs (×2), Generate button.
- Per-company collapsible section: `Execute All` button + one block per statement (label, editable textarea, Execute + Copy buttons, inline status).

## Business Logic

- `src/utils/inforTableSql.js` — pure generation logic (`buildInforTableInserts`), separate from the page component's UI state.
- Company codes are free text, not a fixed picker — the real distinct-suffix set across `dev` includes far more than `220-223` (`000`, `110`, `450`, `451`, `452`, etc.).
- All string values are SQL-escaped (`'` → `''`). JSON blob fields that vary per table (`source_object_settings`, `source_connection_settings`) are built via `JSON.stringify` to avoid quoting/escaping bugs; JSON blobs that are always identical (CDC's macro-only `sink_object_settings`/`copy_activity_settings`, snapshot's legacy-formatted `source_copy_settings`/`triggering_entity_name`) are hardcoded literal constants matching the live dev rows byte-for-byte.
- Source server dropdown maps to a default alias/database pair; ITAC options (`RT-VS-TE-024\ITACAMPERETST`, `RT-VS-PR-025\RIMACITACPROD`) default to `itac`/`itacdb` as an unverified placeholder — double check before executing against those.
- Execution uses `executeQuery` from `src/services/sqlService.js` (same helper `DatabaseInfoPage` uses) — posts to `/api/query`, which runs arbitrary SQL including INSERT with no read-only guard, and logs to query history automatically.

## API / Storage

- `POST /api/query` (`server/index.js`) — used for all Execute buttons. No dedicated endpoint for this page.

## Related Files

- `src/pages/LoadInforTablePage.js`
- `src/utils/inforTableSql.js`
- `src/styles/pages/_load-infor-table.scss`

## Edge Cases

- Empty primary key columns → `unique_key` falls back to a `-- TODO: primary key columns not provided --` placeholder rather than silently generating invalid SQL.
- Dependency INSERTs rely on the pipeline INSERTs having already run (subqueries resolve by name) — statements are generated in dependency-safe order (pipelines → parameter/ingestion/RDL row → dependencies); running them out of order via individual Execute clicks will fail with a NULL FK.
- Hand-editing a statement's textarea only affects that statement; Execute/Copy always act on the current textarea content, not the original generated text.
