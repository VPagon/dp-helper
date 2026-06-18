import { buildMetadataDiffSql, parseDiffColumns } from './metadataDiffSql';

describe('parseDiffColumns', () => {
    it('splits on semicolon and trims whitespace', () => {
        expect(parseDiffColumns('filter;transformation_script')).toEqual([
            'filter',
            'transformation_script',
        ]);
        expect(parseDiffColumns(' filter ; transformation_script ')).toEqual([
            'filter',
            'transformation_script',
        ]);
    });

    it('splits on comma as alternate delimiter', () => {
        expect(parseDiffColumns('filter,transformation_script')).toEqual([
            'filter',
            'transformation_script',
        ]);
    });

    it('returns single column when no delimiter', () => {
        expect(parseDiffColumns('mapping')).toEqual(['mapping']);
    });
});

describe('buildMetadataDiffSql', () => {
    const baseUpdateRecord = {
        object: 'mda_dle_columns',
        diff: 'mapping',
        object_key: 'GOLD#F_PRODUCTION_ORDER_HOURS#entry_date',
        status: 'Difference in data',
    };

    it('serializes array of objects for UPDATE SET (not [object Object])', () => {
        const mappingValue = [
            { source: 'col_a', target: 'col_b' },
            { source: 'col_c', target: 'col_d' },
        ];
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff_json: JSON.stringify({ mapping: mappingValue }),
            },
            'dev'
        );

        expect(sql).toContain(
            "SET mapping = '[{\"source\":\"col_a\",\"target\":\"col_b\"},{\"source\":\"col_c\",\"target\":\"col_d\"}]'"
        );
        expect(sql).not.toContain('[object Object]');
    });

    it('serializes nested objects for UPDATE SET', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff: 'config',
                diff_json: JSON.stringify({
                    config: { nested: { flag: true, count: 2 } },
                }),
            },
            'dev'
        );

        expect(sql).toContain(
            "SET config = '{\"nested\":{\"flag\":true,\"count\":2}}'"
        );
    });

    it('extracts scalar from prod entry when updating DEV from env array', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                object_key: 'GOLD#F_PRODUCTION_ORDER_HOURS#key_day',
                diff_json: JSON.stringify([
                    {
                        env: 'dev',
                        id: 13302,
                        column_name: 'GOLD#F_PRODUCTION_ORDER_HOURS#key_day',
                        mapping: null,
                    },
                    {
                        env: 'prod',
                        id: 28891,
                        column_name: 'GOLD#F_PRODUCTION_ORDER_HOURS#key_day',
                        mapping: 'registration_start_date',
                    },
                ]),
            },
            'dev'
        );

        expect(sql).toContain('-- Target environment: DEV');
        expect(sql).toContain("SET mapping = 'registration_start_date'");
        expect(sql).toContain('WHERE id = 13302;');
        expect(sql).not.toContain('WHERE column_name =');
        expect(sql).not.toContain('[{"env"');
    });

    it('generates single UPDATE with multiple SET columns from semicolon diff', () => {
        const sql = buildMetadataDiffSql(
            {
                object: 'mda_dle_columns',
                diff: 'filter;transformation_script',
                object_key: 'GOLD#MY_TABLE#my_col',
                status: 'Difference in data',
                diff_json: JSON.stringify([
                    {
                        env: 'dev',
                        id: 5001,
                        column_name: 'GOLD#MY_TABLE#my_col',
                        filter: 'dev_filter_expr',
                        transformation_script: 'dev_transform',
                    },
                    {
                        env: 'prod',
                        id: 6002,
                        column_name: 'GOLD#MY_TABLE#my_col',
                        filter: 'prod_filter_expr',
                        transformation_script: 'prod_transform',
                    },
                ]),
            },
            'dev'
        );

        expect(sql).toBe(
            '-- Target environment: DEV\n' +
            'UPDATE rep_mda.mda_dle_columns\n' +
            "SET filter = 'prod_filter_expr', transformation_script = 'prod_transform'\n" +
            'WHERE id = 5001;'
        );
    });

    it('uses WHERE id = 13302 for mda_dle_columns Update DEV (prod mapping source)', () => {
        const sql = buildMetadataDiffSql(
            {
                object: 'mda_dle_columns',
                diff: 'mapping',
                object_key: 'GOLD#F_PRODUCTION_ORDER_HOURS#key_day',
                status: 'Difference in data',
                diff_json: JSON.stringify([
                    {
                        env: 'dev',
                        id: 13302,
                        column_name: 'GOLD#F_PRODUCTION_ORDER_HOURS#key_day',
                        mapping: null,
                    },
                    {
                        env: 'prod',
                        id: 28891,
                        column_name: 'GOLD#F_PRODUCTION_ORDER_HOURS#key_day',
                        mapping: 'registration_start_date',
                    },
                ]),
            },
            'dev'
        );

        expect(sql).toBe(
            '-- Target environment: DEV\n' +
            'UPDATE rep_mda.mda_dle_columns\n' +
            "SET mapping = 'registration_start_date'\n" +
            'WHERE id = 13302;'
        );
    });

    it('extracts scalar from dev entry when updating PROD from env array', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff_json: JSON.stringify([
                    { env: 'dev', id: 1001, mapping: 'dev_mapping_value' },
                    { env: 'prod', id: 2002, mapping: null },
                ]),
            },
            'prod'
        );

        expect(sql).toContain('-- Target environment: PROD');
        expect(sql).toContain("SET mapping = 'dev_mapping_value'");
        expect(sql).toContain('WHERE id = 2002;');
        expect(sql).not.toContain('WHERE column_name =');
    });

    it('sets NULL when source env column value is null', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff_json: JSON.stringify([
                    { env: 'dev', id: 42, mapping: 'keep_dev' },
                    { env: 'prod', id: 99, mapping: null },
                ]),
            },
            'dev'
        );

        expect(sql).toContain('SET mapping = NULL');
        expect(sql).toContain('WHERE id = 42;');
        expect(sql).not.toContain('WHERE column_name =');
    });

    it('uses WHERE id without object_key when target env entry has id', () => {
        const sql = buildMetadataDiffSql(
            {
                object: 'mda_dle_columns',
                diff: 'mapping',
                object_key: '',
                status: 'Difference in data',
                diff_json: JSON.stringify([
                    { env: 'dev', id: 13302, mapping: null },
                    { env: 'prod', id: 28891, mapping: 'registration_start_date' },
                ]),
            },
            'dev'
        );

        expect(sql).toContain('WHERE id = 13302;');
    });

    it('falls back to object_key WHERE when target env entry has no id', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff_json: JSON.stringify([
                    { env: 'dev', mapping: 'dev_val' },
                    { env: 'prod', mapping: 'prod_val' },
                ]),
            },
            'dev'
        );

        expect(sql).toContain("WHERE column_name = 'GOLD#F_PRODUCTION_ORDER_HOURS#entry_date';");
        expect(sql).not.toContain('WHERE id =');
    });

    it('throws when target entry has no id and object_key is missing', () => {
        expect(() => buildMetadataDiffSql(
            {
                object: 'mda_dle_columns',
                diff: 'mapping',
                object_key: '',
                status: 'Difference in data',
                diff_json: JSON.stringify([
                    { env: 'dev', mapping: 'a' },
                    { env: 'prod', mapping: 'b' },
                ]),
            },
            'dev'
        )).toThrow(/no id and object_key is missing/);
    });

    it('throws when source env entry is missing from env array', () => {
        expect(() => buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff_json: JSON.stringify([
                    { env: 'dev', mapping: 'only_dev' },
                ]),
            },
            'dev'
        )).toThrow(/Could not find "prod" entry/);
    });

    it('resolves source env value when diff_json uses environment keys', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff_json: JSON.stringify({
                    dev: [{ id: 1 }],
                    prod: [{ id: 1 }, { id: 2 }],
                }),
            },
            'dev'
        );

        expect(sql).toContain("SET mapping = '[{\"id\":1},{\"id\":2}]'");
    });

    it('escapes single quotes inside JSON string values', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff_json: JSON.stringify({
                    mapping: [{ note: "it's fine" }],
                }),
            },
            'dev'
        );

        expect(sql).toContain("it''s fine");
        expect(sql).not.toContain("[object Object]");
    });

    it('formats primitives for UPDATE SET', () => {
        const sql = buildMetadataDiffSql(
            {
                ...baseUpdateRecord,
                diff: 'active',
                diff_json: JSON.stringify({ active: true }),
            },
            'dev'
        );

        expect(sql).toContain('SET active = 1');
    });

    it('generates INSERT with object/array columns as JSON literals', () => {
        const sql = buildMetadataDiffSql(
            {
                object: 'mda_dle_columns',
                status: 'Missing on dev',
                diff_json: JSON.stringify({
                    column_name: 'my_col',
                    mapping: [{ a: 1 }],
                    active: 'Y',
                }),
            },
            'dev'
        );

        expect(sql).toContain('INSERT INTO rep_mda.mda_dle_columns');
        expect(sql).toContain("'my_col'");
        expect(sql).toContain("'[{\"a\":1}]'");
        expect(sql).toContain("'Y'");
        expect(sql).not.toContain('[object Object]');
    });

    it('generates INSERT with scalar values unchanged', () => {
        const sql = buildMetadataDiffSql(
            {
                object: 'mda_dle_tables',
                status: 'Missing on dev',
                diff_json: JSON.stringify({
                    key_dle_tbe: 'TABLE#1',
                    row_count: 42,
                    enabled: false,
                }),
            },
            'dev'
        );

        expect(sql).toContain('INSERT INTO rep_mda.mda_dle_tables');
        expect(sql).toContain("'TABLE#1'");
        expect(sql).toContain('42');
        expect(sql).toContain('0');
    });
});
