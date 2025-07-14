import React, { useState, useEffect } from 'react';
import { executeQuery } from 'services/sqlService';
import HomeButton from 'components/common/HomeButtom';
import '../styles/pages/_monitor-offloading.scss';

function MonitorOffloadingPage() {
    const [environment, setEnvironment] = useState('dev-mes');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [offloadingData, setOffloadingData] = useState([]);
    const [countsData, setCountsData] = useState({});
    const [extractDate, setExtractDate] = useState(new Date().toISOString().split('T')[0]); // Default to today

    const environmentOptions = [
        { value: 'dev-mes', label: 'MES (DEV)' },
        { value: 'prod-mes', label: 'MES (PROD)' },
        { value: 'dev-itac', label: 'ITAC (DEV)' },
        { value: 'prod-itac', label: 'ITAC (PROD)' }
    ];

    const fetchOffloadingData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Get offloading configuration - always from metadata DB
            const configResult = await executeQuery(
                environment.startsWith('dev') ? 'dev' : 'prod',
                `SELECT 
          job_name, 
          job_group, 
          job_group_ordering,
          JSON_VALUE(source_object_settings, '$.schema') as schema_name,
          JSON_VALUE(source_object_settings, '$.table') as table_name,
          data_retention_value,
          data_retention_unit,
          data_retention_column,
          source_business_key,
          template_id
        FROM rep_mda.mda_dta_ofg_tables
        WHERE is_active = 1
        AND job_group like '%${environment.split('-')[1]}%'
        ORDER BY job_group, job_group_ordering`
            );

            // Get templates - always from metadata DB
            const templatesResult = await executeQuery(
                environment.startsWith('dev') ? 'dev' : 'prod',
                `SELECT 
          id,
          template_name,
          template_string
        FROM rep_mda.mda_dta_ofg_templates
        WHERE is_active = 1`
            );

            // Transform data
            const templates = {};
            templatesResult.rows.forEach(row => {
                templates[row[0]] = {
                    name: row[1],
                    template: row[2]
                };
            });

            const configs = configResult.rows.map(row => ({
                jobName: row[0],
                jobGroup: row[1],
                jobGroupOrder: row[2],
                schema: row[3],
                table: row[4],
                retentionValue: row[5],
                retentionUnit: row[6],
                retentionColumn: row[7],
                businessKey: row[8],
                templateId: row[9],
                template: templates[row[9]]?.template || '',
                templateName: templates[row[9]]?.name || ''
            }));

            setOffloadingData(configs);
            await fetchCountsData(configs);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchCountsData = async (configs) => {
        try {
            const counts = {};

            for (const config of configs) {
                let countQuery;

                // Determine if this is a dimension table (has business key) or fact table
                const isDimensionTable = config.businessKey && config.businessKey.trim() !== '';

                if (isDimensionTable) {
                    // Dimension table count query - count duplicate records older than 1 day
                    countQuery = `
                    SELECT COUNT(1) as cnt 
                    FROM (
                        SELECT 
                            ${config.businessKey} AS business_key,
                            ROW_NUMBER() OVER (
                                PARTITION BY ${config.businessKey} 
                                ORDER BY ${config.retentionColumn} DESC
                            ) AS rn
                        FROM ${config.schema}.${config.table}
                        WHERE ${config.retentionColumn} < DATEADD(DAY, -1, DATEADD(DAY, -1, '${extractDate}'))
                    ) AS RankedRecords
                    WHERE rn > 1
                `;
                } else {
                    // Fact table count query - count records older than retention period
                    countQuery = `
                    SELECT COUNT(1) as cnt 
                    FROM ${config.schema}.${config.table}
                    WHERE ${config.retentionColumn} < DATEADD(
                        ${config.retentionUnit}, 
                        -${config.retentionValue}, 
                        '${extractDate}'
                    )
                `;
                }

                try {
                    const result = await executeQuery(environment, countQuery);
                    counts[config.jobName] = result.rows[0][0];
                } catch (err) {
                    console.error(`Error counting records for ${config.schema}.${config.table}:`, err);
                    counts[config.jobName] = -1; // Use -1 to indicate error
                }
            }

            setCountsData(counts);
        } catch (err) {
            console.error('Error in fetchCountsData:', err);
            setError('Failed to fetch record counts for some tables');
        }
    };

    const handleExtractDateChange = (e) => {
        setExtractDate(e.target.value);
    };

    const handleRefresh = () => {
        fetchOffloadingData();
    };

    useEffect(() => {
        fetchOffloadingData();
    }, [environment]);

    // Group data by job_group
    const groupedData = offloadingData.reduce((groups, item) => {
        const group = groups[item.jobGroup] || [];
        group.push(item);
        groups[item.jobGroup] = group;
        return groups;
    }, {});

    return (
        <div className="monitor-offloading-page">
            <HomeButton />
            <h1>Monitor Offloading</h1>

            <div className="controls">
                <div className="environment-selector">
                    <label>Environment:</label>
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                    >
                        {environmentOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="date-selector">
                    <label>Extract Date:   </label>
                    <input
                        type="date"
                        value={extractDate}
                        onChange={handleExtractDateChange}
                    />
                </div>

                <br />

                <button className="refresh-button" onClick={handleRefresh}>
                    Refresh
                </button>
            </div>

            <br />

            {loading && <div className="loading-message">Loading data...</div>}

            {error && (
                <div className="error-message">
                    {error}
                    <button onClick={fetchOffloadingData}>Retry</button>
                </div>
            )}

            <div className="offloading-groups">
                {Object.entries(groupedData).map(([groupName, tables]) => (
                    <div key={groupName} className="offloading-group">
                        <h2>{groupName}</h2>
                        <div className="tables-list">
                            {tables.map((table) => (
                                <div key={table.jobName} className="table-card">
                                    <div className="table-header">
                                        <h3>{table.schema}.{table.table}</h3>
                                        <div className="record-count">
                                            Records to offload: <strong>{countsData[table.jobName] || 0}</strong>
                                        </div>
                                    </div>

                                    <div className="table-details">
                                        <div>
                                            <label>Retention:</label>
                                            <span>{table.retentionValue} {table.retentionUnit}(s)</span>
                                        </div>
                                        <div>
                                            <label>Column:</label>
                                            <span>{table.retentionColumn}</span>
                                        </div>
                                        <div>
                                            <label>Template:</label>
                                            <span>{table.templateName}</span>
                                        </div>
                                    </div>

                                    <div className="sql-preview">
                                        <h4>SQL Preview:</h4>
                                        <pre>
                                            {table.template
                                                .replace(/#schema#/g, table.schema)
                                                .replace(/#table#/g, table.table)
                                                .replace(/#data_retention_column#/g, table.retentionColumn)
                                                .replace(/#data_retention_time#/g, table.retentionValue)
                                                .replace(/#data_retention_unit#/g, table.retentionUnit)
                                                .replace(/#source_business_key#/g, table.businessKey || '')
                                            }
                                        </pre>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default MonitorOffloadingPage;