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
		extract_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
		start_date_time: '',
		end_date_time: ''
	});
	const [queueFilters, setQueueFilters] = useState({
		queue_id: '',
		pipeline_id: '',
		pipeline_name: '',
		queue_status: '',
		date_last_modified: '',
		extract_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
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
	const [extractDate, setExtractDate] = useState(new Date(Date.now() - 86400000).toISOString().split('T')[0]);

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
			if (filters.extract_date) whereConditions.push(`extract_date >= '${filters.extract_date} 00:00:00' and extract_date <= '${filters.extract_date} 23:59:59'`);
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
         ORDER BY log_id DESC
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

			if (queueFilters.queue_status) {
				whereConditions.push(`queue_status = '${queueFilters.queue_status}'`);
			}

			if (queueFilters.date_last_modified) {
				whereConditions.push(`date_last_modified >= '${queueFilters.date_last_modified}'`);
			}

			if (queueFilters.extract_date) {
				whereConditions.push(`extract_date >= '${queueFilters.extract_date} 00:00:00' and extract_date <= '${queueFilters.extract_date} 23:59:59'`);
			}

			if (queueFilters.date_of_insert) {
				whereConditions.push(`date_of_insert >= '${queueFilters.date_of_insert}'`);
			}

			const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

			const result = await executeQuery(
				environment,
				`SELECT 
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
				`declare @extract_date datetime 
				set @extract_date = '${extractDate} 00:00:00.000'
				select pd.dependant_pipeline_id, p.pipeline_name, * from rep_mda.mda_ocn_pipeline_dependencies pd 
				left join rep_mda.mda_ocn_execution_log el on el.extract_date=@extract_date and pd.dependant_pipeline_id=el.pipeline_id
				left join rep_mda.mda_ocn_pipelines p on pd.dependant_pipeline_id=p.pipeline_id 
				where pd.pipeline_id=(select pipeline_id from rep_mda.mda_ocn_pipelines where pipeline_name = '${selectedPipeline[1]}')
				and el.log_id is null`
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

	const handleApplyQueueFilters = () => {
		fetchExecutionQueue();
	};

	const handleClearQueueFilters = () => {
		setQueueFilters({
			queue_id: '',
			pipeline_id: '',
			pipeline_name: '',
			queue_status: '',
			date_last_modified: '',
			extract_date: '',
			date_of_insert: ''
		});
	};

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

	const formatDateTime = (dateTimeString) => {
		if (!dateTimeString) return 'N/A';

		// Parse the date string directly without timezone conversion
		const date = new Date(dateTimeString);

		// Check if the date is valid
		if (isNaN(date.getTime())) return 'N/A';

		// Use UTC methods to avoid timezone conversion
		const year = date.getUTCFullYear();
		const month = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');
		const hours = String(date.getUTCHours()).padStart(2, '0');
		const minutes = String(date.getUTCMinutes()).padStart(2, '0');
		const seconds = String(date.getUTCSeconds()).padStart(2, '0');

		return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
	};

	const formatDateOnly = (dateTimeString) => {
		if (!dateTimeString) return 'N/A';

		const date = new Date(dateTimeString);
		if (isNaN(date.getTime())) return 'N/A';

		const year = date.getUTCFullYear();
		const month = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');

		return `${month}/${day}/${year}`;
	};

	const formatDateTimeLocal = (dateTimeString) => {
		if (!dateTimeString) return 'N/A';

		const date = new Date(dateTimeString);
		if (isNaN(date.getTime())) return 'N/A';

		const year = date.getUTCFullYear();
		const month = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');
		const hours = String(date.getUTCHours()).padStart(2, '0');
		const minutes = String(date.getUTCMinutes()).padStart(2, '0');

		return `${year}-${month}-${day}T${hours}:${minutes}`;
	};

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
							className="pagination-btn"
						>
							Previous
						</button>

						<button
							onClick={() => setPage(p => Math.min(totalPages, p + 1))}
							disabled={page === totalPages || loading}
							className="pagination-btn"
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
									<td>{log[5] ? formatDateTime(log[5]) : 'N/A'}</td>
									<td>{log[8] ? formatDateTime(log[8]) : 'N/A'}</td>
									<td>{log[9] ? formatDateTime(log[9]) : 'N/A'}</td>
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
			{selectedLog && (
				<div className="modal-overlay">
					<div className="modal-content status-modal">
						<h3>Change Status for Pipeline: {selectedLog[2]}</h3>
						<p>Current Status: <strong>{selectedLog[3]}</strong></p>
						<div className="status-selector">
							<label>New Status:</label>
							<select
								value={newStatus}
								onChange={(e) => setNewStatus(e.target.value)}
								className="status-select"
							>
								<option value="">Select Status</option>
								{statusOptions.map(status => (
									<option key={status} value={status}>{status}</option>
								))}
							</select>
						</div>
						<div className="modal-actions">
							<button onClick={changeLogStatus} disabled={!newStatus || loading} className="primary-btn">
								Update Status
							</button>
							<button onClick={() => setSelectedLog(null)} className="secondary-btn">
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Pipeline Dependency Check Section */}
			<div className="dependency-check-section">
				<h2>Pipeline Dependency Check</h2>
				<div className="dependency-controls">
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

					<div className="extract-date-selector">
						<label>Extract Date:</label>
						<input
							type="date"
							value={extractDate}
							onChange={(e) => setExtractDate(e.target.value)}
						/>
					</div>
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
							<table className="dependency-table logs-table">
								<thead>
									<tr>
										<th>Dependant Pipeline ID</th>
										<th>Pipeline Name</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									{dependencyCheckResults.map((result, index) => (
										<tr key={index} className="not-executed">
											<td>{result[0]}</td>
											<td>{result[1]}</td>
											<td>Not Executed</td>
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

				{/* Queue Filters */}
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
						<button onClick={handleApplyQueueFilters} disabled={loading}>
							Apply Queue Filters
						</button>
						<button onClick={handleClearQueueFilters} className="secondary">
							Clear Queue Filters
						</button>
					</div>
				</div>

				{/* Queue Results */}
				<div className="results-section">
					<div className="results-header">
						<h3>Execution Queue ({queue.length} records)</h3>
					</div>

					<div className="queue-table-container logs-table-container">
						<table className="logs-table">
							<thead>
								<tr>
									<th>Queue ID</th>
									<th>Pipeline ID</th>
									<th>Pipeline Name</th>
									<th>Status</th>
									<th>Last Modified</th>
									<th>Extract Date</th>
									<th>Queued At</th>
									<th>Custom Params</th>
								</tr>
							</thead>
							<tbody>
								{queue.map((item, index) => (
									<tr key={index} className={`status-${item[3]?.toLowerCase()}`}>
										<td>{item[0]}</td>
										<td>{item[1]}</td>
										<td className="pipeline-name">{item[2]}</td>
										<td>
											<span className={`status-badge status-${item[3]?.toLowerCase()}`}>
												{item[3]}
											</span>
										</td>
										<td>{item[4] ? formatDateTime(item[4]) : 'N/A'}</td>
										<td>{item[5] ? formatDateTime(item[5]) : 'N/A'}</td>
										<td>{item[6] ? formatDateTime(item[6]) : 'N/A'}</td>
										<td className="error-message-cell">
											{item[7] ? (
												<span className="error-tooltip" title={item[7]}>
													{item[7].length > 50 ? `${item[7].substring(0, 50)}...` : item[7]}
												</span>
											) : 'N/A'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{queue.length === 0 && !loading && (
						<div className="no-results">No pipelines in queue</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default ExecutionLogDashboard;