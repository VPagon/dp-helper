// src/components/common/HomeButton.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomeButton.css';

function HomeButton() {
  const navigate = useNavigate();

  return (
    <button 
      className="home-button"
      onClick={() => navigate('/')}
    >
      Home
    </button>
  );
}

export default HomeButton;