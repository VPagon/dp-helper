import React, { useState, useEffect } from 'react';
import { executeQuery } from '../../services/sqlService';

const Parameters = ({ 
    environment, 
    onEnvironmentChange, 
    selectedTable, 
    onTableSelect,
    parameters = ['environment', 'table'] 
}) => {
    const [tables, setTables] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [tableSuggestions, setTableSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch all tables
    const fetchTables = async () => {
        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT
                    s.name AS schema_name,
                    t.name AS table_name
                FROM sys.tables AS t
                JOIN sys.schemas AS s ON t.schema_id = s.schema_id
                WHERE s.name = 'rep_mda'
                ORDER BY s.name, t.name`
            );
            setTables(result.rows);
        } catch (err) {
            console.error('Error fetching tables:', err);
        } finally {
            setLoading(false);
        }
    };

    // Search for tables based on input
    const searchTables = (term) => {
        if (!term.trim()) {
            setTableSuggestions([]);
            return;
        }
        
        const filtered = tables.filter(table => 
            table[1].toLowerCase().includes(term.toLowerCase())
        );
        setTableSuggestions(filtered);
    };

    // Handle table selection
    const handleTableSelect = (table) => {
        const fullTableName = table[1];
        onTableSelect(fullTableName);
        setSearchTerm(fullTableName);
        setTableSuggestions([]);
    };

    useEffect(() => {
        if (parameters.includes('table')) {
            fetchTables();
        }
    }, [environment, parameters.includes('table')]);

    useEffect(() => {
        if (parameters.includes('table') && searchTerm) {
            searchTables(searchTerm);
        }
    }, [searchTerm, parameters.includes('table')]);

    return (
        <div className="parameters-component">
            <div className="parameters-grid">
                {parameters.includes('environment') && (
                    <div className="parameter-group">
                        <label>Environment:</label>
                        <select 
                            value={environment} 
                            onChange={(e) => onEnvironmentChange(e.target.value)}
                        >
                            <option value="dev">Development</option>
                            <option value="prod">Production</option>
                        </select>
                    </div>
                )}

                {parameters.includes('table') && (
                    <div className="parameter-group">
                        <label>Table:</label>
                        <div className="table-search-container">
                            <input
                                type="text"
                                placeholder="Search tables..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onBlur={() => setTimeout(() => setTableSuggestions([]), 200)}
                            />
                            {tableSuggestions.length > 0 && (
                                <div className="suggestions-dropdown">
                                    {tableSuggestions.map((table, index) => (
                                        <div
                                            key={index}
                                            className="suggestion-item"
                                            onClick={() => handleTableSelect(table)}
                                        >
                                            {table[1]}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {loading && <div className="loading-indicator">Loading tables...</div>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Parameters;