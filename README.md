# Pueblabus

Web responsive para consultar el transporte del corredor **Isla Mayor–Sevilla**. React, TypeScript y Leaflet en el cliente, API Express para desarrollo y una función serverless para Netlify.

## Desplegar en Netlify

Conecta el repositorio **Yerandy-Espinosa/pueblabus**, rama **main**. `netlify.toml` ya define Node 24, la compilación, `dist`, la función API y las redirecciones. No basta con subir `dist` mediante arrastrar y soltar: la API necesita la función.

- Comando: `npm run build:netlify`.
- Directorio publicado: `dist`.
- Funciones: `netlify/functions`.
- Sin claves para descargar el GTFS público de CTAN.

La compilación descarga `https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip`, filtra las líneas del consorcio de Sevilla que mencionan **Isla Mayor** y genera `data/ctan.json`. Conserva calendarios, excepciones de festivos y horas después de medianoche. No fija un número de línea ni atribuye ALSA como operador sin comprobarlo en los datos.

**La descarga oficial no se ha podido verificar en este entorno:** el proxy responde 403 para `api.ctan.es`. El importador está comprobado con GTFS sintéticos, no con una descarga oficial reciente. Netlify intentará la descarga desde su propia red al construir. Si falla, no se publica una compilación nueva ni se usan datos de ejemplo como si fueran oficiales. Consulta [la guía de Netlify](docs/NETLIFY.md) y [la investigación de fuentes](docs/SOURCES.md).

## Horarios y ubicación son datos diferentes

- **CTAN / GTFS estático:** paradas, recorridos y horas programadas. No contiene posiciones de los autobuses. Sin `shapes.txt`, se dibujan uniones discontinuas entre paradas, no una carretera oficial.
- **GPS / tiempo real:** requiere una fuente que publique posiciones medidas. Aún no se ha confirmado un endpoint GPS público para ALSA en este corredor. Tener horarios abiertos no demuestra que exista ese feed.
- **Demostración local:** cuatro autobuses simulados y horarios ilustrativos. Siempre identificados como demo y sin validez para viajar.

En Netlify se utiliza por defecto el horario importado de CTAN, **sin autobuses simulados**. Si no hay información GPS, se muestra «SIN GPS». Si falta el archivo de horarios, la API devuelve 503, no una demo. Para una demostración explícita en Netlify puede configurarse `TRANSIT_MODE=demo` y usar `npm run build` en lugar de la importación oficial.

## Desarrollo local

Requisitos: Node **24.19.0** (`.node-version`) y npm. Usa el checkout existente; cada tarea cloud ya está aislada y no necesita un worktree adicional.

```sh
cd /workspace/pueblabus
npm ci --no-audit --no-fund
npm run dev
```

Vite usa 5173 y redirige `/api` a Express en 3001. El desarrollo local sin configuración adicional sigue en demo para que pueda probarse sin acceso al operador.

Para utilizar horarios oficiales localmente cuando la red lo permita:

```sh
npm run data:sync
TRANSIT_MODE=ctan npm run dev
```

Los dos procesos deben mantenerse activos; `npm run dev` los gestiona conjuntamente. Las fuentes tipográficas son locales. No se necesitan credenciales para la demo.

```sh
npm run build        # TypeScript y cliente de producción, sin descargar horarios
npm test             # API, Netlify, fuentes y calendarios GTFS
npm run test:e2e     # Chromium en móvil y desktop
```

Las pruebas de navegador usan `/usr/bin/chromium` en el entorno cloud y comprueban el esquema de mapa sin teselas externas. En otro equipo, ajusta `executablePath` en `playwright.config.ts`. Los fixtures de prueba son sintéticos y nunca se publican como datos del operador.

## Servidor propio

```sh
npm run build
npm start
```

Express sirve `dist` y `/api` desde `PORT` (3001 por defecto). Para horarios oficiales utiliza primero `npm run data:sync` y `TRANSIT_MODE=ctan`. No ejecutes `npm start` y `npm run dev` simultáneamente en el mismo puerto.

Comprueba `/api/health`, `/api/transit`, el HTML y su JavaScript compilado. Un puerto abierto no demuestra que la aplicación funcione.

## Actualización del horario

El GTFS se actualiza **en cada compilación de Netlify**, no en cada visita. Haz un nuevo despliegue para refrescarlo; puedes programar un build hook con un servicio propio si necesitas automatizarlo. La aplicación muestra el origen y la fecha de importación, avisa a partir de siete días y cuando el calendario caduca. La fecha seleccionada se evalúa contra `calendar.txt` y `calendar_dates.txt` sin inferir festivos.

## Conectar GPS real

`TRANSIT_FEED_URL` permite usar una fuente JSON HTTPS normalizada según `src/schema.ts`. Se configura en el servidor o en Netlify, nunca mediante una variable `VITE_*`. Esa fuente debe devolver rutas, paradas, horarios y vehículos con su fecha de medición. El adaptador admite HTTPS, valida referencias/coordenadas y no sigue redirecciones. Si la fuente devuelve datos antiguos o falla, se indica `stale`/`unavailable` y nunca se sustituye por la demo.

Un feed GTFS-Realtime/SIRI requeriría su adaptador específico y casar sus viajes con el GTFS estático; no se afirma que esa integración ya exista. No se estiman posiciones como si fueran GPS ni se etiquetan autobuses como «en servicio» a partir del horario.

## Red y privacidad

El mapa utiliza `a.basemaps.cartocdn.com`, con atribución CARTO/OpenStreetMap. Cuando falla, aparece `public/area-map.svg`, un esquema ilustrativo no apto para navegar. Los favoritos se guardan en el navegador. «Mi ubicación» requiere permiso y HTTPS fuera de localhost; no se envía al servidor de Pueblabus.

El entorno cloud necesita permitir `api.ctan.es`, `www.ctas.es`, `siu.ctan.es`, `www.alsa.es` y `a.basemaps.cartocdn.com`. Esos accesos se han guardado en el borrador, pero deben aplicarse en los ajustes. No desactives TLS ni los proxies de la plataforma.

## Estructura

- `src/App.tsx` y `src/components/TransitMap.tsx`: interfaz responsive.
- `src/schema.ts` y `src/transit.ts`: contrato, calendarios y horas.
- `server/gtfs.ts` y `scripts/sync-ctan.ts`: importación del GTFS oficial.
- `server/scheduled.ts`: instantánea del horario sin GPS inventado.
- `server/feed.ts`: fuente JSON en tiempo real opcional.
- `server/app.ts`: API y servidor propio.
- `netlify/functions/api.ts`: API serverless, sin servidor Express persistente.
- `netlify.toml`: compilación, funciones y redirecciones.
