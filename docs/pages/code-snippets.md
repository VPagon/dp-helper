# Code Snippets

## Route

`/code-snippets`

## Purpose

Store and manage reusable code snippets (SQL, PySpark, Python, Other) with titles, descriptions, SQL formatting, search, and filter by language.

## How to Use

1. Browse snippet list; filter by language or search text.
2. Click **Add snippet** to create; click a snippet to expand view.
3. In expanded view: **Edit**, **Delete**, **Copy code**.
4. For SQL snippets: use **Format SQL** in the editor.
5. Save requires non-empty **Title**.

## UI Sections

- **Toolbar** — Add snippet, language filter, search
- **Snippet list** — cards with title, language, description preview, timestamps
- **Expanded snippet** — full code, copy, edit, delete
- **SnippetForm** (create/edit overlay) — title, language, description, code, Format SQL (sql only)

## SQL Queries

None. Snippets may *contain* SQL but the page does not execute queries.

SQL formatting uses `formatSql()` from `src/utils/sqlFormat.js` (sql-formatter library).

## Business Logic

- Languages: `sql`, `pyspark`, `python`, `other` (`SNIPPET_LANGUAGES`).
- Persistence via server API in `codeSnippetsStorage.js` (backed by JSON file on server).
- Client-side filter searches title, description, code, language.
- Action messages auto-dismiss after 4 seconds.

## API / Storage

- **GET/POST/DELETE** via `src/utils/codeSnippetsStorage.js` → server endpoints (see `server/codeSnippetsStore.js`)
- Example seed: `data/code-snippets.example.json`
- No IndexedDB; server-side JSON persistence

## Related Files

- `src/pages/CodeSnippetsPage.jsx`
- `src/utils/codeSnippetsStorage.js`
- `src/utils/sqlFormat.js`
- `server/codeSnippetsStore.js`
- `src/styles/pages/_code-snippets.scss`

## Edge Cases

- Format SQL fails on invalid SQL — error shown, code unchanged.
- Empty title blocks save.
- Server offline → load/save errors displayed.
- Delete requires confirmation in UI flow (see page handlers).
