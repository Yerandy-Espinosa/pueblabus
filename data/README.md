# Horarios importados

`npm run data:sync` genera aquí `ctan.json` solo después de descargar y validar
el GTFS oficial. El JSON se ignora en Git y puede no existir durante un despliegue.

Netlify incluye esta carpeta mediante un patrón, sin exigir que el archivo de
datos exista. Cuando falta, la API responde `scheduled/unavailable` con código
503. No se empaquetan datos ficticios ni se activa una demo silenciosa.
