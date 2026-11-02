# Netlify

Importa `Yerandy-Espinosa/pueblabus`, rama `main`, con directorio base en la raíz. `netlify.toml` configura:

- Build: `npm run build:netlify`.
- Publicación: `dist`.
- Funciones: `netlify/functions`.
- Node: 24.19.0.

No hacen falta claves de mapas, CTAN ni CTAS. OpenStreetMap sustituye a CARTO: su antigua capa devolvía imágenes «API KEY REQUIRED», por lo que no era una base cartográfica válida.

El build importa M-140, M-141 y M-143, y enriquece municipios/operador. `data/ctan.json` se empaqueta con la función y no se versiona. Si CTAN falla, el sitio puede publicarse y muestra la falta de horarios; no se activa una demo silenciosa.

Después del despliegue:

1. `/api/health` debe indicar `ok`.
2. `/api/transit` debe devolver `live`, `mixed` o `estimated` según la disponibilidad de GPS. Cada vehículo declara `positionSource`; un marcador estimado siempre se identifica.
3. `/api/departures?stopId=ctan:1_3290` debe mostrar las próximas salidas programadas desde Polígono Los Juncales, en La Puebla. En festivos se contrasta el calendario para excluir variantes laborables.
4. Comprueba zoom y desplazamiento sobre calles reales, nombres de paradas y la selección de fechas en móvil y desktop.

No arranques Express en Netlify. `/api/*` se redirige a la función antes de la regla de SPA.

Variables opcionales:

| Variable | Uso |
| --- | --- |
| `TRANSIT_FEED_URL` | Proveedor GPS HTTPS alternativo normalizado. No es necesario para la fuente pública CTAS integrada. |
| `TRANSIT_MODE=demo` | Demo explícita; para ella puedes compilar con `npm run build` sin descarga. No sirve para consultar el servicio real. |

Cada build actualiza el GTFS. GPS se consulta como máximo cada 30 segundos por instancia de función y salidas por parada tienen caché de 30 segundos. El cliente consulta posiciones cada 30 segundos e interpola únicamente los marcadores etiquetados como estimados.

El empaquetado y las pruebas locales no prueban por sí solos que el despliegue remoto haya terminado. Revisa el commit del nuevo deploy y su resultado.
