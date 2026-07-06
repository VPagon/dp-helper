import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext';
import AppHeader from './components/layout/AppHeader';
import HomePage from './pages/HomePage';
import InsertDataPage from './pages/InsertDataPage';
import RecreateTablePage from './pages/RecreateTablePage';
import ReplicateToBRPage from './pages/ReplicateToBRPage';
import LoadInforTablePage from './pages/LoadInforTablePage';
import PipelineBranchOutPage from './pages/PipelineBranchOutPage';
import GetMetadataDifferences from 'pages/GetMetadataDifferences';
import OrchestratePipelinesPage from './pages/OrchestratePipelinesPage';
import MonitorOffloadingPage from './pages/MonitorOffloadingPage';
import LoadJiraAssetPage from './pages/LoadJiraAssetPage';
import PipelineAnalysisPage from './pages/PipelineAnalysisPage';
import AddDQRulesPage from './pages/AddDQRulesPage';
import ExecutionLogDashboard from './pages/ExecutionLogDashboard';
import AutoDeployMetadata from './pages/AutoDeployMetadata';
import DatabaseCRUDPage from 'pages/DatabaseCRUDPage';
import DatabaseInfoPage from 'pages/DatabaseInfoPage';
import DataSyncPage from './pages/DataSyncPage';
import MetadateriumPage from './pages/MetadateriumPage';
import LocalDatabaseManager from './pages/LocalDatabaseManager';
import QueryHistoryPage from './pages/QueryHistoryPage';
import CodeSnippetsPage from './pages/CodeSnippetsPage';
import MrmDleComparePage from './pages/MrmDleComparePage';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="app">
          <AppHeader />
          <main className="app-main">
            <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/insert-data" element={<InsertDataPage />} />
          <Route path="/recreate-table" element={<RecreateTablePage />} />
          <Route path="/replicate-to-br" element={<ReplicateToBRPage />} />
          <Route path="/load-infor-table" element={<LoadInforTablePage />} />
          <Route path="/pipeline-branch-out" element={<PipelineBranchOutPage />} />
          <Route path="/metadata-differences" element={<GetMetadataDifferences />} />
          <Route path="/orchestrate-pipelines" element={<OrchestratePipelinesPage />} />
          <Route path="/monitor-offloading" element={<MonitorOffloadingPage />} />
          <Route path="/load-jira-asset" element={<LoadJiraAssetPage />} />
          <Route path="/pipeline-analysis" element={<PipelineAnalysisPage />} />
          <Route path="/add-dq-rules" element={<AddDQRulesPage />} />
          <Route path="/execution-logs" element={<ExecutionLogDashboard />} />
          <Route path="/auto-deploy" element={<AutoDeployMetadata />} />
          <Route path="/database-crud" element={<DatabaseCRUDPage />} />
          <Route path="/database-info" element={<DatabaseInfoPage />} />
          <Route path="/database-crud-page" element={<Navigate to="/database-crud" replace />} />
          <Route path="/database-crud-page-v2" element={<Navigate to="/database-crud" replace />} />
          <Route path="/data-sync" element={<DataSyncPage />} />
          <Route path="/metadaterium" element={<MetadateriumPage />} />
          <Route path="/local-database-manager" element={<LocalDatabaseManager />} />
          <Route path="/query-history" element={<QueryHistoryPage />} />
          <Route path="/code-snippets" element={<CodeSnippetsPage />} />
          <Route path="/mrm-dle-compare" element={<MrmDleComparePage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;