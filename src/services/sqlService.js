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