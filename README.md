# Pueblabus

Mapa responsive del corredor **La Puebla del Río–Sevilla**, con **GPS real prioritario** y **estimaciones de respaldo identificadas**. Incluye M-140, M-141 y el tramo de M-143 que pasa por La Puebla, paradas con nombres, próximos servicios, horarios por fecha, favoritos y geolocalización local.

Autobuses y paradas son **verdes hacia Sevilla** y **rojos de regreso**; el recorrido es **naranja**. Las paradas compartidas muestran ambos colores y cambian al filtrar un sentido. Los horarios de M-143 se muestran desde/hasta La Puebla, usando sus horas de paso publicadas. El feed original se conserva completo para consultar GPS y calcular estimaciones antes de recortar la vista.

## Fuentes conectadas

1. **GPS del Consorcio de Sevilla:** `https://ctas.es/busInfoLinea.php?idlinea=…&sentido=…&accion=infoLinea`, el endpoint usado por su mapa público. Consulta las líneas con servicio ese día, con caché de 30 segundos. Interpreta coordenadas N/S/E/W en grados/minutos/segundos y la hora de medición en Europe/Madrid. Solo utiliza mediciones de hasta 60 segundos de antigüedad. Se ha comprobado con posiciones reales de M-140.
2. **Horarios, trazados y paradas:** GTFS público `https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip`, actualizado durante cada compilación. La última comprobación importó 9 variantes, 89 paradas y 211 viajes, con calendario hasta el 30 de junio de 2027. Los recuentos pueden cambiar al actualizar el feed.
3. **Metadatos y próximas salidas:** API pública de CTAN, consorcio 1. Confirma operador, municipios y nombres de línea; consulta las próximas salidas de cada parada a través de `/api/departures`.
4. **Cartografía:** OpenStreetMap con atribución, sin clave para las teselas estándar utilizadas. No hace falta una cuenta AWS ni otra API de mapas para esta configuración. El trazado usa las coordenadas oficiales de CTAN, sin desplazamientos, dentro de la misma proyección de Leaflet que las calles. Si fallan las teselas, se avisa y se permite reintentar; no se sustituye por un dibujo que aparente tener calles reales.

Las fuentes son públicas y esta configuración no necesita credenciales. Ver [fuentes y comprobaciones](docs/SOURCES.md).

## Prioridad GPS y respaldo

- Las mediciones GPS recientes tienen prioridad. Se deduplican vehículos y se conserva la medición más nueva.
- Si falta GPS para un sentido, se calculan posiciones de los viajes programados en ese sentido. El mapa y cada tarjeta las identifican como **ESTIMADAS**. No se confirma así que el autobús esté circulando.
- Las estimaciones interpolan sobre el trazado oficial entre las horas publicadas de paso por cada parada; respetan el calendario, la dirección y los servicios que cruzan medianoche. No contemplan tráfico, desvíos ni cancelaciones.
- Si la página abierta pierde conexión, puede seguir calculando estimaciones con el horario ya recibido. Al recuperar conexión, vuelve a priorizar el GPS. Sin un horario recibido no se inventan posiciones.
- Cuando solo hay GPS de un sentido, pueden convivir marcadores GPS y estimados. Se identifican por separado y no se duplica el mismo sentido como GPS y estimación.
- CTAS no proporciona una ETA en el endpoint GPS utilizado: se muestra una parada cercana y la hora de medición, sin inventar un tiempo de llegada.

La API devuelve `mode: live`, `estimated` o `mixed`, y cada vehículo tiene `positionSource`. `updatedAt` de un GPS es su hora de medición; en una estimación es la hora del cálculo, no una lectura GPS.

## Sábados, domingos y festivos

Se conserva `calendar.txt` y `calendar_dates.txt`. Además, CTAN añade servicios de festivo sin retirar siempre el patrón L-V. Se interpreta el `idFreq` publicado por `/1/frecuencias` y los festivos añadidos en el GTFS para no activar ambos patrones a la vez.

