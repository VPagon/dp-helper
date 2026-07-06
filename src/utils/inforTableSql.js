// Builds the metadata INSERT statements needed to onboard an Infor (or ITAC) table
// family into rep_mda.* — one physical table per company code, following the
// CDC-landing / snapshot-bronze / RDL-delta pattern confirmed against live dev data
// (see docs/pages/load-infor-table.md for the source-of-truth examples).

const WEEKLY_CDC_CHECK_PIPELINE_NAME = 'CSM_PPE_RUNDQTESTBATCHCDCJOBSWEEKLY';

function sqlLiteral(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonLiteral(value) {
	return sqlLiteral(JSON.stringify(value));
}

export function parseCsvList(value) {
	return String(value || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function buildUniqueKeyExpression(pkColumnsCsv) {
	const cols = parseCsvList(pkColumnsCsv);
	if (cols.length === 0) return '-- TODO: primary key columns not provided --';
	if (cols.length === 1) return cols[0];
	return `concat(${cols.join(",'#',")})`;
}

function formatSqlDateTime(date) {
	return date.toISOString().slice(0, 19).replace('T', ' ') + '.000';
}

function pipelineInsertSql({ name, shortName, description, owner, loadCategory, priority, pipelineType, todayStr, initialDateStr }) {
	return `INSERT INTO rep_mda.mda_ocn_pipelines (
    pipeline_name,
    pipeline_short_name,
    pipeline_description,
    schedule_type,
    pipeline_owner,
    enabled,
    is_running,
    batch_type,
    metadata_tool_name,
    metadata_tool_job_pk,
    multiple_loads,
    prod_mail_to,
    test_mail_to,
    initial_date,
    date_of_insert,
    pipeline_type,
    load_category,
    pipeline_priority)
VALUES (
    ${sqlLiteral(name)},
    ${sqlLiteral(shortName)},
    ${sqlLiteral(description)},
    'D',
    ${sqlLiteral(owner)},
    1,
    0,
    'BT',
    NULL,
    NULL,
    1,
    NULL,
    NULL,
    ${sqlLiteral(initialDateStr)},
    ${sqlLiteral(todayStr)},
    ${sqlLiteral(pipelineType)},
    ${sqlLiteral(loadCategory)},
    ${priority});`;
}

function ingestionInsertSql({
	jobName, schema, table, alias, server, database, datastoreType,
	sourceCopySettings, sinkFolderPath, sinkFileSystem, includeTranslatorNull,
	copyLogSuffix, dataLoadingBehavior, taskId,
}) {
	const sourceObjectSettings = { schema, table };
	const sourceConnectionSettings = {
		SourceConnectionAlias: alias,
		LinkedServiceName: 'LS_GEN_SHIR_SQLServerWindowsAuth',
		MSSQLServerName: server,
		MSSQLDatabaseName: database,
		DatastoreType: datastoreType,
	};
	const sinkObjectSettings = {
		fileName: '#schema#.#table#.snappy.parquet',
		folderPath: sinkFolderPath,
		fileSystem: sinkFileSystem,
	};
	const copyActivitySettings = {
		...(includeTranslatorNull ? { translator: null } : {}),
		logFolderPath: `00-default/900_logs/#date_yyyyMMdd#/01_data_ingestion/#pipeline#/${copyLogSuffix}/#folder_path#`,
	};
	const triggeringEntityName = ['Sandbox', 'Manual', 'TGR_Scheduled3AM', '<ANY>'];

	return `INSERT INTO rep_mda.mda_data_ingestion (
    job_name,
    source_object_settings,
    source_connection_settings,
    source_copy_settings,
    sink_object_settings,
    sink_connection_settings,
    sink_copy_settings,
    copy_activity_settings,
    calling_entity_name,
    triggering_entity_name,
    data_loading_behavior_settings,
    task_id,
    task_name,
    copy_enabled)
VALUES (
    ${sqlLiteral(jobName)},
    ${jsonLiteral(sourceObjectSettings)},
    ${jsonLiteral(sourceConnectionSettings)},
    ${jsonLiteral(sourceCopySettings)},
    ${jsonLiteral(sinkObjectSettings)},
    NULL,
    NULL,
    ${jsonLiteral(copyActivitySettings)},
    'PPE_MdaIngestionTopLevel',
    ${jsonLiteral(triggeringEntityName)},
    ${jsonLiteral(dataLoadingBehavior)},
    ${taskId},
    'Default',
    1);`;
}

function dependencyInsertSql({ pipelineNameSubquery, dependantNameSubquery, keyDep, additionalChecks }) {
	return `INSERT INTO rep_mda.mda_ocn_pipeline_dependencies (
    pipeline_id,
    dependant_pipeline_id,
    dependency_lag,
    key_dep,
    additional_checks)
VALUES (
    (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name = ${sqlLiteral(pipelineNameSubquery)}),
    (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name = ${sqlLiteral(dependantNameSubquery)}),
    0,
    ${sqlLiteral(keyDep)},
    ${additionalChecks === null ? 'NULL' : sqlLiteral(additionalChecks)});`;
}

/**
 * @param {object} params
 * @param {string} params.baseTable
 * @param {string} params.companiesCsv
 * @param {string} params.sourceServer
 * @param {string} params.sourceDatabase
 * @param {string} params.sourceAlias
 * @param {string} params.sourceSchema
 * @param {string} params.pkColumnsCsv
 * @param {string} params.owner
 * @param {string} params.loadCategoryCdc
 * @param {string} params.loadCategorySnapshot
 * @param {string} params.loadCategoryRdl
 * @param {number} params.taskIdCdc
 * @param {number} params.taskIdSnapshot
 * @returns {Array<{ company: string, fullTable: string, queries: Array<{ id: string, label: string, sql: string }> }>}
 */
export function buildInforTableInserts(params) {
	const {
		baseTable, companiesCsv, sourceServer, sourceDatabase, sourceAlias, sourceSchema,
		pkColumnsCsv, owner, loadCategoryCdc, loadCategorySnapshot, loadCategoryRdl,
		taskIdCdc, taskIdSnapshot,
	} = params;

	const companies = parseCsvList(companiesCsv);
	const base = String(baseTable || '').trim();
	const baseUpper = base.toUpperCase();
	const baseLower = base.toLowerCase();
	const schema = String(sourceSchema || 'dbo').trim();
	const uniqueKeyExpr = buildUniqueKeyExpression(pkColumnsCsv);

	const now = new Date();
	const todayStr = formatSqlDateTime(now);
	const initialDate = new Date(now);
	initialDate.setMonth(initialDate.getMonth() - 1);
	const initialDateStr = formatSqlDateTime(initialDate);

	return companies.map((company) => {
		const full = `${baseUpper}${company}`;
		const fullLower = full.toLowerCase();

		const cdcName = `MS_SQL_CDC_INFOR_DBO_${full}_TO_BRONZE_LANDING_ZONE`;
		const snapshotName = `MS_SQL_INFOR_DBO_${full}_TO_BRONZE_ZONE`;
		const rdlName = `RDL_R_LN_DBO_${full}_DELTA`;
		const keyRdlTbe = `BRONZE#R_LN_DBO_${full}_DELTA`;

		const queries = [
			{
				id: 'cdc-pipeline',
				label: 'CDC Pipeline (landing zone)',
				sql: pipelineInsertSql({
					name: cdcName,
					shortName: `CDC_${full}_LNG`,
					description: `Load table ${full} using SQL Server CDC mechanism`,
					owner,
					loadCategory: loadCategoryCdc,
					priority: 90,
					pipelineType: 'METADATA_DRIVEN_INGESTION',
					todayStr,
					initialDateStr,
				}),
			},
			{
				id: 'snapshot-pipeline',
				label: 'Snapshot Pipeline (bronze/raw zone)',
				sql: pipelineInsertSql({
					name: snapshotName,
					shortName: `IGT_INFOR_${full}`,
					description: `Load snapshot table ${full}`,
					owner,
					loadCategory: loadCategorySnapshot,
					priority: 90,
					pipelineType: 'METADATA_DRIVEN_INGESTION',
					todayStr,
					initialDateStr,
				}),
			},
			{
				id: 'rdl-pipeline',
				label: 'RDL Pipeline (landing → raw delta)',
				sql: pipelineInsertSql({
					name: rdlName,
					shortName: rdlName,
					description: `Load table R_LN_DBO_${full}_DELTA using Raw Delta Framework`,
					owner,
					loadCategory: loadCategoryRdl,
					priority: 90,
					pipelineType: 'LOAD_RAW_DELTA',
					todayStr,
					initialDateStr,
				}),
			},
			{
				id: 'pipeline-parameter',
				label: 'RDL Pipeline Parameter (TABLE_NAME)',
				sql: `INSERT INTO rep_mda.mda_ocn_pipeline_parameters (
    pipeline_id,
    parameter_name,
    parameter_value,
    parameter_value_last_used)
VALUES (
    (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name = ${sqlLiteral(rdlName)}),
    'TABLE_NAME',
    ${sqlLiteral(keyRdlTbe)},
    NULL);`,
			},
			{
				id: 'cdc-ingestion',
				label: 'CDC Ingestion Job',
				sql: ingestionInsertSql({
					jobName: cdcName,
					schema,
					table: fullLower,
					alias: sourceAlias,
					server: sourceServer,
					database: sourceDatabase,
					datastoreType: 'RimacOnPremSQLServerTableCdc',
					sourceCopySettings: { PartitionOption: 'None', PartitionNames: null },
					sinkFolderPath: '01_#source#/01_#schema#/04_parquet/lze_#table#/#subfolder#/year=#year#/month=#month#/day=#day#',
					sinkFileSystem: '01-bronze/01_landing',
					includeTranslatorNull: false,
					copyLogSuffix: 'load_sql_cdc',
					dataLoadingBehavior: { dataLoadingBehavior: 'DeltaLoad', watermarkColumnStartValue: null },
					taskId: taskIdCdc,
				}),
			},
			{
				id: 'snapshot-ingestion',
				label: 'Snapshot Ingestion Job',
				sql: ingestionInsertSql({
					jobName: snapshotName,
					schema,
					table: fullLower,
					alias: sourceAlias,
					server: sourceServer,
					database: sourceDatabase,
					datastoreType: 'RimacOnPremSQLServerTable',
					sourceCopySettings: {
						PartitionOption: 'None',
						PartitionNames: null,
						SqlReaderQuery: 'select * from #schema#.#table#',
						PartitionLowerBound: null,
						PartitionUpperBound: null,
						PartitionColumnName: null,
					},
					sinkFolderPath: '01_#source#/01_#schema#/rze_#table#/year=#year#/month=#month#/day=#day#',
					sinkFileSystem: '01-bronze/02_raw',
					includeTranslatorNull: true,
					copyLogSuffix: 'load_sql',
					dataLoadingBehavior: { dataLoadingBehavior: 'FullLoad', watermarkColumnStartValue: null },
					taskId: taskIdSnapshot,
				}),
			},
			{
				id: 'rdl-table',
				label: 'RDL Table Definition',
				sql: `INSERT INTO rep_mda.mda_rdl_tables (
    zone_name,
    schema_name,
    table_name,
    source_directory,
    target_directory,
    alias,
    unique_key,
    partition_format,
    description,
    is_active,
    date_insert,
    key_rdl_tbe)
VALUES (
    'BRONZE',
    '012_raw',
    ${sqlLiteral(`r_ln_dbo_${fullLower}_delta`)},
    ${sqlLiteral(`/01_landing/01_${sourceAlias}/01_${schema}/04_parquet/lze_${fullLower}`)},
    ${sqlLiteral(`/02_raw/01_${sourceAlias}/01_${schema}/rze_${fullLower}_delta`)},
    ${sqlLiteral(`r_ln_dbo_${baseLower}_delta`)},
    ${sqlLiteral(uniqueKeyExpr)},
    '{}/year={}/month={}/day={}',
    NULL,
    1,
    ${sqlLiteral(todayStr)},
    ${sqlLiteral(keyRdlTbe)});`,
			},
			{
				id: 'dep-rdl-cdc',
				label: 'Dependency: RDL → CDC',
				sql: dependencyInsertSql({
					pipelineNameSubquery: rdlName,
					dependantNameSubquery: cdcName,
					keyDep: `DEP_${cdcName}_${rdlName}`,
					additionalChecks: 'CHECK_DEPENDENCY_ROWCOUNT',
				}),
			},
			{
				id: 'dep-snapshot-weekly',
				label: 'Dependency: Snapshot → Weekly CDC Check',
				sql: dependencyInsertSql({
					pipelineNameSubquery: WEEKLY_CDC_CHECK_PIPELINE_NAME,
					dependantNameSubquery: snapshotName,
					keyDep: `DEP_${snapshotName}_${WEEKLY_CDC_CHECK_PIPELINE_NAME}`,
					additionalChecks: null,
				}),
			},
		];

		return { company, fullTable: full, queries };
	});
}

export const SOURCE_SERVER_OPTIONS = [
	{ value: 'RT-VS-PR-085\\INFORTESTLN', alias: 'infor', database: 'infordb' },
	{ value: 'RT-VS-PR-085\\INFORDEVLN', alias: 'infor', database: 'infordb' },
	{ value: 'INFORPRODDB\\INFORPROD', alias: 'infor', database: 'infordb' },
	{ value: 'RT-VS-TE-024\\ITACAMPERETST', alias: 'itac', database: 'itacdb' },
	{ value: 'RT-VS-PR-025\\RIMACITACPROD', alias: 'itac', database: 'itacdb' },
];
