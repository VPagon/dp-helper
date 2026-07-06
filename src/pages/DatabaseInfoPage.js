import React, { useState, useEffect, useMemo } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/_database-info.scss';

const ENVIRONMENTS = [
	{ value: 'dev', label: 'Development' },
	{ value: 'prod', label: 'Production' },
	{ value: 'deploy', label: 'Deploy' },
];

export default function DatabaseInfoPage() {
	const [environment, setEnvironment] = useState('dev');
	const [tables, setTables] = useState([]);
	const [search, setSearch] = useState('');
	const [selectedTable, setSelectedTable] = useState(null);
	const [columns, setColumns] = useState([]);
	const [loadingTables, setLoadingTables] = useState(false);
	const [loadingColumns, setLoadingColumns] = useState(false);
	const [error, setError] = useState(null);

	const fetchTables = async (env) => {
		try {
			setLoadingTables(true);
			setError(null);
			setSelectedTable(null);
			setColumns([]);
			const result = await executeQuery(
				env,
				`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
				FROM INFORMATION_SCHEMA.TABLES
				ORDER BY TABLE_SCHEMA, TABLE_NAME`,
				{ source: 'database-info' }
			);
			setTables(result.rows.map(([schema, name, type]) => ({ schema, name, type })));
		} catch (err) {
			setError(err.message);
			setTables([]);
		} finally {
			setLoadingTables(false);
		}
	};

	useEffect(() => {
		fetchTables(environment);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [environment]);

	const fetchColumns = async (table) => {
		try {
			setLoadingColumns(true);
			setError(null);
			const result = await executeQuery(
				environment,
				`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT
				FROM INFORMATION_SCHEMA.COLUMNS
				WHERE TABLE_SCHEMA = '${table.schema}' AND TABLE_NAME = '${table.name}'
				ORDER BY ORDINAL_POSITION`,
				{ source: 'database-info' }
			);
			setColumns(result.rows.map(([name, dataType, nullable, maxLength, defaultValue]) => ({
				name,
				dataType,
				nullable,
				maxLength,
				defaultValue,
			})));
		} catch (err) {
			setError(err.message);
			setColumns([]);
		} finally {
			setLoadingColumns(false);
		}
	};

	const handleSelectTable = (table) => {
		setSelectedTable(table);
		fetchColumns(table);
	};

	const filteredTables = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return tables;
		return tables.filter((t) => `${t.schema}.${t.name}`.toLowerCase().includes(term));
	}, [tables, search]);

	const groupedBySchema = useMemo(() => {
		const groups = new Map();
		filteredTables.forEach((t) => {
			if (!groups.has(t.schema)) groups.set(t.schema, []);
			groups.get(t.schema).push(t);
		});
		return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
	}, [filteredTables]);

	const schemaCount = groupedBySchema.length;
	const tableCount = filteredTables.length;

	return (
		<div className="database-info-page">
			<HomeButton />
			<br />
			<br />
			<h1>Database Info</h1>

			<div className="controls-section">
				<div className="environment-selector">
					<label>Environment:</label>
					<select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
						{ENVIRONMENTS.map((env) => (
							<option key={env.value} value={env.value}>{env.label}</option>
						))}
					</select>
				</div>

				<button
					type="button"
					className="refresh-btn"
					onClick={() => fetchTables(environment)}
					disabled={loadingTables}
				>
					{loadingTables ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>

			{error && <div className="error-message">{error}</div>}

			<div className="database-info-summary">
				{loadingTables
					? 'Loading tables...'
					: `${schemaCount} schema${schemaCount === 1 ? '' : 's'}, ${tableCount} table${tableCount === 1 ? '' : 's'}`}
			</div>

			<div className="database-info-layout">
				<div className="table-list-panel">
					<input
						type="text"
						className="table-search-input"
						placeholder="Search tables..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					<div className="table-tree">
						{groupedBySchema.map(([schema, schemaTables]) => (
							<div key={schema} className="schema-group">
								<div className="schema-name">
									{schema}
									<span className="schema-count">({schemaTables.length})</span>
								</div>
								<ul>
									{schemaTables.map((table) => {
										const isSelected = selectedTable
											&& selectedTable.schema === table.schema
											&& selectedTable.name === table.name;
										return (
											<li
												key={`${table.schema}.${table.name}`}
												className={`table-item${isSelected ? ' table-item--selected' : ''}`}
												onClick={() => handleSelectTable(table)}
											>
												<span className="table-item-name">{table.name}</span>
												{table.type === 'VIEW' && <span className="table-item-badge">view</span>}
											</li>
										);
									})}
								</ul>
							</div>
						))}
						{!loadingTables && groupedBySchema.length === 0 && (
							<div className="no-results">No tables found.</div>
						)}
					</div>
				</div>

				<div className="table-detail-panel">
					{!selectedTable && (
						<div className="no-selection">Select a table to view its schema.</div>
					)}
					{selectedTable && (
						<>
							<h3>{selectedTable.schema}.{selectedTable.name}</h3>
							{loadingColumns ? (
								<div className="loading">Loading columns...</div>
							) : (
								<div className="db-info-columns-container">
									<table className="db-info-columns-table">
										<thead>
											<tr>
												<th>Column</th>
												<th>Type</th>
												<th>Nullable</th>
												<th>Max Length</th>
												<th>Default</th>
											</tr>
										</thead>
										<tbody>
											{columns.map((col) => (
												<tr key={col.name}>
													<td>{col.name}</td>
													<td>{col.dataType}</td>
													<td>{col.nullable}</td>
													<td>{col.maxLength ?? ''}</td>
													<td>{col.defaultValue ?? ''}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
