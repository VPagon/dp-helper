import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/pages/_home.scss';

function HomePage() {
  return (
    <div className="home-page">
      <div className="columns-container">
        <div className="column">
          <h1>Helper Functions</h1>
          <div className="service-list">
            <Link to="/insert-data" className="service-card">
              <h2>Insert Data</h2>
              <p>Generate SQL INSERT statements from tabular data</p>
            </Link>
            <Link to="/recreate-table" className="service-card">
              <h2>Recreate Table</h2>
              <p>Generate SQL for recreating Delta tables</p>
            </Link>
            <Link to="/query-metadata" className="service-card">
              <h2>Query Metadata</h2>
              <p>Execute queries against the metadata database</p>
            </Link>
            <Link to="/pipeline-branch-out" className="service-card">
              <h2>Pipeline Branch Out</h2>
              <p>Visualize pipeline dependencies and execution order</p>
            </Link>
          </div>
        </div>

        <div className="column">
          <h1>Services</h1>
          <div className="service-list">
            <Link to="/load-infor-table" className="service-card">
              <h2>Load Infor Table</h2>
              <p>Generate configuration for Infor table loading</p>
            </Link>
            <Link to="/replicate-to-br" className="service-card">
              <h2>Replicate Table to BR</h2>
              <p>Generate replication scripts for BR database</p>
            </Link>
            <Link to="/get-metadata-differences" className="service-card">
              <h2>Get Metadata Differences</h2>
              <p>Get all differences between Dev and Prod Metadata</p>
            </Link>
            <Link to="/database-page" className="service-card">
              <h2>Database Page</h2>
              <p>Select and update rows in a metadata table</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;