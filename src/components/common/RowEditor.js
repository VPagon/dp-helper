import React, { useState } from 'react';

function RowEditor({ row, columns, onClose, onUpdate, tableName }) {
	const [editedValues, setEditedValues] = useState({});
	const [showUpdateDialog, setShowUpdateDialog] = useState(false);
	const [updateQuery, setUpdateQuery] = useState('');
	const [error, setError] = useState('');
	const [successMessage, setSuccessMessage] = useState('');

	const handleValueChange = (colIndex, value) => {
		setEditedValues({
			...editedValues,
			[columns[colIndex]]: value
		});
	};

	const generateUpdateQuery = () => {
		try {
			if (Object.keys(editedValues).length === 0) {
				throw new Error('No fields have been modified');
			}

			if (!tableName) {
				throw new Error('Table name is missing. Please perform a new search.');
			}

			if (!columns?.[0] || !row?.[0]) {
				throw new Error('Primary key column not found');
			}

			const setClause = Object.entries(editedValues)
				.map(([col, val]) => `${col} = ${val === null ? 'NULL' : `'${val.replace(/'/g, "''")}'`}`)
				.join(', ');

			const whereClause = `${columns[0]} = '${row[0]}'`;

			const query = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause};`;
			setUpdateQuery(query);
			setShowUpdateDialog(true);
			setError('');
		} catch (err) {
			setError(err.message);
		}
	};

	return (
		<div className="row-editor">
			<button className="close-btn" onClick={onClose}>×</button>
			<h3>Edit Row</h3>

			{error && <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

			<div className="editor-fields">
				{columns.map((col, i) => (
					<div key={col} className="field-group">
						<label>{col}:</label>
						<input
							type="text"
							value={editedValues[col] ?? row[i]}
							onChange={(e) => handleValueChange(i, e.target.value)}
						/>
					</div>
				))}
			</div>

			<button
				onClick={generateUpdateQuery}
				disabled={Object.keys(editedValues).length === 0}
			>
				Generate Update
			</button>
			<br />
			<br />

			{showUpdateDialog && (
				<div className="update-dialog">
					<h4>Update Query</h4>
					<pre>{updateQuery}</pre>
					{successMessage && (
					<div className="success-message">{successMessage}</div>
					)}
					<div className="dialog-actions">
					<button onClick={() => navigator.clipboard.writeText(updateQuery)}>
						Copy to Clipboard
					</button>
					<button onClick={async () => {
						try {
							const success = await onUpdate(updateQuery);
							if (success) {
							setSuccessMessage('Update successful!');
							setTimeout(() => {
								setShowUpdateDialog(false);
								setSuccessMessage('');
							}, 1500);
							}
						} catch (err) {
							setError(err.message);
						}
						}}>
						Execute Update
						</button>
					<button onClick={() => setShowUpdateDialog(false)}>
						Cancel
					</button>
					</div>
				</div>
				)}
		</div>
	);
}

export default RowEditor;