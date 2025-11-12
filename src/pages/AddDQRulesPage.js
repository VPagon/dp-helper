import React, { useState, useEffect } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/AddDQRulesPage.css';

function AddDQRulesPage() {
    const [environment, setEnvironment] = useState('dev');
    const [searchTerm, setSearchTerm] = useState('');
    const [tables, setTables] = useState([]);
    const [selectedTables, setSelectedTables] = useState([]);
    const [dqTables, setDqTables] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [generatedSQL, setGeneratedSQL] = useState('');
    const [showPopup, setShowPopup] = useState(false);
    const [activeSection, setActiveSection] = useState('dq-tables');
    const [dqTableOptions, setDqTableOptions] = useState({
        filter: 'is_current=1 and is_deleted=0',
        table_group: 'DEFAULT',
        f_check_column_datatypes: 'N',
        f_stage_only_failed_rows: 'N',
        f_check_na_row_existence: 'N'
    });

    // For compare tables
    const [compareTable1, setCompareTable1] = useState(null);
    const [compareTable2, setCompareTable2] = useState(null);
    const [compareOptions, setCompareOptions] = useState({
        f_compare_data: 'N',
        f_compare_counts: 'Y',
        f_compare_schema: 'N',
        severity: 3,
        rule_classification: 'technical',
        rule_owner: 'Data Platform'
    });

    // For referential integrity
    const [refTable1, setRefTable1] = useState(null);
    const [refTable2, setRefTable2] = useState(null);
    const [refOptions, setRefOptions] = useState({
        foreign_key_name: '',
        unique_key_name: '',
        severity: 3,
        rule_classification: 'technical',
        rule_owner: 'Data Platform'
    });

    // Fetch available tables
    const fetchTables = async () => {
        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT id, table_name, schema_name, zone_name 
         FROM rep_mda.mda_dle_tables 
         WHERE is_active = 1 
         ORDER BY table_name`
            );
            setTables(result.rows);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch existing DQ tables
    const fetchDqTables = async () => {
        try {
            const result = await executeQuery(
                environment,
                `SELECT id, table_name 
         FROM rep_mda.mda_dq_tables 
         WHERE is_active = 1 
         ORDER BY table_name`
            );
            setDqTables(result.rows);
        } catch (err) {
            console.error('Error fetching DQ tables:', err);
        }
    };

    useEffect(() => {
        fetchTables();
        fetchDqTables();
    }, [environment]);

    const filteredTables = tables.filter(table =>
        table[1].toLowerCase().includes(searchTerm.toLowerCase()) ||
        table[2].toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleTableSelect = (table) => {
        if (selectedTables.some(t => t[0] === table[0])) {
            setSelectedTables(selectedTables.filter(t => t[0] !== table[0]));
        } else {
            setSelectedTables([...selectedTables, table]);
        }
    };

    const generateDQTablesSQL = () => {
        if (selectedTables.length === 0) {
            setError('Please select at least one table');
            return;
        }

        const inserts = selectedTables.map(table => `
INSERT INTO rep_mda.mda_dq_tables (
  table_name,
  table_type,
  table_definition_location,
  table_definition_key,
  filter,
  stage_dq_table_name,
  dq_indicator_column_name,
  dq_issues_column_name,
  table_group,
  is_active,
  f_check_column_datatypes,
  key_email,
  table_definition,
  f_stage_only_failed_rows,
  f_check_na_row_existence,
  unique_key,
  kvs_connection_string
) VALUES (
  '${table[2]}.${table[1]}',
  'DLE_TABLE',
  'rep_mda.mda_dle_tables',
  ${table[0]},
  'is_current=1 and is_deleted=0',
  NULL,
  NULL,
  NULL,
  'DEFAULT',
  1,
  'N',
  NULL,
  NULL,
  'N',
  'N',
  NULL,
  NULL
);`);

        setGeneratedSQL(inserts.join('\n'));
        setShowPopup(true);
        setError(null);
    };

    const generateCompareTablesSQL = () => {
        if (!compareTable1 || !compareTable2) {
            setError('Please select both tables for comparison');
            return;
        }

        const keyDqCmp = `DQ#COMPARE#${compareTable1[1]}#${compareTable2[1]}`.toUpperCase().replace(/\./g, '_');

        const sql = `
INSERT INTO rep_mda.mda_dq_compare_tables (
  dq_rle_id,
  dq_tbe_id,
  dq_tbe_id_referential,
  keys_json,
  mapping_json,
  ignore_columns_csv,
  active_columns_csv,
  f_compare_data,
  f_compare_counts,
  f_compare_schema,
  severity,
  is_active,
  rule_classification,
  rule_owner,
  key_dq_cmp
) VALUES (
  2,
  ${compareTable1[0]},
  ${compareTable2[0]},
  NULL,
  NULL,
  NULL,
  NULL,
  '${compareOptions.f_compare_data}',
  '${compareOptions.f_compare_counts}',
  '${compareOptions.f_compare_schema}',
  ${compareOptions.severity},
  1,
  '${compareOptions.rule_classification}',
  '${compareOptions.rule_owner}',
  '${keyDqCmp}'
);`;

        setGeneratedSQL(sql);
        setShowPopup(true);
        setError(null);
    };

    const generateReferentialIntegritySQL = () => {
        if (!refTable1 || !refTable2 || !refOptions.foreign_key_name) {
            setError('Please select both tables and provide foreign key name');
            return;
        }

        const keyDqRef = `${refTable1[1]}#${refOptions.foreign_key_name}#ref_int`.toUpperCase().replace(/\./g, '_');

        const sql = `
INSERT INTO rep_mda.mda_dq_referential_integrity (
  dq_rle_id,
  dq_tbe_id,
  dq_tbe_id_lookup,
  foreign_key_name,
  unique_key_name,
  severity,
  is_active,
  rule_classification,
  rule_owner,
  key_dq_ref
) VALUES (
  4,
  ${refTable1[0]},
  ${refTable2[0]},
  '${refOptions.foreign_key_name}',
  '${refOptions.unique_key_name || refOptions.foreign_key_name}',
  ${refOptions.severity},
  1,
  '${refOptions.rule_classification}',
  '${refOptions.rule_owner}',
  '${keyDqRef}'
);`;

        setGeneratedSQL(sql);
        setShowPopup(true);
        setError(null);
    };

    const executeSQL = async () => {
        try {
            setLoading(true);
            await executeQuery(environment, generatedSQL);
            setShowPopup(false);
            setSelectedTables([]);
            setCompareTable1(null);
            setCompareTable2(null);
            setRefTable1(null);
            setRefTable2(null);
            fetchDqTables(); // Refresh DQ tables list
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="add-dq-rules-page">
            <HomeButton />
            <h1>Add DQ Rules</h1>

            <div className="environment-selector">
                <label>Environment:</label>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                    <option value="dev">Development</option>
                    <option value="prod">Production</option>
                </select>
            </div>

            <div className="section-tabs">
                <button
                    className={activeSection === 'dq-tables' ? 'active' : ''}
                    onClick={() => setActiveSection('dq-tables')}
                >
                    Add DQ Tables
                </button>
                <button
                    className={activeSection === 'compare-tables' ? 'active' : ''}
                    onClick={() => setActiveSection('compare-tables')}
                >
                    Add Compare Tables
                </button>
                <button
                    className={activeSection === 'referential-integrity' ? 'active' : ''}
                    onClick={() => setActiveSection('referential-integrity')}
                >
                    Add Referential Integrity
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {/* DQ Tables Section */}
            {activeSection === 'dq-tables' && (
                <div className="section-content">
                    <h2>Add DQ Tables</h2>
                    <div className="search-box">
                        <input
                            type="text"
                            placeholder="Search tables..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="tables-list">
                        {loading && <div className="loading">Loading tables...</div>}
                        {filteredTables.map((table) => (
                            <div
                                key={table[0]}
                                className={`table-item ${selectedTables.some(t => t[0] === table[0]) ? 'selected' : ''}`}
                                onClick={() => handleTableSelect(table)}
                            >
                                <div className="table-name">{table[2]}.{table[1]}</div>
                                <div className="table-zone">{table[3]}</div>
                            </div>
                        ))}
                    </div>

                    {selectedTables.length > 0 && (
                        <div className="selected-section">
                            <h3>Selected Tables ({selectedTables.length})</h3>
                            {selectedTables.map(table => (
                                <div key={table[0]} className="selected-table">
                                    {table[2]}.{table[1]}
                                </div>
                            ))}

                            <div className="dq-options">
                                <h4>DQ Table Options</h4>

                                <div className="form-group">
                                    <label>Filter Condition:</label>
                                    <input
                                        type="text"
                                        value={dqTableOptions.filter}
                                        onChange={(e) => setDqTableOptions({ ...dqTableOptions, filter: e.target.value })}
                                        placeholder="e.g., is_current=1 and is_deleted=0"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Table Group:</label>
                                    <input
                                        type="text"
                                        value={dqTableOptions.table_group}
                                        onChange={(e) => setDqTableOptions({ ...dqTableOptions, table_group: e.target.value })}
                                        placeholder="e.g., DEFAULT"
                                    />
                                </div>

                                <div className="options-grid">
                                    <div className="form-group">
                                        <label>Check Column Datatypes:</label>
                                        <select
                                            value={dqTableOptions.f_check_column_datatypes}
                                            onChange={(e) => setDqTableOptions({ ...dqTableOptions, f_check_column_datatypes: e.target.value })}
                                        >
                                            <option value="Y">Yes</option>
                                            <option value="N">No</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Stage Only Failed Rows:</label>
                                        <select
                                            value={dqTableOptions.f_stage_only_failed_rows}
                                            onChange={(e) => setDqTableOptions({ ...dqTableOptions, f_stage_only_failed_rows: e.target.value })}
                                        >
                                            <option value="Y">Yes</option>
                                            <option value="N">No</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Check NA Row Existence:</label>
                                        <select
                                            value={dqTableOptions.f_check_na_row_existence}
                                            onChange={(e) => setDqTableOptions({ ...dqTableOptions, f_check_na_row_existence: e.target.value })}
                                        >
                                            <option value="Y">Yes</option>
                                            <option value="N">No</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={generateDQTablesSQL}
                        disabled={selectedTables.length === 0 || loading}
                        className="generate-btn"
                    >
                        Generate DQ Tables SQL
                    </button>
                </div>
            )}

            {/* Compare Tables Section */}
            {activeSection === 'compare-tables' && (
                <div className="section-content">
                    <h2>Add Compare Tables</h2>

                    <div className="form-group">
                        <label>First Table (dq_tbe_id):</label>
                        <TableSelector
                            tables={dqTables}
                            selectedTable={compareTable1}
                            onSelect={setCompareTable1}
                            placeholder="Select first table..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Second Table (dq_tbe_id_referential):</label>
                        <TableSelector
                            tables={dqTables}
                            selectedTable={compareTable2}
                            onSelect={setCompareTable2}
                            placeholder="Select second table..."
                        />
                    </div>

                    <div className="options-grid">
                        <div className="form-group">
                            <label>Compare Data:</label>
                            <select
                                value={compareOptions.f_compare_data}
                                onChange={(e) => setCompareOptions({ ...compareOptions, f_compare_data: e.target.value })}
                            >
                                <option value="Y">Yes</option>
                                <option value="N">No</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Compare Counts:</label>
                            <select
                                value={compareOptions.f_compare_counts}
                                onChange={(e) => setCompareOptions({ ...compareOptions, f_compare_counts: e.target.value })}
                            >
                                <option value="Y">Yes</option>
                                <option value="N">No</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Compare Schema:</label>
                            <select
                                value={compareOptions.f_compare_schema}
                                onChange={(e) => setCompareOptions({ ...compareOptions, f_compare_schema: e.target.value })}
                            >
                                <option value="Y">Yes</option>
                                <option value="N">No</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Severity:</label>
                            <select
                                value={compareOptions.severity}
                                onChange={(e) => setCompareOptions({ ...compareOptions, severity: parseInt(e.target.value) })}
                            >
                                <option value="1">1 - Low</option>
                                <option value="2">2 - Medium</option>
                                <option value="3">3 - High</option>
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={generateCompareTablesSQL}
                        disabled={!compareTable1 || !compareTable2 || loading}
                        className="generate-btn"
                    >
                        Generate Compare Tables SQL
                    </button>
                </div>
            )}

            {/* Referential Integrity Section */}
            {activeSection === 'referential-integrity' && (
                <div className="section-content">
                    <h2>Add Referential Integrity</h2>

                    <div className="form-group">
                        <label>Main Table (dq_tbe_id):</label>
                        <TableSelector
                            tables={dqTables}
                            selectedTable={refTable1}
                            onSelect={setRefTable1}
                            placeholder="Select main table..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Lookup Table (dq_tbe_id_lookup):</label>
                        <TableSelector
                            tables={dqTables}
                            selectedTable={refTable2}
                            onSelect={setRefTable2}
                            placeholder="Select lookup table..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Foreign Key Name:</label>
                        <input
                            type="text"
                            value={refOptions.foreign_key_name}
                            onChange={(e) => setRefOptions({ ...refOptions, foreign_key_name: e.target.value })}
                            placeholder="e.g., key_whe_odr"
                        />
                    </div>

                    <div className="form-group">
                        <label>Unique Key Name:</label>
                        <input
                            type="text"
                            value={refOptions.unique_key_name}
                            onChange={(e) => setRefOptions({ ...refOptions, unique_key_name: e.target.value })}
                            placeholder="e.g., unified_key"
                        />
                    </div>

                    <div className="form-group">
                        <label>Severity:</label>
                        <select
                            value={refOptions.severity}
                            onChange={(e) => setRefOptions({ ...refOptions, severity: parseInt(e.target.value) })}
                        >
                            <option value="1">1 - Low</option>
                            <option value="2">2 - Medium</option>
                            <option value="3">3 - High</option>
                        </select>
                    </div>

                    <button
                        onClick={generateReferentialIntegritySQL}
                        disabled={!refTable1 || !refTable2 || !refOptions.foreign_key_name || loading}
                        className="generate-btn"
                    >
                        Generate Referential Integrity SQL
                    </button>
                </div>
            )}

            {/* SQL Popup */}
            {showPopup && (
                <div className="sql-popup">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3>Generated SQL</h3>
                            <button className="close-btn" onClick={() => setShowPopup(false)}>×</button>
                        </div>
                        <pre className="sql-code">{generatedSQL}</pre>
                        <div className="popup-actions">
                            <button onClick={() => navigator.clipboard.writeText(generatedSQL)}>
                                Copy to Clipboard
                            </button>
                            <button onClick={executeSQL} disabled={loading}>
                                {loading ? 'Executing...' : 'Execute Query'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Table Selector Component
function TableSelector({ tables, selectedTable, onSelect, placeholder }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    const filteredTables = tables.filter(table =>
        table[1].toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="table-selector">
            <input
                type="text"
                placeholder={placeholder}
                value={selectedTable ? selectedTable[1] : searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            />

            {showDropdown && filteredTables.length > 0 && (
                <div className="dropdown-options">
                    {filteredTables.map((table) => (
                        <div
                            key={table[0]}
                            className="dropdown-option"
                            onClick={() => {
                                onSelect(table);
                                setShowDropdown(false);
                                setSearchTerm('');
                            }}
                        >
                            {table[1]}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default AddDQRulesPage;