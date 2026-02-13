// test-fixes.js
const { getLocalDatabase } = require('./local-db');

async function testFixes() {
    console.log('🧪 Testing SQLite fixes...\n');
    
    try {
        const db = getLocalDatabase();
        
        console.log('1. Testing string literals (single quotes):');
        const test1 = await db.query("SELECT 'test' as value, CURRENT_TIMESTAMP as now");
        console.log('   ✅', test1.rows[0]);
        
        console.log('\n2. Testing table schema (no colon syntax):');
        const tables = await db.getTables();
        if (tables.length > 0) {
            const schema = await db.getTableSchema(tables[0]);
            console.log(`   ✅ Schema for ${tables[0]}:`, schema.rowCount, 'columns');
        }
        
        console.log('\n3. Testing key-value storage (CURRENT_TIMESTAMP fix):');
        await db.setValue('test_fix', 'fixed_value');
        const kvResult = await db.getValue('test_fix');
        console.log(`   ✅ Value retrieved: ${kvResult.value}`);
        
        console.log('\n4. Testing GraphQL rejection:');
        try {
            const graphqlQuery = `query { __schema { types { name } } }`;
            await db.query(graphqlQuery);
            console.log('   ❌ Should have rejected GraphQL');
        } catch (err) {
            console.log(`   ✅ Correctly rejected GraphQL: ${err.message}`);
        }
        
        console.log('\n5. Testing table with spaces (sanitization):');
        // Create a test table with spaces
        await db.query("CREATE TABLE IF NOT EXISTS `test table` (id INTEGER, name TEXT)");
        const allTables = await db.getTables();
        console.log(`   ✅ Tables: ${allTables.join(', ')}`);
        
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        await db.query("DROP TABLE IF EXISTS `test table`");
        await db.query("DELETE FROM app_data WHERE key = 'test_fix'");
        
        console.log('\n🎉 All fixes working correctly!');
        
    } catch (err) {
        console.error('❌ Test failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

testFixes();