import React, { useState, useEffect } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import '../styles/pages/ExecutionLogDashboard.css';

function ExecutionLogDashboard() {
	const [environment, setEnvironment] = useState('dev');
	const [logs, setLogs] = useState([]);
	const [queue, setQueue] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [filters, setFilters] = useState({
		log_id: '',
		pipeline_id: '',
		pipeline_name: '',
		pipeline_status: '',
		extract_date: '',
		start_date_time: '',
		end_date_time: ''
	});
	const [queueFilters, setQueueFilters] = useState({
		queue_id: '',
		pipeline_id: '',
		pipeline_name: '',
		queue_status: ['Ready', 'Finished'],
		date_last_modified: '',
		extract_date: '',
		date_of_insert: ''
	});
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(50);
	const [totalCount, setTotalCount] = useState(0);
	const [selectedLog, setSelectedLog] = useState(null);
	const [newStatus, setNewStatus] = useState('');
	const [pipelineSearch, setPipelineSearch] = useState('');
	const [pipelineResults, setPipelineResults] = useState([]);
	const [selectedPipeline, setSelectedPipeline] = useState(null);
	const [dependencyCheckResults, setDependencyCheckResults] = useState(null);

	const statusOptions = ['Succeeded', 'In Progress', 'Failed', 'Cancelled'];
	const queueStatusOptions = ['Blocked', 'Cancelled', 'Finished', 'Ready', 'Fired'];

	const fetchExecutionLogs = async () => {
		try {
			setLoading(true);

			let whereClause = '';
			const whereConditions = [];

			// Build filter conditions
			if (filters.log_id) whereConditions.push(`log_id = ${filters.log_id}`);
			if (filters.pipeline_id) whereConditions.push(`pipeline_id = ${filters.pipeline_id}`);
			if (filters.pipeline_name) whereConditions.push(`pipeline_name LIKE '%${filters.pipeline_name}%'`);
			if (filters.pipeline_status) whereConditions.push(`pipeline_status = '${filters.pipeline_status}'`);
			if (filters.extract_date) whereConditions.push(`CONVERT(date, extract_date) = '${filters.extract_date}'`);
			if (filters.start_date_time) whereConditions.push(`start_date_time >= '${filters.start_date_time}'`);
			if (filters.end_date_time) whereConditions.push(`end_date_time <= '${filters.end_date_time}'`);

			if (whereConditions.length > 0) {
				whereClause = `WHERE ${whereConditions.join(' AND ')}`;
			}

			// Get total count
			const countResult = await executeQuery(
				environment,
				`SELECT COUNT(*) as total FROM rep_mda.mda_ocn_execution_log ${whereClause}`
			);
			setTotalCount(countResult.rows[0][0]);

			// Get logs with pagination
			const offset = (page - 1) * pageSize;
			const result = await executeQuery(
				environment,
				`SELECT 
           log_id, pipeline_id, pipeline_name, pipeline_status,
           ocn_tool_batch_id, extract_date, period_from, period_to,
           start_date_time, end_date_time, error_message, number_of_changed_rows
         FROM rep_mda.mda_ocn_execution_log 
         ${whereClause}
         ORDER BY start_date_time DESC
         OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`
			);

			setLogs(result.rows);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const fetchExecutionQueue = async () => {
		try {
			let whereConditions = [];

			if (queueFilters.queue_id) {
				whereConditions.push(`queue_id = ${queueFilters.queue_id}`);
			}

			if (queueFilters.pipeline_id) {
				whereConditions.push(`pipeline_id = ${queueFilters.pipeline_id}`);
			}

			if (queueFilters.pipeline_name) {
				whereConditions.push(`pipeline_name LIKE '%${queueFilters.pipeline_name}%'`);
			}

			if (queueFilters.queue_status.length > 0) {
				const statusList = queueFilters.queue_status.map(status => `'${status}'`).join(',');
				whereConditions.push(`queue_status IN (${statusList})`);
			}

			if (queueFilters.date_last_modified) {
				whereConditions.push(`date_last_modified >= '${queueFilters.date_last_modified}'`);
			}

			if (queueFilters.extract_date) {
				whereConditions.push(`CONVERT(date, extract_date) = '${queueFilters.extract_date}'`);
			}

			if (queueFilters.date_of_insert) {
				whereConditions.push(`date_of_insert >= '${queueFilters.date_of_insert}'`);
			}

			const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

			const result = await executeQuery(
				environment,
				`SELECT TOP 20
         queue_id, pipeline_id, pipeline_name, queue_status, 
         date_last_modified, extract_date, date_of_insert, custom_params
       FROM rep_mda.mda_ocn_execution_queue 
       ${whereClause}
       ORDER BY date_of_insert DESC`
			);
			setQueue(result.rows);
		} catch (err) {
			console.error('Error fetching execution queue:', err);
			setError(`Error fetching queue: ${err.message}`);
		}
	};

	const changeLogStatus = async () => {
		if (!selectedLog || !newStatus) {
			setError('Please select a log and specify a new status');
			return;
		}

		try {
			setLoading(true);
			const result = await executeQuery(
				environment,
				`UPDATE rep_mda.mda_ocn_execution_log 
         SET pipeline_status = '${newStatus}',
             date_last_modified = GETDATE()
         WHERE log_id = ${selectedLog[0]}`
			);

			if (result.rowsAffected > 0) {
				setError(null);
				setSelectedLog(null);
				setNewStatus('');
				fetchExecutionLogs(); // Refresh logs
				alert('Status updated successfully!');
			} else {
				setError('Failed to update status');
			}
		} catch (err) {
			setError(`Error updating status: ${err.message}`);
		} finally {
			setLoading(false);
		}
	};

	const searchPipelines = async () => {
		if (!pipelineSearch.trim()) {
			setError('Please enter a pipeline name to search');
			return;
		}

		try {
			setLoading(true);
			const result = await executeQuery(
				environment,
				`SELECT pipeline_id, pipeline_name 
         FROM rep_mda.mda_ocn_pipelines 
         WHERE pipeline_name LIKE '%${pipelineSearch}%'
         ORDER BY pipeline_name`
			);
			setPipelineResults(result.rows);
		} catch (err) {
			setError(`Error searching pipelines: ${err.message}`);
		} finally {
			setLoading(false);
		}
	};

	const checkDependencies = async () => {
		if (!selectedPipeline) {
			setError('Please select a pipeline first');
			return;
		}

		try {
			setLoading(true);
			const result = await executeQuery(
				environment,
				`WITH DependencyCTE AS (
          SELECT p.pipeline_id, p.pipeline_name, 1 AS level
          FROM rep_mda.mda_ocn_pipelines p
          JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
          WHERE d.dependant_pipeline_id = ${selectedPipeline[0]}
          
          UNION ALL
          
          SELECT p.pipeline_id, p.pipeline_name, u.level + 1
          FROM rep_mda.mda_ocn_pipelines p
          JOIN rep_mda.mda_ocn_pipeline_dependencies d ON p.pipeline_id = d.pipeline_id
          JOIN DependencyCTE u ON d.dependant_pipeline_id = u.pipeline_id
          WHERE u.level < 10
        )
        SELECT d.pipeline_id, d.pipeline_name, d.level,
               CASE WHEN l.log_id IS NULL THEN 'Not Executed' ELSE 'Executed' END as execution_status,
               l.pipeline_status, l.start_date_time
        FROM DependencyCTE d
        LEFT JOIN (
          SELECT pipeline_id, log_id, pipeline_status, start_date_time,
                 ROW_NUMBER() OVER (PARTITION BY pipeline_id ORDER BY start_date_time DESC) as rn
          FROM rep_mda.mda_ocn_execution_log 
          WHERE pipeline_id IN (SELECT pipeline_id FROM DependencyCTE)
        ) l ON d.pipeline_id = l.pipeline_id AND l.rn = 1
        ORDER BY d.level, d.pipeline_name`
			);

			setDependencyCheckResults(result.rows);
		} catch (err) {
			setError(`Error checking dependencies: ${err.message}`);
			console.error('Dependency query error:', err);
		} finally {
			setLoading(false);
		}
	};

	const handleQueueFilterChange = (field, value) => {
		setQueueFilters(prev => ({ ...prev, [field]: value }));
	};

	const handleQueueStatusChange = (status) => {
		setQueueFilters(prev => {
			const newStatuses = prev.queue_status.includes(status)
				? prev.queue_status.filter(s => s !== status)
				: [...prev.queue_status, status];

			return { ...prev, queue_status: newStatuses };
		});
	};

	useEffect(() => {
		fetchExecutionLogs();
		fetchExecutionQueue();
	}, [environment, page, pageSize]);

	const handleFilterChange = (field, value) => {
		setFilters(prev => ({ ...prev, [field]: value }));
	};

	const handleApplyFilters = () => {
		setPage(1);
		fetchExecutionLogs();
	};

	const handleClearFilters = () => {
		setFilters({
			log_id: '',
			pipeline_id: '',
			pipeline_name: '',
			pipeline_status: '',
			extract_date: '',
			start_date_time: '',
			end_date_time: ''
		});
		setPage(1);
	};

	const calculateDuration = (start, end) => {
		if (!start || !end) return 'N/A';
		const startDate = new Date(start);
		const endDate = new Date(end);
		const diffMs = endDate - startDate;
		const minutes = Math.floor(diffMs / 60000);
		const seconds = ((diffMs % 60000) / 1000).toFixed(0);
		return `${minutes}m ${seconds}s`;
	};

	const totalPages = Math.ceil(totalCount / pageSize);

	return (
		<div className="execution-log-dashboard">
			<HomeButton />
			<br />
			<h1>Execution Log Dashboard</h1>

			<div className="environment-selector">
				<label>Environment:</label>
				<select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
					<option value="dev">Development</option>
					<option value="prod">Production</option>
				</select>
			</div>

			{/* Filters */}
			<div className="filters-section">
				<h3>Execution Log Filters</h3>
				<div className="filters-grid">
					<div className="filter-group">
						<label>Log ID:</label>
						<input
							type="number"
							value={filters.log_id}
							onChange={(e) => handleFilterChange('log_id', e.target.value)}
						/>
					</div>

					<div className="filter-group">
						<label>Pipeline ID:</label>
						<input
							type="number"
							value={filters.pipeline_id}
							onChange={(e) => handleFilterChange('pipeline_id', e.target.value)}
						/>
					</div>

					<div className="filter-group">
						<label>Pipeline Name:</label>
						<input
							type="text"
							value={filters.pipeline_name}
							onChange={(e) => handleFilterChange('pipeline_name', e.target.value)}
						/>
					</div>

					<div className="filter-group">
						<label>Status:</label>
						<select
							value={filters.pipeline_status}
							onChange={(e) => handleFilterChange('pipeline_status', e.target.value)}
						>
							<option value="">All</option>
							{statusOptions.map(status => (
								<option key={status} value={status}>{status}</option>
							))}
						</select>
					</div>

					<div className="filter-group">
						<label>Extract Date:</label>
						<input
							type="date"
							value={filters.extract_date}
							onChange={(e) => handleFilterChange('extract_date', e.target.value)}
						/>
					</div>

					<div className="filter-group">
						<label>Start Date From:</label>
						<input
							type="datetime-local"
							value={filters.start_date_time}
							onChange={(e) => handleFilterChange('start_date_time', e.target.value)}
						/>
					</div>

					<div className="filter-group">
						<label>End Date To:</label>
						<input
							type="datetime-local"
							value={filters.end_date_time}
							onChange={(e) => handleFilterChange('end_date_time', e.target.value)}
						/>
					</div>
				</div>

				<div className="filter-actions">
					<button onClick={handleApplyFilters} disabled={loading}>
						Apply Filters
					</button>
					<button onClick={handleClearFilters} className="secondary">
						Clear Filters
					</button>
				</div>
			</div>

			{error && <div className="error-message">{error}</div>}

			{/* Results */}
			<div className="results-section">
				<div className="results-header">
					<h3>Execution Logs ({totalCount} total records)</h3>
					<div className="pagination-controls">
						<select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value))}>
							<option value={20}>20 per page</option>
							<option value={50}>50 per page</option>
							<option value={100}>100 per page</option>
							<option value={200}>200 per page</option>
						</select>

						<span>Page {page} of {totalPages}</span>

						<button
							onClick={() => setPage(p => Math.max(1, p - 1))}
							disabled={page === 1 || loading}
						>
							Previous
						</button>

						<button
							onClick={() => setPage(p => Math.min(totalPages, p + 1))}
							disabled={page === totalPages || loading}
						>
							Next
						</button>
					</div>
				</div>

				{loading && <div className="loading">Loading execution logs...</div>}

				<div className="logs-table-container">
					<table className="logs-table">
						<thead>
							<tr>
								<th>Log ID</th>
								<th>Pipeline ID</th>
								<th>Pipeline Name</th>
								<th>Status</th>
								<th>Batch ID</th>
								<th>Extract Date</th>
								<th>Start Time</th>
								<th>End Time</th>
								<th>Duration</th>
								<th>Changed Rows</th>
								<th>Error Message</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{logs.map((log, index) => (
								<tr key={index} className={`status-${log[3]?.toLowerCase().replace(' ', '-')}`}>
									<td>{log[0]}</td>
									<td>{log[1]}</td>
									<td className="pipeline-name">{log[2]}</td>
									<td>
										<span className={`status-badge status-${log[3]?.toLowerCase().replace(' ', '-')}`}>
											{log[3]}
										</span>
									</td>
									<td>{log[4]}</td>
									<td>{log[5] ? new Date(log[5]).toLocaleDateString() : 'N/A'}</td>
									<td>{log[8] ? new Date(log[8]).toLocaleString() : 'N/A'}</td>
									<td>{log[9] ? new Date(log[9]).toLocaleString() : 'N/A'}</td>
									<td>{calculateDuration(log[8], log[9])}</td>
									<td>{log[11] || 0}</td>
									<td className="error-message-cell">
										{log[10] ? (
											<span className="error-tooltip" title={log[10]}>
												{log[10].length > 50 ? `${log[10].substring(0, 50)}...` : log[10]}
											</span>
										) : 'N/A'}
									</td>
									<td>
										<button
											onClick={() => setSelectedLog(log)}
											className="change-status-btn"
										>
											Change Status
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{logs.length === 0 && !loading && (
					<div className="no-results">No execution logs found matching your criteria.</div>
				)}
			</div>

			{/* Status Change Modal */}
			{
				selectedLog && (
					<div className="modal-overlay">
						<div className="modal-content">
							<h3>Change Status for Pipeline: {selectedLog[2]}</h3>
							<p>Current Status: <strong>{selectedLog[3]}</strong></p>
							<div className="status-selector">
								<label>New Status:</label>
								<select
									value={newStatus}
									onChange={(e) => setNewStatus(e.target.value)}
								>
									<option value="">Select Status</option>
									{statusOptions.map(status => (
										<option key={status} value={status}>{status}</option>
									))}
								</select>
							</div>
							<div className="modal-actions">
								<button onClick={changeLogStatus} disabled={!newStatus || loading}>
									Update Status
								</button>
								<button onClick={() => setSelectedLog(null)} className="secondary">
									Cancel
								</button>
							</div>
						</div>
					</div>
				)
			}

			{/* Pipeline Dependency Check Section */}
			<div className="dependency-check-section">
				<h2>Pipeline Dependency Check</h2>
				<div className="pipeline-search">
					<input
						type="text"
						placeholder="Search pipeline by name..."
						value={pipelineSearch}
						onChange={(e) => setPipelineSearch(e.target.value)}
					/>
					<button onClick={searchPipelines} disabled={loading}>
						Search Pipelines
					</button>
				</div>

				{pipelineResults.length > 0 && (
					<div className="pipeline-results">
						<h3>Search Results</h3>
						<div className="pipeline-list">
							{pipelineResults.map((pipeline, index) => (
								<div
									key={index}
									className={`pipeline-item ${selectedPipeline && selectedPipeline[0] === pipeline[0] ? 'selected' : ''}`}
									onClick={() => setSelectedPipeline(pipeline)}
								>
									{pipeline[1]} (ID: {pipeline[0]})
								</div>
							))}
						</div>
					</div>
				)}

				{selectedPipeline && (
					<div className="selected-pipeline">
						<h3>Selected Pipeline: {selectedPipeline[1]}</h3>
						<button onClick={checkDependencies} disabled={loading}>
							Check Execution Dependencies
						</button>
					</div>
				)}

				{dependencyCheckResults && (
					<div className="dependency-results">
						<h3>Dependency Execution Status</h3>
						<div className="dependency-table-container">
							<table className="dependency-table">
								<thead>
									<tr>
										<th>Pipeline ID</th>
										<th>Pipeline Name</th>
										<th>Dependency Level</th>
										<th>Execution Status</th>
										<th>Status</th>
										<th>Last Execution</th>
									</tr>
								</thead>
								<tbody>
									{dependencyCheckResults.map((result, index) => (
										<tr key={index} className={result[4] === 'Not Executed' ? 'not-executed' : ''}>
											<td>{result[0]}</td>
											<td>{result[1]}</td>
											<td>{result[2]}</td>
											<td>{result[4]}</td>
											<td>{result[5] || 'N/A'}</td>
											<td>{result[6] ? new Date(result[6]).toLocaleString() : 'N/A'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>

			{/* Execution Queue Section */}
			<div className="queue-section">
				<h2>Execution Queue</h2>

				{/* Queue Filters - Same style as execution log */}
				<div className="filters-section">
					<h3>Queue Filters</h3>
					<div className="filters-grid">
						<div className="filter-group">
							<label>Queue ID:</label>
							<input
								type="number"
								value={queueFilters.queue_id}
								onChange={(e) => handleQueueFilterChange('queue_id', e.target.value)}
							/>
						</div>

						<div className="filter-group">
							<label>Pipeline ID:</label>
							<input
								type="number"
								value={queueFilters.pipeline_id}
								onChange={(e) => handleQueueFilterChange('pipeline_id', e.target.value)}
							/>
						</div>

						<div className="filter-group">
							<label>Pipeline Name:</label>
							<input
								type="text"
								value={queueFilters.pipeline_name}
								onChange={(e) => handleQueueFilterChange('pipeline_name', e.target.value)}
							/>
						</div>

						<div className="filter-group">
							<label>Status:</label>
							<div className="status-checkboxes">
								{queueStatusOptions.map(status => (
									<label key={status} className="checkbox-label">
										<input
											type="checkbox"
											checked={queueFilters.queue_status.includes(status)}
											onChange={() => handleQueueStatusChange(status)}
										/>
										{status}
									</label>
								))}
							</div>
						</div>
						<div className="filter-group">
							<label>Status:</label>
							<select
								value={queueFilters.queue_status}
								onChange={(e) => handleQueueFilterChange('queue_status', e.target.value)}
							>
								<option value="">All</option>
								{queueStatusOptions.map(status => (
									<option key={status} value={status}>{status}</option>
								))}
							</select>
						</div>

						<div className="filter-group">
							<label>Last Modified:</label>
							<input
								type="datetime-local"
								value={queueFilters.date_last_modified}
								onChange={(e) => handleQueueFilterChange('date_last_modified', e.target.value)}
							/>
						</div>

						<div className="filter-group">
							<label>Extract Date:</label>
							<input
								type="date"
								value={queueFilters.extract_date}
								onChange={(e) => handleQueueFilterChange('extract_date', e.target.value)}
							/>
						</div>

						<div className="filter-group">
							<label>Queued From:</label>
							<input
								type="datetime-local"
								value={queueFilters.date_of_insert}
								onChange={(e) => handleQueueFilterChange('date_of_insert', e.target.value)}
							/>
						</div>
					</div>

					<div className="filter-actions">
						<button onClick={fetchExecutionQueue} disabled={loading}>
							Apply Queue Filters
						</button>
						<button onClick={() => {
							setQueueFilters({
								queue_id: '',
								pipeline_id: '',
								pipeline_name: '',
								queue_status: ['Queued', 'Processing'],
								date_last_modified: '',
								extract_date: '',
								date_of_insert: ''
							});
						}} className="secondary">
							Clear Queue Filters
						</button>
					</div>
				</div>
				<div className="queue-table-container">
					<table className="queue-table">
						<thead>
							<tr>
								<th>Queue ID</th>
								<th>Pipeline ID</th>
								<th>Pipeline Name</th>
								<th>Status</th>
								<th>Last Modified</th>
								<th>Extract Date</th>
								<th>Queued At</th>
							</tr>
						</thead>
						<tbody>
							{queue.map((item, index) => (
								<tr key={index} className={`queue-status-${item[3]?.toLowerCase()}`}>
									<td>{item[0]}</td>
									<td>{item[1]}</td>
									<td>{item[2]}</td>
									<td>
										<span className={`status-badge status-${item[3]?.toLowerCase()}`}>
											{item[3]}
										</span>
									</td>
									<td>{item[4] ? new Date(item[4]).toLocaleString() : 'N/A'}</td>
									<td>{item[5] ? new Date(item[5]).toLocaleDateString() : 'N/A'}</td>
									<td>{item[6] ? new Date(item[6]).toLocaleString() : 'N/A'}</td>
								</tr>
							))}
						</tbody>
					</table>
					{queue.length === 0 && <div className="no-results">No pipelines in queue</div>}
				</div>
			</div>
		</div >
	);
}

export default ExecutionLogDashboard;