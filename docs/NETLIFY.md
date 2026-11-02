# Despliegue de Pueblabus

1. En Netlify, importa `Yerandy-Espinosa/pueblabus` desde GitHub y selecciona `main`.
2. Mantén el directorio base en la raíz. Se leerá `netlify.toml`:
   - build: `npm run build:netlify`;
   - publicación: `dist`;
   - funciones: `netlify/functions`;
   - Node: 24.19.0.
3. Despliega. La fase de importación debe indicar el número de variantes, paradas, viajes y la fecha final del calendario. Si CTAN falla, el build se detiene. Revisa el registro antes de modificar la fuente; no desactives TLS ni sustituyas datos reales por fixtures.
4. Abre `/api/health` y `/api/transit` en el dominio asignado. Este último debe indicar `mode: "scheduled"`, una fuente de CTAN y `vehicles: []` mientras no se configure GPS.
5. Comprueba mapa, paradas y horarios en móvil y ordenador. El mapa indicará «SIN GPS» mientras solo haya horarios.

No necesitas ejecutar Express en Netlify. Las peticiones `/api/*` van a la función; la redirección de SPA va después, para no devolver HTML al solicitar JSON.

## Variables opcionales

| Variable | Uso |
| --- | --- |
| `TRANSIT_FEED_URL` | Fuente HTTPS normalizada para GPS real, una vez identificada y adaptada. Se lee en la función, no se publica en el navegador. |
| `TRANSIT_MODE=demo` | Activar explícitamente la demo. Para desplegar solo una demo, cambia el comando de build en Netlify a `npm run build`. No necesita descargar el GTFS. |

Para horarios oficiales no hacen falta claves. No configures `TRANSIT_MODE=demo` si quieres consultar el servicio real.

Cada compilación actualiza el GTFS. El archivo generado se incluye en la función y no se versiona en Git. Un cambio en el horario requiere reconstruir; no se presume que el calendario permanezca vigente indefinidamente.

El trabajo en cloud no crea un sitio Netlify ni autoriza acceso a una cuenta de Netlify. La configuración y las pruebas locales no prueban que una publicación real haya terminado. No se han creado dominios ni enlaces de despliegue ficticios.
