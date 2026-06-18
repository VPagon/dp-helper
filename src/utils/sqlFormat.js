import { format } from 'sql-formatter';

/** Default formatter options for dp-helper (Microsoft SQL Server). */
export const SQL_FORMAT_OPTIONS = {
    language: 'transactsql',
    keywordCase: 'upper',
};

const FRIENDLY_PARSE_ERROR =
    'Could not format SQL. This tool uses Microsoft SQL Server (T-SQL) syntax — '
    + 'bracketed identifiers like [schema] are supported. Check for typos or unsupported syntax.';

const STATEMENT_START_PATTERN =
    /\n(?=\s*(?:select|insert|update|delete|merge|with|create|alter|drop|exec|declare|truncate|set|use|go)\b)/i;

function friendlyFormatError(err) {
    const message = err?.message || '';
    if (message.includes('Parse error') || message.includes('Unexpected')) {
        return FRIENDLY_PARSE_ERROR;
    }
    return message || FRIENDLY_PARSE_ERROR;
}

function formatOneStatement(sql) {
    return format(sql.trim(), SQL_FORMAT_OPTIONS);
}

function splitSqlStatements(code) {
    const trimmed = code.trim();
    if (!trimmed) {
        return { statements: [], usesSemicolons: false };
    }

    if (trimmed.includes(';')) {
        const statements = trimmed
            .split(';')
            .map((segment) => segment.trim())
            .filter(Boolean);
        return {
            statements: statements.length ? statements : [trimmed],
            usesSemicolons: true,
        };
    }

    const statements = trimmed
        .split(STATEMENT_START_PATTERN)
        .map((segment) => segment.trim())
        .filter(Boolean);

    return {
        statements: statements.length ? statements : [trimmed],
        usesSemicolons: false,
    };
}

/**
 * Format SQL for display/editing. Uses T-SQL dialect (bracketed identifiers, etc.).
 * @returns {{ formatted: string | null, error: string | null }}
 */
export function formatSql(code) {
    const trimmed = (code ?? '').trim();
    if (!trimmed) {
        return { formatted: code ?? '', error: null };
    }

    try {
        return { formatted: format(trimmed, SQL_FORMAT_OPTIONS), error: null };
    } catch (firstErr) {
        const { statements, usesSemicolons } = splitSqlStatements(trimmed);
        if (statements.length <= 1) {
            return { formatted: null, error: friendlyFormatError(firstErr) };
        }

        try {
            const formattedParts = statements.map(formatOneStatement);
            const separator = usesSemicolons ? ';\n\n' : '\n\n';
            let formatted = formattedParts.join(separator);
            if (usesSemicolons && trimmed.endsWith(';')) {
                formatted += ';';
            }
            return { formatted, error: null };
        } catch (err) {
            return { formatted: null, error: friendlyFormatError(err) };
        }
    }
}
