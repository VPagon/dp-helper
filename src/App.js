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
          <Route path="/get-metadata-differences" element={<GetMetadataDifferences />} />
          <Route path="/database-crud-page" element={< DatabaseCRUDPage/>} />
          <Route path="/orchestrate-pipelines" element={<OrchestratePipelinesPage />} />
          <Route path="/monitor-offloading" element={<MonitorOffloadingPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;