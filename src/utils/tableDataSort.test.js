import { booleanSortValue, sortTableRows } from './tableDataSort';

describe('tableDataSort', () => {
    describe('booleanSortValue', () => {
        it('maps boolean and string forms to 0/1', () => {
            expect(booleanSortValue(true)).toBe(1);
            expect(booleanSortValue(false)).toBe(0);
            expect(booleanSortValue('true')).toBe(1);
            expect(booleanSortValue('0')).toBe(0);
        });
    });

    describe('sortTableRows', () => {
        const rows = [
            ['b', 10, null],
            ['a', 2, 1],
            ['c', null, 0],
        ];

        it('sorts strings ascending with nulls last', () => {
            const sorted = sortTableRows(rows, 0, 'asc');
            expect(sorted.map((r) => r[0])).toEqual(['a', 'b', 'c']);
        });

        it('sorts numbers descending with nulls last', () => {
            const sorted = sortTableRows(rows, 1, 'desc');
            expect(sorted.map((r) => r[1])).toEqual([10, 2, null]);
        });

        it('sorts bit column as 0/1 with nulls last', () => {
            const bitRows = [[1], [0], [null], ['true']];
            const sorted = sortTableRows(bitRows, 0, 'asc', () => 'bit', 'flag');
            expect(sorted[0][0]).toBe(0);
            expect(sorted[sorted.length - 1][0]).toBe(null);
        });
    });
});
