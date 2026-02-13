export async function executeQuery(environment, query) {
	try {
		console.log("[DEBUG] Sending query:", { environment, query });

		const response = await fetch('http://localhost:5000/api/query', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify({
				environment,
				query
			})
		});

		console.log("[DEBUG] Response status:", response.status);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || `Server responded with ${response.status}`);
		}

		const data = await response.json();
		console.log("[DEBUG] Response data:", data);

		// For all query types
		if (data.success === false) {
			throw new Error(data.error || 'Query failed');
		}

		return data;
	} catch (err) {
		console.error("[DEBUG] Full error:", err);
		throw new Error(`API Error: ${err.message}`);
	}
}


export const executeLocalQuery = async (query, params = []) => {
	try {
		const response = await fetch('/api/local/query', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query, params }),
		});

		const result = await response.json();

		if (!result.success) {
			throw new Error(result.error || 'Query failed');
		}

		return result;
	} catch (error) {
		console.error('Local database query error:', error);
		throw error;
	}
};

// Helper for local database operations
export const localDatabaseService = {
	// Get all tables
	getTables: async () => {
		const response = await fetch('/api/local/tables');
		const result = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.tables;
	},

	// Get table schema
	getTableSchema: async (tableName) => {
		const response = await fetch(`/api/local/table/${tableName}/schema`);
		const result = await response.json();
		if (!result.success) throw new Error(result.error);
		return result.schema;
	},

	// Insert data
	insertData: async (tableName, data) => {
		const response = await fetch(`/api/local/insert/${tableName}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ data }),
		});
		const result = await response.json();
		if (!result.success) throw new Error(result.error);
		return result;
	},

	// Get database info
	getDatabaseInfo: async () => {
		const response = await fetch('/api/local/info');
		const result = await response.json();
		if (!result.success) throw new Error(result.error);
		return result;
	},

	// Test connection
	testConnection: async () => {
		const response = await fetch('/api/local/test');
		return await response.json();
	},
};