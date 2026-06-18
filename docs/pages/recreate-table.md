# Recreate Table

## Route

`/recreate-table`

## Purpose

Generate Databricks notebook-style SQL to drop and recreate a Delta table at a computed ADLS path from database name, table name, environment, and folder path.

## How to Use

1. Enter **Database Name** (e.g. `020_silver`).
2. Enter **Table Name** (e.g. `s_jira_dbo_jira_service_desk_tickets`).
3. Select **Environment**: `dev` or `prod` (radio).
4. Enter **Path** (e.g. `06_jira/01_rest/sze_servicedesk_tickets`).
5. Click **Generate SQL**.
6. Copy output with **Copy to Clipboard**.

## UI Sections

- Database, Table, Environment (radio), Path inputs
- **Generate SQL** button
- **Generated SQL** `<pre>` block
- **Copy to Clipboard**

## SQL Queries

Generated output:

```sql
%%sql
drop table ${database}.${table};
create table ${database}.${table} USING DELTA LOCATION "${location}";
```

**Location computation:**

```javascript
const container = database
  .replace(/^(\d{2})0_/, '$1-')  // e.g. 020_silver → 02-silver
  .split('_')[0];
const location = `abfss://${container}@st0${environment}0rmc0dtp0we.dfs.core.windows.net/${path}`;
```

Example: database `020_silver`, env `dev`, path `06_jira/01_rest/foo` →  
`abfss://02-silver@st0dev0rmc0dtp0we.dfs.core.windows.net/06_jira/01_rest/foo`

## Business Logic

- Pure client-side string templating; no database calls.
- `%%sql` prefix indicates Databricks cell magic.
- Container name derived from first two digits of database prefix pattern.

## API / Storage

None.

## Related Files

- `src/pages/RecreateTablePage.js`
- `src/styles/pages/_recreate-table.scss`

## Edge Cases

- Database names not matching `NN0_*` pattern may produce unexpected container names.
- Only first segment before `_` used after digit transform (`split('_')[0]`).
- Destructive `DROP TABLE` — review carefully before running in Databricks.
- No query history logging.
