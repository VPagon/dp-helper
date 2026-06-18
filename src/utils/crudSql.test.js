import {
    formatCrudDisplayValue,
    formatCrudSqlValue,
    isSqlNullInput,
} from './crudSql';

describe('crudSql', () => {
    describe('isSqlNullInput', () => {
        it('treats null, empty, and NULL string as SQL null', () => {
            expect(isSqlNullInput(null)).toBe(true);
            expect(isSqlNullInput(undefined)).toBe(true);
            expect(isSqlNullInput('')).toBe(true);
            expect(isSqlNullInput('   ')).toBe(true);
            expect(isSqlNullInput('NULL')).toBe(true);
            expect(isSqlNullInput('null')).toBe(true);
        });

        it('does not treat other strings as null', () => {
            expect(isSqlNullInput('hello')).toBe(false);
            expect(isSqlNullInput('0')).toBe(false);
        });
    });

    describe('formatCrudSqlValue', () => {
        it('emits unquoted NULL for null inputs', () => {
            expect(formatCrudSqlValue('NULL')).toBe('NULL');
            expect(formatCrudSqlValue('')).toBe('NULL');
        });

        it('does not quote NULL as a string literal', () => {
            expect(formatCrudSqlValue('NULL')).not.toBe("'NULL'");
        });

        it('formats bit/boolean as numeric literals', () => {
            expect(formatCrudSqlValue('1', 'bit')).toBe('1');
            expect(formatCrudSqlValue('true', 'boolean')).toBe('1');
            expect(formatCrudSqlValue('0', 'bit')).toBe('0');
        });
    });

    describe('formatCrudDisplayValue', () => {
        it('shows booleans as 0/1', () => {
            expect(formatCrudDisplayValue(true, 'bit')).toBe(1);
            expect(formatCrudDisplayValue(false, 'boolean')).toBe(0);
            expect(formatCrudDisplayValue('True', 'bit')).toBe(1);
        });

        it('leaves non-boolean values unchanged', () => {
            expect(formatCrudDisplayValue('abc', 'varchar')).toBe('abc');
        });
    });
});
