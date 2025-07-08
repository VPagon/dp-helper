// src/pages/ReplicateToBRPage.js
import React, { useState } from 'react';
import { executeQuery } from '../services/sqlService';
import '../styles/pages/ReplicateToBRPage.css';
import HomeButton from '../components/common/HomeButtom';

function ReplicateToBRPage() {
  const [tableName, setTableName] = useState('');
  const [checkResults, setCheckResults] = useState(null);
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkTableExists = async () => {
    try {
      setLoading(true);
      setError(null);
      const results = await executeQuery(
        'prod', // Use production environment for metadata checks
        `SELECT * FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE '%${tableName}%'`
        // `SELECT top 1 * FROM rep_mda.mda_ocn_pipelines`
      );
      console.log(`SELECT * FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE '%${tableName}%'`);
      setCheckResults(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateReplicationSQL = () => {
    if (!tableName) {
      setError('Please enter a table name first');
      return;
    }

    const sql = `
INSERT [rep_mda].[mda_data_ingestion] (
    /*01*/ [job_name],
    /*02*/ [source_object_settings], 
    /*03*/ [source_connection_settings], 
    /*04*/ [source_copy_settings],
    /*05*/ [sink_object_settings],
    /*06*/ [sink_connection_settings],
    /*07*/ [sink_copy_settings],
    /*08*/ [copy_activity_settings],
    /*09*/ [calling_entity_name],
    /*10*/ [triggering_entity_name],
    /*11*/ [data_loading_behavior_settings],
    /*12*/ [task_id],
    /*13*/ [task_name],
    /*14*/ [copy_enabled]
)
VALUES
(
    /*01*/ 'REPLICATION_RAW_R_LN_DBO_${tableName.toUpperCase()}_TO_AZURE_SQL_BR',
    /*02*/
N'{    "schema": "dbo",    "table":  "r_ln_dbo_${tableName.toLowerCase()}_delta"   }',
    /*03*/ 
N'{    "MSSQLServerName": "syn-prod-rmc-dtp-sdc-ondemand.sql.azuresynapse.net",     "MSSQLDatabaseName": "012_raw",    "DatastoreType": "ServerlessRawToAzureSQL"   }',
    /*04*/N'{"SqlReaderQuery":"select * from #schema#.#table# where is_current=1 and is_deleted=0","PartitionOption":"None","PartitionLowerBound":null,"PartitionUpperBound":null,"PartitionColumnName":null,"PartitionNames":null}',
    /*05*/
N'{"schema":"ln_br","table":"${tableName.toLowerCase()}"}', 
    /*06*/ 
N'{"MSSQLServerName":"sql-prod-br-dtp-we.database.windows.net","MSSQLDatabaseName":"sqldb-br-app","DatastoreType":"AzureSQLTable"}',
    /*07*/N'{"PreCopyScript":"\\r\\nIF EXISTS (\\r\\n\\tSELECT 1 FROM INFORMATION_SCHEMA.TABLES\\r\\n\\tWHERE 1 = 1\\r\\n\\t\\tAND TABLE_NAME = ''#table#''\\r\\n\\t\\tAND TABLE_SCHEMA = ''#schema#''\\r\\n) BEGIN\\r\\n    TRUNCATE TABLE #schema#.#table#;\\r\\nEND"}',
    /*08*/
N'{
    "translator":null,
    "encloseColumnNames":"\\"",
    "logFolderPath": "00-default/900_logs/#date_yyyyMMdd#/01_data_ingestion/#pipeline#/replicate_to_dev/#folder_path#"
}',
    /*09*/ 'PPE_MdaIngestionTopLevel',
    /*10*/ N'["<ANY>"]',
    /*11*/ 
N'{
    "dataLoadingBehavior": "Replication"
}',
    /*12*/ 0,
    /*13*/ 'Default',
    /*14*/ 1
);

INSERT INTO rep_mda.mda_rpn_objects (rpn_src_id, table_name, table_schema, table_type, target_table_name, is_active, key_rpn_obj)
SELECT DISTINCT 1, 'r_ln_dbo_${tableName.toLowerCase()}_delta', 'dbo', 'external_table', '${tableName.toLowerCase()}', 1, 'RPN#OBJECT#RAW#R_LN_DBO_${tableName.toUpperCase()}_DELTA' 
FROM [rep_mda].[mda_infor_columns_definition] 
WHERE table_name = '${tableName.toLowerCase()}';

INSERT INTO rep_mda.mda_rpn_object_columns(rpn_obt_id, column_name, ordinal_position, is_nullable, source_data_type, source_character_maximum_length, source_numeric_precision, source_numeric_scale, target_data_type, target_character_maximum_length, target_numeric_precision, target_numeric_scale, is_deleted_from_source, is_replicated, is_active)
SELECT DISTINCT (SELECT id FROM rep_mda.mda_rpn_objects WHERE target_table_name='${tableName.toLowerCase()}'),
name, column_id, 1, datatype, max_length, precision, scale, datatype, max_length, precision, scale, 0, 1, 1
FROM [rep_mda].[mda_infor_columns_definition] 
WHERE table_name='${tableName.toLowerCase()}'
ORDER BY column_id;

-- Add to orchestration
UPDATE rep_mda.mda_ocn_pipeline_parameters 
SET parameter_value=REPLACE(parameter_value,']',', "REPLICATION_RAW_R_LN_DBO_${tableName.toUpperCase()}_TO_AZURE_SQL_BR"]') 
WHERE parameter_id=921;

INSERT INTO rep_mda.mda_ocn_pipelines (pipeline_name, pipeline_short_name, pipeline_description, schedule_type, enabled, is_running, batch_type, metadata_tool_name, metadata_tool_job_pk, multiple_loads, prod_mail_to, test_mail_to, pipeline_type, load_category, pipeline_owner, initial_date)
VALUES ('REPLICATION_RAW_R_LN_DBO_${tableName.toUpperCase()}_TO_AZURE_SQL_BR', 'RPN_RAW_SQL_${tableName.toUpperCase()}', '','D',1,0,'BT',NULL,NULL,1,NULL,NULL,'METADATA_DRIVEN_INGESTION','standard_load', 'Vilim Pagon', '${new Date().toISOString().split('T')[0]} 00:00:00.000');

-- Add dependencies
INSERT INTO rep_mda.mda_ocn_pipeline_dependencies (pipeline_id, dependant_pipeline_id, dependency_lag, key_dep, additional_checks)
VALUES (1834, (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name LIKE '%${tableName.toUpperCase()}%delta%'), 0, 'DEP_REPLICATION_RAW_R_${tableName.toUpperCase()}_TO_AZURE_SQL_BR', NULL);
    `;

    setGeneratedSQL(sql);
  };

  return (
    <div className="replicate-br-page">
      <HomeButton />
      <br/>
      <h1>Replicate Table to BR Database</h1>
      
      <div className="input-section">
        <div className="form-group">
          <label>Table Name to Replicate:</label>
          <input
            type="text"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g., TWHINH226222"
          />
        </div>
        
        <div className="button-group">
          <button 
            onClick={checkTableExists} 
            disabled={loading || !tableName}
          >
            {loading ? 'Checking...' : 'Check Table Exists on DP'}
          </button>
          
          <button 
            onClick={generateReplicationSQL}
            disabled={!tableName}
            className="generate-btn"
          >
            Generate Replication SQL
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {checkResults && (
        <div className="results-section">
          <h3>Table Check Results</h3>
          <div className="results-table">
            <table>
              <thead>
                <tr>
                  {checkResults.columns.map((col, i) => (
                    <th key={i}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checkResults.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {generatedSQL && (
        <div className="sql-section">
          <h3>Generated Replication SQL</h3>
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

export default ReplicateToBRPage;