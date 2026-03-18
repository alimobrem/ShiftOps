import React from 'react';
import { createRoot } from 'react-dom/client';
import './kubeview/styles/index.css';
import ShiftOpsApp from './kubeview/App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Failed to find the root element');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ShiftOpsApp />
  </React.StrictMode>
);
