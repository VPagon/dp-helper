import { formatSql, SQL_FORMAT_OPTIONS } from './sqlFormat';

describe('formatSql', () => {
    it('exports transactsql as default dialect with upper keywords', () => {
        expect(SQL_FORMAT_OPTIONS).toEqual({
            language: 'transactsql',
            keywordCase: 'upper',
        });
    });

    it('formats bracketed MSSQL identifiers', () => {
        const input = "select * from [020_silver].dbo.s_ln_dbo_dim_item_groups where dl_unified_key = 'N/A'";
        const { formatted, error } = formatSql(input);
        expect(error).toBeNull();
        expect(formatted).toContain('[020_silver]');
        expect(formatted).toMatch(/^SELECT/m);
    });

    it('formats multiple newline-separated SELECT statements', () => {
        const input = `select * from [020_silver].dbo.s_ln_dbo_dim_item_groups where dl_unified_key = 'N/A'
select * from [020_silver].dbo.s_ln_dbo_item_groups where dl_unified_key = 'N/A'`;
        const { formatted, error } = formatSql(input);
        expect(error).toBeNull();
        expect(formatted).toContain('[020_silver].dbo.s_ln_dbo_dim_item_groups');
        expect(formatted).toContain('[020_silver].dbo.s_ln_dbo_item_groups');
        expect(formatted).toMatch(/SELECT[\s\S]*SELECT/);
    });

    it('returns a friendly message on parse failure', () => {
        const { formatted, error } = formatSql('select [unclosed');
        expect(formatted).toBeNull();
        expect(error).toContain('Microsoft SQL Server');
        expect(error).toContain('[schema]');
    });
});
