import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Buffer } from 'buffer';
import { BrowserRouter } from 'react-router-dom';

(window as any).Buffer = Buffer;

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);