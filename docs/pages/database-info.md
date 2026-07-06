# Database Info

## Route

`/database-info`

## Purpose

Read-only browser for the whole database: pick an environment, see every schema/table (and views), and inspect a table's column definitions.

## How to Use

1. Select **Environment** (dev | prod | deploy).
2. Tables load automatically, grouped by schema, in the left panel.
3. Optionally type in **Search tables...** to filter by schema or table name.
4. Click a table to load its column definitions in the right panel.
5. **Refresh** re-fetches the table list for the current environment.

## UI Sections

- **Environment selector** (dev | prod | deploy)
- **Refresh** button
- **Summary line** — schema count / table count for the current filter
- **Table list panel** — search box + tables grouped by schema, views tagged with a `view` badge
- **Table detail panel** — column name, data type, nullable, max length, default value

## SQL Queries

**List tables (all schemas):**

```sql
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
ORDER BY TABLE_SCHEMA, TABLE_NAME
```

**Column metadata for a selected table:**

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'
ORDER BY ORDINAL_POSITION
```

## Business Logic

- Schema/table names come from the table list already fetched from the database (not free user input) before being interpolated into the column query.
- Client-side search filters the already-fetched table list; it does not re-query the database.
- No insert/update/delete actions on this page — purely informational, unlike Database CRUD.

## API / Storage

- **executeQuery** — dev/prod/deploy connections, source `database-info`

## Related Files

- `src/pages/DatabaseInfoPage.js`
- `src/styles/pages/_database-info.scss`
- `src/services/sqlService.js`

## Edge Cases

- Large databases with many schemas/tables render the full list at once (no pagination or virtualization).
- Environments beyond dev/prod/deploy are not selectable here even if configured in `server/dbConfig.js`.
