# Add DQ Rules

## Route

`/add-dq-rules`

## Purpose

Generate INSERT SQL for Data Quality metadata: register DLE tables in `mda_dq_tables`, compare-table rules, referential integrity rules, and custom rules.

## How to Use

1. Select **Environment** (dev | prod).
2. Choose active section tab: **DQ Tables**, **Compare Tables**, **Referential Integrity**, or **Custom Rules**.
3. **DQ Tables**: search DLE tables, multi-select, set options, **Generate SQL**.
4. **Compare Tables**: pick two DQ tables, set compare flags, generate.
5. **Referential**: pick lookup/foreign tables, enter key names, generate.
6. Review SQL in popup; copy or execute if button provided.

## UI Sections

- Environment selector
- Section tabs
- DLE table search + multi-select list
- DQ table pickers (for compare/ref)
- Options forms per rule type
- Generated SQL popup

## SQL Queries

**Load DLE tables:**

```sql
SELECT id, table_name, schema_name, zone_name 
FROM rep_mda.mda_dle_tables 
WHERE is_active = 1 
ORDER BY table_name
```

**Load existing DQ tables:**

```sql
SELECT id, table_name 
FROM rep_mda.mda_dq_tables 
WHERE is_active = 1 
ORDER BY table_name
```

**Generate DQ table INSERT:**

```sql
INSERT INTO rep_mda.mda_dq_tables (
  table_name, table_type, table_definition_location, table_definition_key,
  filter, stage_dq_table_name, dq_indicator_column_name, dq_issues_column_name,
  table_group, is_active, f_check_column_datatypes, key_email, table_definition,
  f_stage_only_failed_rows, f_check_na_row_existence, unique_key, kvs_connection_string
) VALUES (
  '${schema}.${table_name}',
  'DLE_TABLE',
  'rep_mda.mda_dle_tables',
  ${dle_table_id},
  '${filter}',  -- default: is_current=1 and is_deleted=0
  NULL, NULL, NULL,
  '${table_group}',  -- default DEFAULT
  1, '${f_check_column_datatypes}', NULL, NULL,
  '${f_stage_only_failed_rows}', '${f_check_na_row_existence}',
  NULL, NULL
);
```

**Compare tables:**

```sql
INSERT INTO rep_mda.mda_dq_compare_tables (
  dq_rle_id, dq_tbe_id, dq_tbe_id_referential, keys_json, mapping_json,
  ignore_columns_csv, active_columns_csv,
  f_compare_data, f_compare_counts, f_compare_schema,
  severity, is_active, rule_classification, rule_owner, key_dq_cmp
) VALUES (
  2, ${table1_id}, ${table2_id}, NULL, NULL, NULL, NULL,
  '${f_compare_data}', '${f_compare_counts}', '${f_compare_schema}',
  ${severity}, 1, '${rule_classification}', '${rule_owner}',
  'DQ#COMPARE#${table1}#${table2}'  -- uppercased, dots → _
);
```

**Referential integrity** and **custom rules** generators produce similar INSERTs into `mda_dq_referential_integrities` and `mda_dq_custom_rules` (see page source).

## Business Logic

- Default compare options: counts=Y, data/schema=N, severity=3.
- Compare uses DQ table IDs from `mda_dq_tables`, not DLE IDs directly (after registration).
- `dq_rle_id` hardcoded to `2` for compare rules.
- Multi-table DQ registration produces one INSERT per selected DLE table.

## API / Storage

- **executeQuery** — dev/prod for reads; optional execute from popup

## Related Files

- `src/pages/AddDQRulesPage.js`
- `src/styles/pages/AddDQRulesPage.css`

## Edge Cases

- Compare/ref sections require tables already in `mda_dq_tables`.
- Duplicate DQ registrations may violate unique constraints.
- Filter/options use string interpolation — quote carefully in custom filters.
- Referential generator requires `foreign_key_name` filled.