- M-141: excluida en sábados, domingos y festivos.
- M-140: se usa el patrón correspondiente a la fecha.
- M-143: se distingue la variante laborable de la variante de sábados/domingos/festivos.

Comprobación del **2 de noviembre de 2026**: M-141 sin servicio; M-140 con servicio festivo; M-143 publica salidas de Isla Mayor a las 09:50 y 16:50, y de Sevilla a las 08:45 y 15:45. Son horarios publicados, no confirmación GPS de circulación.

La consulta REST de salidas puede devolver una variante laborable durante un festivo. Se contrasta con el calendario GTFS; en ese caso se aplica el calendario oficial festivo y se indica su origen.

## Desarrollo

Node 24.19.0 (`.node-version`) y npm. Usa el checkout existente; las tareas cloud ya están aisladas y no necesitan worktrees adicionales.

```sh
cd /workspace/pueblabus
npm ci --no-audit --no-fund
npm run data:sync
npm run dev
```

Vite usa 5173 y Express 3001. Por defecto se consultan las fuentes oficiales y se aplican las estimaciones de respaldo. Para la demo explícita: `TRANSIT_MODE=demo npm run dev`. Esta demo se identifica y nunca sustituye silenciosamente datos oficiales.

```sh
npm test              # Validación de fuentes, calendarios, GPS, respaldo y API
npm run test:e2e      # Chromium en móvil y desktop
npm run build        # TypeScript y cliente, sin descargar datos
npm run build:netlify # Actualiza datos y compila para Netlify
```

Las pruebas de navegador usan `/usr/bin/chromium`, un servidor en modo demo y respuestas controladas para probar GPS, caída y recuperación. Los fixtures son sintéticos; no se despliegan como datos del operador. Se comprueba el aviso de teselas no disponibles y, por separado, la alineación de ruta y paradas con teselas sintéticas georreferenciadas a zoom 13, 15 y 17, en móvil y ordenador. Esto no sustituye la comprobación visual de las calles reales del proveedor.

## Netlify

Importa `Yerandy-Espinosa/pueblabus`, rama `main`. `netlify.toml` configura `npm run build:netlify`, `dist`, las funciones y redirecciones. No necesitas ejecutar Express en Netlify ni configurar claves de mapa o de CTAN/CTAS.

El build intenta actualizar el GTFS. Si la importación falla, se compila la web igualmente y la API indica la falta de datos; no se generan horarios ficticios. La actualización manual `npm run data:sync` sí conserva un código de error para diagnóstico. Ver [guía de despliegue](docs/NETLIFY.md).

Comprueba `/api/health`, `/api/transit` y `/api/departures?stopId=ctan:1_2648`. El modo puede variar con la disponibilidad GPS y con la hora del servicio; fuera de un viaje programado no se crea un marcador estimado.

## Servidor propio

```sh
npm run data:sync
npm run build
npm start
```

Sirve el cliente y `/api` en `PORT` (3001 por defecto). No uses el mismo puerto simultáneamente para desarrollo y producción. `PORT=3002 npm start` permite comprobar producción aparte.

## Actualización, privacidad y límites

El GTFS se actualiza en cada build, no en cada visita. Para refrescar calendarios, vuelve a desplegar o programa un build hook en tu infraestructura. Se conserva la fecha de importación y la vigencia; los festivos futuros dependen de lo publicado por CTAN. Las estimaciones no extrapolan fuera del calendario vigente.

La ubicación del usuario se usa en el navegador y no se envía al servidor de Pueblabus. Los favoritos son locales. La geolocalización requiere permiso y HTTPS fuera de localhost.

`TRANSIT_FEED_URL` permite configurar un proveedor GPS JSON normalizado alternativo, según `src/schema.ts`, en el servidor. No uses `VITE_*` para credenciales. El posicionamiento público CTAS funciona sin esa variable. No se han creado recursos AWS, contratos de pago ni cuentas externas.

El entorno cloud necesita permitir CTAN/CTAS, `tile.openstreetmap.org` y el dominio de despliegue para verificaciones externas. Guarda los dominios añadidos en los ajustes del entorno sin desactivar los proxies ni TLS.
