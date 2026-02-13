import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/pages/_home.scss';

function HomePage() {
  return (
    <div className="home-page">
      <div className="tool-categories">

        {/* Monitoring Section */}
        <div className="category-card">
          <h2>Monitoring</h2>
          <div className="tool-list">
            <Link to="/metadata-differences" className="tool-card">
              <h3>Metadata Comparison</h3>
              <p>Compare Dev vs Prod environments</p>
            </Link>
            <Link to="/monitor-offloading" className="tool-card">
              <h3>Offloading Monitor</h3>
              <p>Track scheduled data offloading</p>
            </Link>
            <Link to="/execution-logs" className="tool-card">
              <h3>Execution Log Dashboard</h3>
              <p>Monitor pipeline execution logs and statuses</p>
            </Link>
          </div>
        </div>

        {/* Help services Section */}
        <div className="category-card">
          <h2>Help Services</h2>
          <div className="tool-list">
            <Link to="/insert-data" className="tool-card">
              <h3>Insert Data</h3>
              <p>Generate SQL INSERT statements</p>
            </Link>
            <Link to="/recreate-table" className="tool-card">
              <h3>Recreate Table</h3>
              <p>Generate Delta table recreation SQL</p>
            </Link>
            <Link to="/add-dq-rules" className="tool-card">
              <h3>Add DQ Rules</h3>
              <p>Manage Data Quality rules and configurations</p>
            </Link>
          </div>
        </div>

        {/* Metadata Operations Section */}
        <div className="category-card">
          <h2>Metadata Operations</h2>
          <div className="tool-list">
            <Link to="/query-metadata" className="tool-card">
              <h3>Query Metadata</h3>
              <p>Execute metadata database queries</p>
            </Link>
            <Link to="/database-crud-page" className="tool-card">
              <h3>Database CRUD</h3>
              <p>Manage metadata database tables</p>
            </Link>
            <Link to="/database-crud-page-v2" className="tool-card">
              <h3>Database CRUD V2</h3>
              <p>Manage metadata database tables</p>
            </Link>
          </div>
        </div>

        {/* Pipeline Tools Section */}
        <div className="category-card">
          <h2>Pipeline Tools</h2>
          <div className="tool-list">
            <Link to="/pipeline-analysis" className="tool-card">
              <h3>Pipeline Analysis</h3>
              <p>Analyze pipeline dependencies and metadata</p>
            </Link>
            <Link to="/orchestrate-pipelines" className="tool-card">
              <h3>Pipeline Orchestration</h3>
              <p>Configure pipeline dependencies</p>
            </Link>
            <Link to="/pipeline-branch-out" className="tool-card">
              <h3>Pipeline Visualization</h3>
              <p>View dependency graphs</p>
            </Link>
          </div>
        </div>

        {/* System Integration Section */}
        <div className="category-card">
          <h2>System Integration</h2>
          <div className="tool-list">
            <Link to="/load-infor-table" className="tool-card">
              <h3>Infor Delta Table Loader</h3>
              <p>Load table from infor to DP in delta table on raw</p>
            </Link>
            <Link to="/replicate-to-br" className="tool-card">
              <h3>Data Replication</h3>
              <p>Generate BR replication scripts</p>
            </Link>
            <Link to="/load-jira-asset" className="tool-card">
              <h3>Load Jira Asset</h3>
              <p>Configure Jira Asset loading from REST to landing zone</p>
            </Link>
            <Link to="/auto-deploy" className="tool-card">
              <h3>Auto Deploy Metadata</h3>
              <p>Automated metadata deployment to production</p>
            </Link>
          </div>
        </div>

        <div className="category-card">
          <h2>Data migration</h2>
          <div className="tool-list">
            <Link to="/data-sync" className="tool-card">
              <h3>SQLDB-KUP-APP DEV-PROD MIGRATION</h3>
              <p>Migrate keeping up data from dev to prod server</p>
            </Link>
            <Link to="/metadaterium" className="tool-card">
              <h3>Metadaterium</h3>
              <p>Load data throuhm metadaterium framework</p>
            </Link>
          </div>
        </div>

        <div className="category-card">
          <h2>Local database</h2>
          <div className="tool-list">
            <Link to="/local-database-manager" className="tool-card">
              <h3>CRUD</h3>
              <p>Manage local database</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;