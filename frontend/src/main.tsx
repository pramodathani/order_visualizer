import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';

import { App } from './App';
import './styles.css';
import { themeRegistry } from './utilities/themes';

themeRegistry.applyToPage();

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('The page has no #root element.');
}
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
