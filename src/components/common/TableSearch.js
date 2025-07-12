// TableSearch.js
import React, { useState } from 'react';
import { executeQuery } from '../../services/sqlService';

function TableSearch({ onResults, onError }) {
	const [tableName, setTableName] = useState('');
	const [filter, setFilter] = useState('');
	const [loading, setLoading] = useState(false);
	const [environment, setEnvironment] = useState('dev');

	const handleSearch = async () => {
		try {
			setLoading(true);
			const whereClause = filter ? ` WHERE ${filter}` : '';
			const query = `SELECT TOP 100 * FROM ${tableName}${whereClause}`;
			const queryResults = await executeQuery(environment, query);

			// Add tableName to results
			onResults({
				...queryResults,
				environment,
				tableName,
				query
			});
		} catch (err) {
			onError(err.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="search-container">
			<div className="form-group">
				<label>Environment:</label>
				<div className="radio-group">
					<label>
						<input
							type="radio"
							value="dev"
							checked={environment === 'dev'}
							onChange={() => setEnvironment('dev')}
						/>
						dev
					</label>
					<label>
						<input
							type="radio"
							value="prod"
							checked={environment === 'prod'}
							onChange={() => setEnvironment('prod')}
						/>
						prod
					</label>
				</div>
			</div>
			<div className="form-group">
				<label>Table Name:</label>
				<input
					type="text"
					value={tableName}
					onChange={(e) => setTableName(e.target.value)}
					placeholder="schema.table_name"
				/>
			</div>
			<div className="form-group">
				<label>Filter (WHERE clause):</label>
				<input
					type="text"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					placeholder="column_name = 'value'"
				/>
			</div>
			<button
				onClick={handleSearch}
				disabled={loading || !tableName}
			>
				{loading ? 'Searching...' : 'Search'}
			</button>
		</div>
	);
}
export default TableSearch;