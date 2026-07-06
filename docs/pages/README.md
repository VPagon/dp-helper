# DP Helper — Page Documentation

Index of all routed pages in the React app (`src/App.js`). Each link goes to detailed documentation for that route.

## Quick reference

| Route | Page | Doc |
|-------|------|-----|
| `/` | Home | [home.md](./home.md) |
| `/metadata-differences` | Metadata Comparison | [metadata-differences.md](./metadata-differences.md) |
| `/database-crud` | Database CRUD | [database-crud.md](./database-crud.md) |
| `/database-info` | Database Info | [database-info.md](./database-info.md) |
| `/insert-data` | Insert Data | [insert-data.md](./insert-data.md) |
| `/recreate-table` | Recreate Table | [recreate-table.md](./recreate-table.md) |
| `/execution-logs` | Execution Log Dashboard | [execution-logs.md](./execution-logs.md) |
| `/pipeline-analysis` | Pipeline Analysis | [pipeline-analysis.md](./pipeline-analysis.md) |
| `/mrm-dle-compare` | MRM vs DLE Compare | [mrm-dle-compare.md](./mrm-dle-compare.md) |
| `/query-history` | Query History | [query-history.md](./query-history.md) |
| `/code-snippets` | Code Snippets | [code-snippets.md](./code-snippets.md) |
| `/monitor-offloading` | Offloading Monitor | [monitor-offloading.md](./monitor-offloading.md) |
| `/data-sync` | SQLDB DEV-PROD Migration | [data-sync.md](./data-sync.md) |
| `/metadaterium` | Metadaterium | [metadaterium.md](./metadaterium.md) |
| `/orchestrate-pipelines` | Pipeline Orchestration | [orchestrate-pipelines.md](./orchestrate-pipelines.md) |
| `/pipeline-branch-out` | Pipeline Visualization | [pipeline-branch-out.md](./pipeline-branch-out.md) |
| `/replicate-to-br` | Data Replication (BR) | [replicate-to-br.md](./replicate-to-br.md) |
| `/load-infor-table` | Infor Delta Table Loader | [load-infor-table.md](./load-infor-table.md) |
| `/load-jira-asset` | Load Jira Asset | [load-jira-asset.md](./load-jira-asset.md) |
| `/add-dq-rules` | Add DQ Rules | [add-dq-rules.md](./add-dq-rules.md) |
| `/auto-deploy` | Auto Deploy Metadata | [auto-deploy.md](./auto-deploy.md) |
| `/local-database-manager` | Local SQLite CRUD | [local-database-manager.md](./local-database-manager.md) |

## By category (matches home page)

### Monitoring

- [Metadata Comparison](./metadata-differences.md) — `/metadata-differences`
- [Offloading Monitor](./monitor-offloading.md) — `/monitor-offloading`
- [Execution Log Dashboard](./execution-logs.md) — `/execution-logs`

### Help services

- [Insert Data](./insert-data.md) — `/insert-data`
- [Recreate Table](./recreate-table.md) — `/recreate-table`
- [Add DQ Rules](./add-dq-rules.md) — `/add-dq-rules`

### Metadata operations

- [Query History](./query-history.md) — `/query-history`
- [Database CRUD](./database-crud.md) — `/database-crud`
- [Database Info](./database-info.md) — `/database-info`
- [MRM vs DLE Compare](./mrm-dle-compare.md) — `/mrm-dle-compare` *(dev only)*

### Pipeline tools

- [Pipeline Analysis](./pipeline-analysis.md) — `/pipeline-analysis`
- [Pipeline Orchestration](./orchestrate-pipelines.md) — `/orchestrate-pipelines`
- [Pipeline Visualization](./pipeline-branch-out.md) — `/pipeline-branch-out`

### System integration

- [Infor Delta Table Loader](./load-infor-table.md) — `/load-infor-table`
- [Data Replication](./replicate-to-br.md) — `/replicate-to-br`
- [Load Jira Asset](./load-jira-asset.md) — `/load-jira-asset`
- [Auto Deploy Metadata](./auto-deploy.md) — `/auto-deploy`

### Data migration

- [Data Sync](./data-sync.md) — `/data-sync`
- [Metadaterium](./metadaterium.md) — `/metadaterium`

### Developer tools

- [Code Snippets](./code-snippets.md) — `/code-snippets`

### Local database

- [Local Database Manager](./local-database-manager.md) — `/local-database-manager`

## Redirects (not separate pages)

| Legacy route | Target |
|--------------|--------|
| `/database-crud-page` | `/database-crud` |
| `/database-crud-page-v2` | `/database-crud` |

## Shared infrastructure

Most SQL Server pages use:

- `src/services/sqlService.js` → `POST http://localhost:5000/api/execute-query`
- Query audit: `src/services/queryHistoryLogger.js` + `src/utils/queryHistoryStorage.js` (IndexedDB)

Environment keys commonly include: `dev`, `prod`, `deploy`, plus operational DBs (`dev-mes`, `prod-mes`, `dev-sqldb-kup-app`, etc.) configured on the server.

## Source of truth

Routes are defined in `src/App.js`. Navigation cards are in `src/pages/HomePage.js`. When docs and code disagree, prefer the source files.
