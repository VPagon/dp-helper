// src/pages/PipelineBranchOutPage.js
import React, { useState, useEffect } from 'react';
import { executeQuery } from '../services/sqlService';
import '../styles/pages/PipelineBranchOutPage.css';
import HomeButton from 'components/common/HomeButtom';

function PipelineBranchOutPage() {
  const [pipelineName, setPipelineName] = useState('');
  const [dependencies, setDependencies] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    pipeline: null,
    logs: []
  });

  const fetchDependencies = async () => {
    if (!pipelineName.trim()) {
      setError('Please enter a pipeline name');
      return;
    }

    setLoading(true);
    setError(null);
    setDependencies(null);

    try {
      // Find the base pipeline
      const pipelineResult = await executeQuery(
        'prod',
        `SELECT pipeline_id, pipeline_name, cast(enabled as varchar) as enabled 
         FROM rep_mda.mda_ocn_pipelines 
         WHERE pipeline_name = '${pipelineName}'`
      );

      if (!pipelineResult.rows || pipelineResult.rows.length === 0) {
        throw new Error(`Pipeline "${pipelineName}" not found`);
      }

      const firstRow = pipelineResult.rows[0];
      const basePipeline = {
        pipeline_id: firstRow[0],
        pipeline_name: firstRow[1],
        enabled: firstRow[2]
      };

      if (!basePipeline.pipeline_id) {
        throw new Error('Could not extract pipeline_id from results');
      }

      // Fetch upstream and downstream dependencies
      const [upstreamResult, downstreamResult] = await Promise.all([
        executeQuery(
          'prod',
          `WITH UpstreamCTE AS (
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, 1 AS level
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
            WHERE d.dependant_pipeline_id = ${basePipeline.pipeline_id}
            
            UNION ALL
            
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, u.level + 1
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
            JOIN UpstreamCTE u ON d.dependant_pipeline_id = u.pipeline_id
            WHERE u.level < 5
          )
          SELECT * FROM UpstreamCTE ORDER BY level`
        ),
        executeQuery(
          'prod',
          `WITH DownstreamCTE AS (
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, 1 AS level
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.dependant_pipeline_id
            WHERE d.pipeline_id = ${basePipeline.pipeline_id}
            
            UNION ALL
            
            SELECT p.pipeline_id, p.pipeline_name, cast(p.enabled as varchar) as enabled, d.level + 1
            FROM rep_mda.mda_ocn_pipelines p
            JOIN rep_mda.mda_ocn_pipeline_dependencies dep ON p.pipeline_id = dep.dependant_pipeline_id
            JOIN DownstreamCTE d ON dep.pipeline_id = d.pipeline_id
            WHERE d.level < 5
          )
          SELECT * FROM DownstreamCTE ORDER BY level`
        )
      ]);

      setDependencies({
        base: basePipeline,
        upstream: upstreamResult.rows,
        downstream: downstreamResult.rows
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipelineLogs = async (pipelineName) => {
  try {
    const result = await executeQuery(
      'prod',
      `SELECT TOP 5 
          log_id,
          pipeline_id,
          pipeline_name,
          pipeline_status,
          extract_date,
          start_date_time,
          end_date_time,
          DATEDIFF(SECOND, start_date_time, end_date_time) AS duration_seconds,
          ocn_tool_batch_id
       FROM rep_mda.mda_ocn_execution_log 
       WHERE pipeline_name = '${pipelineName}'
       ORDER BY start_date_time DESC`
    );
    return result.rows;
  } catch (err) {
    console.error('Error fetching logs:', err);
    return [];
  }
};

  const handleRightClick = async (e, pipeline) => {
    e.preventDefault();
    
    const pipelineData = Array.isArray(pipeline) ? {
      pipeline_id: pipeline[0],
      pipeline_name: pipeline[1],
      enabled: pipeline[2],
      level: pipeline[3]
    } : pipeline;

    const logs = await fetchPipelineLogs(pipelineData.pipeline_name);
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pipeline: pipelineData,
      logs
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ ...contextMenu, visible: false });
  };

  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const renderDependencyList = (pipelines, direction) => {
    if (!pipelines || pipelines.length === 0) {
      return <p>No {direction} dependencies found</p>;
    }

    return (
      <ul className="dependency-list">
        {pipelines.map((pipeline, index) => {
          const pipelineData = Array.isArray(pipeline) ? {
            pipeline_id: pipeline[0],
            pipeline_name: pipeline[1],
            enabled: pipeline[2],
            level: pipeline[3]
          } : pipeline;

          return (
            <li 
              key={index} 
              className={`dependency-item level-${pipelineData.level} ${pipelineData.enabled === '1' ? '' : 'disabled'}`}
              onContextMenu={(e) => handleRightClick(e, pipeline)}
            >
              <div className="dependency-content">
                <span className="pipeline-name">{pipelineData.pipeline_name || 'Unknown Pipeline'}</span>
                <span className="pipeline-id">ID: {pipelineData.pipeline_id || 'N/A'}</span>
                <span className="pipeline-level">Level: {pipelineData.level}</span>
                <span className="pipeline-status">
                  {pipelineData.enabled === '1' ? '✓ Enabled' : '✗ Disabled'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="pipeline-branch-out">
      <HomeButton />
      <h1>Pipeline Branch Out</h1>
      
      <div className="input-section">
        <div className="form-group">
          <label>Pipeline Name:</label>
          <input
            type="text"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            placeholder="Enter exact pipeline name"
          />
        </div>
        
        <button onClick={fetchDependencies} disabled={loading}>
          {loading ? 'Loading...' : 'Show Dependencies'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {dependencies && (
        <div className="dependency-view">
          <div className="dependency-column downstream">
            <h3>Downstream Dependencies (Executes Before)</h3>
            {renderDependencyList(dependencies.downstream, 'downstream')}
          </div>

          <div className="base-pipeline">
            <h3>Selected Pipeline</h3>
            <div 
              className={`pipeline-card ${dependencies.base.enabled === '1' ? '' : 'disabled'}`}
              onContextMenu={(e) => handleRightClick(e, dependencies.base)}
            >
              <div className="pipeline-name">{dependencies.base.pipeline_name}</div>
              <div className="pipeline-details">
                <div>ID: {dependencies.base.pipeline_id}</div>
                <div>Status: {dependencies.base.enabled === '1' ? 'Enabled' : 'Disabled'}</div>
              </div>
            </div>
          </div>

          <div className="dependency-column upstream">
            <h3>Upstream Dependencies (Executes After)</h3>
            {renderDependencyList(dependencies.upstream, 'upstream')}
          </div>
        </div>
      )}

      {contextMenu.visible && (
        <div 
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${Math.min(contextMenu.x, window.innerWidth - 650)}px`,
            top: `${Math.min(contextMenu.y, window.innerHeight - 400)}px`,
            zIndex: 1000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            <h4>Execution Logs: {contextMenu.pipeline.pipeline_name}</h4>
            <button onClick={closeContextMenu} className="close-btn">×</button>
          </div>
          <div className="log-table-container">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>Pipe ID</th>
                  <th>Pipe Name</th>
                  <th>Extract Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Batch ID</th>
                </tr>
              </thead>
              <tbody>
                {contextMenu.logs.map((log) => {
                  const logData = Array.isArray(log) ? {
                    log_id: log[0],
                    pipeline_id: log[1],
                    pipeline_name: log[2],
                    pipeline_status: log[3],
                    extract_date: log[4],
                    start_date_time: log[5],
                    end_date_time: log[6],
                    duration_seconds: log[7],
                    ocn_tool_batch_id: log[8]
                  } : log;

                  const duration = new Date(logData.duration_seconds * 1000)
                    .toISOString()
                    .substr(11, 8);

                  return (
                    <tr key={logData.log_id}>
                      <td>{logData.log_id}</td>
                      <td>{logData.pipeline_id}</td>
                      <td>{logData.pipeline_name}</td>
                      <td>{logData.extract_date}</td>
                      <td>{logData.start_date_time}</td>
                      <td>{logData.end_date_time}</td>
                      <td>{duration}</td>
                      <td className={`status-${logData.pipeline_status}`}>
                        {logData.pipeline_status}
                      </td>
                      <td>{logData.ocn_tool_batch_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default PipelineBranchOutPage;