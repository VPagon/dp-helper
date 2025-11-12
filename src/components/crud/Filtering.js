import React, { useState, useEffect } from 'react';
import { executeQuery } from '../../services/sqlService';

const Filtering = ({ 
    environment, 
    selectedTable, 
    onFiltersChange,
    onApplyFilters 
}) => {
    const [showFilters, setShowFilters] = useState(false);
    const [tableColumns, setTableColumns] = useState([]);
    const [filters, setFilters] = useState({});
    const [activeFilters, setActiveFilters] = useState({});
    const [loading, setLoading] = useState(false);

    // Fetch table columns
    const fetchTableColumns = async () => {
        if (!selectedTable) return;
        
        try {
            setLoading(true);
            const result = await executeQuery(
                environment,
                `SELECT
                    c.name AS column_name,
                    t.name AS data_type,
                    c.max_length,
                    c.is_nullable,
                    c.column_id
                FROM sys.columns c
                JOIN sys.types t ON c.user_type_id = t.user_type_id
                WHERE c.object_id = OBJECT_ID('rep_mda.${selectedTable}')
                ORDER BY c.column_id`
            );
            setTableColumns(result.rows);
            
            // Initialize filters
            const initialFilters = {};
            result.rows.forEach(column => {
                initialFilters[column[0]] = '';
            });
            setFilters(initialFilters);
        } catch (err) {
            console.error('Error fetching columns:', err);
        } finally {
            setLoading(false);
        }
    };

    // Handle filter change
    const handleFilterChange = (column, value) => {
        setFilters(prev => ({
            ...prev,
            [column]: value
        }));
    };

    // Apply filters
    const handleApplyFilters = () => {
        const newActiveFilters = {};
        Object.entries(filters).forEach(([column, value]) => {
            if (value && value.trim() !== '') {
                newActiveFilters[column] = value;
            }
        });
        
        setActiveFilters(newActiveFilters);
        onFiltersChange(newActiveFilters);
        setShowFilters(false);
        onApplyFilters(newActiveFilters);
    };

    // Remove individual filter
    const removeFilter = (column) => {
        const newActiveFilters = { ...activeFilters };
        delete newActiveFilters[column];
        setActiveFilters(newActiveFilters);
        onFiltersChange(newActiveFilters);
        
        // Also clear the filter input
        setFilters(prev => ({
            ...prev,
            [column]: ''
        }));
    };

    // Clear all filters
    const clearAllFilters = () => {
        setActiveFilters({});
        setFilters({});
        onFiltersChange({});
        
        // Re-initialize filters
        const initialFilters = {};
        tableColumns.forEach(column => {
            initialFilters[column[0]] = '';
        });
        setFilters(initialFilters);
    };

    useEffect(() => {
        if (selectedTable) {
            fetchTableColumns();
        }
    }, [selectedTable, environment]);

    return (
        <div className="filtering-component">
            <div className="filtering-controls">
                <button 
                    className="filter-toggle-btn"
                    onClick={() => setShowFilters(!showFilters)}
                >
                    Filters {Object.keys(activeFilters).length > 0 ? 
                        `(${Object.keys(activeFilters).length})` : ''}
                </button>
                
                {Object.keys(activeFilters).length > 0 && (
                    <button 
                        className="clear-filters-btn"
                        onClick={clearAllFilters}
                    >
                        Clear All
                    </button>
                )}
            </div>

            {/* Active filters display */}
            {Object.keys(activeFilters).length > 0 && (
                <div className="active-filters">
                    {Object.entries(activeFilters).map(([column, value]) => (
                        <span key={column} className="active-filter">
                            {column}: {value}
                            <button onClick={() => removeFilter(column)}>×</button>
                        </span>
                    ))}
                </div>
            )}

            {/* Filters sidebar */}
            {showFilters && (
                <div className="filters-sidebar">
                    <div className="sidebar-header">
                        <h3>Define Filters</h3>
                        <button onClick={() => setShowFilters(false)}>×</button>
                    </div>
                    
                    <div className="filters-content">
                        {loading ? (
                            <div className="loading">Loading columns...</div>
                        ) : (
                            tableColumns.map((column) => (
                                <div key={column[0]} className="filter-group">
                                    <label>{column[0]} ({column[1]})</label>
                                    <input
                                        type="text"
                                        value={filters[column[0]] || ''}
                                        onChange={(e) => handleFilterChange(column[0], e.target.value)}
                                        placeholder={`Filter by ${column[0]}`}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                    
                    <div className="sidebar-actions">
                        <button onClick={handleApplyFilters} className="apply-btn">
                            Apply Filters
                        </button>
                        <button onClick={() => setShowFilters(false)} className="cancel-btn">
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Filtering;