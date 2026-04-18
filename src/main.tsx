import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { isNativeApp, resolveEndpoint } from './utils/env';

if (isNativeApp()) {
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    if (typeof input === 'string') {
      return originalFetch(resolveEndpoint(input), init);
    }
    return originalFetch(input, init);
  };
}

import './providers';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
