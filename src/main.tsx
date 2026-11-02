import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
