# Home

## Route

`/`

## Purpose

Landing page and navigation hub for all DP Helper tools. Tools are grouped into categories (Monitoring, Help Services, Metadata Operations, Pipeline Tools, System Integration, Data migration, Developer Tools, Local database) with short descriptions and links.

## How to Use

1. Open the app root URL.
2. Browse category cards on the home page.
3. Click a tool card to navigate to the corresponding route.

There is no data entry or SQL execution on this page.

## UI Sections

| Section | Tools linked |
|---------|--------------|
| Monitoring | Metadata Comparison, Offloading Monitor, Execution Log Dashboard |
| Help Services | Insert Data, Recreate Table, Add DQ Rules |
| Metadata Operations | Query Metadata, Query History, Database CRUD, MRM vs DLE Compare |
| Pipeline Tools | Pipeline Analysis, Pipeline Orchestration, Pipeline Visualization |
| System Integration | Infor Delta Table Loader, Data Replication, Load Jira Asset, Auto Deploy Metadata |
| Data migration | SQLDB-KUP-APP DEV-PROD MIGRATION, Metadaterium |
| Developer Tools | Code Snippets |
| Local database | Local database CRUD |

## SQL Queries

None. Navigation only.

## Business Logic

Static layout defined in `HomePage.js`. Each `Link` maps to a React Router path registered in `App.js`.

## API / Storage

None.

## Related Files

- `src/pages/HomePage.js`
- `src/App.js` (route definitions)
- `src/styles/pages/_home.scss`

## Edge Cases

- **MRM vs DLE Compare** appears under Metadata Operations but queries **dev only** (hardcoded in the compare page).
- Legacy routes `/database-crud-page` and `/database-crud-page-v2` redirect to `/database-crud`.
