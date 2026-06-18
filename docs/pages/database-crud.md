# Database CRUD

## Route

`/database-crud`

Legacy redirects: `/database-crud-page`, `/database-crud-page-v2` → `/database-crud`.

## Purpose

Browse and mutate rows in `rep_mda.*` metadata tables. Search tables, filter rows, sort columns, insert/update/delete with generated SQL preview and optional execution.

## How to Use

1. Select **Environment** (dev | prod).
2. Search and pick a table from `rep_mda` schema suggestions.
3. Optionally expand **Filters** and enter per-column LIKE filters.
4. Click **Search** to load rows.
5. **Insert New Record** or right-click a row for Edit / Insert Based on This Row / Delete.
6. In edit/insert popups: change fields → **Generate SQL** → review SQL popup → **Execute Query** or copy.
7. **Delete** button on each row opens confirmation with DELETE preview.

## UI Sections

- **Environment selector**
- **Table search** with autocomplete dropdown
- **Collapsible filters grid** (one input per column)
- **Search** / **Insert New Record** buttons
- **Results table** — resizable columns, sortable headers, Delete per row
- **Context menu** — Edit Row, Insert Based on This Row, Delete Row
- **Popups** — Edit, Delete, Insert, Insert Based on, SQL Preview

## SQL Queries

**List tables:**

```sql
SELECT s.name AS schema_name, t.name AS table_name
FROM sys.tables AS t
JOIN sys.schemas AS s ON t.schema_id = s.schema_id
WHERE s.name = 'rep_mda'
ORDER BY s.name, t.name
```

**Column metadata:**

```sql
SELECT c.name AS column_name, t.name AS data_type, c.max_length, c.is_nullable, c.column_id
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('rep_mda.${tableName}')
ORDER BY c.column_id
```

**Search rows:**

```sql
SELECT * FROM rep_mda.${selectedTable} ${whereClause} order by 1 desc
```

WHERE clause: `column LIKE '%value%'` per non-empty filter (AND-combined).

**Update** (first column treated as primary key):

```sql
UPDATE rep_mda.${selectedTable}
SET ${changed_columns}
WHERE ${primaryKeyColumn} = '${primaryKeyValue}'
```

**Delete:**

```sql
DELETE FROM rep_mda.${selectedTable}
WHERE ${primaryKeyColumn} = '${primaryKeyValue}'
```

**Insert:**

```sql
INSERT INTO rep_mda.${selectedTable} (${columns})
VALUES (${values})
```

Values formatted via `formatCrudSqlValue()` in `src/utils/crudSql.js`.

## Business Logic

- Primary key assumed to be **first column** in result set; PK field disabled in edit form.
- Insert forms skip columns whose names contain `date`, `user`, or (for clone) `id`.
- Client-side sorting via `sortTableRows()` after fetch (does not re-query).
- CRUD operations log to query history with revert metadata from `buildCrudUpdateMetadata`, `buildCrudDeleteMetadata`, `buildCrudInsertMetadata`.

## API / Storage

- **executeQuery** — dev/prod metadata connections
- **Query history** — source `database-crud`

## Related Files

- `src/pages/DatabaseCRUDPage.js`
- `src/utils/crudSql.js`
- `src/utils/queryReverse.js`
- `src/utils/tableDataSort.js`
- `src/hooks/useResizableColumns.js`
- `src/styles/pages/_database-crud.scss`

## Edge Cases

- Composite primary keys not supported (first column only).
- String PK values embedded in SQL without parameterization — special characters in PK can break queries.
- "No changes detected" if edit produces identical values.
- Insert with all empty fields rejected.
- `DatabaseCRUDPageV2.js` exists in repo but is **not routed**; active page is `DatabaseCRUDPage.js`.
