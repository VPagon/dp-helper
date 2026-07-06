import {
    buildEntityKey,
    COLUMN_COMPARE_FIELDS,
    compareColumns,
    compareEntitySets,
    compareJobs,
    executionStatusBadgeClass,
    EXCLUDED_COLUMN_ZONES,
    flattenEntityDiffs,
    isExcludedColumnZone,
    parseMrmExecutionStatus,
    TABLE_COMPARE_FIELDS,
    TABLE_KEY_FIELDS,
} from './mrmDleCompare';

const GOLD_SILVER_TABLE = 'shared_table_name';
const DEFAULT_SCHEMA = 'dbo';

describe('mrmDleCompare', () => {
    describe('compareEntitySets', () => {
        it('treats key_dle_tbe case differences as match', () => {
            const result = compareEntitySets({
                mrmRows: [
                    {
                        zone_name: 'ODS',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: 'd_as_built_serial_end_item_components',
                        key_dle_tbe: 'ODS#d_as_built_serial_end_item_components',
                    },
                ],
                dleRows: [
                    {
                        zone_name: 'ODS',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: 'D_AS_BUILT_SERIAL_END_ITEM_COMPONENTS',
                        key_dle_tbe: 'ODS#D_AS_BUILT_SERIAL_END_ITEM_COMPONENTS',
                    },
                ],
                keyFields: TABLE_KEY_FIELDS,
                compareFields: TABLE_COMPARE_FIELDS,
            });

            expect(result.summary).toEqual({
                matched: 1,
                differ: 0,
                onlyMrm: 0,
                onlyDle: 0,
            });
            const keyDleTbe = result.entities[0].fields.find((f) => f.field === 'key_dle_tbe');
            expect(keyDleTbe.status).toBe('match');
            expect(result.entities[0].entityStatus).toBe('match');
        });

        it('matches tables with the same name in different zones separately', () => {
            const result = compareEntitySets({
                mrmRows: [
                    {
                        zone_name: 'GOLD',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: GOLD_SILVER_TABLE,
                        directory: '/gold/path',
                    },
                    {
                        zone_name: 'SILVER',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: GOLD_SILVER_TABLE,
                        directory: '/silver/path',
                    },
                ],
                dleRows: [
                    {
                        zone_name: 'GOLD',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: GOLD_SILVER_TABLE,
                        directory: '/gold/path',
                    },
                    {
                        zone_name: 'SILVER',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: GOLD_SILVER_TABLE,
                        directory: '/silver/path',
                    },
                ],
                keyFields: TABLE_KEY_FIELDS,
                compareFields: TABLE_COMPARE_FIELDS,
            });

            expect(result.summary).toEqual({
                matched: 2,
                differ: 0,
                onlyMrm: 0,
                onlyDle: 0,
            });
            expect(result.entities).toHaveLength(2);
        });

        it('does not pair MRM and DLE rows across zones', () => {
            const result = compareEntitySets({
                mrmRows: [
                    {
                        zone_name: 'GOLD',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: GOLD_SILVER_TABLE,
                        directory: '/gold/path',
                    },
                ],
                dleRows: [
                    {
                        zone_name: 'SILVER',
                        schema_name: DEFAULT_SCHEMA,
                        table_name: GOLD_SILVER_TABLE,
                        directory: '/silver/path',
                    },
                ],
                keyFields: TABLE_KEY_FIELDS,
                compareFields: TABLE_COMPARE_FIELDS,
            });

            expect(result.summary).toEqual({
                matched: 0,
                differ: 0,
                onlyMrm: 1,
                onlyDle: 1,
            });
        });

        it('does not pair tables with different schema_name', () => {
            const result = compareEntitySets({
                mrmRows: [
                    {
                        zone_name: 'GOLD',
                        schema_name: 'schema_a',
                        table_name: 'my_table',
                    },
                ],
                dleRows: [
                    {
                        zone_name: 'GOLD',
                        schema_name: 'schema_b',
                        table_name: 'my_table',
                    },
                ],
                keyFields: TABLE_KEY_FIELDS,
                compareFields: TABLE_COMPARE_FIELDS,
            });

            expect(result.summary).toEqual({
                matched: 0,
                differ: 0,
                onlyMrm: 1,
                onlyDle: 1,
            });
        });
    });

    describe('buildEntityKey', () => {
        it('builds a normalized composite key', () => {
            expect(
                buildEntityKey(
                    { zone_name: 'GOLD', schema_name: 'dbo', table_name: 'My_Table' },
                    TABLE_KEY_FIELDS
                )
            ).toBe('gold|dbo|my_table');
        });
    });

    describe('isExcludedColumnZone', () => {
        it('flags ODS and SLR_STG as excluded', () => {
            expect(isExcludedColumnZone('ODS')).toBe(true);
            expect(isExcludedColumnZone('slr_stg')).toBe(true);
            expect(isExcludedColumnZone('GOLD')).toBe(false);
        });

        it('exports the excluded zone list', () => {
            expect(EXCLUDED_COLUMN_ZONES).toEqual(['ODS', 'SLR_STG']);
        });
    });

    describe('compareColumns', () => {
        const goldTable = {
            id: 42,
            zone_name: 'GOLD',
            table_name: 'd_as_built_serial_end_item_components',
        };
        const dleTableById = new Map([[42, goldTable]]);
        const dleTableByName = new Map([
            [goldTable.table_name, goldTable],
        ]);
        const mrmTables = [
            {
                zone_name: 'GOLD',
                table_name: 'd_as_built_serial_end_item_components',
                is_active: 1,
            },
        ];

        it('excludes ODS zone columns from comparison', () => {
            const odsTable = {
                id: 99,
                zone_name: 'ODS',
                table_name: 'ods_table',
            };
            const result = compareColumns(
                [],
                [
                    {
                        dle_tbe_id: 99,
                        column_name: 'key_asb_itm_rel',
                        mapping: 'x',
                    },
                ],
                new Map([[99, odsTable]]),
                [{ zone_name: 'ODS', table_name: 'ods_table', is_active: 1 }],
                new Map([['ods_table', odsTable]])
            );

            expect(result.summary).toEqual({
                matched: 0,
                differ: 0,
                onlyMrm: 0,
                onlyDle: 0,
            });
            expect(result.entities).toHaveLength(0);
        });

        it('marks a column present only in DLE as only_dle', () => {
            const result = compareColumns(
                [],
                [
                    {
                        dle_tbe_id: 42,
                        column_name: 'key_asb_itm_rel',
                        mapping: 'x',
                        position: 1,
                    },
                ],
                dleTableById,
                mrmTables,
                dleTableByName
            );

            expect(result.summary).toEqual({
                matched: 0,
                differ: 0,
                onlyMrm: 0,
                onlyDle: 1,
            });
            expect(result.entities).toHaveLength(1);
            expect(result.entities[0]).toMatchObject({
                entityStatus: 'only_dle',
                label: 'gold / d_as_built_serial_end_item_components · key_asb_itm_rel',
            });
        });

        it('matches MRM dle_tbe_id table name string with DLE resolved table name', () => {
            const result = compareColumns(
                [
                    {
                        dle_tbe_id: 'd_as_built_serial_end_item_components',
                        column_name: 'existing_col',
                        mapping: 'a',
                        is_active: 1,
                        position: 1,
                    },
                ],
                [
                    {
                        dle_tbe_id: 42,
                        column_name: 'existing_col',
                        mapping: 'a',
                        position: 1,
                    },
                ],
                dleTableById,
                mrmTables,
                dleTableByName
            );

            expect(result.summary.onlyMrm).toBe(0);
            expect(result.summary.onlyDle).toBe(0);
            expect(result.summary.matched).toBe(1);
            const tableRef = result.entities[0].fields.find((f) => f.field === 'dle_tbe_id');
            expect(tableRef.status).toBe('match');
        });

        it('compares mapping only (not position or other metadata)', () => {
            expect(COLUMN_COMPARE_FIELDS).toEqual(['mapping']);

            const result = compareColumns(
                [
                    {
                        dle_tbe_id: 'd_as_built_serial_end_item_components',
                        column_name: 'existing_col',
                        mapping: 'a',
                        is_active: 1,
                        position: 1,
                    },
                ],
                [
                    {
                        dle_tbe_id: 42,
                        column_name: 'existing_col',
                        mapping: 'a',
                        position: 99,
                    },
                ],
                dleTableById,
                mrmTables,
                dleTableByName
            );

            expect(result.summary.matched).toBe(1);
            expect(result.entities[0].entityStatus).toBe('match');
            expect(result.entities[0].fields.some((f) => f.field === 'position')).toBe(false);
        });

        it('keeps columns with the same name in different zones separate', () => {
            const multiZoneDleTableById = new Map([
                [1, { id: 1, zone_name: 'GOLD', table_name: GOLD_SILVER_TABLE }],
                [2, { id: 2, zone_name: 'SILVER', table_name: GOLD_SILVER_TABLE }],
            ]);
            const multiZoneMrmTables = [
                { zone_name: 'GOLD', table_name: GOLD_SILVER_TABLE, is_active: 1 },
                { zone_name: 'SILVER', table_name: GOLD_SILVER_TABLE, is_active: 1 },
            ];

            const result = compareColumns(
                [
                    {
                        zone_name: 'GOLD',
                        table_name: GOLD_SILVER_TABLE,
                        column_name: 'shared_col',
                        mapping: 'gold_mapping',
                        is_active: 1,
                    },
                    {
                        zone_name: 'SILVER',
                        table_name: GOLD_SILVER_TABLE,
                        column_name: 'shared_col',
                        mapping: 'silver_mapping',
                        is_active: 1,
                    },
                ],
                [
                    {
                        dle_tbe_id: 1,
                        column_name: 'shared_col',
                        mapping: 'gold_mapping',
                    },
                    {
                        dle_tbe_id: 2,
                        column_name: 'shared_col',
                        mapping: 'silver_mapping',
                    },
                ],
                multiZoneDleTableById,
                multiZoneMrmTables,
                new Map([[GOLD_SILVER_TABLE, multiZoneDleTableById.get(1)]])
            );

            expect(result.summary).toEqual({
                matched: 2,
                differ: 0,
                onlyMrm: 0,
                onlyDle: 0,
            });
        });

        it('treats inactive MRM columns as absent while still surfacing DLE-only rows', () => {
            const result = compareColumns(
                [
                    {
                        dle_tbe_id: 'd_as_built_serial_end_item_components',
                        column_name: 'inactive_col',
                        mapping: 'a',
                        is_active: 0,
                    },
                ],
                [
                    {
                        dle_tbe_id: 42,
                        column_name: 'inactive_col',
                        mapping: 'a',
                    },
                ],
                dleTableById,
                mrmTables,
                dleTableByName
            );

            expect(result.summary.onlyDle).toBe(1);
            expect(result.entities[0].entityStatus).toBe('only_dle');
        });
    });

    describe('compareJobs', () => {
        const dleTableById = new Map([
            [10, { id: 10, zone_name: 'GOLD', table_name: 'src_table' }],
            [20, { id: 20, zone_name: 'GOLD', table_name: 'tgt_table' }],
        ]);
        const dleTableByName = new Map([
            ['src_table', dleTableById.get(10)],
            ['tgt_table', dleTableById.get(20)],
        ]);

        it('resolves DLE numeric src/tgt ids to table names for MRM string refs', () => {
            const result = compareJobs(
                [
                    {
                        job_name: 'load_job',
                        src_dle_tbe_id: 'src_table',
                        tgt_dle_tbe_id: 'tgt_table',
                        job_type: 'FULL',
                        filter: '',
                        transformation_script: '',
                        load_type: 'INCREMENTAL',
                    },
                ],
                [
                    {
                        job_name: 'load_job',
                        src_dle_tbe_id: 10,
                        tgt_dle_tbe_id: 20,
                        job_type: 'FULL',
                        filter: '',
                        transformation_script: '',
                        load_type: 'INCREMENTAL',
                    },
                ],
                dleTableById,
                dleTableByName
            );

            expect(result.summary.matched).toBe(1);
            const srcRef = result.entities[0].fields.find((f) => f.field === 'src_dle_tbe_id');
            const tgtRef = result.entities[0].fields.find((f) => f.field === 'tgt_dle_tbe_id');
            expect(srcRef.status).toBe('match');
            expect(tgtRef.status).toBe('match');
        });
    });

    describe('parseMrmExecutionStatus', () => {
        it('returns No execution log when records are empty', () => {
            expect(parseMrmExecutionStatus([])).toEqual({
                status: null,
                label: 'No execution log',
            });
        });

        it('parses execution_status from the first row', () => {
            expect(
                parseMrmExecutionStatus([{ execution_status: 'Deployed' }])
            ).toEqual({
                status: 'Deployed',
                label: 'Deployed',
            });
        });

        it('returns Unknown when status value is empty', () => {
            expect(parseMrmExecutionStatus([{ execution_status: '' }])).toEqual({
                status: null,
                label: 'Unknown',
            });
        });
    });

    describe('executionStatusBadgeClass', () => {
        it('maps known statuses to badge classes', () => {
            expect(executionStatusBadgeClass('Deployed')).toBe('mdc-exec--deployed');
            expect(executionStatusBadgeClass('Ready')).toBe('mdc-exec--ready');
            expect(executionStatusBadgeClass('Staged')).toBe('mdc-exec--staged');
            expect(executionStatusBadgeClass('Failed')).toBe('mdc-exec--failed');
        });

        it('maps unknown statuses to neutral class', () => {
            expect(executionStatusBadgeClass(null)).toBe('mdc-exec--unknown');
            expect(executionStatusBadgeClass('Pending')).toBe('mdc-exec--unknown');
        });
    });

    describe('flattenEntityDiffs', () => {
        it('maps only_dle entity status to only_dle (not inverted missing_mrm)', () => {
            const rows = flattenEntityDiffs([
                {
                    label: 'd_as_built_serial_end_item_components · key_asb_itm_rel',
                    entityStatus: 'only_dle',
                },
            ]);

            expect(rows).toHaveLength(1);
            expect(rows[0]).toEqual({
                entity: 'd_as_built_serial_end_item_components · key_asb_itm_rel',
                field: '—',
                mrmValue: '—',
                dleValue: '(row present)',
                status: 'only_dle',
            });
        });

        it('maps only_mrm entity status to only_mrm', () => {
            const rows = flattenEntityDiffs([
                {
                    label: 'some_table · some_col',
                    entityStatus: 'only_mrm',
                },
            ]);

            expect(rows[0].status).toBe('only_mrm');
            expect(rows[0].mrmValue).toBe('(row present)');
            expect(rows[0].dleValue).toBe('—');
        });
    });
});
