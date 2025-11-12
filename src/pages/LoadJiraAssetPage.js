import React, { useState } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/LoadJiraAssetPage.css';

function LoadJiraAssetPage() {
    const [assetName, setAssetName] = useState('');
    const [folderName, setFolderName] = useState('');
    const [environment, setEnvironment] = useState('dev');
    const [releaseName, setReleaseName] = useState(''); // New state for release name
    const [showRestToLandingPopup, setShowRestToLandingPopup] = useState(false);
    const [showParseToRawPopup, setShowParseToRawPopup] = useState(false);
    const [showSilverGoldPopup, setShowSilverGoldPopup] = useState(false);
    const [showDeployMetadataPopup, setShowDeployMetadataPopup] = useState(false);
    const [restToLandingSQL, setRestToLandingSQL] = useState('');
    const [parseToRawSQL, setParseToRawSQL] = useState('');
    const [silverGoldSQL, setSilverGoldSQL] = useState('');
    const [deployMetadataSQL, setDeployMetadataSQL] = useState('');
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [loading, setLoading] = useState(false);

    const generateRestToLandingSQL = () => {
        if (!assetName || !folderName) {
            setError('Please fill all parameters');
            return;
        }

        const oneWeekBefore = new Date();
        oneWeekBefore.setDate(oneWeekBefore.getDate() - 7);
        const dateString = oneWeekBefore.toISOString().split('T')[0];

        const sql = `
-- REST TO LANDING INGESTION JOB
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
  'JIRA_ASSETS_REST_${assetName.toUpperCase().replace(/ /g, '_')}_TO_LANDING',
  '{"jiraAsset":"${assetName}"}',
  '{"DatastoreType": "JiraRestApi", "jiraWorkspaceId":"d23d4df3-f590-4f7f-9353-d680ad9283ac", "authUser":"service.dp.${environment}@rimac-technology.com", "authSecretName":"kvs-jira-api-basic-auth-key"}',
  '{"resultsPerPage":"120", "paginationRange":"RANGE:1:1000:1"}',
  '{"landingFolder":"06_jira/01_rest/${folderName}/year=#year#/month=#month#/day=#day#", "landingFolderShort":"${folderName}", "landingFile": "jira_${assetName.toLowerCase().replace(/ /g, '_')}.json", "rawTableName": ""}',
  NULL,
  NULL,
  NULL,
  'PPE_MdaIngestionTopLevel',
  '["<ANY>"]',
  '{"dataLoadingBehavior": "FullLoad", "parse": false}',
  0,
  'Default',
  1);

-- PIPELINE FOR INGESTION JOB
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
  pipeline_type,
  load_category,
  pipeline_priority)
VALUES (
  'JIRA_ASSETS_REST_${assetName.toUpperCase().replace(/ /g, '_')}_TO_LANDING',
  'JAR_${assetName.toUpperCase().replace(/ /g, '_')}_LZE',
  'Load ${assetName} Jira asset to landing',
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
  '${dateString} 00:00:00.000',
  'METADATA_DRIVEN_INGESTION',
  'standard_load',
  100);

INSERT INTO rep_mda.mda_ocn_pipeline_parameters (
	pipeline_id,
	parameter_name,
	parameter_value,
	parameter_value_last_used) 
VALUES 
	((select pipeline_id from rep_mda.mda_ocn_pipelines where pipeline_name = 'JIRA_ASSETS_REST_${assetName.toUpperCase().replace(/ /g, '_')}_TO_LANDING'),
	'LOG_ORCHESTRATION',
	'true',
	NULL),
	((select pipeline_id from rep_mda.mda_ocn_pipelines where pipeline_name = 'JIRA_ASSETS_REST_${assetName.toUpperCase().replace(/ /g, '_')}_TO_LANDING'),
	'RUN_JOB_ARRAY',
	'["JIRA_ASSETS_REST_${assetName.toUpperCase().replace(/ /g, '_')}_TO_LANDING"]',
	NULL);

    `;

        setRestToLandingSQL(sql);
        setShowRestToLandingPopup(true);
        setError(null);
    };

    const generateParseToRawSQL = () => {
        if (!assetName || !folderName) {
            setError('Please fill all parameters');
            return;
        }

        const oneWeekBefore = new Date();
        oneWeekBefore.setDate(oneWeekBefore.getDate() - 7);
        const dateString = oneWeekBefore.toISOString().split('T')[0];

        const sql = `
INSERT INTO rep_mda.mda_jira_assets (
  asset_name,
  asset_jira_column_key,
  landing_folder,
  raw_folder,
  is_active) 
VALUES (
  '${assetName.toLowerCase().replace(/ /g, '_')}',
  'jira_id',
  '01_landing/06_jira/01_rest/${folderName}',
  '02_raw/06_jira/01_rest/rze_jira${assetName.toLowerCase().replace(/ /g, '')}',
  1);

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
  pipeline_type,
  load_category,
  pipeline_priority) 
VALUES (
  'PPE_MDAINGESTIONJIRAASSETS_${assetName.toUpperCase().replace(/ /g, '_')}',
  'PPE_MDAINGESTIONJIRAASSETS_${assetName.toUpperCase().replace(/ /g, '_')}',
  'Parse Jira Asset ${assetName}',
  'NR',
  'Vilim Pagon',
  1,
  0,
  'BT',
  NULL,
  NULL,
  1,
  NULL,
  NULL,
  '${dateString} 00:00:00.000',
  'CUSTOM',
  'standard_load',
  100);

INSERT INTO rep_mda.mda_ocn_pipeline_parameters (
  pipeline_id,
  parameter_name,
  parameter_value,
  parameter_value_last_used) 
VALUES (
  (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name = 'PPE_MDAINGESTIONJIRAASSETS_${assetName.toUpperCase().replace(/ /g, '_')}'),
  'ASSET_NAME',
  '${assetName.toLowerCase().replace(/ /g, '_')}',
  NULL);

-- Parameter for raw delta loading pipeline
INSERT INTO rep_mda.mda_ocn_pipeline_parameters (
  pipeline_id,
  parameter_name,
  parameter_value,
  parameter_value_last_used) 
VALUES (
  (SELECT pipeline_id FROM rep_mda.mda_ocn_pipelines WHERE pipeline_name = 'PPE_MDAINGESTIONJIRAASSETS_${assetName.toUpperCase().replace(/ /g, '_')}'),
  'PIPELINE_NAME',
  'PPE_MdaIngestionJiraAssets',
  NULL);
    `;

        setParseToRawSQL(sql);
        setShowParseToRawPopup(true);
        setError(null);
    };

    const generateSilverGoldSQL = () => {
        if (!assetName) {
            setError('Please fill Jira Asset Name parameter');
            return;
        }

        const sql = `
-- First check the latest MRM_ID
select * from [rep_mda].[log_mrm_execution] order by 1 desc;

-- Insert new MRM execution record
insert into [rep_mda].[log_mrm_execution] (domain, specification_path, sheet_names, execution_status, email)
values 
  ('06_jira_assets',
  '/700_metadata/001_frameworks/20_delta_lake_etl/01_landing/it/LoadJiraAssets.xlsx',
  '${assetName}',
  'Ready', 
  (select [rep_mda].[f_util_get_user]()));

-- Note: After running the above insert, check the new MRM_ID and use it in the queries below
-- Replace 761 with the actual MRM_ID from the insert above

/*
-- Check for any errors (run after MRM_ID is known)
select * from rep_mda.log_mrm_specification_check
where mrm_id=761
order by log_status, log_type;

select * from rep_mda.mda_mrm_tables
where mrm_id=761;

select * from rep_mda.mda_mrm_jobs
where mrm_id=761;

select * from rep_mda.mda_mrm_columns
where mrm_id=761;
*/
    `;

        setSilverGoldSQL(sql);
        setShowSilverGoldPopup(true);
        setError(null);
    };

    const generateDeployMetadataSQL = () => {
        console.log('generateDeployMetadataSQL called'); // Debug log

        if (!assetName) {
            console.log('Asset name missing'); // Debug log
            setError('Please fill Jira Asset Name parameter');
            return;
        }

        if (!releaseName) {
            console.log('Release name missing'); // Debug log
            setError('Please fill Release Name parameter');
            return;
        }

        try {
            console.log('Starting SQL generation'); // Debug log
            setLoading(true);
            setError(null);

            const assetNameUpper = assetName.toUpperCase().replace(/ /g, '_');
            const assetNameLower = assetName.toLowerCase().replace(/ /g, '_');

            // Fix the string replacement issue
            const bronzeTableName = `BRONZE#R_JIRA_JIRA${assetNameLower.toUpperCase().replace(/_/g, '')}`;

            const sql = `
-- Check latest releases
select * from mda.mda_releases order by 1 desc;

-- Create new release
insert into mda.mda_releases (
  [release_name],
  [responsible_person],
  [status],
  [status_environment]
)
select
  '${releaseName}',
  'Vilim Pagon',
  'Ready',
  'DEV';

-- Insert DLE_TABLES entries
insert into mda.mda_release_entries (
  [release_id],
  [object_type_id],
  [object_identificator_value],
  [additional_action],
  [responsible_person],
  [status]
)
select
  (select id from mda.mda_releases where release_name = '${releaseName}'),
  (select id from mda.mda_deploy_object_types where object_type = 'MDA_DLE_TABLES_ROW'),
  tabs.key_dle_tbe,
  tabs.[additional_action],
  'Vilim Pagon',
  'Ready'
from (
            select '${bronzeTableName}' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'SILVER#S_JIRA_JIRA_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'GOLD#D_JIRA_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
) tabs;

-- Insert DATA_INGESTION entries
insert into mda.mda_release_entries (
  [release_id],
  [object_type_id],
  [object_identificator_value],
  [responsible_person],
  [status],
  [additional_action]
)
select
  (select id from mda.mda_releases where release_name = '${releaseName}'),
  (select id from mda.mda_deploy_object_types where object_type = 'MDA_DATA_INGESTION_ROW'),
  tabs.key_dle_tbe,
  'Vilim Pagon',
  'Ready',
  tabs.[additional_action]
from (
            select 'JIRA_ASSETS_REST_${assetNameUpper}_TO_LANDING' as key_dle_tbe, 'replace' as [additional_action]
) tabs;

-- Insert DLE_JOBS entries
insert into mda.mda_release_entries (
  [release_id],
  [object_type_id],
  [object_identificator_value],
  [additional_action],
  [responsible_person],
  [status]
)
select
  (select id from mda.mda_releases where release_name = '${releaseName}'),
  (select id from mda.mda_deploy_object_types where object_type = 'MDA_DLE_JOBS_ROW'),
  tabs.key_dle_tbe,
  tabs.[additional_action],
  'Vilim Pagon',
  'Ready'
from (
            select 'SLR_jira_jira_${assetNameLower}' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'GLD_d_jira_${assetNameLower}' as key_dle_tbe, 'replace' as [additional_action]
) tabs;

-- Insert OCN_PIPELINES entries
insert into mda.mda_release_entries (
  [release_id],
  [object_type_id],
  [object_identificator_value],
  [additional_action],
  [responsible_person],
  [status]
)
select
  (select id from mda.mda_releases where release_name = '${releaseName}'),
  (select id from mda.mda_deploy_object_types where object_type = 'MDA_OCN_PIPELINES_ROW'),
  tabs.key_dle_tbe,
  tabs.[additional_action],
  'Vilim Pagon',
  'Ready'
from (
            select 'JIRA_ASSETS_REST_${assetNameUpper}_TO_LANDING' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'PPE_MDAINGESTIONJIRAASSETS_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'SLR_JIRA_JIRA_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'GLD_D_JIRA_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
) tabs;

-- Insert OCN_PIPELINE_DEPENDENCIES entries
insert into mda.mda_release_entries (
  [release_id],
  [object_type_id],
  [object_identificator_value],
  [additional_action],
  [responsible_person],
  [status]
)
select
  (select id from mda.mda_releases where release_name = '${releaseName}'),
  (select id from mda.mda_deploy_object_types where object_type = 'MDA_OCN_PIPELINE_DEPENDENCIES_ROW'),
  tabs.key_dle_tbe,
  tabs.[additional_action],
  'Vilim Pagon',
  'Ready'
from (
            select 'DEP_SLR_JIRA_JIRA_${assetNameUpper}_GLD_D_JIRA_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'DEP_PPE_MDAINGESTIONJIRAASSETS_${assetNameUpper}_SLR_JIRA_JIRA_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
  union all select 'DEP_JIRA_ASSETS_REST_${assetNameUpper}_TO_LANDING_PPE_MDAINGESTIONJIRAASSETS_${assetNameUpper}' as key_dle_tbe, 'replace' as [additional_action]
) tabs;

-- Check all inserted entries
select * from mda.mda_release_entries where release_id = (select id from mda.mda_releases where release_name = '${releaseName}') order by 1 desc;
    `;

            console.log('SQL generated successfully'); // Debug log
            setDeployMetadataSQL(sql);
            setShowDeployMetadataPopup(true);
            console.log('Popup should be visible now'); // Debug log
        } catch (err) {
            console.error('Error generating SQL:', err); // Debug log
            setError(`Failed to generate deploy metadata SQL: ${err.message}`);
        } finally {
            console.log('Setting loading to false'); // Debug log
            setLoading(false);
        }
    };

    const executeSQL = async (sql) => {
        try {
            setLoading(true);
            setError(null);
            setSuccess(null);

            const statements = sql.split(';').filter(s => s.trim());
            for (const statement of statements) {
                if (statement.trim()) {
                    await executeQuery(environment, `${statement};`);
                }
            }

            setSuccess('SQL executed successfully');
            setTimeout(() => {
                setSuccess(null);
                setShowRestToLandingPopup(false);
                setShowParseToRawPopup(false);
                setShowSilverGoldPopup(false);
                setShowDeployMetadataPopup(false);
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="load-jira-asset-page">
            <HomeButton />
            <h1>Load Jira Asset</h1>

            <div className="parameters-section">
                <h2>Parameters</h2>
                <div className="form-group">
                    <label>Jira Asset Name:</label>
                    <input
                        type="text"
                        value={assetName}
                        onChange={(e) => setAssetName(e.target.value)}
                        placeholder="e.g., Meeting Room"
                    />
                </div>
                <div className="form-group">
                    <label>Jira Asset Folder Name:</label>
                    <input
                        type="text"
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        placeholder="e.g., 66_meeting_room"
                    />
                </div>
                <div className="form-group">
                    <label>Environment:</label>
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                    >
                        <option value="dev">Development</option>
                        <option value="prod">Production</option>
                    </select>
                </div>
            </div>

            <div className="sql-section">
                <h2>Load Jira Asset from REST to Landing</h2>
                <button onClick={generateRestToLandingSQL}>Generate Query</button>

                {showRestToLandingPopup && (
                    <div className="sql-popup">
                        <div className="sql-popup-content">
                            <h3>Generated SQL</h3>
                            <pre>{restToLandingSQL}</pre>
                            <div className="popup-actions">
                                <button onClick={() => navigator.clipboard.writeText(restToLandingSQL)}>
                                    Copy to Clipboard
                                </button>
                                <button
                                    onClick={() => executeSQL(restToLandingSQL)}
                                    disabled={loading}
                                >
                                    {loading ? 'Executing...' : 'Execute Query'}
                                </button>
                                <button onClick={() => setShowRestToLandingPopup(false)}>
                                    Cancel
                                </button>
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            {success && <div className="success-message">{success}</div>}
                        </div>
                    </div>
                )}
            </div>

            <div className="sql-section">
                <h2>Parse Jira Asset json to raw</h2>
                <button onClick={generateParseToRawSQL}>Generate Query</button>

                {showParseToRawPopup && (
                    <div className="sql-popup">
                        <div className="sql-popup-content">
                            <h3>Generated SQL</h3>
                            <pre>{parseToRawSQL}</pre>
                            <div className="popup-actions">
                                <button onClick={() => navigator.clipboard.writeText(parseToRawSQL)}>
                                    Copy to Clipboard
                                </button>
                                <button
                                    onClick={() => executeSQL(parseToRawSQL)}
                                    disabled={loading}
                                >
                                    {loading ? 'Executing...' : 'Execute Query'}
                                </button>
                                <button onClick={() => setShowParseToRawPopup(false)}>
                                    Cancel
                                </button>
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            {success && <div className="success-message">{success}</div>}
                        </div>
                    </div>
                )}
            </div>

            <div className="sql-section">
                <h2>Create silver and gold job</h2>
                <button onClick={generateSilverGoldSQL}>Generate Query</button>

                {showSilverGoldPopup && (
                    <div className="sql-popup">
                        <div className="sql-popup-content">
                            <h3>Generated SQL</h3>
                            <pre>{silverGoldSQL}</pre>
                            <div className="popup-actions">
                                <button onClick={() => navigator.clipboard.writeText(silverGoldSQL)}>
                                    Copy to Clipboard
                                </button>
                                <button
                                    onClick={() => executeSQL(silverGoldSQL)}
                                    disabled={loading}
                                >
                                    {loading ? 'Executing...' : 'Execute Query'}
                                </button>
                                <button onClick={() => setShowSilverGoldPopup(false)}>
                                    Cancel
                                </button>
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            {success && <div className="success-message">{success}</div>}
                        </div>
                    </div>
                )}
            </div>

            <div className="sql-section">
                <h2>Deploy Metadata</h2>

                {/* New Release Name parameter */}
                <div className="form-group">
                    <label>Release Name:</label>
                    <input
                        type="text"
                        value={releaseName}
                        onChange={(e) => setReleaseName(e.target.value)}
                        placeholder="e.g., RELEASE-0403"
                    />
                </div>

                <button
                    onClick={() => {
                        console.log('Deploy metadata button clicked');
                        generateDeployMetadataSQL();
                    }}
                    disabled={loading}
                >
                    {loading ? 'Generating...' : 'Generate Query'}
                </button>

                {showDeployMetadataPopup && (
                    <div className="sql-popup">
                        <div className="sql-popup-content">
                            <h3>Generated SQL</h3>
                            <pre>{deployMetadataSQL}</pre>
                            <div className="popup-actions">
                                <button onClick={() => navigator.clipboard.writeText(deployMetadataSQL)}>
                                    Copy to Clipboard
                                </button>
                                <button
                                    onClick={() => executeSQL(deployMetadataSQL)}
                                    disabled={loading}
                                >
                                    {loading ? 'Executing...' : 'Execute Query'}
                                </button>
                                <button onClick={() => setShowDeployMetadataPopup(false)}>
                                    Cancel
                                </button>
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            {success && <div className="success-message">{success}</div>}
                        </div>
                    </div>
                )}
            </div>

            <div className="dependencies-section">
                <button className="add-dependencies-btn">
                    Add Dependencies
                </button>
            </div>
        </div>
    );
}

export default LoadJiraAssetPage;