# Fuentes comprobadas

Verificaciones del 2 de noviembre de 2026.

## Posiciones GPS reales

El mapa oficial [Autobuses en tiempo real](https://www.ctas.es/autobuses-en-tiempo-real) utiliza una consulta GET pública:

`https://ctas.es/busInfoLinea.php?idlinea=299&sentido=1&accion=infoLinea`

Su script público `posicionamiento.js` describe el formato de `posicion`. La respuesta contiene identificador operativo de autobús, coordenadas como `N371549.630` / `W0060402.180`, fecha y hora con espacios iniciales. Se convierten grados/minutos/segundos y hora de Madrid conservando la fecha de la medición.

Se han recibido **mediciones GPS reales de M-140**: en una comprobación a las 14:59, las mediciones tenían aproximadamente 8 y 21 segundos de antigüedad. Se han visto también respuestas válidas con `posicion: []`; no demuestran que no haya servicio, solo que esa consulta no aporta una posición reciente.

M-143 no devolvió posiciones durante las consultas realizadas antes de su siguiente servicio festivo. No se presenta como un GPS disponible cuando no lo está. El adaptador se consulta para los sentidos con servicio y activa estimaciones identificadas cuando no hay GPS reciente.

No se utilizan claves privadas ni el token sin uso que aparece en el JavaScript público. No se requieren cuentas adicionales para esta integración.

## Horarios y trazados

- [API oficial CTAN](https://api.ctan.es/doc/).
- [GTFS unificado oficial](https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip).
- `/v1/Consorcios/1/lineas`: líneas, códigos y operador.
- `/v1/Consorcios/1/lineas/:id/paradas`: orden y sentido.
- `/v1/Consorcios/1/paradas`: municipio, núcleo y coordenadas.
- `/v1/Consorcios/1/paradas/:id/servicios?horaIni=DD-MM-YYYY+HH:MM`: horas programadas, no una ETA GPS.
- `/v1/Consorcios/1/frecuencias`: tipos de día, incluidos domingos y festivos.

IDs comprobados: M-140=299; M-141=300; M-143 laborable=324; M-143 sábados/domingos/festivos=448. El operador figura como **TRANVIAS DE SEVILLA S.A**. M-140 y M-143 llegan a Delicias; M-141 incluye variantes con Plaza de Armas. Se utilizan los nombres exactos publicados, no un destino supuesto.

La importación actual contiene 9 variantes, 89 paradas y 211 viajes, vigentes hasta 2027-06-30. Estos recuentos corresponden a la descarga verificada y pueden cambiar.

## Festivo del 2 de noviembre

El GTFS añade el servicio de festivo para esa fecha, pero no siempre retira la base laborable. `idFreq` se interpreta con la referencia oficial: 1=L-V; 2=sábado; 3=domingos/festivos; 4=sábados/domingos/festivos; 6=diario; 13=festivos. Las fechas de festivo se extraen de las excepciones de esos servicios.

Se ha comprobado:

- M-141 no opera en sábado, domingo ni festivo.
- M-140 tiene servicio festivo el 2026-11-02.
- M-143 publica salidas de Isla Mayor 09:50 y 16:50 y de Sevilla 08:45 y 15:45 ese festivo.

La API REST de servicios devolvió también entradas laborables para esa fecha. La aplicación las contrasta con el GTFS festivo y no las muestra como salidas válidas. No se infiere el servicio de un festivo solo por ser lunes.

## Cartografía

Se utilizan [teselas estándar OpenStreetMap](https://www.openstreetmap.org/) con atribución, sin clave. La fuente CARTO anterior mostraba «API KEY REQUIRED» y se ha retirado. El dibujo local es solo un esquema alternativo identificado; no representa calles con precisión y no se usa como prueba de alineación cartográfica.

## Notas históricas

Las primeras consultas desde cloud estaban bloqueadas por la política de red. Después de aplicar los dominios necesarios, se han podido consultar directamente CTAN y CTAS e importar datos reales. No se depende de una estimación ajena como Radar ES para obtener GPS.

El sitio de ALSA redirigió a su cola `alsa.queue-it.net`; no fue necesario atravesarla ni iniciar sesión para integrar la fuente pública del Consorcio. No se ha creado ninguna cuenta AWS ni recurso facturable.
