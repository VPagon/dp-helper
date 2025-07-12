import React, { useState, useEffect } from 'react';
import { executeQuery } from 'services/sqlService';
import HomeButton from 'components/common/HomeButtom';
import '../styles/pages/_orchestrate-pipelines.scss';

function OrchestratePipelinesPage() {
    const [environment, setEnvironment] = useState('dev');
    const [pipelines, setPipelines] = useState([]);
    const [generatedSQL, setGeneratedSQL] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dependencies, setDependencies] = useState([]);

    // Fetch all pipelines on mount
    useEffect(() => {
        fetchPipelines();
    }, [environment]);

    const fetchPipelines = async () => {
        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT pipeline_id, pipeline_name FROM rep_mda.mda_ocn_pipelines ORDER BY pipeline_name`
            );
            setPipelines(result.rows);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const searchPipelines = (term) => {
        if (!term.trim()) return [];
        return pipelines.filter(pipeline =>
            pipeline[1].toLowerCase().includes(term.toLowerCase())
        );
    };

    const addDependencyGroup = () => {
        setDependencies([...dependencies, {
            key: Date.now(),
            dependants: [],
            pipeline: null,
            pipelineSearchTerm: '',
            pipelineSearchResults: []
        }]);
    };

    const addDependant = (groupKey) => {
        const updated = dependencies.map(group => {
            if (group.key === groupKey) {
                return { 
                    ...group, 
                    dependants: [...group.dependants, { 
                        id: Date.now(), 
                        searchTerm: '', 
                        searchResults: [],
                        selectedPipeline: null
                    }] 
                };
            }
            return group;
        });
        setDependencies(updated);
    };

    const handleDependantSearch = (groupKey, dependantId, term) => {
        const updated = dependencies.map(group => {
            if (group.key === groupKey) {
                const updatedDependants = group.dependants.map(d => {
                    if (d.id === dependantId) {
                        return { ...d, searchTerm: term, searchResults: searchPipelines(term) };
                    }
                    return d;
                });
                return { ...group, dependants: updatedDependants };
            }
            return group;
        });
        setDependencies(updated);
    };

    const handlePipelineSearch = (groupKey, term) => {
        const updated = dependencies.map(group => {
            if (group.key === groupKey) {
                return { 
                    ...group, 
                    pipelineSearchTerm: term,
                    pipelineSearchResults: searchPipelines(term)
                };
            }
            return group;
        });
        setDependencies(updated);
    };

    const selectDependant = (groupKey, dependantId, pipeline) => {
        const updated = dependencies.map(group => {
            if (group.key === groupKey) {
                const updatedDependants = group.dependants.map(d => {
                    if (d.id === dependantId) {
                        return { ...d, selectedPipeline: pipeline, searchTerm: '', searchResults: [] };
                    }
                    return d;
                });
                return { ...group, dependants: updatedDependants };
            }
            return group;
        });
        setDependencies(updated);
    };

    const selectPipeline = (groupKey, pipeline) => {
        const updated = dependencies.map(group => {
            if (group.key === groupKey) {
                return { 
                    ...group, 
                    pipeline: pipeline,
                    pipelineSearchTerm: '',
                    pipelineSearchResults: [] 
                };
            }
            return group;
        });
        setDependencies(updated);
    };

    const removeDependencyGroup = (groupKey) => {
        setDependencies(dependencies.filter(group => group.key !== groupKey));
    };

    const removeDependant = (groupKey, dependantId) => {
        const updated = dependencies.map(group => {
            if (group.key === groupKey) {
                const newDependants = group.dependants.filter(d => d.id !== dependantId);
                return { ...group, dependants: newDependants };
            }
            return group;
        });
        setDependencies(updated);
    };

    const generateSQL = () => {
        const inserts = [];
        const today = new Date().toISOString().slice(0, 19).replace('T', ' ');

        dependencies.forEach(group => {
            if (group.pipeline && group.dependants.length > 0) {
                group.dependants.forEach(dependant => {
                    if (dependant.selectedPipeline) {
                        const keyDep = `DEP_${dependant.selectedPipeline[1]}_${group.pipeline[1]}`
                            .replace(/[^A-Z0-9_]/g, '_')
                            .toUpperCase();

                        inserts.push(
                            `INSERT INTO rep_mda.mda_ocn_pipeline_dependencies (\n` +
                            `  pipeline_id, dependant_pipeline_id, dependency_lag,\n` +
                            `  date_last_modified, user_last_modified, key_dep, additional_checks\n` +
                            `) VALUES (\n` +
                            `  ${group.pipeline[0]}, ${dependant.selectedPipeline[0]}, 0,\n` +
                            `  '${today}.000', '${localStorage.getItem('userEmail') || 'system'}',\n` +
                            `  '${keyDep}', NULL\n` +
                            `);`
                        );
                    }
                });
            }
        });

        setGeneratedSQL(inserts.join('\n\n'));
    };

    return (
        <div className="orchestrate-pipelines-page">
            <HomeButton />
            <h1>Orchestrate Pipelines</h1>

            <div className="environment-selector">
                <label>Environment:</label>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                    <option value="dev">Development</option>
                    <option value="prod">Production</option>
                </select>
            </div>

            <button
                onClick={addDependencyGroup}
                className="add-group-btn"
            >
                Add New Dependency Group
            </button>

            <div className="dependency-groups">
                {dependencies.map((group) => (
                    <div key={group.key} className="dependency-group">
                        <button
                            onClick={() => removeDependencyGroup(group.key)}
                            className="remove-group-btn"
                        >
                            ×
                        </button>

                        <div className="group-columns">
                            <div className="dependants-column">
                                <h3>Dependant Pipelines (Execute First)</h3>
                                <button
                                    onClick={() => addDependant(group.key)}
                                    className="add-dependant-btn"
                                >
                                    Add Dependant
                                </button>
                                {group.dependants.map((dependant) => (
                                    <div key={dependant.id} className="pipeline-selector">
                                        <input
                                            type="text"
                                            value={dependant.searchTerm || dependant.selectedPipeline?.[1] || ''}
                                            onChange={(e) => handleDependantSearch(group.key, dependant.id, e.target.value)}
                                            placeholder="Search dependant pipeline..."
                                        />
                                        {dependant.searchResults.length > 0 && (
                                            <div className="dropdown-options">
                                                {dependant.searchResults.map((pipeline, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={() => selectDependant(group.key, dependant.id, pipeline)}
                                                    >
                                                        {pipeline[1]}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => removeDependant(group.key, dependant.id)}
                                            className="remove-btn"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="pipeline-column">
                                <h3>Pipeline (Executes After)</h3>
                                <div className="pipeline-selector">
                                    <input
                                        type="text"
                                        value={group.pipelineSearchTerm || group.pipeline?.[1] || ''}
                                        onChange={(e) => handlePipelineSearch(group.key, e.target.value)}
                                        placeholder="Search pipeline..."
                                    />
                                    {group.pipelineSearchResults.length > 0 && (
                                        <div className="dropdown-options">
                                            {group.pipelineSearchResults.map((pipeline, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => selectPipeline(group.key, pipeline)}
                                                >
                                                    {pipeline[1]}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {dependencies.length > 0 && (
                <button
                    onClick={generateSQL}
                    className="generate-sql-btn"
                    disabled={loading}
                >
                    {loading ? 'Generating...' : 'Generate SQL Inserts'}
                </button>
            )}

            {error && <div className="error-message">{error}</div>}

            {generatedSQL && (
                <div className="sql-output">
                    <h3>Generated SQL</h3>
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

export default OrchestratePipelinesPage;