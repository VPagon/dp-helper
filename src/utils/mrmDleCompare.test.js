import {
    COLUMN_COMPARE_FIELDS,
    compareColumns,
    compareEntitySets,
    executionStatusBadgeClass,
    flattenEntityDiffs,
    parseMrmExecutionStatus,
    TABLE_COMPARE_FIELDS,
} from './mrmDleCompare';

describe('mrmDleCompare', () => {
    describe('compareEntitySets', () => {
        it('treats key_dle_tbe case differences as match', () => {
            const result = compareEntitySets({
                mrmRows: [
                    {
                        table_name: 'd_as_built_serial_end_item_components',
                        key_dle_tbe: 'ODS#d_as_built_serial_end_item_components',
                    },
                ],
                dleRows: [
                    {
                        table_name: 'D_AS_BUILT_SERIAL_END_ITEM_COMPONENTS',
                        key_dle_tbe: 'ODS#D_AS_BUILT_SERIAL_END_ITEM_COMPONENTS',
                    },
                ],
                keyField: 'table_name',
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
    });

    describe('compareColumns', () => {
        const dleTableById = new Map([
            [42, 'd_as_built_serial_end_item_components'],
        ]);

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
                dleTableById
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
                label: 'd_as_built_serial_end_item_components · key_asb_itm_rel',
            });
        });

        it('matches MRM dle_tbe_id table name string with DLE resolved table name', () => {
            const result = compareColumns(
                [
                    {
                        dle_tbe_id: 'd_as_built_serial_end_item_components',
                        column_name: 'existing_col',
                        mapping: 'a',
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
                dleTableById
            );

            expect(result.summary.onlyMrm).toBe(0);
            expect(result.summary.onlyDle).toBe(0);
            expect(result.summary.matched).toBe(1);
        });

        it('does not compare position between MRM and DLE', () => {
            expect(COLUMN_COMPARE_FIELDS).not.toContain('position');

            const result = compareColumns(
                [
                    {
                        dle_tbe_id: 'd_as_built_serial_end_item_components',
                        column_name: 'existing_col',
                        mapping: 'a',
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
                dleTableById
            );

            expect(result.summary.matched).toBe(1);
            expect(result.entities[0].entityStatus).toBe('match');
            expect(result.entities[0].fields.some((f) => f.field === 'position')).toBe(false);
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
