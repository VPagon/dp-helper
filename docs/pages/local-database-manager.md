# Local Database Manager

## Route

`/local-database-manager`

## Purpose

CRUD interface for the app's **local SQLite database** (not metadata SQL Server). Manage tables, schema (add columns), and row data via REST API on the Node backend.

## How to Use

1. Select a **table** from the list (or create new table).
2. View paginated data with optional **search** and per-column **filters**.
3. **Create Table** — define columns (name, type, nullable, PK, autoincrement).
4. **Modify Table** — add columns via ALTER TABLE.
5. **Insert / Edit / Delete** rows through modals.
6. Use pagination controls (page size default 50).

## UI Sections

- Table list sidebar
- Search + filter panel
- Data grid with row actions
- Modals: Create Table, Modify Table, Insert, Edit, Delete
- Pagination footer

## SQL Queries

Executed **server-side** via `POST /api/local/query` with SQLite syntax:

**List tables:**

```
GET /api/local/tables
```

**Schema:**

```
GET /api/local/table/:name/schema
```

**Select data:**

```sql
SELECT * FROM ${tableName} ${whereClause} ORDER BY rowid DESC LIMIT ${itemsPerPage} OFFSET ${offset}
```

WHERE: global search ORs `column LIKE ?` across all columns; filters AND `column LIKE ?`.

**Create table:**

```sql
CREATE TABLE IF NOT EXISTS ${name} (${columnDefinitions})
```

**Add column:**

```sql
ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}
```

**Insert / Update / Delete** — built dynamically from form data (see component handlers).

Rename column uses table recreate pattern (SQLite limitation) — simplified in code with data copy warning in comments.

## Business Logic

- API base: `http://localhost:5000` (`API_BASE_URL` constant).
- Parameterized queries (`?` placeholders) for reads with filters.
- Pagination by `rowid DESC`.
- Separate from metadata `Database CRUD` page — different DB entirely.

## API / Storage

- **SQLite** file on server (`local-data.db`)
- REST endpoints under `/api/local/*`

## Related Files

- `src/pages/LocalDatabaseManager.jsx`
- `server/index.js` (local DB routes)
- `src/styles/pages/_local-database-manager.scss`
- Reuses `_database-crud.scss` styles

## Edge Cases

- Backend must be running on port 5000.
- SQLite ALTER limitations — rename/drop column uses workaround, may lose data if misused.
- Table/column names not validated for SQL injection on CREATE (trusted local use).
- No query history integration.
