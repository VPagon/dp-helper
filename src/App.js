import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import InsertDataPage from './pages/InsertDataPage';
import RecreateTablePage from './pages/RecreateTablePage';
import QueryMetadataPage from './pages/QueryMetadataPage';
import ReplicateToBRPage from './pages/ReplicateToBRPage';
import LoadInforTablePage from './pages/LoadInforTablePage';
import PipelineBranchOutPage from './pages/PipelineBranchOutPage';
import GetMetadataDifferences from 'pages/GetMetadataDifferences';
import DatabaseCRUDPage from 'pages/DatabaseCRUDPage';
import OrchestratePipelinesPage from './pages/OrchestratePipelinesPage';
import MonitorOffloadingPage from './pages/MonitorOffloadingPage';
import LoadJiraAssetPage from './pages/LoadJiraAssetPage';
import PipelineAnalysisPage from './pages/PipelineAnalysisPage';
import AddDQRulesPage from './pages/AddDQRulesPage';
import ExecutionLogDashboard from './pages/ExecutionLogDashboard';
import AutoDeployMetadata from './pages/AutoDeployMetadata';
import DatabaseCRUDPageV2 from 'pages/DatabaseCRUDPageV2';
import DataSyncPage from './pages/DataSyncPage';
import MetadateriumPage from './pages/MetadateriumPage';
import LocalDatabaseManager from './pages/LocalDatabaseManager';

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/insert-data" element={<InsertDataPage />} />
          <Route path="/recreate-table" element={<RecreateTablePage />} />
          <Route path="/query-metadata" element={<QueryMetadataPage />} />
          <Route path="/replicate-to-br" element={<ReplicateToBRPage />} />
          <Route path="/load-infor-table" element={<LoadInforTablePage />} />
          <Route path="/pipeline-branch-out" element={<PipelineBranchOutPage />} />
          <Route path="/metadata-differences" element={<GetMetadataDifferences />} />
          <Route path="/database-crud-page" element={< DatabaseCRUDPage />} />
          <Route path="/orchestrate-pipelines" element={<OrchestratePipelinesPage />} />
          <Route path="/monitor-offloading" element={<MonitorOffloadingPage />} />
          <Route path="/load-jira-asset" element={<LoadJiraAssetPage />} />
          <Route path="/pipeline-analysis" element={<PipelineAnalysisPage />} />
          <Route path="/add-dq-rules" element={<AddDQRulesPage />} />
          <Route path="/execution-logs" element={<ExecutionLogDashboard />} />
          <Route path="/auto-deploy" element={<AutoDeployMetadata />} />
          <Route path="/database-crud-page-v2" element={<DatabaseCRUDPageV2 />} />
          <Route path="/data-sync" element={<DataSyncPage />} />
          <Route path="/metadaterium" element={<MetadateriumPage />} />
          <Route path="/local-database-manager" element={<LocalDatabaseManager />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;