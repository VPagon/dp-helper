// src/pages/LoadInforTablePage.js
import React, { useState } from 'react';
import '../styles/pages/LoadInforTablePage.css';
import HomeButton from 'components/common/HomeButtom';

function LoadInforTablePage() {
  const [tableName, setTableName] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [loading, setLoading] = useState(false);

  const generateInserts = () => {
    setLoading(true);
    
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const initialDate = new Date();
    initialDate.setMonth(initialDate.getMonth() - 4); // 4 months ago
    const initialDateStr = initialDate.toISOString().slice(0, 19).replace('T', ' ');
    
    const sql = `
-- Pipeline Inserts
INSERT INTO rep_mda.mda_ocn_pipelines (
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
    'MS_SQL_CDC_INFOR_DBO_${tableName.toUpperCase()}_TO_BRONZE_LANDING_ZONE',
    'CDC_${tableName.toUpperCase()}_LNG',
    'Load table ${tableName.toUpperCase()} using SQL Server CDC mechanism',
    'D',
    'Vilim Pagon',
    1,
    0,
    'BT',
    NULL,
    NULL,
    1,
    NULL,
    NULL,
    '${initialDateStr}.000',
    '${today}.000',
    'METADATA_DRIVEN_INGESTION',
    'standard_load',
    100);

INSERT INTO rep_mda.mda_ocn_pipelines (
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
    'RDL_R_LN_DBO_${tableName.toUpperCase()}_DELTA',
    'RDL_R_LN_DBO_${tableName.toUpperCase()}_DELTA',
    'Load table R_LN_DBO_${tableName.toUpperCase()}_DELTA using Raw Delta Framework',
    'D',
    'Vilim Pagon',
    1,
    0,
    'BT',
    NULL,
    NULL,
    1,
    NULL,
    NULL,
    '${initialDateStr}.000',
    '${today}.000',
    'LOAD_RAW_DELTA',
    'standard_load',
    100);

-- Pipeline Parameters
INSERT INTO rep_mda.mda_ocn_pipeline_parameters (
    pipeline_id,
    parameter_name,
    parameter_value,
    parameter_value_last_used) 
VALUES (
    (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE '%RDL_R_LN_DBO_${tableName.toUpperCase()}_DELTA%'),
    'TABLE_NAME',
    'BRONZE#R_LN_DBO_${tableName.toUpperCase()}_DELTA',
    NULL);

-- Data Ingestion
INSERT INTO rep_mda.mda_data_ingestion (
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
    'MS_SQL_CDC_INFOR_DBO_${tableName.toUpperCase()}_TO_BRONZE_LANDING_ZONE',
    '{"schema":"dbo","table":"${tableName.toLowerCase()}"}',
    '{"SourceConnectionAlias":"infor","LinkedServiceName":"LS_GEN_SHIR_SQLServerWindowsAuth","MSSQLServerName":"INFORPRODDB\\INFORPROD","MSSQLDatabaseName":"infordb","DatastoreType":"RimacOnPremSQLServerTableCdc"}',
    '{"PartitionOption":"None","PartitionNames":null}',
    '{"fileName":"#schema#.#table#.snappy.parquet","folderPath":"01_#source#\\/01_#schema#\\/04_parquet\\/lze_#table#\\/#subfolder#\\/year=#year#\\/month=#month#\\/day=#day#","fileSystem":"01-bronze\\/01_landing"}',
    NULL,
    NULL,
    '{"logFolderPath":"00-default\\/900_logs\\/#date_yyyyMMdd#\\/01_data_ingestion\\/#pipeline#\\/load_sql_cdc\\/#folder_path#"}',
    'PPE_MdaIngestionTopLevel',
    '["Sandbox","Manual","TGR_Scheduled3AM","<ANY>"]',
    '{"dataLoadingBehavior":"DeltaLoad","watermarkColumnStartValue":"${today}"}',
    15,
    'Default',
    1);

-- RDL Tables
INSERT INTO rep_mda.mda_rdl_tables (
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
    'r_ln_dbo_${tableName.toLowerCase()}_delta',
    '/01_landing/01_infor/01_dbo/04_parquet/lze_${tableName.toLowerCase()}',
    '/02_raw/01_infor/01_dbo/rze_${tableName.toLowerCase()}_delta',
    'r_ln_dbo_${tableName.toLowerCase()}_delta',
    'CHECK FOR PRIMARY KEY ON INFOR',  -- Manual check required
    '{}/year={}/month={}/day={}',
    NULL,
    1,
    '${today}.000',
    'BRONZE#R_LN_DBO_${tableName.toUpperCase()}_DELTA');

-- Pipeline Dependencies
INSERT INTO rep_mda.mda_ocn_pipeline_dependencies (
    pipeline_id,
    dependant_pipeline_id,
    dependency_lag,
    key_dep,
    additional_checks) 
VALUES (
    (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE 'RDL_R_LN_DBO_${tableName.toUpperCase()}_DELTA'),
    (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE 'MS_SQL_CDC_INFOR_DBO_${tableName.toUpperCase()}_TO_BRONZE_LANDING_ZONE'),
    0,
    'DEP_MS_SQL_CDC_INFOR_DBO_${tableName.toUpperCase()}_TO_BRONZE_LANDING_ZONE_RDL_R_LN_DBO_${tableName.toUpperCase()}_DELTA',
    'CHECK_DEPENDENCY_ROWCOUNT');
`;

    setGeneratedSQL(sql);
    setLoading(false);
  };

  return (
    <div className="load-infor-page">
      <HomeButton />
      <h1>Load Infor Table Configuration</h1>
      
      <div className="input-section">
        <div className="form-group">
          <label>Infor Table Name:</label>
          <input
            type="text"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g., TWHINH226222"
          />
        </div>
        
        <button 
          onClick={generateInserts}
          disabled={loading || !tableName}
        >
          {loading ? 'Generating...' : 'Generate SQL Inserts'}
        </button>
      </div>

      {generatedSQL && (
        <div className="sql-section">
          <h3>Generated SQL Inserts</h3>
          <pre>{generatedSQL}</pre>
          <button 
            onClick={() => navigator.clipboard.writeText(generatedSQL)}
            className="copy-btn"
          >
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}

export default LoadInforTablePage;