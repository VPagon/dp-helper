import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import InsertDataPage from './pages/InsertDataPage';
import RecreateTablePage from './pages/RecreateTablePage';
import QueryMetadataPage from './pages/QueryMetadataPage';
import ReplicateToBRPage from './pages/ReplicateToBRPage';
import LoadInforTablePage from './pages/LoadInforTablePage';
import PipelineBranchOutPage from './pages/PipelineBranchOutPage';

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
        </Routes>
      </div>
    </Router>
  );
}

export default App;