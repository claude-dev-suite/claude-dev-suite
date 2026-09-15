// SPDX-License-Identifier: MIT
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Bundled, not fetched. index.html used to pull these from fonts.googleapis.com,
// which made a desktop app that is otherwise entirely local contact Google on
// every launch, and degrade to system fallbacks with no network. These are the
// same families and weights that <link> requested; Vite emits them into
// dist/assets and the renderer reads them off disk. All subsets are kept rather
// than latin alone — the UI renders the user's own project paths and file
// contents — and @font-face unicode-range still means only the subset in use is
// ever read.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import './index.css';
import { initGlobalErrorHandler } from './utils/globalErrorHandler';

// Initialize global error handlers
initGlobalErrorHandler();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
