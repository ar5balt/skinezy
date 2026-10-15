import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const mount = document.getElementById('root');
if (!mount) throw new Error('Missing #root mount element');
createRoot(mount).render(<React.StrictMode><App /></React.StrictMode>);
