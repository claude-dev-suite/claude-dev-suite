// SPDX-License-Identifier: MIT
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { initGlobalErrorHandler } from './utils/globalErrorHandler';

// Initialize global error handlers
initGlobalErrorHandler();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
