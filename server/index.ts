import { createApp } from './app.ts';

const port = Number(process.env.PORT || 3001);
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`Pueblabus API en puerto ${port} · ${process.env.TRANSIT_MODE === 'demo' && !process.env.TRANSIT_FEED_URL ? 'modo demostración' : 'GPS prioritario + horarios CTAN y estimaciones de respaldo'}`);
});
server.on('error', error => { console.error('No se pudo iniciar Pueblabus:', error.message); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
