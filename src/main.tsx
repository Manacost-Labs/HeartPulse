import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/AppErrorBoundary';
import { releaseIdFromModuleUrl } from './components/appErrorRecovery';
import './index.css';
import './parchment-theme.css';

const releaseId = releaseIdFromModuleUrl(import.meta.url);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary releaseId={releaseId}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
