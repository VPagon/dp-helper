import React, { useState, useEffect } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/PipelineAnalysisPage.css';

function PipelineAnalysisPage() {
    const [environment, setEnvironment] = useState('dev');
    const [pipelines, setPipelines] = useState([]);
    const [selectedPipeline, setSelectedPipeline] = useState(null);
    const [pipelineDetails, setPipelineDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [tableInfoPopup, setTableInfoPopup] = useState(null);
    const [tableDetails, setTableDetails] = useState(null);
    const [tableColumns, setTableColumns] = useState(null);

    // Fetch all pipelines
    const fetchPipelines = async () => {
        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT pipeline_id, pipeline_name, pipeline_short_name, enabled, pipeline_type 
         FROM rep_mda.mda_ocn_pipelines 
         ORDER BY 1 DESC`
            );
            setPipelines(result.rows);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch complete pipeline details
    const fetchPipelineDetails = async (pipelineId) => {
        try {
            setLoading(true);
            setError(null);

            // Get pipeline basic info
            const pipelineResult = await executeQuery(
                environment,
                `SELECT top 1 * FROM rep_mda.mda_ocn_pipelines WHERE pipeline_id = ${pipelineId}`
            );
            console.log('Pipeline Result:', pipelineResult);
            console.log('Pipeline Result:', pipelineResult.rows[0]);

            // Get pipeline parameters
            const paramsResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_ocn_pipeline_parameters WHERE pipeline_id = ${pipelineId}`
            );

            // Get dependencies where this pipeline is the parent
            const dependenciesResult = await executeQuery(
                environment,
                `SELECT d.*, p.pipeline_name as dependant_name 
         FROM rep_mda.mda_ocn_pipeline_dependencies d
         JOIN rep_mda.mda_ocn_pipelines p ON d.dependant_pipeline_id = p.pipeline_id
         WHERE d.pipeline_id = ${pipelineId}`
            );

            // Get dependencies where this pipeline is the dependant
            const dependantResult = await executeQuery(
                environment,
                `SELECT d.*, p.pipeline_name as parent_name 
         FROM rep_mda.mda_ocn_pipeline_dependencies d
         JOIN rep_mda.mda_ocn_pipelines p ON d.pipeline_id = p.pipeline_id
         WHERE d.dependant_pipeline_id = ${pipelineId}`
            );

            // Get execution history
            const executionResult = await executeQuery(
                environment,
                `SELECT TOP 5 * FROM rep_mda.mda_ocn_execution_log 
         WHERE pipeline_id = ${pipelineId} 
         AND extract_date >= DATEADD(DAY, -30, GETDATE())
         ORDER BY 1 DESC`
            );

            // Check if this pipeline is related to data ingestion
            const ingestionResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_data_ingestion 
         WHERE job_name = '${pipelineResult.rows[0][1]}'`
            );

            // Check if this pipeline is related to DLE jobs
            const dleJobsResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_dle_jobs 
         WHERE job_name = '${pipelineResult.rows[0][1]}'`
            );

            console.log('dependencies:', dependenciesResult);
            console.log('dependants:', dependantResult);
            console.log('dleJobsResult:', dleJobsResult);

            setPipelineDetails({
                pipeline: pipelineResult.rows[0],
                parameters: paramsResult.rows,
                dependencies: dependenciesResult.rows,
                dependants: dependantResult.rows,
                executionHistory: executionResult.rows,
                dataIngestion: ingestionResult.rows,
                dleJobs: dleJobsResult.rows
            });

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch dependency tree for a pipeline
    const fetchDependencyTree = async (pipelineId) => {
        try {
            setLoading(true);

            // Recursive CTE to get all upstream dependencies
            const upstreamResult = await executeQuery(
                environment,
                `WITH UpstreamCTE AS (
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, 1 AS level
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
            WHERE d.dependant_pipeline_id = ${pipelineId}
            
            UNION ALL
            
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, u.level + 1
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
            JOIN UpstreamCTE u ON d.dependant_pipeline_id = u.pipeline_id
            WHERE u.level < 5
          )
          SELECT * FROM UpstreamCTE ORDER BY level`
            );

            // Recursive CTE to get all downstream dependencies
            const downstreamResult = await executeQuery(
                environment,
                `WITH DownstreamCTE AS (
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, 1 AS level
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.dependant_pipeline_id
            WHERE d.pipeline_id = ${pipelineId}
            
            UNION ALL
            
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, d.level + 1
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies dep ON p.pipeline_id = dep.dependant_pipeline_id
            JOIN DownstreamCTE d ON dep.pipeline_id = d.pipeline_id
            WHERE d.level < 5
          )
          SELECT * FROM DownstreamCTE ORDER BY level`
            );

            setPipelineDetails(prev => ({
                ...prev,
                upstreamTree: upstreamResult.rows,
                downstreamTree: downstreamResult.rows
            }));
            console.log('PipelineDetails:', pipelineDetails);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPipelines();
    }, [environment]);

    const handlePipelineSelect = async (pipeline) => {
        setSelectedPipeline(pipeline);
        await fetchPipelineDetails(pipeline[0]);
        await fetchDependencyTree(pipeline[0]);
    };

    const filteredPipelines = pipelines.filter(pipeline =>
        pipeline[1].toLowerCase().includes(searchTerm.toLowerCase())
    );

    const fetchTableDetails = async (tableId) => {
        try {
            setLoading(true);
            setError(null);

            console.log('Fetching table details for ID:', tableId);

            // Get table details
            const tableResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_dle_tables WHERE id = ${tableId}`
            );

            console.log('Table result:', tableResult);

            // Get table columns
            const columnsResult = await executeQuery(
                environment,
                `SELECT * FROM rep_mda.mda_dle_columns WHERE dle_tbe_id = ${tableId} ORDER BY position`
            );

            console.log('Columns result:', columnsResult);

            if (tableResult.rows && tableResult.rows.length > 0) {
                setTableDetails(tableResult.rows[0]);
            } else {
                setError('No table found with the specified ID');
            }

            if (columnsResult.rows && columnsResult.rows.length > 0) {
                setTableColumns(columnsResult.rows);
            } else {
                setTableColumns([]);
            }

        } catch (err) {
            console.error('Error fetching table details:', err);
            setError(`Failed to fetch table details: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Handle right-click on table IDs
    // Handle right-click on table IDs
    const handleTableIdRightClick = async (e, tableId, tableType) => {
        e.preventDefault();

        if (!tableId) {
            setError('Table ID is missing');
            return;
        }

        console.log('Right-click on table ID:', tableId, 'Type:', tableType);

        setTableInfoPopup({
            visible: true,
            tableId: tableId,
            tableType: tableType
        });

        // Reset previous data
        setTableDetails(null);
        setTableColumns(null);
        setError(null);

        await fetchTableDetails(tableId);
    };

    // Close table info popup
    const closeTableInfoPopup = () => {
        setTableInfoPopup(null);
        setTableDetails(null);
        setTableColumns(null);
    };

    // Helper function to check if pipeline is enabled (handles both boolean and 0/1 values)
    const isPipelineEnabled = (pipeline) => {
        const enabledValue = pipeline[6];
        return enabledValue === true || enabledValue === 1 || enabledValue === '1';
    };

    const formatJSON = (jsonString) => {
        try {
            const json = JSON.parse(jsonString);
            return JSON.stringify(json, null, 2);
        } catch (e) {
            return jsonString; // Return original if not valid JSON
        }
    };

    return (
        <div className="pipeline-analysis-page">
            <HomeButton />
            <br />
            <h1>Pipeline Analysis</h1>

            <div className="controls">
                <div className="environment-selector">
                    <label>Environment:</label>
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                    >
                        <option value="dev">Development</option>
                        <option value="prod">Production</option>
                    </select>
                </div>

                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search pipelines..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <button onClick={fetchPipelines} disabled={loading}>
                    Refresh
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="content-container">
                {/* Pipeline List */}
                <div className="pipeline-list">
                    <h2>Pipelines</h2>
                    {loading && <div className="loading">Loading pipelines...</div>}
                    <div className="pipeline-items">
                        {filteredPipelines.map((pipeline) => {
                            const isEnabled = pipeline[3]
                            return (
                                <div
                                    key={pipeline[0]}
                                    className={`pipeline-item ${selectedPipeline?.[0] === pipeline[0] ? 'selected' : ''} ${!isEnabled ? 'disabled' : ''}`}
                                    onClick={() => handlePipelineSelect(pipeline)}
                                >
                                    <div className="pipeline-name">{pipeline[1]}</div>
                                    <div className="pipeline-type">{pipeline[4]}</div>
                                    <div className={`pipeline-status ${isEnabled ? 'enabled' : 'disabled'}`}>
                                        {isEnabled ? 'Enabled' : 'Disabled'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Pipeline Details in Rows */}
                <div className="pipeline-details-rows">
                    {selectedPipeline && pipelineDetails ? (
                        <>
                            <h2>Pipeline: {selectedPipeline[1]}</h2>

                            {/* Basic Information Row */}
                            <div className="detail-row">
                                <div className="detail-section full-width">
                                    <h3>Basic Information</h3>
                                    <div className="info-grid">
                                        <div className="info-item">
                                            <strong>Pipeline ID:</strong> {pipelineDetails.pipeline[0]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Status:</strong>
                                            <span className={`status-indicator ${isPipelineEnabled(pipelineDetails.pipeline) ? 'enabled' : 'disabled'}`}>
                                                {isPipelineEnabled(pipelineDetails.pipeline) ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        <div className="info-item">
                                            <strong>Pipeline Type:</strong> {pipelineDetails.pipeline[18]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Schedule Type:</strong> {pipelineDetails.pipeline[4]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Owner:</strong> {pipelineDetails.pipeline[5]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Load Category:</strong> {pipelineDetails.pipeline[19]}
                                        </div>
                                        <div className="info-item">
                                            <strong>Pipeline Priority:</strong> {pipelineDetails.pipeline[20]}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Parameters Row */}
                            {pipelineDetails.parameters.length > 0 && (
                                <div className="detail-row">
                                    <div className="detail-section full-width">
                                        <h3>Parameters ({pipelineDetails.parameters.length})</h3>
                                        <div className="parameters-grid">
                                            {pipelineDetails.parameters.map((param, index) => (
                                                <div key={index} className="parameter-item">
                                                    <div className="parameter-name"><strong>{param[2]}:</strong></div>
                                                    <div className="parameter-value">{param[3]}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DLE Jobs Row - Show if JOB_NAME parameter exists */}
                            {pipelineDetails.parameters.some(param => param[2] === 'JOB_NAME') && (
                                <div className="detail-row">
                                    <div className="detail-section full-width">
                                        <h3>DLE Job Information</h3>
                                        {pipelineDetails.dleJobs.length > 0 ? (
                                            <div className="dle-jobs-container">
                                                {pipelineDetails.dleJobs.map((job, index) => (
                                                    <div key={index} className="job-section">
                                                        <h4>DLE Job: {job[3]}</h4>
                                                        <div className="info-grid">
                                                            <div className="info-item">
                                                                <strong>Job ID:</strong> {job[0]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Target Table ID:</strong>
                                                                <span
                                                                    className="table-id-link"
                                                                    onContextMenu={(e) => handleTableIdRightClick(e, job[1], 'target')}
                                                                    title="Right-click for table details"
                                                                >
                                                                    {job[1]}
                                                                </span>
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Source Table ID:</strong>
                                                                <span
                                                                    className="table-id-link"
                                                                    onContextMenu={(e) => handleTableIdRightClick(e, job[2], 'source')}
                                                                    title="Right-click for table details"
                                                                >
                                                                    {job[2]}
                                                                </span>
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Job Type:</strong> {job[4]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Filter:</strong>
                                                                <div className="script-content">
                                                                    {job[7] || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div className="info-item full-width-item">
                                                                <strong>Script:</strong>
                                                                <div className="script-content">
                                                                    {job[8] || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Load type:</strong> {job[9]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Check Source Deleted Records:</strong> {job[10]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>GLD Delete Non Existing Records:</strong> {job[11]}
                                                            </div>
                                                            <div className="info-item">
                                                                <strong>Active:</strong>
                                                                <span className={`status ${job[20] === 1 ? 'active' : 'inactive'}`}>
                                                                    {job[20] === 1 ? 'Yes' : 'No'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="no-data">No DLE job found for JOB_NAME parameter</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Data Ingestion Row - Show if RUN_ARRAY parameter exists or data ingestion job exists */}
                            {(pipelineDetails.parameters.some(param => param[2] === 'RUN_ARRAY') ||
                                pipelineDetails.dataIngestion.length > 0) && (
                                    <div className="detail-row">
                                        <div className="detail-section full-width">
                                            <h3>Data Ingestion Information</h3>
                                            {pipelineDetails.dataIngestion.length > 0 ? (
                                                <div className="ingestion-container">
                                                    {pipelineDetails.dataIngestion.map((ingestion, index) => (
                                                        <div key={index} className="ingestion-section">
                                                            <h4>Data Ingestion: {ingestion[1]}</h4>
                                                            <div className="ingestion-info-rows">
                                                                <div className="ingestion-row">
                                                                    <strong>Ingestion ID:</strong> {ingestion[0]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Source Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[2])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Connection Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[3])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Copy Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[4])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Sink Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[5])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Copy Activity Settings:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[8])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Calling Entity:</strong> {ingestion[9]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Triggering Entity:</strong> {ingestion[10]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Data Loading Behavior:</strong>
                                                                    <pre className="json-pre">{formatJSON(ingestion[11])}</pre>
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Task ID:</strong> {ingestion[12]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Task Name:</strong> {ingestion[13]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Enabled:</strong> {ingestion[14] ? 'Yes' : 'No'}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>Last Modified:</strong> {ingestion[15]}
                                                                </div>
                                                                <div className="ingestion-row">
                                                                    <strong>User Last Modified:</strong> {ingestion[16]}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : pipelineDetails.parameters.some(param => param[2] === 'RUN_ARRAY') ? (
                                                <p className="no-data">RUN_ARRAY parameter found but no data ingestion job exists</p>
                                            ) : (
                                                <p className="no-data">No data ingestion information available</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                            {/* Dependencies Row */}
                            <div className="detail-row">
                                <div className="detail-section full-width">
                                    <h3>Dependencies</h3>
                                    <div className="dependencies-container">
                                        <div className="dependency-column">
                                            <h4>↑ Downstream Dependencies (Executes Before) ({pipelineDetails.dependencies.length})</h4>
                                            {pipelineDetails.dependencies.length > 0 ? (
                                                <div className="dependency-list">
                                                    {pipelineDetails.dependencies.map((dep, index) => (
                                                        <div key={index} className="dependency-item">
                                                            <div className="dependency-name">{dep[8]}</div>
                                                            <div className="dependency-details">
                                                                ID: {dep[2]} • Lag: {dep[3]}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="no-data">No downstream dependencies</p>
                                            )}
                                        </div>

                                        <div className="dependency-column">
                                            <h4>↓ Upstream Dependencies (Executes After) ({pipelineDetails.dependants.length})</h4>
                                            {pipelineDetails.dependants.length > 0 ? (
                                                <div className="dependency-list">
                                                    {pipelineDetails.dependants.map((dep, index) => (
                                                        <div key={index} className="dependency-item">
                                                            <div className="dependency-name">{dep[8]}</div>
                                                            <div className="dependency-details">
                                                                ID: {dep[1]} • Lag: {dep[3]}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="no-data">No upstream dependencies</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Execution History Row */}
                            <div className="detail-row">
                                <div className="detail-section full-width">
                                    <h3>Recent Executions ({pipelineDetails.executionHistory.length})</h3>
                                    {pipelineDetails.executionHistory.length > 0 ? (
                                        <div className="execution-grid">
                                            {pipelineDetails.executionHistory.map((exec, index) => (
                                                <div key={index} className="execution-item">
                                                    <div className="execution-header">
                                                        <span className={`status status-${exec[3]?.toLowerCase()}`}>
                                                            {exec[3]}
                                                        </span>
                                                        <span className="execution-date">
                                                            {exec[9] ? new Date(exec[10]).toLocaleDateString() : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="execution-details">
                                                        <strong>Extract Date: </strong>{exec[6] ? new Date(exec[6]).toLocaleString() : 'N/A'}    |    <strong>Start Date: </strong>{exec[9] ? new Date(exec[9]).toLocaleString() : 'N/A'}    |    <strong>End Date: </strong>{exec[10] ? new Date(exec[10]).toLocaleString() : 'N/A'}
                                                        {exec[9] && exec[10] && (
                                                            <div className="execution-duration">
                                                                Duration: {(new Date(exec[10]) - new Date(exec[9])) / 60000}min
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="no-data">No execution history found</p>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="no-selection">
                            {selectedPipeline ? 'Loading pipeline details...' : 'Select a pipeline to view details'}
                        </div>
                    )}
                </div>
            </div>
            {/* Table Info Popup */}
            {tableInfoPopup?.visible && (
                <>
                    <div className="popup-overlay" onClick={closeTableInfoPopup} />
                    <div
                        className="table-info-popup"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="popup-header">
                            <h3>Table Details: {tableInfoPopup.tableType.toUpperCase()} Table ID {tableInfoPopup.tableId}</h3>
                            <button className="close-popup-btn" onClick={closeTableInfoPopup}>×</button>
                        </div>

                        {loading ? (
                            <div className="popup-loading">Loading table details...</div>
                        ) : error ? (
                            <div className="popup-error">{error}</div>
                        ) : tableDetails ? (
                            <div className="table-details-content">
                                {/* Table Information */}
                                <div className="table-info-section">
                                    <h4>Table Information</h4>
                                    <div className="table-info-grid">
                                        <div><strong>ID:</strong> {tableDetails[0]}</div>
                                        <div><strong>Zone:</strong> {tableDetails[1] || 'N/A'}</div>
                                        <div><strong>Schema:</strong> {tableDetails[2] || 'N/A'}</div>
                                        <div className="long-content-field">
                                            <strong>Table Name:</strong>
                                            <div className="scrollable-content">
                                                {tableDetails[3] || 'N/A'}
                                            </div>
                                        </div>
                                        <div className="long-content-field">
                                            <strong>Directory:</strong>
                                            <div className="scrollable-content">
                                                {tableDetails[4] || 'N/A'}
                                            </div>
                                        </div>
                                        <div><strong>Alias:</strong> {tableDetails[5] || 'N/A'}</div>
                                        <div><strong>Partition Format:</strong> {tableDetails[6] || 'N/A'}</div>
                                        <div><strong>Table Type:</strong> {tableDetails[7] || 'N/A'}</div>
                                        <div><strong>Active:</strong> {tableDetails[8] ? 'Yes' : 'No'}</div>
                                        <div><strong>Key:</strong> {tableDetails[15] || 'N/A'}</div>
                                    </div>
                                </div>

                                {/* Table Columns */}
                                {tableColumns && tableColumns.length > 0 ? (
                                    <div className="columns-section">
                                        <h4>Columns ({tableColumns.length})</h4>
                                        <div className="columns-table">
                                            <div className="columns-header">
                                                <span>Table ID</span>
                                                <span>Name</span>
                                                <span>Position</span>
                                                <span>Business Key</span>
                                                <span>Is Hash</span>
                                                <span>Is Audit</span>
                                                <span>Is Active</span>
                                                <span>Mapping</span>
                                            </div>
                                            {tableColumns.map((column, index) => (
                                                <div key={index} className="column-row">
                                                    <span>{column[1] || 'N/A'}</span>
                                                    <span>{column[2] || 'N/A'}</span>
                                                    <span>{column[4] || 'N/A'}</span>
                                                    <span>{column[5] ? 'Yes' : 'No'}</span>
                                                    <span>{column[6] ? 'Yes' : 'No'}</span>
                                                    <span>{column[7] ? 'Yes' : 'No'}</span>
                                                    <span>{column[8] ? 'Yes' : 'No'}</span>
                                                    <span>{column[12] || 'N/A'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="no-columns">No columns found for this table</div>
                                )}
                            </div>
                        ) : (
                            <div className="no-table-data">No table details available</div>
                        )}
                    </div>
                </>
            )}

            {/* Close popup when clicking outside */}
            {tableInfoPopup?.visible && (
                <div className="popup-overlay" onClick={closeTableInfoPopup} />
            )}
        </div>
    );
}

export default PipelineAnalysisPage;