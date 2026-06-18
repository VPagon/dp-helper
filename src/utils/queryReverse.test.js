import {
    buildCrudDeleteMetadata,
    buildCrudUpdateMetadata,
    buildReverseSql,
    detectSqlOperation,
} from './queryReverse';

describe('queryReverse', () => {
    describe('detectSqlOperation', () => {
        it('detects DML operation from SQL', () => {
            expect(detectSqlOperation('INSERT INTO t (a) VALUES (1)')).toBe('INSERT');
            expect(detectSqlOperation('UPDATE t SET a = 1')).toBe('UPDATE');
            expect(detectSqlOperation('DELETE FROM t WHERE id = 1')).toBe('DELETE');
            expect(detectSqlOperation('SELECT 1')).toBe('SELECT');
        });
    });

    describe('buildReverseSql', () => {
        it('returns stored reverseSql when present', () => {
            const result = buildReverseSql({
                sql: 'UPDATE t SET a = 2',
                reverseSql: 'UPDATE t SET a = 1',
            });
            expect(result.sql).toBe('UPDATE t SET a = 1');
            expect(result.error).toBeNull();
        });

        it('builds UPDATE revert from before metadata', () => {
            const result = buildReverseSql({
                sql: 'UPDATE rep_mda.foo SET name = \'new\' WHERE id = 1',
                metadata: {
                    operation: 'UPDATE',
                    tableName: 'foo',
                    primaryKey: { column: 'id', value: 1 },
                    before: { name: 'old' },
                },
            });
            expect(result.error).toBeNull();
            expect(result.sql).toContain('name = \'old\'');
            expect(result.sql).toContain('WHERE id = 1');
        });

        it('builds DELETE revert as INSERT from beforeRow', () => {
            const result = buildReverseSql({
                sql: 'DELETE FROM rep_mda.foo WHERE id = 1',
                metadata: buildCrudDeleteMetadata({
                    tableName: 'foo',
                    columns: ['id', 'name'],
                    columnTypes: {},
                    row: [1, 'alice'],
                }),
            });
            expect(result.error).toBeNull();
            expect(result.sql).toMatch(/^INSERT INTO/);
            expect(result.sql).toContain('alice');
        });

        it('reports unavailable when metadata missing', () => {
            const result = buildReverseSql({ sql: 'UPDATE t SET a = 1' });
            expect(result.sql).toBeNull();
            expect(result.error).toContain('before state not captured');
        });
    });

    describe('buildCrudUpdateMetadata', () => {
        it('captures before and after for changed columns', () => {
            const meta = buildCrudUpdateMetadata({
                tableName: 't',
                columns: ['id', 'name'],
                columnTypes: {},
                selectedRow: [1, 'old'],
                editData: { id: 1, name: 'new' },
                primaryKeyColumn: 'id',
            });
            expect(meta.before).toEqual({ name: 'old' });
            expect(meta.after).toEqual({ name: 'new' });
        });
    });
});
