import React, { useState } from 'react';
import { executeQuery } from '../services/sqlService';
import HomeButton from '../components/common/HomeButtom';
import { buildInforTableInserts, SOURCE_SERVER_OPTIONS } from '../utils/inforTableSql';
import '../styles/pages/_load-infor-table.scss';

const ENVIRONMENTS = [
	{ value: 'dev', label: 'Development' },
	{ value: 'prod', label: 'Production' },
	{ value: 'deploy', label: 'Deploy' },
];

function LoadInforTablePage() {
	const [baseTable, setBaseTable] = useState('');
	const [companiesCsv, setCompaniesCsv] = useState('220,221,222,223');
	const [environment, setEnvironment] = useState('dev');
	const [sourceServer, setSourceServer] = useState(SOURCE_SERVER_OPTIONS[0].value);
	const [sourceDatabase, setSourceDatabase] = useState(SOURCE_SERVER_OPTIONS[0].database);
	const [sourceAlias, setSourceAlias] = useState(SOURCE_SERVER_OPTIONS[0].alias);
	const [sourceSchema, setSourceSchema] = useState('dbo');
	const [pkColumnsCsv, setPkColumnsCsv] = useState('');
	const [owner, setOwner] = useState('Vilim Pagon');
	const [loadCategoryCdc, setLoadCategoryCdc] = useState('standard_load');
	const [loadCategorySnapshot, setLoadCategorySnapshot] = useState('irregular_dq');
	const [loadCategoryRdl, setLoadCategoryRdl] = useState('standard_load');
	const [taskIdCdc, setTaskIdCdc] = useState(7);
	const [taskIdSnapshot, setTaskIdSnapshot] = useState(110);

	const [companyResults, setCompanyResults] = useState([]);

	const handleSourceServerChange = (value) => {
		setSourceServer(value);
		const opt = SOURCE_SERVER_OPTIONS.find((o) => o.value === value);
		if (opt) {
			setSourceAlias(opt.alias);
			setSourceDatabase(opt.database);
		}
	};

	const handleGenerate = () => {
		const results = buildInforTableInserts({
			baseTable,
			companiesCsv,
			sourceServer,
			sourceDatabase,
			sourceAlias,
			sourceSchema,
			pkColumnsCsv,
			owner,
			loadCategoryCdc,
			loadCategorySnapshot,
			loadCategoryRdl,
			taskIdCdc: Number(taskIdCdc) || 0,
			taskIdSnapshot: Number(taskIdSnapshot) || 0,
		});

		setCompanyResults(results.map((r) => ({
			...r,
			queries: r.queries.map((q) => ({ ...q, text: q.sql, status: 'idle', message: '' })),
		})));
	};

	const updateQueryText = (companyIdx, queryIdx, text) => {
		setCompanyResults((prev) => {
			const next = [...prev];
			const queries = [...next[companyIdx].queries];
			queries[queryIdx] = { ...queries[queryIdx], text };
			next[companyIdx] = { ...next[companyIdx], queries };
			return next;
		});
	};

	const setQueryStatus = (companyIdx, queryIdx, status, message = '') => {
		setCompanyResults((prev) => {
			const next = [...prev];
			const queries = [...next[companyIdx].queries];
			queries[queryIdx] = { ...queries[queryIdx], status, message };
			next[companyIdx] = { ...next[companyIdx], queries };
			return next;
		});
	};

	const executeOne = async (companyIdx, queryIdx) => {
		const company = companyResults[companyIdx];
		const query = company.queries[queryIdx];
		setQueryStatus(companyIdx, queryIdx, 'running');
		try {
			const result = await executeQuery(environment, query.text, {
				source: 'load-infor-table',
				metadata: { company: company.company, fullTable: company.fullTable, queryId: query.id },
			});
			setQueryStatus(companyIdx, queryIdx, 'success', result.message || `Rows affected: ${result.rowsAffected ?? 0}`);
		} catch (err) {
			setQueryStatus(companyIdx, queryIdx, 'error', err.message);
		}
	};

	const executeAll = async (companyIdx) => {
		for (let i = 0; i < companyResults[companyIdx].queries.length; i++) {
			// eslint-disable-next-line no-await-in-loop
			await executeOne(companyIdx, i);
		}
	};

	const copyOne = (text) => {
		navigator.clipboard.writeText(text);
	};

	const canGenerate = baseTable.trim() && companiesCsv.trim();

	return (
		<div className="load-infor-table-page">
			<HomeButton />
			<h1>Load Infor Table Wizard</h1>
			<p className="page-subtitle">
				Onboard an Infor/ITAC table family (base table + company codes) into the metadata-driven ingestion framework:
				CDC-landing, snapshot-bronze, and RDL-delta pipelines, their ingestion jobs, RDL table definition, and dependencies.
			</p>

			<div className="wizard-form">
				<div className="form-row">
					<div className="form-group">
						<label>Base Infor Table Name</label>
						<input
							type="text"
							value={baseTable}
							onChange={(e) => setBaseTable(e.target.value)}
							placeholder="e.g. TQMPTC300"
						/>
					</div>
					<div className="form-group">
						<label>Company Codes (comma-separated)</label>
						<input
							type="text"
							value={companiesCsv}
							onChange={(e) => setCompaniesCsv(e.target.value)}
							placeholder="220,221,222,223"
						/>
					</div>
				</div>

				<div className="form-row">
					<div className="form-group">
						<label>Target Metadata Environment</label>
						<select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
							{ENVIRONMENTS.map((env) => (
								<option key={env.value} value={env.value}>{env.label}</option>
							))}
						</select>
					</div>
					<div className="form-group">
						<label>Infor / ITAC Source Server</label>
						<select value={sourceServer} onChange={(e) => handleSourceServerChange(e.target.value)}>
							{SOURCE_SERVER_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>{opt.value}</option>
							))}
						</select>
					</div>
				</div>

				<div className="form-row">
					<div className="form-group">
						<label>Source Database Name</label>
						<input type="text" value={sourceDatabase} onChange={(e) => setSourceDatabase(e.target.value)} />
					</div>
					<div className="form-group">
						<label>Source Connection Alias</label>
						<input type="text" value={sourceAlias} onChange={(e) => setSourceAlias(e.target.value)} />
					</div>
					<div className="form-group">
						<label>Source Schema</label>
						<input type="text" value={sourceSchema} onChange={(e) => setSourceSchema(e.target.value)} />
					</div>
				</div>

				<div className="form-row">
					<div className="form-group form-group--wide">
						<label>Primary Key Columns (comma-separated)</label>
						<input
							type="text"
							value={pkColumnsCsv}
							onChange={(e) => setPkColumnsCsv(e.target.value)}
							placeholder="e.g. t_cbdt,t_inno,t_inst,t_srno"
						/>
					</div>
					<div className="form-group">
						<label>Pipeline Owner</label>
						<input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} />
					</div>
				</div>

				<div className="form-row">
					<div className="form-group">
						<label>Load Category — CDC</label>
						<input type="text" value={loadCategoryCdc} onChange={(e) => setLoadCategoryCdc(e.target.value)} />
					</div>
					<div className="form-group">
						<label>Load Category — Snapshot</label>
						<input type="text" value={loadCategorySnapshot} onChange={(e) => setLoadCategorySnapshot(e.target.value)} />
					</div>
					<div className="form-group">
						<label>Load Category — RDL</label>
						<input type="text" value={loadCategoryRdl} onChange={(e) => setLoadCategoryRdl(e.target.value)} />
					</div>
				</div>

				<div className="form-row">
					<div className="form-group">
						<label>Task ID — CDC</label>
						<input type="number" value={taskIdCdc} onChange={(e) => setTaskIdCdc(e.target.value)} />
					</div>
					<div className="form-group">
						<label>Task ID — Snapshot</label>
						<input type="number" value={taskIdSnapshot} onChange={(e) => setTaskIdSnapshot(e.target.value)} />
					</div>
				</div>

				<button type="button" className="generate-btn" onClick={handleGenerate} disabled={!canGenerate}>
					Generate SQL
				</button>
			</div>

			{companyResults.map((companyResult, companyIdx) => (
				<div key={companyResult.company} className="company-section">
					<div className="company-section-header">
						<h2>{companyResult.fullTable}</h2>
						<button type="button" className="execute-all-btn" onClick={() => executeAll(companyIdx)}>
							Execute All ({environment})
						</button>
					</div>

					{companyResult.queries.map((query, queryIdx) => (
						<div key={query.id} className="query-block">
							<div className="query-block-header">
								<span className="query-label">{query.label}</span>
								{query.status === 'running' && <span className="query-status query-status--running">Running...</span>}
								{query.status === 'success' && <span className="query-status query-status--success">{query.message || 'OK'}</span>}
								{query.status === 'error' && <span className="query-status query-status--error">{query.message}</span>}
							</div>
							<textarea
								className="query-textarea"
								value={query.text}
								onChange={(e) => updateQueryText(companyIdx, queryIdx, e.target.value)}
								rows={Math.min(20, query.text.split('\n').length + 1)}
							/>
							<div className="query-block-actions">
								<button
									type="button"
									onClick={() => executeOne(companyIdx, queryIdx)}
									disabled={query.status === 'running'}
								>
									Execute ({environment})
								</button>
								<button type="button" className="copy-btn" onClick={() => copyOne(query.text)}>
									Copy to Clipboard
								</button>
							</div>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

export default LoadInforTablePage;
