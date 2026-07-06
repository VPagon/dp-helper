#!/usr/bin/env node
// Read-only MCP server exposing a subset of the Azure SQL environments already
// configured in server/dbConfig.js, so an MCP client (e.g. Claude Code) can
// inspect schema and run SELECT queries without going through the Express API.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const sql = require('mssql');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { CONNECTION_CONFIGS, dbConfig } = require('../server/dbConfig');

// Only these environments are reachable through this MCP server, regardless of
// how many are defined in server/dbConfig.js. Edit this list to change scope.
const ALLOWED_ENVIRONMENTS = ['dev', 'prod', 'deploy'];

// Blocks obviously destructive statements. This is a safety net against
// accidental writes, not a hard security boundary against a malicious query.
const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|MERGE|CREATE|GRANT|REVOKE|DENY|EXEC|EXECUTE)\b/i;

function assertAllowedEnvironment(environment) {
	if (!ALLOWED_ENVIRONMENTS.includes(environment)) {
		throw new Error(`Environment '${environment}' is not exposed by this MCP server. Allowed: ${ALLOWED_ENVIRONMENTS.join(', ')}`);
	}
}

function assertReadOnly(query) {
	if (WRITE_KEYWORDS.test(query)) {
		throw new Error('Only read-only (SELECT) queries are allowed through this MCP server.');
	}
}

const poolCache = new Map();

async function getPool(environment) {
	if (!poolCache.has(environment)) {
		const config = dbConfig(environment);
		const pool = new sql.ConnectionPool(config);
		poolCache.set(environment, pool.connect().catch(err => {
			poolCache.delete(environment);
			throw err;
		}));
	}
	return poolCache.get(environment);
}

function textResult(value) {
	return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function errorResult(err) {
	return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

const server = new McpServer({ name: 'azure-sql-readonly', version: '1.0.0' });

server.registerTool(
	'list_environments',
	{
		title: 'List Azure SQL environments',
		description: 'Lists the Azure SQL environments exposed through this MCP server and whether each is configured (credentials present).',
		inputSchema: {}
	},
	async () => {
		const environments = ALLOWED_ENVIRONMENTS.map(name => ({
			name,
			type: CONNECTION_CONFIGS[name]?.type,
			configured: CONNECTION_CONFIGS[name]?.envPattern.every(key => process.env[key]) ?? false
		}));
		return textResult(environments);
	}
);

server.registerTool(
	'list_tables',
	{
		title: 'List tables',
		description: 'Lists tables (schema + name) available in the given Azure SQL environment.',
		inputSchema: { environment: z.enum(ALLOWED_ENVIRONMENTS) }
	},
	async ({ environment }) => {
		try {
			assertAllowedEnvironment(environment);
			const pool = await getPool(environment);
			const result = await pool.request().query(`
				SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
				FROM INFORMATION_SCHEMA.TABLES
				ORDER BY TABLE_SCHEMA, TABLE_NAME
			`);
			return textResult(result.recordset);
		} catch (err) {
			return errorResult(err);
		}
	}
);

server.registerTool(
	'describe_table',
	{
		title: 'Describe table',
		description: 'Lists column names, data types, nullability, and default values for a table in the given Azure SQL environment.',
		inputSchema: {
			environment: z.enum(ALLOWED_ENVIRONMENTS),
			table: z.string().describe('Table name, optionally schema-qualified as schema.table'),
		}
	},
	async ({ environment, table }) => {
		try {
			assertAllowedEnvironment(environment);
			const [schema, tableName] = table.includes('.') ? table.split('.') : ['dbo', table];
			const pool = await getPool(environment);
			const request = pool.request();
			request.input('schema', sql.NVarChar, schema);
			request.input('table', sql.NVarChar, tableName);
			const result = await request.query(`
				SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT
				FROM INFORMATION_SCHEMA.COLUMNS
				WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
				ORDER BY ORDINAL_POSITION
			`);
			if (result.recordset.length === 0) {
				return errorResult(new Error(`Table '${table}' not found in environment '${environment}'.`));
			}
			return textResult(result.recordset);
		} catch (err) {
			return errorResult(err);
		}
	}
);

server.registerTool(
	'query',
	{
		title: 'Run read-only SQL query',
		description: 'Executes a read-only (SELECT) SQL query against the given Azure SQL environment and returns the result rows.',
		inputSchema: {
			environment: z.enum(ALLOWED_ENVIRONMENTS),
			sql: z.string().describe('A SELECT query. INSERT/UPDATE/DELETE/DDL statements are rejected.'),
		}
	},
	async ({ environment, sql: queryText }) => {
		try {
			assertAllowedEnvironment(environment);
			assertReadOnly(queryText);
			const pool = await getPool(environment);
			const result = await pool.request().query(queryText);
			return textResult({
				rowCount: result.recordset?.length ?? 0,
				rows: result.recordset ?? []
			});
		} catch (err) {
			return errorResult(err);
		}
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch(err => {
	console.error('Failed to start Azure SQL MCP server:', err);
	process.exit(1);
});
