# Investigación de fuentes

Investigación realizada el 2 de noviembre de 2026. Se distinguen referencias públicas, datos descargados y funcionalidades no confirmadas.

## Horarios y paradas de Sevilla

- API del Consorcio: <https://api.ctan.es/doc/>
- Feed estático identificado: <https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip>
- Web del Consorcio de Sevilla: <https://www.ctas.es/>
- Referencia pública que documenta y utiliza esa URL de GTFS: [sevilla-transit-coverage](https://github.com/javierrc8/sevilla-transit-coverage/blob/main/extract/extract_gtfs.py).
- Referencia pública de endpoints REST y sus respuestas: [andalusia-public-transport-app](https://github.com/hendrikbgr/andalusia-public-transport-app/blob/main/docs/api.md).

La URL del feed se ha encontrado en documentación pública. La consulta directa a CTAN falla aquí con `CONNECT tunnel failed, response 403` del proxy cloud. El registro del primer despliegue de Netlify confirma la descarga del archivo, pero su importación falló por comillas no escapadas en un nombre de parada (`CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE`). Se ha corregido el lector y añadido una prueba de regresión. Aún falta confirmar la importación completa y el número de línea, operador o terminal de Sevilla para este corredor en el siguiente despliegue. El importador descubre las líneas por consorcio y nombre; no fija un supuesto M-xxx ni ALSA como operador sin datos.

Los endpoints `paradas/.../servicios` documentados por clientes públicos contienen servicios **programados** con una hora y un destino. Sus coordenadas de paradas son ubicaciones de infraestructura. Ninguno de esos campos equivale a una posición GPS del autobús.

Se descartó como fuente actual un archivo público `bus_sevilla.zip` del repositorio [gtfs_bus_sevilla](https://github.com/marcbosch-idencity/gtfs_bus_sevilla): corresponde a TUSSAM y su calendario termina en junio de 2016. No se ha incorporado al producto.

## Seguimiento de ALSA

La web de ALSA (<https://www.alsa.es/>) también está bloqueada por el proxy de este entorno. No se ha confirmado un endpoint GPS público y operativo para los autobuses de Isla Mayor.

La aplicación pública [Radar ES](https://github.com/FlorinTodor/radar-es#fuentes-de-datos) distingue entre GPS y posiciones estimadas. Su [registro de fuentes](https://github.com/FlorinTodor/radar-es/blob/main/server/adapters/outbound/sources/index.js) utiliza para ALSA el **horario GTFS del NAP** y etiqueta sus posiciones como **estimadas según horario**, mientras que para algunos otros operadores utiliza GTFS-Realtime. Es evidencia secundaria útil, pero no demuestra por sí sola que no exista ninguna otra fuente GPS de ALSA.

Por tanto:

1. Está identificado un camino público para importar horarios y paradas, pendiente de validar mediante descarga directa.
2. No está confirmada una fuente GPS real para este corredor. No se presenta como integrada.
3. Que Renfe, algunos operadores de autobús o servicios aeronáuticos publiquen posiciones no establece que ALSA publique las de todas sus líneas.
4. La versión de Netlify muestra los horarios importados sin inventar autobuses en circulación. La conexión GPS queda pendiente de identificar y verificar su fuente.

No se han copiado credenciales ni se han intentado accesos privados. Para continuar la comprobación oficial hay que aplicar en el entorno los dominios guardados en el borrador de red y volver a ejecutar `npm run data:sync` y las consultas a ALSA/CTAN.
