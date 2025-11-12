import React, { useState, useEffect } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/AutoDeployMetadata.css';

function AutoDeployMetadata() {
  const [environment, setEnvironment] = useState('dev');
  const [pipelines, setPipelines] = useState([]);
  const [selectedPipelines, setSelectedPipelines] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [entities, setEntities] = useState([]);
  const [releaseName, setReleaseName] = useState('');
  const [autoDependencies, setAutoDependencies] = useState(false);
  const [dependencyTree, setDependencyTree] = useState([]);
  const [customEntity, setCustomEntity] = useState({ type: '', identifier: '' });
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [showSQLPopup, setShowSQLPopup] = useState(false);

  // Entity types and their identifiers
  const entityTypes = [
    { type: 'MDA_DLE_TABLES_ROW', identifier: 'key_dle_tbe', table: 'rep_mda.mda_dle_tables' },
    { type: 'MDA_DATA_INGESTION_ROW', identifier: 'job_name', table: 'rep_mda.mda_data_ingestion' },
    { type: 'MDA_EXTERNAL_FILES_ROW', identifier: 'key_external_file', table: 'rep_mda.mda_external_files' },
    { type: 'MDA_DLE_JOBS_ROW', identifier: 'job_name', table: 'rep_mda.mda_dle_jobs' },
    { type: 'MDA_OCN_PIPELINES_ROW', identifier: 'pipeline_name', table: 'rep_mda.mda_ocn_pipelines' },
    { type: 'MDA_OCN_PIPELINE_DEPENDENCIES_ROW', identifier: 'key_dep', table: 'rep_mda.mda_ocn_pipeline_dependencies' },
    { type: 'MDA_DLE_ACLS_ROW', identifier: 'key_acl', table: 'rep_mda.mda_dle_acls' },
    { type: 'MDA_EMAILS_ROW', identifier: 'key_email', table: 'rep_mda.mda_emails' },
    { type: 'MDA_DATA_APIS_ROW', identifier: 'key_api', table: 'rep_mda.mda_data_apis' },
    { type: 'MDA_RDL_TABLES_ROW', identifier: 'key_rdl_tbe', table: 'rep_mda.mda_rdl_tables' },
    { type: 'MDA_DQ_TABLES_ROW', identifier: 'table_name', table: 'rep_mda.mda_dq_tables' },
    { type: 'MDA_DQ_DUPLICATES_ROW', identifier: 'key_dq_dup', table: 'rep_mda.mda_dq_duplicates' },
    { type: 'MDA_DQ_COMPARE_TABLES_ROW', identifier: 'key_dq_cmp', table: 'rep_mda.mda_dq_compare_tables' },
    { type: 'MDA_DQ_CUSTOM_RULES_ROW', identifier: 'rule_name', table: 'rep_mda.mda_dq_custom_rules' },
    { type: 'MDA_DQ_REFERENTIAL_INTEGRITIES_ROW', identifier: 'key_dq_ref', table: 'rep_mda.mda_dq_referential_integrities' },
    { type: 'MDA_JIRA_TEMPLATES_ROW', identifier: 'template_name', table: 'rep_mda.mda_jira_templates' },
    { type: 'MDA_DQ_JIRA_TICKETS_ROW', identifier: 'key_dq_jtt', table: 'rep_mda.mda_dq_jira_tickets' },
    { type: 'MDA_RPN_OBJECTS_ROW', identifier: 'key_rpn_obj', table: 'rep_mda.mda_rpn_objects' }
  ];

  // Fetch available pipelines
  const fetchPipelines = async () => {
    try {
      setLoading(true);
      const result = await executeQuery(
        'dev',
        `SELECT pipeline_id, pipeline_name 
         FROM rep_mda.mda_ocn_pipelines 
         ORDER BY pipeline_name`
      );
      setPipelines(result.rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate next release name
  const generateReleaseName = async () => {
    try {
      const result = await executeQuery(
        'deploy',
        `SELECT MAX(release_name) as last_release 
         FROM mda.mda_releases 
         WHERE release_name LIKE 'RELEASE-%'`
      );

      const lastRelease = result.rows[0]?.[0];
      if (lastRelease) {
        const match = lastRelease.match(/RELEASE-(\d+)/);
        if (match) {
          const nextNumber = parseInt(match[1]) + 1;
          setReleaseName(`RELEASE-${nextNumber.toString().padStart(4, '0')}`);
          return;
        }
      }
      setReleaseName('RELEASE-0001');
    } catch (err) {
      setError(`Failed to generate release name: ${err.message}`);
      setReleaseName('RELEASE-0001');
    }
  };

  // Find dependency tree for a pipeline
  const findDependencyTree = async (pipelineId) => {
    try {
      // Get upstream and downstream dependencies
      const [upstreamResult, downstreamResult] = await Promise.all([
        // Upstream dependencies (pipelines that this one depends on)
        executeQuery(
          'dev',
          `WITH UpstreamCTE AS (
          SELECT p.pipeline_id, p.pipeline_name, 1 AS level
          FROM rep_mda.mda_ocn_pipelines p
          JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
          WHERE d.dependant_pipeline_id = ${pipelineId}
          
          UNION ALL
          
          SELECT p.pipeline_id, p.pipeline_name, u.level + 1
          FROM rep_mda.mda_ocn_pipelines p
          JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
          JOIN UpstreamCTE u ON d.dependant_pipeline_id = u.pipeline_id
          WHERE u.level < 10
        )
        SELECT DISTINCT pipeline_id, pipeline_name FROM UpstreamCTE`
        ),

        // Downstream dependencies (pipelines that depend on this one)
        executeQuery(
          'dev',
          `WITH DownstreamCTE AS (
          SELECT p.pipeline_id, p.pipeline_name, 1 AS level
          FROM rep_mda.mda_ocn_pipelines p
          JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.dependant_pipeline_id
          WHERE d.pipeline_id = ${pipelineId}
          
          UNION ALL
          
          SELECT p.pipeline_id, p.pipeline_name, d.level + 1
          FROM rep_mda.mda_ocn_pipelines p
          JOIN rep_mda.mda_ocn_pipeline_dependencies dep ON p.pipeline_id = dep.dependant_pipeline_id
          JOIN DownstreamCTE d ON dep.pipeline_id = d.pipeline_id
          WHERE d.level < 10
        )
        SELECT DISTINCT pipeline_id, pipeline_name FROM DownstreamCTE`
        )
      ]);

      // Combine and remove duplicates
      const allDependencies = [
        ...upstreamResult.rows,
        ...downstreamResult.rows
      ].filter((dep, index, self) =>
        index === self.findIndex(d => d[0] === dep[0])
      );

      return allDependencies;
    } catch (err) {
      setError(`Failed to fetch dependency tree: ${err.message}`);
      return [];
    }
  };

  // Handle auto selection of dependencies
  const handleAutoSelectDependencies = async () => {
    if (selectedPipelines.length !== 1) {
      setError('Please select exactly one pipeline for auto dependency selection');
      return;
    }

    try {
      setLoading(true);
      const pipelineId = selectedPipelines[0][0];
      const dependencies = await findDependencyTree(pipelineId);

      // Add all dependencies to selected pipelines
      const allPipelines = [...selectedPipelines, ...dependencies.filter(dep =>
        !selectedPipelines.some(p => p[0] === dep[0])
      )];

      setSelectedPipelines(allPipelines);
      setDependencyTree(dependencies);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Find metadata entities for selected pipelines
  const findMetadata = async () => {
    if (selectedPipelines.length === 0) {
      setError('Please select at least one pipeline');
      return;
    }

    try {
      setLoading(true);
      const pipelineNames = selectedPipelines.map(p => `'${p[1]}'`).join(',');
      const pipelineIds = selectedPipelines.map(p => p[0]).join(',');

      // Build queries for different entity types
      const queries = [
        // MDA_OCN_PIPELINES_ROW
        `SELECT 'MDA_OCN_PIPELINES_ROW' as entity_type, pipeline_name as identifier
       FROM rep_mda.mda_ocn_pipelines 
       WHERE pipeline_name IN (${pipelineNames})`,

        // MDA_DATA_INGESTION_ROW
        `SELECT 'MDA_DATA_INGESTION_ROW' as entity_type, job_name as identifier
       FROM rep_mda.mda_data_ingestion 
       WHERE job_name IN (${pipelineNames})`,

        // MDA_DLE_JOBS_ROW
        `SELECT 'MDA_DLE_JOBS_ROW' as entity_type, job_name as identifier
       FROM rep_mda.mda_dle_jobs 
       WHERE job_name IN (${pipelineNames})`,

        // MDA_OCN_PIPELINE_DEPENDENCIES_ROW
        `SELECT 'MDA_OCN_PIPELINE_DEPENDENCIES_ROW' as entity_type, key_dep as identifier
       FROM rep_mda.mda_ocn_pipeline_dependencies 
       WHERE pipeline_id IN (${pipelineIds}) OR dependant_pipeline_id IN (${pipelineIds})`,
      ];

      // Execute basic queries first
      let allEntities = [];

      for (const query of queries) {
        try {
          const result = await executeQuery('dev', query);
          const entities = result.rows.map(row => ({
            type: row[0],
            identifier: row[1],
            additional_action: null,
            selected: true
          }));
          allEntities = [...allEntities, ...entities];
        } catch (err) {
          console.warn(`Query failed: ${query}`, err);
        }
      }

      // Now find DLE tables from DLE jobs
      try {
        const dleTablesResult = await executeQuery(
          'dev',
          `SELECT DISTINCT 'MDA_DLE_TABLES_ROW' as entity_type, key_dle_tbe as identifier
         FROM rep_mda.mda_dle_tables 
         WHERE id IN (
           SELECT tgt_dle_tbe_id FROM rep_mda.mda_dle_jobs 
            WHERE job_name IN (select parameter_value from rep_mda.mda_ocn_pipeline_parameters 
                where pipeline_id IN (select pipeline_id from rep_mda.mda_ocn_pipelines 
                    where pipeline_id IN (${pipelineIds})))
           UNION
           SELECT src_dle_tbe_id FROM rep_mda.mda_dle_jobs 
            WHERE job_name IN (select parameter_value from rep_mda.mda_ocn_pipeline_parameters 
                where pipeline_id IN (select pipeline_id from rep_mda.mda_ocn_pipelines 
                    where pipeline_id IN (${pipelineIds})))
         )`
        );

        const dleTableEntities = dleTablesResult.rows.map(row => ({
          type: row[0],
          identifier: row[1],
          additional_action: null,
          selected: true
        }));
        console.log('DLE Table Entities:', dleTableEntities);
        allEntities = [...allEntities, ...dleTableEntities];

        // If we found DLE tables, look for related entities
        if (dleTableEntities.length > 0) {
          const dleTableKeys = dleTableEntities.map(e => `'${e.identifier}'`).join(',');

          // MDA_DQ_TABLES_ROW
          const dqTablesResult = await executeQuery(
            'dev',
            `SELECT 'MDA_RPN_OBJECTS_ROW' as entity_type, key_rpn_obj as identifier
           FROM rep_mda.mda_rpn_objects 
           WHERE table_name IN (
             SELECT table_name FROM rep_mda.mda_dle_tables WHERE id IN (SELECT tgt_dle_tbe_id FROM rep_mda.mda_dle_jobs 
            WHERE job_name IN (select parameter_value from rep_mda.mda_ocn_pipeline_parameters 
                where pipeline_id IN (select pipeline_id from rep_mda.mda_ocn_pipelines 
                    where pipeline_id IN (${pipelineIds})))
           ))`
          );
          console.log('DQ Tables Result:', dqTablesResult);

          const dqTableEntities = dqTablesResult.rows.map(row => ({
            type: row[0],
            identifier: row[1],
            additional_action: null,
            selected: true
          }));
          allEntities = [...allEntities, ...dqTableEntities];

          // If we found DQ tables, look for related entities
          if (dqTableEntities.length > 0) {
            const dqTableIds = dqTableEntities.map(e => {
              const match = e.identifier.match(/\d+$/); // Extract ID from table name if needed
              return match ? match[0] : null;
            }).filter(id => id).join(',');

            if (dqTableIds) {
              // MDA_DQ_COMPARE_TABLES_ROW

              console.log('DQ Compare Query:', `SELECT 'MDA_DQ_COMPARE_TABLES_ROW' as entity_type, key_dq_cmp as identifier
               FROM rep_mda.mda_dq_compare_tables 
               WHERE dq_tbe_id IN (select id from rep_mda.mda_dq_tables where key_dq_cmp in (${dqTableIds})) OR dq_tbe_id_referential IN (select id from rep_mda.mda_dq_tables where key_dq_cmp in (${dqTableIds}))`);

              const dqCompareResult = await executeQuery(
                'dev',
                `SELECT 'MDA_DQ_COMPARE_TABLES_ROW' as entity_type, key_dq_cmp as identifier
               FROM rep_mda.mda_dq_compare_tables 
               WHERE dq_tbe_id IN (select id from rep_mda.mda_dq_tables where key_dq_cmp in (${dqTableIds})) OR dq_tbe_id_referential IN (select id from rep_mda.mda_dq_tables where key_dq_cmp in (${dqTableIds}))`
              );

              const dqCompareEntities = dqCompareResult.rows.map(row => ({
                type: row[0],
                identifier: row[1],
                additional_action: null,
                selected: true
              }));
              allEntities = [...allEntities, ...dqCompareEntities];

              // MDA_DQ_REFERENTIAL_INTEGRITIES_ROW
              const dqRefIntegrityResult = await executeQuery(
                'dev',
                `SELECT 'MDA_DQ_REFERENTIAL_INTEGRITIES_ROW' as entity_type, key_dq_ref as identifier
               FROM rep_mda.mda_dq_referential_integrities 
               WHERE dq_tbe_id IN (${dqTableIds}) OR dq_tbe_id_lookup IN (${dqTableIds})`
              );

              const dqRefIntegrityEntities = dqRefIntegrityResult.rows.map(row => ({
                type: row[0],
                identifier: row[1],
                additional_action: null,
                selected: true
              }));
              allEntities = [...allEntities, ...dqRefIntegrityEntities];

              // MDA_DQ_CUSTOM_RULES_ROW
              const dqCustomRulesResult = await executeQuery(
                'dev',
                `SELECT 'MDA_DQ_CUSTOM_RULES_ROW' as entity_type, rule_name as identifier
               FROM rep_mda.mda_dq_custom_rules 
               WHERE dq_tbe_id IN (${dqTableIds})`
              );

              const dqCustomRulesEntities = dqCustomRulesResult.rows.map(row => ({
                type: row[0],
                identifier: row[1],
                additional_action: null,
                selected: true
              }));
              allEntities = [...allEntities, ...dqCustomRulesEntities];
            }
          }

          // MDA_RPN_OBJECTS_ROW
          const rpnObjectsResult = await executeQuery(
            'dev',
            `SELECT 'MDA_RPN_OBJECTS_ROW' as entity_type, key_rpn_obj as identifier
           FROM rep_mda.mda_rpn_objects 
           WHERE table_name IN (
             SELECT table_name FROM rep_mda.mda_dle_tables WHERE key_dle_tbe IN (${dleTableKeys})
           )`
          );

          const rpnObjectsEntities = rpnObjectsResult.rows.map(row => ({
            type: row[0],
            identifier: row[1],
            additional_action: null,
            selected: true
          }));
          allEntities = [...allEntities, ...rpnObjectsEntities];
        }
      } catch (err) {
        console.warn('Error finding related entities:', err);
      }

      // Remove duplicates
      const uniqueEntities = allEntities.filter((entity, index, self) =>
        index === self.findIndex(e => e.type === entity.type && e.identifier === entity.identifier)
      );

      setEntities(uniqueEntities);
    } catch (err) {
      setError(err.message);
      console.error("Error finding metadata:", err);
    } finally {
      setLoading(false);
    }
  };

  // Check if custom entity exists
  const checkCustomEntity = async () => {
    if (!customEntity.type || !customEntity.identifier) {
      setError('Please specify both entity type and identifier');
      return;
    }

    try {
      setLoading(true);
      const entityConfig = entityTypes.find(e => e.type === customEntity.type);
      if (!entityConfig) {
        setError('Invalid entity type');
        return;
      }

      const result = await executeQuery(
        'dev',
        `SELECT COUNT(*) as count 
       FROM ${entityConfig.table} 
       WHERE ${entityConfig.identifier} = '${customEntity.identifier}'`
      );

      if (result.rows[0][0] > 0) {
        setError(null);
        // Don't add automatically, just show success message
        alert('Custom entity found successfully! You can now add it manually if needed.');
      } else {
        setError('Custom entity not found in the database');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add a function to manually add the custom entity
  const addCustomEntity = () => {
    if (!customEntity.type || !customEntity.identifier) {
      setError('Please specify both entity type and identifier');
      return;
    }

    const newEntity = {
      type: customEntity.type,
      identifier: customEntity.identifier,
      additional_action: null,
      selected: true
    };

    setEntities([...entities, newEntity]);
    setCustomEntity({ type: '', identifier: '' }); // Reset form
  };

  // Generate deploy SQL
  const generateDeploySQL = async () => {
    if (entities.length === 0) {
      setError('No entities found to deploy');
      return;
    }

    try {
      setLoading(true);

      // Group entities by type
      const entitiesByType = {};
      entities.forEach(entity => {
        if (entity.selected) {
          if (!entitiesByType[entity.type]) {
            entitiesByType[entity.type] = [];
          }
          entitiesByType[entity.type].push({
            identifier: entity.identifier,
            additional_action: entity.additional_action
          });
        }
      });

      let sql = `-- Create release entry
INSERT INTO mda.mda_releases (
  [release_name],
  [responsible_person],
  [status],
  [status_environment]
)
SELECT
  '${releaseName}',
  'Vilim Pagon',
  'Ready',
  'DEV';\n\n`;

      // Generate SQL for each entity type
      for (const [entityType, items] of Object.entries(entitiesByType)) {
        if (items.length > 0) {
          const values = items.map(item =>
            `SELECT '${item.identifier}' as identifier, ${item.additional_action ? `'${item.additional_action}'` : 'NULL'} as additional_action`
          ).join('\n  UNION ALL\n  ');

          sql += `-- ${entityType}
INSERT INTO mda.mda_release_entries (
  [release_id],
  [object_type_id],
  [object_identificator_value],
  [additional_action],
  [responsible_person],
  [status]
)
SELECT
  (SELECT id FROM mda.mda_releases WHERE release_name = '${releaseName}'),
  (SELECT id FROM mda.mda_deploy_object_types WHERE object_type = '${entityType}'),
  tabs.identifier,
  tabs.additional_action,
  'Vilim Pagon',
  'Ready'
FROM (
  ${values}
) tabs;\n\n`;
        }
      }

      setGeneratedSQL(sql);
      setShowSQLPopup(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Execute generated SQL
  const executeDeploySQL = async () => {
    try {
      setLoading(true);
      await executeQuery('deploy', generatedSQL);
      setError(null);
      setShowSQLPopup(false);
      // Show success message or refresh data
    } catch (err) {
      setError(`Failed to execute SQL: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipelines();
    generateReleaseName();
  }, []);

  const filteredPipelines = pipelines.filter(pipeline =>
    pipeline[1].toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePipelineSelect = (pipeline) => {
    if (selectedPipelines.some(p => p[0] === pipeline[0])) {
      setSelectedPipelines(selectedPipelines.filter(p => p[0] !== pipeline[0]));
    } else {
      setSelectedPipelines([...selectedPipelines, pipeline]);
    }
  };

  return (
    <div className="auto-deploy-metadata">
      <HomeButton />
      <br />
      <h1>Auto Deploy Metadata</h1>

      <div className="environment-info">
        <p><strong>Note:</strong> Metadata search is always performed on DEV environment</p>
        <p><strong>TO-DO:</strong> Add support for adding DQ entities to deploy</p>
      </div>

      {/* Pipeline Selection */}
      <div className="section">
        <h2>1. Select Pipelines</h2>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search pipelines..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="auto-dependency">
          <label>
            <input
              type="checkbox"
              checked={autoDependencies}
              onChange={(e) => setAutoDependencies(e.target.checked)}
            />
            Auto-select dependency tree
          </label>
          {autoDependencies && selectedPipelines.length === 1 && (
            <button onClick={handleAutoSelectDependencies} disabled={loading}>
              Find Dependencies
            </button>
          )}
        </div>

        <br />

        <div className="pipelines-list">
          {filteredPipelines.map((pipeline) => (
            <div
              key={pipeline[0]}
              className={`pipeline-item ${selectedPipelines.some(p => p[0] === pipeline[0]) ? 'selected' : ''}`}
              onClick={() => handlePipelineSelect(pipeline)}
            >
              <div className="pipeline-info">
                {pipeline[1]}
                {dependencyTree.some(dep => dep[0] === pipeline[0]) && (
                  <span className="dependency-badge">Dependency</span>
                )}
              </div>
              {selectedPipelines.some(p => p[0] === pipeline[0]) && (
                <div className="auto-dependency-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={autoDependencies}
                      onChange={(e) => {
                        setAutoDependencies(e.target.checked);
                        if (e.target.checked) {
                          handleAutoSelectDependencies();
                        }
                      }}
                    />
                    Auto-select dependencies
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedPipelines.length > 0 && (
          <div className="selected-pipelines">
            <h3>Selected Pipelines ({selectedPipelines.length})</h3>
            {selectedPipelines.map(pipeline => (
              <div key={pipeline[0]} className="selected-pipeline">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => handlePipelineSelect(pipeline)}
                />
                {pipeline[1]}
              </div>
            ))}
          </div>
        )}

        {/* Custom Entity Input */}
        <div className="custom-entity-section">
          <h3>Add Custom Entity</h3>
          <div className="custom-entity-input">
            <select
              value={customEntity.type}
              onChange={(e) => setCustomEntity({ ...customEntity, type: e.target.value })}
            >
              <option value="">Select Entity Type</option>
              {entityTypes.map(entity => (
                <option key={entity.type} value={entity.type}>{entity.type}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Entity Identifier"
              value={customEntity.identifier}
              onChange={(e) => setCustomEntity({ ...customEntity, identifier: e.target.value })}
            />
            <button onClick={checkCustomEntity} disabled={loading}>
              Check Entity
            </button>
            <button onClick={addCustomEntity}>
              Add to List
            </button>
          </div>
        </div>

        <button
          onClick={findMetadata}
          disabled={selectedPipelines.length === 0 || loading}
        >
          Find Metadata
        </button>
      </div>

      {/* Metadata Entities */}
      {entities.length > 0 && (
        <div className="section">
          <h2>2. Review Metadata Entities</h2>
          <div className="release-name">
            <label>Release Name:</label>
            <input
              type="text"
              value={releaseName}
              onChange={(e) => setReleaseName(e.target.value)}
            />
          </div>

          <div className="entities-list">
            {entities.map((entity, index) => (
              <div key={index} className="entity-item">
                <input
                  type="checkbox"
                  checked={entity.selected}
                  onChange={(e) => {
                    const newEntities = [...entities];
                    newEntities[index].selected = e.target.checked;
                    setEntities(newEntities);
                  }}
                />
                <span className="entity-type">{entity.type}</span>
                <span className="entity-identifier">{entity.identifier}</span>
                <select
                  value={entity.additional_action || ''}
                  onChange={(e) => {
                    const newEntities = [...entities];
                    newEntities[index].additional_action = e.target.value;
                    setEntities(newEntities);
                  }}
                >
                  <option value="">No additional action</option>
                  <option value="replace">Replace environment values</option>
                  <option value="delete_target_excess_columns">Delete excess columns</option>
                </select>
              </div>
            ))}
          </div>

          <button onClick={generateDeploySQL} disabled={loading}>
            Generate Deploy Inserts
          </button>
        </div>
      )}

      {/* SQL Popup */}
      {showSQLPopup && (
        <div className="sql-popup">
          <div className="popup-content">
            <div className="popup-header">
              <h3>Generated SQL</h3>
              <button className="close-btn" onClick={() => setShowSQLPopup(false)}>×</button>
            </div>
            <pre className="sql-code">{generatedSQL}</pre>
            <div className="popup-actions">
              <button onClick={() => navigator.clipboard.writeText(generatedSQL)}>
                Copy to Clipboard
              </button>
              <button onClick={executeDeploySQL} disabled={loading}>
                Execute Query
              </button>
              <button onClick={() => setShowSQLPopup(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {loading && <div className="loading">Loading...</div>}
    </div>
  );
}

export default AutoDeployMetadata;