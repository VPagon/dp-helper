import React, { useState } from 'react';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/_metadaterium.scss';
import { executeQuery } from '../services/sqlService';

export default function MetadateriumPage() {
    const [currentStep, setCurrentStep] = useState('ingestion');
    const [formData, setFormData] = useState({
        // Ingestion step data
        environment: '',
        tableName: '',
        companies: [],
        owner: '',
        primaryKey: '',
        server: '',
        databaseName: 'infordb',
        // New fields for MRM configuration
        domain: '',
        specificationLocation: '',
        excelSheets: '',
        mrmId: ''
    });
    const [showSnapshotSql, setShowSnapshotSql] = useState(false);
    const [showDeltaIngestionSql, setShowDeltaIngestionSql] = useState(false);
    const [showLandingToRawSql, setShowLandingToRawSql] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [environment, setEnvironment] = useState('dev');

    const steps = [
        { id: 'ingestion', label: 'Ingestion' },
        { id: 'raw', label: 'Raw' },
        { id: 'silver', label: 'Silver' },
        { id: 'gold', label: 'Gold' }
    ];

    const [showSilverSql, setShowSilverSql] = useState(false);
    const [mrmTables, setMrmTables] = useState([]);
    const [mrmJobs, setMrmJobs] = useState([]);
    const [silverTables, setSilverTables] = useState([]);
    const [goldTables, setGoldTables] = useState([]);
    const [loadingMrmData, setLoadingMrmData] = useState(false);

    const handleCompanyChange = (companyValue) => {
        setFormData(prev => ({
            ...prev,
            companies: prev.companies.includes(companyValue)
                ? prev.companies.filter(c => c !== companyValue)
                : [...prev.companies, companyValue]
        }));
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // Helper function to safely extract table name parts
    const getTableParts = (tableName) => {
        if (!tableName) return { baseName: 'table_name', lastPart: 'table' };

        const parts = tableName.split('_');
        const baseName = tableName;
        const lastPart = parts.length > 1 ? parts[parts.length - 1] : tableName;

        return { baseName, lastPart };
    };

    const formatPrimaryKey = (primaryKey) => {
        if (!primaryKey) return 'id';

        // If multiple columns are specified with commas
        if (primaryKey.includes(',')) {
            const columns = primaryKey.split(',').map(col => col.trim());
            // Create concatenation like: concat(t_ifbp,'#',t_cofc)
            return `concat(${columns.map(col => `${col}`).join(",''#'',")})`;
        }

        // Single column
        return `t_${primaryKey}`;
    };

    // Function to get latest MRM_ID
    const getLatestMrmId = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await executeQuery(
                formData.environment || 'dev',
                `SELECT TOP 1 * FROM [rep_mda].[log_mrm_execution] ORDER BY 1 DESC`
            );
            if (result.rows && result.rows.length > 0) {
                const latestMrmId = result.rows[0][0]; // Assuming MRM_ID is the first column
                setFormData(prev => ({ ...prev, mrmId: latestMrmId }));
                setSuccess(`Latest MRM_ID: ${latestMrmId}`);
            } else {
                setError('No MRM_ID found in log_mrm_execution table');
            }
        } catch (err) {
            setError('Failed to get MRM_ID: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const generateSnapshotSql = () => {
        const { tableName, server, databaseName, owner, companies } = formData;
        const { baseName, lastPart } = getTableParts(tableName);
        const user = owner || 'current_user';

        // If no companies selected, use default
        const selectedCompanies = companies.length > 0 ? companies : ['220'];

        let sql = '';

        selectedCompanies.forEach(company => {
            sql += `insert into  [rep_mda].[mda_data_ingestion] (
    [job_name]
    ,[source_connection_settings]
    ,[source_object_settings]
    ,[source_copy_settings]
    ,[sink_object_settings]
    ,[sink_connection_settings]
    ,[sink_copy_settings]
    ,[copy_activity_settings]
    ,[calling_entity_name]
    ,[triggering_entity_name]
    ,[data_loading_behavior_settings]
    ,[task_id]
    ,[task_name]
    ,[copy_enabled]
)
select
    'MS_SQL_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_ZONE' as [job_name],
    JSON_OBJECT(
        'SourceConnectionAlias':'infor',
        'LinkedServiceName':'LS_GEN_SHIR_SQLServerWindowsAuth',
        'MSSQLServerName': '${server || 'server_name'}',
        'MSSQLDatabaseName':'infordb',
        'DatastoreType': 'RimacOnPremSQLServerTable'
    ) as [source_connection_settings],
    JSON_OBJECT(
        'schema':'dbo',
        'table':'${lastPart}${company}'
    ) as [source_object_settings],
    JSON_OBJECT(        
        'PartitionOption':'None',
        'PartitionNames':null,
        'SqlReaderQuery':'select * from #schema#.#table#',
        'PartitionLowerBound':null,
        'PartitionUpperBound':null,
        'PartitionColumnName':null
    ) as [source_copy_settings],
    JSON_OBJECT(
        'fileName':'#schema#.#table#.snappy.parquet',
        'folderPath':'01_#source#/01_#schema#/rze_#table#/year=#year#/month=#month#/day=#day#',
        'fileSystem':'01-bronze/02_raw'
    ) as [sink_object_settings],
    null as [sink_connection_settings],
    null as [sink_copy_settings],
    JSON_OBJECT(
        'translator':null,
        'logFolderPath':'00-default/900_logs/#date_yyyyMMdd#/01_data_ingestion/#pipeline#/load_sql/#folder_path#'
    ) as [copy_activity_settings],
    'PPE_MdaIngestionTopLevel' as [calling_entity_name],
    json_array('Sandbox', 'Manual', 'TGR_Scheduled3AM', '<ANY>') as [triggering_entity_name],
    JSON_OBJECT(
        'dataLoadingBehavior':'FullLoad',
        'watermarkColumnStartValue':null
    ) as [data_loading_behavior_settings],
    110 as [task_id],
    'Default' as [task_name],
    1 as [copy_enabled]


insert into rep_mda.mda_ocn_pipelines (
    pipeline_name,
    pipeline_short_name,
    pipeline_description,
    schedule_type,
    pipeline_owner,
    enabled,
    is_running,
    batch_type,
    multiple_loads,
    initial_date,
    pipeline_type,
    load_category
) values (
    'MS_SQL_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_ZONE',
    '${lastPart.toUpperCase()}${company}',
    'Load snapshot table ${lastPart.toUpperCase()}${company}',
    'D',
    '${user}',
    1,
    0,
    'BT',
    1,
    '2024-03-01 00:00:00.000',
    'METADATA_DRIVEN_INGESTION',
    'irregular_dq'
)

`;
        });

        return sql.trim();
    };

    const generateDeltaIngestionSql = () => {
        const { tableName, server, databaseName, owner, companies } = formData;
        const { baseName, lastPart } = getTableParts(tableName);
        const user = owner || 'current_user';

        // If no companies selected, use default
        const selectedCompanies = companies.length > 0 ? companies : ['220'];

        let sql = '';

        selectedCompanies.forEach(company => {
            sql += `insert into  [rep_mda].[mda_data_ingestion] (
    [job_name]
    ,[source_connection_settings]
    ,[source_object_settings]
    ,[source_copy_settings]
    ,[sink_object_settings]
    ,[sink_connection_settings]
    ,[sink_copy_settings]
    ,[copy_activity_settings]
    ,[calling_entity_name]
    ,[triggering_entity_name]
    ,[data_loading_behavior_settings]
    ,[task_id]
    ,[task_name]
    ,[copy_enabled]
)
select
    'MS_SQL_CDC_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_LANDING_ZONE' as [job_name],
    JSON_OBJECT(
        'SourceConnectionAlias':'infor',
        'LinkedServiceName':'LS_GEN_SHIR_SQLServerWindowsAuth',
        'MSSQLServerName': '${server || 'server_name'}',
        'MSSQLDatabaseName':'infordb',
        'DatastoreType': 'RimacOnPremSQLServerTableCdc'
    ) as [source_connection_settings],
    JSON_OBJECT(
        'schema':'dbo',
        'table':'${lastPart}${company}'
    ) as [source_object_settings],
    JSON_OBJECT(
        'PartitionOption':'None',
        'PartitionNames':null
    ) as [source_copy_settings],
    JSON_OBJECT(
        'fileName':'#schema#.#table#.snappy.parquet',
        'folderPath':'01_#source#/01_#schema#/04_parquet/lze_#table#/#subfolder#/year=#year#/month=#month#/day=#day#',
        'fileSystem':'01-bronze/01_landing'
    ) as [sink_object_settings],
    null as [sink_connection_settings],
    null as [sink_copy_settings],
    JSON_OBJECT(
        'logFolderPath':'00-default/900_logs/#date_yyyyMMdd#/01_data_ingestion/#pipeline#/load_sql_cdc/#folder_path#'
    ) as [copy_activity_settings],
    'PPE_MdaIngestionTopLevel' as [calling_entity_name],
    json_array('Sandbox', 'Manual', 'TGR_Scheduled3AM', '<ANY>') as [triggering_entity_name],
    JSON_OBJECT(
        'dataLoadingBehavior':'FullLoad',
        'watermarkColumnStartValue':'1900-01-01T00:00:00.000'
    ) as [data_loading_behavior_settings],
    7 as [task_id],
    'Default' as [task_name],
    1 as [copy_enabled]

insert into rep_mda.mda_ocn_pipelines (
    pipeline_name,
    pipeline_short_name,
    pipeline_description,
    schedule_type,
    pipeline_owner,
    enabled,
    is_running,
    batch_type,
    multiple_loads,
    initial_date,
    pipeline_type,
    load_category
) values (
    'MS_SQL_CDC_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_LANDING_ZONE',
    'CDC_${lastPart.toUpperCase()}${company}_LNG',
    'Load table ${lastPart.toUpperCase()}${company} using SQL Server CDC mechanism',
    'D',
    '${user}',
    1,
    0,
    'BT',
    1,
    '2024-03-01 00:00:00.000',
    'METADATA_DRIVEN_INGESTION',
    'standard_load'
)

`;
        });

        return sql.trim();
    };

    const generateLandingToRawSql = () => {
        const { tableName, primaryKey, owner, companies } = formData;
        const { baseName, lastPart } = getTableParts(tableName);
        const user = owner || 'current_user';
        const alias = lastPart.toLowerCase();
        const uniqueKey = formatPrimaryKey(primaryKey); // Use the new helper function

        // If no companies selected, use default
        const selectedCompanies = companies.length > 0 ? companies : ['220'];

        let sql = '';

        selectedCompanies.forEach(company => {
            sql += `insert into rep_mda.mda_rdl_tables(zone_name,schema_name,table_name,source_directory,target_directory,alias,unique_key,partition_format,description,is_active,key_rdl_tbe)
        values
        ('BRONZE','012_raw','r_ln_dbo_${baseName}${company}_delta','/01_landing/01_infor/01_dbo/04_parquet/lze_${lastPart}${company}',
            '/02_raw/01_infor/01_dbo/rze_${lastPart}${company}_delta', 'r_ln_dbo_${alias}_delta','${uniqueKey}',
            '{}/year={}/month={}/day={}',null,1,'BRONZE#R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA')

insert into rep_mda.mda_ocn_pipelines (
    pipeline_name,
    pipeline_short_name,
    pipeline_description,
    schedule_type,
    pipeline_owner,
    enabled,
    is_running,
    batch_type,
    multiple_loads,
    initial_date,
    pipeline_type,
    load_category,
    pipeline_priority,
    execution_resource,
    orchestrator_tool
) values (
    'RDL_R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA',
    'RDL_R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA',
    'Load table R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA using Raw Delta Framework',
    'D',
    '${user}',
    1,
    0,
    'BT',
    1,
    '2024-03-01 00:00:00.000',
    'LOAD_RAW_DELTA',
    'standard_load',
    100,
    'spark',
    'Synapse Notebook'
)

insert into rep_mda.mda_ocn_pipeline_parameters(pipeline_Id,parameter_name,parameter_value) 
    values
    ((select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='RDL_R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA'),'TABLE_NAME','BRONZE#R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA')

insert into  [rep_mda].[mda_ocn_Pipeline_Dependencies] (pipeline_Id,dependant_pipeline_id,dependency_lag, key_dep, additional_checks) 
    values
    ((select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='RDL_R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA'),(select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='MS_SQL_CDC_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_LANDING_ZONE'),0, 'DEP_MS_SQL_CDC_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_LANDING_ZONE_RDL_${baseName.toUpperCase()}${company}_DELTA','CHECK_DEPENDENCY_ROWCOUNT'),
    ((select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='CSM_PPE_RUNDQTESTBATCHCDCJOBSWEEKLY'),(select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='MS_SQL_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_ZONE'),0, 'DEP_MS_SQL_INFOR_DBO_${lastPart.toUpperCase()}${company}_TO_BRONZE_ZONE_CSM_PPE_RUNDQTESTBATCHCDCJOBSWEEKLY',null),
    ((select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='CSM_PPE_RUNDQTESTBATCHCDCJOBSWEEKLY'),(select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='RDL_R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA'),0, 'DEP_RDL_R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA_CSM_PPE_RUNDQTESTBATCHCDCJOBSWEEKLY',null)

`;
        });

        return sql.trim();
    };

    // Raw page SQL generators
    const generateLogMrmExecutionSql = () => {
        const { domain, specificationLocation, excelSheets } = formData;

        return `-- Prvo provjeri najnoviji MRM_ID:
select * from [rep_mda].[log_mrm_execution] order by 1 desc

-- Zatim insertaj novi zapis sa UNIKATNIM MRM_ID:
insert into [rep_mda].[log_mrm_execution] (domain, specification_path, sheet_names, execution_status, email)
values 
    ('${domain || '06_jira_assets'}',
    '${specificationLocation || '/700_metadata/001_frameworks/20_delta_lake_etl/01_landing/it/LoadJiraAssets.xlsx'}',
    '${excelSheets || 'Camera'}',
    'Ready', [rep_mda].[f_util_get_user]())`;
    };

    const generateSpecificationCheckSql = () => {
        const { mrmId } = formData;
        const mrmIdValue = mrmId || '731'; // Default fallback

        return `-- Provjera podataka prije pokretanja pipelinea PPE_InsertMetadateriumSpecifications
-- Koristi MRM_ID iz prethodnog koraka (npr. ${mrmIdValue})

select * from rep_mda.log_mrm_specification_check			
where mrm_id=${mrmIdValue}
order by log_status, log_type

select * from rep_mda.mda_mrm_tables
where mrm_id=${mrmIdValue}

select * from rep_mda.mda_mrm_jobs
where mrm_id=${mrmIdValue}

select * from rep_mda.mda_mrm_columns
where mrm_id=${mrmIdValue}

-- Provjera DLE tablica:
select * from rep_mda.mda_dle_tables where table_name like 'table_name'
select * from rep_mda.mda_dle_columns where dle_tbe_id=`;
    };

    const generateDqTablesSql = () => {
        const { tableName, primaryKey, companies } = formData;
        const { baseName } = getTableParts(tableName);
        const rawTable = baseName.toLowerCase();
        const uniqueKey = formatPrimaryKey(primaryKey);
        const selectedCompanies = companies.length > 0 ? companies : ['220'];

        let sql = '';

        selectedCompanies.forEach(company => {
            sql += `-- Add DQ for raw delta tables - Company ${company}

-- Insert za snapshot tabelu
insert into rep_mda.mda_dq_tables(
    table_name,table_type,table_definition_location,table_definition_key,filter,stage_dq_table_name,dq_indicator_column_name,dq_issues_column_name,table_group,is_active,f_check_column_datatypes,key_email,table_definition,f_stage_only_failed_rows,f_check_na_row_existence,unique_key,kvs_connection_string)
values
    ('012_raw.${rawTable}${company}','DLE_TABLE','rep_mda.mda_dle_tables',(SELECT id FROM rep_mda.mda_dle_tables WHERE key_dle_tbe='BRONZE#${baseName.toUpperCase()}${company}'),NULL,NULL,NULL,NULL,'CDC_WEEKLY_CHECKS',1,'N',NULL,NULL,'N','N','${uniqueKey}',NULL)

-- Insert za CDC tabelu
insert into rep_mda.mda_dq_tables(
    table_name,table_type,table_definition_location,table_definition_key,filter,stage_dq_table_name,dq_indicator_column_name,dq_issues_column_name,table_group,is_active,f_check_column_datatypes,key_email,table_definition,f_stage_only_failed_rows,f_check_na_row_existence,unique_key,kvs_connection_string)
values('012_raw.${rawTable}${company}_delta','DLE_TABLE','rep_mda.mda_dle_tables',(SELECT id FROM rep_mda.mda_dle_tables WHERE key_dle_tbe='BRONZE#${baseName.toUpperCase()}${company}_DELTA'),'is_current=1 and is_deleted=0',NULL,NULL,NULL,'CDC_WEEKLY_CHECKS',1,'N',NULL,NULL,'N','N','${uniqueKey}',NULL)

-- Insert za compare tables
insert into rep_mda.mda_dq_compare_tables(dq_rle_id,dq_tbe_id,dq_tbe_id_referential,keys_json,mapping_json,ignore_columns_csv,active_columns_csv,f_compare_data,f_compare_counts,f_compare_schema,severity,is_active,key_dq_cmp)
values
    (2,
    (SELECT id FROM rep_mda.mda_dq_tables WHERE table_name='012_raw.${rawTable}${company}'),
    (SELECT id FROM rep_mda.mda_dq_tables WHERE table_name='012_raw.${rawTable}${company}_delta'),
    '[{"key":"unique_key","ref_key":"${uniqueKey}"},{"key":"key_le","ref_key":"get_key_le_from_input_file_folder_name(input_file_name())"}]',
    NULL,
    'dtp_dle_framework_tmp_src_record_modified,dtp_dle_framework_tmp_transaction_order,date_from,date_last_modified,entry_date,date_to,is_current,src_record_modified,transaction_order,is_deleted,transaction_order_key,is_initial_row',
    NULL,'N','Y','N',3,1,'DQ#COMPARE#012_raw.${rawTable}${company}#012_raw.${rawTable}${company}_delta')

`;
        });

        return sql.trim();
    };

    const executeSql = async (sqlType) => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            // Determine which SQL to execute based on sqlType
            let sql = '';
            switch (sqlType) {
                case 'Snapshot':
                    sql = generateSnapshotSql();
                    break;
                case 'Delta Ingestion':
                    sql = generateDeltaIngestionSql();
                    break;
                case 'Landing to Raw':
                    sql = generateLandingToRawSql();
                    break;
                case 'Insert u log_mrm_execution':
                    sql = generateLogMrmExecutionSql();
                    break;
                case 'Provjera podataka prije pokretanja':
                    sql = generateSpecificationCheckSql();
                    break;
                case 'Populate DQ Tables':
                    sql = generateDqTablesSql();
                    break;
                case 'Silver Configuration':
                    sql = await generateSilverPipelinesSql(); // Await the async function
                    break;
                default:
                    throw new Error(`Unknown SQL type: ${sqlType}`);
            }

            // Execute the SQL query
            const result = await executeQuery(formData.environment || 'dev', sql);

            setSuccess(`${sqlType} SQL executed successfully!`);

            // Close the SQL preview after execution
            if (sqlType === 'Snapshot') setShowSnapshotSql(false);
            if (sqlType === 'Delta Ingestion') setShowDeltaIngestionSql(false);
            if (sqlType === 'Landing to Raw') setShowLandingToRawSql(false);
            if (sqlType === 'Silver Configuration') setShowSilverSql(false);

            // Log the result for debugging
            console.log(`${sqlType} execution result:`, result);

        } catch (err) {
            setError(`Failed to execute ${sqlType} SQL: ` + err.message);
            console.error('SQL execution error:', err);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (sql) => {
        navigator.clipboard.writeText(sql);
        setSuccess('SQL copied to clipboard!');
    };

    const nextStep = () => {
        const currentIndex = steps.findIndex(step => step.id === currentStep);
        if (currentIndex < steps.length - 1) {
            setCurrentStep(steps[currentIndex + 1].id);
        }
    };

    const prevStep = () => {
        const currentIndex = steps.findIndex(step => step.id === currentStep);
        if (currentIndex > 0) {
            setCurrentStep(steps[currentIndex - 1].id);
        }
    };

    const SqlSection = ({ title, showState, setShowState, generateSql, sqlType }) => (
        <div className="sql-section">
            <button
                className="sql-toggle"
                onClick={() => setShowState(!showState)}
                disabled={loading}
            >
                {showState ? '▲ Hide' : '▼ Show'} {title}
            </button>

            {showState && (
                <div className="sql-preview">
                    <pre className="sql-code">{generateSql()}</pre>
                    <div className="sql-info">
                        <strong>Generated for {formData.companies.length > 0 ? formData.companies.join(', ') : '220'} companies</strong>
                    </div>
                    <div className="sql-actions">
                        <button
                            className="btn btn-primary"
                            onClick={() => executeSql(sqlType)}
                            disabled={loading}
                        >
                            {loading ? 'Executing...' : '⚡ Execute SQL'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => copyToClipboard(generateSql())}
                            disabled={loading}
                        >
                            📋 Copy to Clipboard
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowState(false)}
                            disabled={loading}
                        >
                            ✕ Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    const RawSqlSection = ({ title, showState, setShowState, generateSql, instructions, showMrmButton = false }) => (
        <div className="sql-section">
            <button
                className="sql-toggle"
                onClick={() => setShowState(!showState)}
                disabled={loading}
            >
                {showState ? '▲ Hide' : '▼ Show'} {title}
            </button>

            {showState && (
                <div className="sql-preview">
                    {showMrmButton && (
                        <div className="mrm-id-section">
                            <div className="mrm-id-display">
                                <strong>Current MRM_ID:</strong> {formData.mrmId || 'Not set'}
                            </div>
                            <button
                                className="btn btn-secondary"
                                onClick={getLatestMrmId}
                                disabled={loading}
                            >
                                🔄 Get Latest MRM_ID
                            </button>
                        </div>
                    )}

                    {instructions && (
                        <div className="sql-instructions">
                            <h4>Upute:</h4>
                            <p>{instructions}</p>
                        </div>
                    )}
                    <pre className="sql-code">{generateSql()}</pre>
                    <div className="sql-actions">
                        <button
                            className="btn btn-primary"
                            onClick={() => executeSql(title)}
                            disabled={loading}
                        >
                            {loading ? 'Executing...' : '⚡ Execute SQL'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => copyToClipboard(generateSql())}
                            disabled={loading}
                        >
                            📋 Copy to Clipboard
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowState(false)}
                            disabled={loading}
                        >
                            ✕ Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    // Add a new function to fetch MRM data
    const fetchMrmData = async () => {
        if (!formData.mrmId) {
            setError('MRM_ID is required to fetch MRM data');
            return;
        }

        setLoadingMrmData(true);
        setError(null);
        try {
            // Fetch DLE jobs - these contain the job_name we need
            const jobsResult = await executeQuery(
                formData.environment || 'dev',
                `SELECT job_name, job_type, tgt_dle_tbe_id FROM rep_mda.mda_mrm_jobs WHERE mrm_id=${formData.mrmId}`
            );

            // Initialize arrays
            const silver = [];
            const gold = [];
            const allDleJobs = [];

            if (jobsResult && jobsResult.rows && jobsResult.rows.length > 0) {
                jobsResult.rows.forEach(row => {
                    allDleJobs.push(row);

                    if (row && row[0]) { // job_name is first column
                        const jobName = row[0].toString();
                        const lowerJobName = jobName.toLowerCase();

                        if (lowerJobName.includes('slr_') || lowerJobName.includes('silver') ||
                            (row[1] && row[1].toString().toLowerCase().includes('silver'))) {
                            silver.push(row);
                        } else if (lowerJobName.includes('gld_') || lowerJobName.includes('gold') ||
                            (row[1] && row[1].toString().toLowerCase().includes('gold'))) {
                            gold.push(row);
                        }
                    }
                });

                setMrmJobs(allDleJobs);
                setSilverTables(silver);
                setGoldTables(gold);
            }

            // Also fetch tables for reference from mda_dle_tables
            const tablesResult = await executeQuery(
                formData.environment || 'dev',
                `SELECT table_name, alias FROM rep_mda.mda_mrm_tables WHERE mrm_id=${formData.mrmId}`
            );

            if (tablesResult && tablesResult.rows && tablesResult.rows.length > 0) {
                setMrmTables(tablesResult.rows);
            } else {
                setMrmTables([]);
            }

            const jobCount = allDleJobs.length || 0;
            const tableCount = (tablesResult && tablesResult.rows && tablesResult.rows.length) || 0;

            setSuccess(`Fetched ${jobCount} DLE jobs (${silver.length} silver, ${gold.length} gold) and ${tableCount} DLE tables`);
        } catch (err) {
            setError('Failed to fetch DLE data: ' + err.message);
            console.error('DLE fetch error:', err);

            // Reset arrays on error
            setMrmTables([]);
            setSilverTables([]);
            setGoldTables([]);
            setMrmJobs([]);
        } finally {
            setLoadingMrmData(false);
        }
    };

    const extractShortAlias = (fullAlias, type) => {
        if (!fullAlias) return '';

        // Remove common prefixes from alias
        let shortAlias = fullAlias.toLowerCase()
            .replace(/^(s_ln_dbo_|s_|ln_|dbo_|r_|d_)/g, '')
            .replace(/[^a-z0-9_]/g, '_');

        // If after removing prefixes it's empty or too short, use the original
        if (shortAlias.length < 3) {
            shortAlias = fullAlias.toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')
                .replace(/^_+|_+$/g, '');
        }

        return shortAlias;
    };

    const extractAliasFromJobName = (jobName) => {
        if (!jobName) return '';

        // Remove prefixes
        let alias = jobName.toLowerCase()
            .replace(/^(slr_|gld_|silver_|gold_|s_|d_|ln_|dbo_)/g, '')
            .replace(/_/g, ' ');

        // Take first 3 letters of each word
        const words = alias.split(' ');
        const shortWords = words.map(word => {
            // Take first 3 characters, but skip common words
            if (word.length <= 3) return word;
            return word.substring(0, 3);
        });

        // Join with underscores and limit length
        return shortWords.join('_').substring(0, 20).replace(/[^a-z0-9_]/g, '');
    };

    // Helper function to get alias from DLE tables
    const getTableAliasForDisplay = async (tableName) => {
        try {
            const result = await executeQuery(
                formData.environment || 'dev',
                `SELECT TOP 1 alias FROM rep_mda.mda_dle_tables WHERE table_name LIKE '%${tableName.replace(/^(slr_|gld_|silver_|gold_)/i, '')}%' OR key_dle_tbe LIKE '%${tableName.toUpperCase()}%'`
            );

            if (result.rows && result.rows.length > 0 && result.rows[0][0]) {
                return result.rows[0][0];
            }
            return null;
        } catch (err) {
            console.error('Failed to get table alias:', err);
            return null;
        }
    };

    // Helper function to get table alias from DLE tables
    const getTableAlias = async (tableName) => {
        try {
            const result = await executeQuery(
                formData.environment || 'dev',
                `SELECT alias FROM rep_mda.mda_dle_tables WHERE table_name = '${tableName}'`
            );

            if (result.rows && result.rows.length > 0 && result.rows[0][0]) {
                return result.rows[0][0];
            }
            return null;
        } catch (err) {
            console.error('Failed to get table alias:', err);
            return null;
        }
    };

    // Helper function to get RDL pipeline names for dependencies
    const getRdlPipelineNames = () => {
        const { tableName, companies } = formData;
        const { baseName } = getTableParts(tableName);
        const selectedCompanies = companies.length > 0 ? companies : ['220'];

        return selectedCompanies.map(company =>
            `RDL_R_LN_DBO_${baseName.toUpperCase()}${company}_DELTA`
        );
    };

    // Function to calculate initial date (2 weeks before today)
    const calculateInitialDate = () => {
        const today = new Date();
        const twoWeeksAgo = new Date(today);
        twoWeeksAgo.setDate(today.getDate() - 14);

        return twoWeeksAgo.toISOString().slice(0, 19).replace('T', ' ');
    };

    // Generate Silver SQL for pipelines
    const generateSilverPipelinesSql = async () => {
        const { owner } = formData;
        const user = owner || 'current_user';
        const initialDate = calculateInitialDate();

        let sql = `-- Silver and Gold Pipeline Configuration for MRM_ID: ${formData.mrmId || 'Not set'}\n\n`;

        // Check if we have DLE job data
        if (silverTables.length === 0 && goldTables.length === 0) {
            return sql + `-- No DLE jobs found. Please fetch DLE data first using the "Fetch MRM Data" button.\n`;
        }

        // We'll store job info with aliases
        const jobInfo = [];

        // First, let's get table names from DLE jobs and find their aliases
        for (const row of [...silverTables, ...goldTables]) {
            if (row && row[0]) {
                const jobName = row[0].toString().trim();
                if (jobName) {
                    // Get table name from the job row (usually column 2)
                    const tableName = row[2] ? row[2].toString().trim() : '';

                    // Get alias from mda_dle_tables using the table name
                    let alias = null;
                    if (tableName) {
                        alias = await getTableAliasForDisplay(tableName);
                    }

                    // If no alias found from table name, try to extract from job name
                    if (!alias) {
                        // Try to find the alias in mda_dle_tables by searching for similar table names
                        const result = await executeQuery(
                            formData.environment || 'dev',
                            `SELECT TOP 1 alias FROM rep_mda.mda_dle_tables WHERE table_name LIKE '%${jobName.replace(/^(slr_|gld_)/i, '')}%' OR key_dle_tbe LIKE '%${jobName.toUpperCase()}%'`
                        );

                        if (result.rows && result.rows.length > 0 && result.rows[0][0]) {
                            alias = result.rows[0][0];
                        }
                    }

                    // Determine type
                    const type = jobName.toLowerCase().includes('slr_') ? 'silver' : 'gold';

                    jobInfo.push({
                        jobName,
                        type,
                        alias: alias || '' // Store the alias for later use
                    });
                }
            }
        }

        if (jobInfo.length === 0) {
            return sql + `-- No valid jobs found to create pipelines.\n`;
        }

        // Generate pipeline insertions
        sql += `-- 1. Pipeline Insertions\n`;
        sql += `insert into [rep_mda].[mda_ocn_Pipelines] \n`;
        sql += `(Pipeline_Name, Pipeline_Short_Name, Pipeline_Description, Schedule_Type, Pipeline_Owner,\n`;
        sql += `Enabled, Is_Running, Batch_Type, Multiple_Loads, initial_Date, pipeline_type, load_category)\n`;
        sql += `values\n`;

        const pipelineValues = [];

        jobInfo.forEach(info => {
            // Extract short alias from full alias
            const shortAlias = extractShortAlias(info.alias, info.type);

            // Create pipeline short name
            const pipelineShortName = info.type === 'silver'
                ? `SLR_${shortAlias.toUpperCase()}`
                : `GLD_${shortAlias.toUpperCase()}`;

            pipelineValues.push(
                `(UPPER('${info.jobName}'), '${pipelineShortName}', '', 'D', '${user}', 1, 0, 'BT', 1, '${initialDate}', 'LOAD_DELTA_LAKE_NB', 'standard_load')`
            );
        });

        sql += pipelineValues.join(',\n') + ';\n\n';

        // Generate parameters insertions
        sql += `-- 2. Parameters Insertions\n`;
        sql += `insert into rep_mda.mda_ocn_pipeline_parameters(pipeline_Id, parameter_name, parameter_value)\n`;
        sql += `values\n`;

        const paramValues = [];

        jobInfo.forEach(info => {
            paramValues.push(
                `((select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name=UPPER('${info.jobName}')), 'JOB_NAME', '${info.jobName}')`
            );
        });

        if (paramValues.length > 0) {
            sql += paramValues.join(',\n') + ';\n\n';
        } else {
            sql += `-- No parameters to insert\n\n`;
        }

        // Generate dependencies insertions
        sql += `-- 3. Dependencies Insertions\n`;
        sql += `insert into [rep_mda].[mda_ocn_Pipeline_Dependencies] (pipeline_Id, dependant_pipeline_id, dependency_lag, key_dep)\n`;
        sql += `values\n`;

        const depValues = [];

        // Dependencies from silver jobs to RDL pipelines
        const rdlPipelineNames = getRdlPipelineNames();
        jobInfo.forEach(info => {
            if (info.type === 'silver') {
                rdlPipelineNames.forEach(rdlPipeline => {
                    depValues.push(
                        `((select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name=UPPER('${info.jobName}')), ` +
                        `(select pipeline_id from [rep_mda].[mda_ocn_Pipelines] where pipeline_name='${rdlPipeline}'), ` +
                        `0, UPPER('DEP_${rdlPipeline}_${info.jobName}'))`
                    );
                });
            }
        });

        if (depValues.length > 0) {
            sql += depValues.join(',\n') + ';';
        } else {
            sql += `-- No dependencies to insert\n`;
        }

        return sql;
    };

    // Add new SqlSection for Silver
    const SilverSqlSection = ({ title, showState, setShowState, generateSql, sqlType }) => {
        const [generatedSql, setGeneratedSql] = useState('');
        const [generatingSql, setGeneratingSql] = useState(false);

        const handleGenerateSql = async () => {
            if (!formData.mrmId) {
                setError('MRM_ID is required to generate SQL');
                return;
            }

            setGeneratingSql(true);
            try {
                const sql = await generateSql();
                setGeneratedSql(sql);
            } catch (err) {
                setError('Failed to generate SQL: ' + err.message);
                console.error('SQL generation error:', err);
            } finally {
                setGeneratingSql(false);
            }
        };

        return (
            <div className="sql-section">
                <button
                    className="sql-toggle"
                    onClick={() => {
                        setShowState(!showState);
                        if (!showState && !generatedSql) {
                            handleGenerateSql();
                        }
                    }}
                    disabled={loading || loadingMrmData}
                >
                    {showState ? '▲ Hide' : '▼ Show'} {title}
                </button>

                {showState && (
                    <div className="sql-preview">
                        <div className="mrm-data-section">
                            <h4>MRM Data Status:</h4>
                            <div className="data-status">
                                <div><strong>MRM_ID:</strong> {formData.mrmId || 'Not set'}</div>
                                <div><strong>Silver Tables Found:</strong> {silverTables.length}</div>
                                <div><strong>Gold Tables Found:</strong> {goldTables.length}</div>
                                <div><strong>MRM Jobs Found:</strong> {mrmJobs.length}</div>
                            </div>
                            <button
                                className="btn btn-secondary"
                                onClick={fetchMrmData}
                                disabled={loadingMrmData || !formData.mrmId}
                            >
                                {loadingMrmData ? 'Loading...' : '🔄 Fetch MRM Data'}
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={handleGenerateSql}
                                disabled={generatingSql || !formData.mrmId || silverTables.length === 0}
                                style={{ marginLeft: '10px' }}
                            >
                                {generatingSql ? 'Generating...' : '🔄 Regenerate SQL'}
                            </button>
                        </div>

                        <pre className="sql-code">{generatedSql || 'Click "Regenerate SQL" to generate the pipeline configuration SQL...'}</pre>
                        <div className="sql-actions">
                            <button
                                className="btn btn-primary"
                                onClick={() => executeSql(sqlType)}
                                disabled={loading || !generatedSql || generatedSql.includes('No valid tables')}
                            >
                                {loading ? 'Executing...' : '⚡ Execute SQL'}
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => copyToClipboard(generatedSql)}
                                disabled={!generatedSql || generatedSql.includes('No valid tables')}
                            >
                                📋 Copy to Clipboard
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowState(false)}
                                disabled={loading}
                            >
                                ✕ Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="metadaterium-page">
            <HomeButton />
            <br />
            <br />

            <div className="wizard-container">
                <div className="wizard-header">
                    <h1>Metadaterium Configuration Wizard</h1>
                    <p>Configure your data pipeline through multiple stages</p>
                </div>

                <div className="wizard-tabs">
                    {steps.map(step => (
                        <div
                            key={step.id}
                            className={`wizard-tab ${currentStep === step.id ? 'active' : ''}`}
                            onClick={() => setCurrentStep(step.id)}
                        >
                            {step.label}
                        </div>
                    ))}
                </div>

                <div className="wizard-content">
                    {error && <div className="error-message">{error}</div>}
                    {success && <div className="success-message">{success}</div>}

                    {/* Ingestion Step */}
                    {currentStep === 'ingestion' && (
                        <div className="wizard-step active">
                            <h2 className="step-title">Ingestion Configuration</h2>

                            <div className="form-group">
                                <label htmlFor="environment">Environment</label>
                                <select
                                    id="environment"
                                    value={formData.environment}
                                    onChange={(e) => handleInputChange('environment', e.target.value)}
                                    disabled={loading}
                                >
                                    <option value="">Select Environment</option>
                                    <option value="dev">Development</option>
                                    <option value="prod">Production</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="tableName">Table Name</label>
                                <input
                                    type="text"
                                    id="tableName"
                                    value={formData.tableName}
                                    onChange={(e) => handleInputChange('tableName', e.target.value)}
                                    placeholder="Enter table name"
                                    disabled={loading}
                                />
                            </div>

                            <div className="form-group">
                                <label>Companies</label>
                                <div className="checkbox-group">
                                    {['220', '221', '222'].map(company => (
                                        <div key={company} className="checkbox-item">
                                            <input
                                                type="checkbox"
                                                id={`company${company}`}
                                                checked={formData.companies.includes(company)}
                                                onChange={() => handleCompanyChange(company)}
                                                disabled={loading}
                                            />
                                            <label htmlFor={`company${company}`}>{company}</label>
                                        </div>
                                    ))}
                                </div>
                                <small>Select one or more companies. SQL will be generated for each selected company.</small>
                            </div>

                            <div className="form-group">
                                <label htmlFor="owner">Owner</label>
                                <input
                                    type="text"
                                    id="owner"
                                    value={formData.owner}
                                    onChange={(e) => handleInputChange('owner', e.target.value)}
                                    placeholder="Enter owner name"
                                    disabled={loading}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="primaryKey">Primary Key</label>
                                <input
                                    type="text"
                                    id="primaryKey"
                                    value={formData.primaryKey}
                                    onChange={(e) => handleInputChange('primaryKey', e.target.value)}
                                    placeholder="Enter primary key or multiple columns separated by commas"
                                    disabled={loading}
                                />
                                <small>For multiple columns, use format: clan,ctxt,seqe (will generate: concat(t_clan,'#',t_ctxt,'#',t_seqe))</small>
                            </div>

                            <div className="form-group">
                                <label htmlFor="server">Server</label>
                                <select
                                    id="server"
                                    value={formData.server}
                                    onChange={(e) => handleInputChange('server', e.target.value)}
                                    disabled={loading}
                                >
                                    <option value="">Select Server</option>
                                    <option value="RT-VS-PR-085\INFORDEVLN">RT-VS-PR-085\\INFORDEVLN</option>
                                    <option value="RT-VS-PR-085\INFORTESTLN">RT-VS-PR-085\\INFORTESTLN</option>
                                    <option value="INFORPRODDB\INFORPROD">INFORPRODDB\INFORPROD</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="databaseName">Database Name</label>
                                <input
                                    type="text"
                                    id="databaseName"
                                    value={formData.databaseName}
                                    onChange={(e) => handleInputChange('databaseName', e.target.value)}
                                    disabled={loading}
                                />
                            </div>

                            {/* SQL Sections */}
                            <SqlSection
                                title=" Step 1. Generated Snapshot SQL"
                                showState={showSnapshotSql}
                                setShowState={setShowSnapshotSql}
                                generateSql={generateSnapshotSql}
                                sqlType="Snapshot"
                            />

                            <SqlSection
                                title="Step 2. Generated Delta Ingestion SQL"
                                showState={showDeltaIngestionSql}
                                setShowState={setShowDeltaIngestionSql}
                                generateSql={generateDeltaIngestionSql}
                                sqlType="Delta Ingestion"
                            />

                            <SqlSection
                                title="Step 3. Generated Landing -> Raw SQL"
                                showState={showLandingToRawSql}
                                setShowState={setShowLandingToRawSql}
                                generateSql={generateLandingToRawSql}
                                sqlType="Landing to Raw"
                            />

                            {/* Instructions Section */}
                            <div className="instructions-section">
                                <h3>📋 Upute za pokretanje pipelinea</h3>
                                <div className="instructions-content">
                                    <p><strong>Pokreni pipeline u Synapseu (PPE_MdaIngestionTopLevel):</strong></p>
                                    <ul>
                                        <li>✅ Prije pokretanja provjeri da li je CDC uključen</li>
                                        <li>✅ Provjeri koji tip loada je u pitanju</li>
                                        <li>✅ Provjeri iz koje baze se učitava</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Raw Step */}
                    {currentStep === 'raw' && (
                        <div className="wizard-step active">
                            <h2 className="step-title">Raw Configuration</h2>
                            <p className="step-description">Parametri su preneseni sa Ingestion stranice</p>

                            <div className="current-parameters">
                                <h4>Trenutni parametri:</h4>
                                <div className="parameters-grid">
                                    <div><strong>Table Name:</strong> {formData.tableName || 'Nije postavljeno'}</div>
                                    <div><strong>Companies:</strong> {formData.companies.length > 0 ? formData.companies.join(', ') : '220'}</div>
                                    <div><strong>Owner:</strong> {formData.owner || 'Nije postavljeno'}</div>
                                    <div><strong>Primary Key:</strong> {formData.primaryKey || 'Nije postavljeno'}</div>
                                    <div><strong>Server:</strong> {formData.server || 'Nije postavljeno'}</div>
                                    <div><strong>Database:</strong> {formData.databaseName}</div>
                                </div>
                            </div>

                            {/* New MRM Configuration Fields */}
                            <div className="mrm-configuration">
                                <h3>MRM Configuration</h3>

                                <div className="form-group">
                                    <label htmlFor="domain">Domain</label>
                                    <input
                                        type="text"
                                        id="domain"
                                        value={formData.domain}
                                        onChange={(e) => handleInputChange('domain', e.target.value)}
                                        placeholder="Enter domain (e.g., 06_jira_assets)"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="specificationLocation">Specification Location</label>
                                    <input
                                        type="text"
                                        id="specificationLocation"
                                        value={formData.specificationLocation}
                                        onChange={(e) => handleInputChange('specificationLocation', e.target.value)}
                                        placeholder="Enter specification path"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="excelSheets">Excel Sheets</label>
                                    <input
                                        type="text"
                                        id="excelSheets"
                                        value={formData.excelSheets}
                                        onChange={(e) => handleInputChange('excelSheets', e.target.value)}
                                        placeholder="Enter Excel sheets separated by commas"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Raw SQL Sections */}
                            <RawSqlSection
                                title="Insert u log_mrm_execution"
                                showState={showSnapshotSql}
                                setShowState={setShowSnapshotSql}
                                generateSql={generateLogMrmExecutionSql}
                                instructions="a) Uploadaj specku na dobro mjesto: storage account -> '00-default/700_metadata/001_frameworks/20_delta_lake_etl/01_landing/quality/instruments_specification.xlsx' | b) Potrebno ponovno pokrenuti insert ako se promijenila specka | c) Svako pokretanje PPE_GetMetadateriumSpecification mora biti sa drugacijim mrm_id"
                                showMrmButton={true}
                            />

                            <div className="instruction-step">
                                <h4>📝 STEP -- load custom_labels.xlsx</h4>
                                <p>Napomena: https://rimac-technology-servicedesk.atlassian.net/wiki/spaces/IT/pages/421901714/Custom+Labels+data+load</p>
                                <p>Samo kao napomena da je to korak koji se treba napraviti</p>
                            </div>

                            <div className="instruction-step">
                                <h4>🚀 Pokreni PPE_GetMetadateriumSpecification sa MRM_ID</h4>
                                <p>Koristi MRM_ID dobiven iz prethodnog INSERT-a u log_mrm_execution</p>
                                <div className="mrm-id-display">
                                    <strong>Current MRM_ID:</strong> {formData.mrmId || 'Not set'}
                                    <button
                                        className="btn btn-secondary"
                                        onClick={getLatestMrmId}
                                        disabled={loading}
                                        style={{ marginLeft: '10px' }}
                                    >
                                        🔄 Get Latest MRM_ID
                                    </button>
                                </div>
                            </div>

                            <RawSqlSection
                                title="Provjera podataka prije pokretanja"
                                showState={showDeltaIngestionSql}
                                setShowState={setShowDeltaIngestionSql}
                                generateSql={generateSpecificationCheckSql}
                                instructions="Kada je 1st step finished i execution_status='Staged' - ovdje možemo vidjeti koje će se tablice, kolone i poslovi upisati (ovo su 'staging' tablice). Kreira se gold skripta, tablice na rawu, goldu, odsu, silveru (vjv i slr_stg), silver i gold jobovi, kolone za silver i gold tablice."
                                showMrmButton={true}
                            />

                            <div className="instruction-step">
                                <h4>🚀 Pokreni PPE_InsertMetadateriumSpecifications</h4>
                                <p>Unosi metapodatke iz mrm tablica u dle tablice</p>
                                <ul>
                                    <li><strong>0</strong> - ako ne želimo updateati postojeće u dle_tables i dle_columns</li>
                                    <li><strong>1</strong> - ako želimo updateati postojeće u dle_tables i dle_columns</li>
                                </ul>
                            </div>

                            <div className="instruction-step">
                                <h4>📜 Napisi skriptu</h4>
                                <p><strong>Lokacija generirane skripte:</strong> 00-default/700_metadata/001_frameworks/20_delta_lake_etl/02_app/id=598/quality/d_instruments/script.py</p>
                                <p><strong>Note:</strong> This script has to be downloaded, properly renamed, placed in Synapse in the appropriate folder according business domain. Additional code and cells have to be added in order to script to work.</p>
                                <p><strong>Place script here:</strong> 020_delta_lake_etl/020_app/030_gold/031_ods/14_quality/d_instruments/d_instruments</p>

                                <h5>Upute za skriptu:</h5>
                                <ul>
                                    <li>Učitaj sve sourceove</li>
                                    <li>Napravi join na temelju sql upita u specki po svim uvjetima</li>
                                    <li>Dodaj uvjet, odnosno kolonu prema uvjetu</li>
                                    <li>Koristi skriptu d_instruments kao referencu</li>
                                </ul>
                            </div>

                            <RawSqlSection
                                title="Populate DQ Tables"
                                showState={showLandingToRawSql}
                                setShowState={setShowLandingToRawSql}
                                generateSql={generateDqTablesSql}
                                instructions="Koristi generirane queries iz scripta NB_PopulateMetadataForNewRDLBeforeMetadaterium"
                            />
                        </div>
                    )}

                    {currentStep === 'silver' && (
                        <div className="wizard-step active">
                            <h2 className="step-title">Silver Configuration</h2>

                            <div className="current-parameters">
                                <h4>Configuration Parameters:</h4>
                                <div className="parameters-grid">
                                    <div><strong>Table Name:</strong> {formData.tableName || 'N/A'}</div>
                                    <div><strong>Companies:</strong> {formData.companies.length > 0 ? formData.companies.join(', ') : '220'}</div>
                                    <div><strong>Owner:</strong> {formData.owner || 'N/A'}</div>
                                    <div><strong>MRM_ID:</strong> {formData.mrmId || 'Not set'}</div>
                                    <div><strong>Initial Date:</strong> {calculateInitialDate()}</div>
                                </div>
                            </div>

                            <div className="instruction-step">
                                <h4>📋 Prerequisites</h4>
                                <ol>
                                    <li>Ensure MRM_ID is set (use "Get Latest MRM_ID" from Raw tab)</li>
                                    <li>MRM specifications should be loaded and staged</li>
                                    <li>Raw pipelines should be configured and tested</li>
                                </ol>
                            </div>

                            <SilverSqlSection
                                title="Silver and Gold Pipeline Configuration"
                                showState={showSilverSql}
                                setShowState={setShowSilverSql}
                                generateSql={generateSilverPipelinesSql}  // Just pass the function
                                sqlType="Silver Configuration"
                            />

                            <div className="instruction-step">
                                <h4>🚀 Post-Configuration Steps</h4>
                                <ol>
                                    <li>Verify pipeline dependencies are correctly set</li>
                                    <li>Test individual silver pipelines</li>
                                    <li>Test gold pipelines after silver completes</li>
                                    <li>Monitor execution logs for any issues</li>
                                </ol>
                            </div>

                            <div className="data-preview">
                                <h4>DLE Data Preview</h4>
                                <div className="data-tables">
                                    <div className="data-table">
                                        <h5>Silver Jobs ({silverTables.length})</h5>
                                        {silverTables.length > 0 ? (
                                            <ul>
                                                {silverTables.slice(0, 5).map((row, idx) => (
                                                    <li key={idx}>
                                                        <div><strong>Job:</strong> {row[0] || 'Unknown job'}</div>
                                                        <div><strong>Table:</strong> {row[2] || 'N/A'}</div>
                                                    </li>
                                                ))}
                                                {silverTables.length > 5 && <li>... and {silverTables.length - 5} more</li>}
                                            </ul>
                                        ) : (
                                            <p>No silver jobs found. Fetch DLE data first.</p>
                                        )}
                                    </div>
                                    <div className="data-table">
                                        <h5>Gold Jobs ({goldTables.length})</h5>
                                        {goldTables.length > 0 ? (
                                            <ul>
                                                {goldTables.slice(0, 5).map((row, idx) => (
                                                    <li key={idx}>
                                                        <div><strong>Job:</strong> {row[0] || 'Unknown job'}</div>
                                                        <div><strong>Table:</strong> {row[2] || 'N/A'}</div>
                                                    </li>
                                                ))}
                                                {goldTables.length > 5 && <li>... and {goldTables.length - 5} more</li>}
                                            </ul>
                                        ) : (
                                            <p>No gold jobs found. Fetch DLE data first.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Other steps would go here */}
                    {currentStep !== 'ingestion' && currentStep !== 'raw' && (
                        <div className="wizard-step active">
                            <h2 className="step-title">{steps.find(s => s.id === currentStep)?.label} Configuration</h2>
                            <p>Configuration for {currentStep} step will be implemented here.</p>
                        </div>
                    )}

                    <div className="wizard-navigation">
                        <button
                            className="btn btn-secondary"
                            onClick={prevStep}
                            disabled={currentStep === 'ingestion' || loading}
                        >
                            ← Previous
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={nextStep}
                            disabled={currentStep === 'gold' || loading}
                        >
                            Next →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}