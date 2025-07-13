// src/components/common/AddDependancyButton.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './AddDependancyButton.css';

function AddDependancyButton() {
  const navigate = useNavigate();

  return (
    <button 
      className="add-dependancy-button"
      onClick={() => navigate('/orchestrate-pipelines')}
    >
      Add dependancy
    </button>
  );
}

export default AddDependancyButton;