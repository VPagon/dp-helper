import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/pages/_home.scss';
import HomeButton from '../components/common/HomeButtom';

function HomePage() {
  return (
    <div className="home-page">
      <HomeButton />
      <h1>Services</h1>
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
        <Link to="/replicate-to-br" className="service-card">
          <h2>Replicate Table to BR</h2>
          <p>Generate replication scripts for BR database</p>
        </Link>
        <Link to="/load-infor-table" className="service-card">
          <h2>Load Infor Table</h2>
          <p>Generate configuration for Infor table loading</p>
        </Link>
        <Link to="/pipeline-branch-out" className="service-card">
          <h2>Pipeline Branch Out</h2>
          <p>Visualize pipeline dependencies and execution order</p>
        </Link>
      </div>
    </div>
  );
}

export default HomePage;