import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Layers3, LocateFixed, Minus, Plus, Route as RouteIcon } from 'lucide-react';
import type { Feed, Point, Route, Stop, Vehicle } from '../transit';
import { directionFor, DIRECTIONS, ROUTE_COLOR } from '../direction';

const busSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M9 6h6"/><path d="M8 15h1m6 0h1"/></svg>';

function busIcon(vehicle: Vehicle, color: string, selected: boolean) {
  const wrapper = document.createElement('div');
  wrapper.className = `bus-pin ${selected ? 'selected' : ''} ${vehicle.positionSource === 'estimate' ? 'estimated-pin' : ''}`;
  wrapper.style.setProperty('--pin-color', color);
  wrapper.innerHTML = busSvg;
  const label = document.createElement('span');
  label.textContent = `${vehicle.positionSource === 'estimate' ? 'EST · ' : ''}${vehicle.label || vehicle.id}`;
  wrapper.append(label);
  return L.divIcon({ html: wrapper, className: 'bus-marker', iconSize: [42, 42], iconAnchor: [21, 21] });
}

function stopIcon(colors: string[], selected: boolean) {
  const size = selected ? 24 : 16;
  const halves = colors.length > 1
    ? `<path d="M10 3a7 7 0 0 1 0 14" stroke="${colors[0]}"/><path d="M10 17a7 7 0 0 1 0-14" stroke="${colors[1]}"/>`
    : `<circle cx="10" cy="10" r="7" stroke="${colors[0]}"/>`;
  return L.divIcon({ className: 'stop-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="white"/><g fill="none" stroke-width="4">${halves}</g></svg>` });
}

type Props = {
  feed: Feed; routeId: string; selectedVehicle: string | null;
  selectedStop: Stop | null; showStops: boolean;
  onVehicle: (v: Vehicle) => void; onStop: (s: Stop) => void;
};

function MapControls({ routes, focus, setMessage }: { routes: Route[]; focus: Point | null; setMessage: (m: string) => void }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [userPosition, setUserPosition] = useState<Point | null>(null);
  const pendingFocus = useRef<Point | null>(null);
  const fit = () => map.fitBounds(L.latLngBounds(routes.flatMap(r => r.shape)), { paddingTopLeft: [35, 45], paddingBottomRight: [45, 100], maxZoom: 14 });
  const routeKey = routes.map(r => r.id).join('|');
  useEffect(() => {
    let framed = false;
    const resize = () => {
      // Leaflet cannot animate a map with zero dimensions (the mobile list view).
      const container = map.getContainer();
      if (!container.clientWidth || !container.clientHeight) { map.stop(); return; }
      map.invalidateSize();
      if (!framed) { fit(); framed = true; }
      if (pendingFocus.current) {
        map.setView(pendingFocus.current, Math.max(map.getZoom(), 13), { animate: false });
        pendingFocus.current = null;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, routeKey]); // Reframe on a route selection, preserving zoom on GPS refreshes.
  useEffect(() => {
    pendingFocus.current = focus;
    if (focus && map.getContainer().clientWidth && map.getContainer().clientHeight) {
      map.flyTo(focus, Math.max(map.getZoom(), 13), { duration: 0.7, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
      pendingFocus.current = null;
    }
  }, [focus?.[0], focus?.[1], map]);

  const locate = () => {
    if (!navigator.geolocation) { setMessage('Tu navegador no permite obtener tu ubicación.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(p => {
      const point: Point = [p.coords.latitude, p.coords.longitude];
      setUserPosition(point); map.flyTo(point, 14); setLocating(false); setMessage('Tu ubicación solo se utiliza en este dispositivo.');
    }, () => { setLocating(false); setMessage('No se pudo obtener tu ubicación. Puedes buscar tu parada por su nombre.'); }, { timeout: 10_000, maximumAge: 60_000 });
  };
  return <>
    {userPosition && <CircleMarker center={userPosition} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#3478ee', fillOpacity: 1 }}><Tooltip>Tu ubicación</Tooltip></CircleMarker>}
    <div className="map-tools">
      <div className="zoom-controls"><button aria-label="Acercar mapa" onClick={() => map.zoomIn()}><Plus size={20} /></button><button aria-label="Alejar mapa" onClick={() => map.zoomOut()}><Minus size={20} /></button></div>
      <button className="map-tool" aria-label="Ver recorrido completo" title="Ver recorrido completo" onClick={fit}><RouteIcon size={20} /></button>
      <button className={`map-tool ${locating ? 'locating' : ''}`} aria-label="Mi ubicación" title="Mi ubicación" onClick={locate} disabled={locating}><LocateFixed size={20} /></button>
    </div>
  </>;
}

export default function TransitMap({ feed, routeId, selectedVehicle, selectedStop, showStops, onVehicle, onStop }: Props) {
  const [tileFailed, setTileFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [tileRevision, setTileRevision] = useState(0);
  const vehicle = feed.vehicles.find(v => v.id === selectedVehicle);
  // Stop focus is stable: live vehicle updates must not repeatedly recenter the user's map.
  const focus = useMemo(() => selectedStop?.position ?? (selectedVehicle ? feed.vehicles.find(v => v.id === selectedVehicle)?.position : null) ?? null, [selectedStop?.id, selectedVehicle]);
  const routes = feed.routes.filter(r => routeId === 'all' || r.id === routeId);
  const shapeKeys = new Set<string>();
  const geometries = routes.filter(route => {
    const key = `${route.ctanDirection || directionFor(route).label}:${JSON.stringify(route.shape)}`;
    if (shapeKeys.has(key)) return false;
    shapeKeys.add(key); return true;
  });
  const visibleStopIds = new Set(routes.flatMap(r => r.stopIds));

  return <div className="map-wrapper">
    <MapContainer center={[37.326, -6.04]} zoom={12} zoomControl={false} scrollWheelZoom maxZoom={19} className="transit-map" aria-label="Mapa de autobuses entre La Puebla del Río y Sevilla">
      <TileLayer key={tileRevision} maxZoom={19} url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' eventHandlers={{ tileerror: () => setTileFailed(true) }} />
      {geometries.map(route => <Polyline key={`${route.id}-halo`} positions={route.shape} smoothFactor={0} pathOptions={{ color: '#fff', weight: 7, opacity: .9, interactive: false }} />)}
      {geometries.map(route => <Polyline key={route.id} positions={route.shape} smoothFactor={0} pathOptions={{ className: 'route-path', color: ROUTE_COLOR, weight: 4, opacity: .95, dashArray: route.geometry === 'stops' || directionFor(route) === DIRECTIONS.fromSeville ? '6 8' : undefined }} />)}
      {showStops && feed.stops.filter(s => visibleStopIds.has(s.id)).map(stop => {
        const directions = [...new Set(routes.filter(r => r.stopIds.includes(stop.id)).map(directionFor))];
        const label = `${stop.name} · ${directions.map(d => d.label).join(' y ')}`;
        return <Marker key={stop.id} position={stop.position} title={label} alt={label} icon={stopIcon(directions.map(d => d.color), selectedStop?.id === stop.id)} eventHandlers={{ click: () => onStop(stop) }}>
        <Tooltip permanent={['isla', 'sevilla', 'puebla', 'coria'].includes(stop.id) || selectedStop?.id === stop.id || routes.some(r => r.stopIds[0] === stop.id || r.stopIds.at(-1) === stop.id)} direction={stop.id === 'isla' ? 'right' : 'left'} offset={stop.id === 'isla' ? [10, 0] : [-10, 0]} className="stop-tooltip">{stop.name}</Tooltip>
      </Marker>;
      })}
      {feed.vehicles.filter(v => routeId === 'all' || v.routeId === routeId).map(v => {
        const direction = directionFor(feed.routes.find(r => r.id === v.routeId)!);
        const title = `${v.label || v.id} · ${direction.label}${v.positionSource === 'estimate' ? ' · posición estimada' : v.positionSource === 'demo' ? ' · demostración' : ' · GPS'}`;
        return <Marker key={v.id} position={v.position} title={title} alt={title} icon={busIcon(v, direction.color, v.id === selectedVehicle)} eventHandlers={{ click: () => onVehicle(v) }} />;
      })}
      <MapControls routes={routes} focus={focus} setMessage={setMessage} />
    </MapContainer>
    <div className="map-area-label"><span className="area-dot" /> LA PUEBLA <span className="area-separator">/</span> SEVILLA</div>
    <div className="map-bottom-left">
      <button className="layer-button" onClick={() => { setTileFailed(false); setTileRevision(v => v + 1); }} aria-label="Recargar mapa de calles"><Layers3 size={18} /><span>{tileFailed ? 'Reintentar mapa' : 'Mapa de calles'}</span></button>
      {tileFailed && <span className="map-offline" role="status">Mapa de calles no disponible · solo se muestra el recorrido</span>}
    </div>
    {message && <div className="map-message" role="status"><Crosshair size={16} />{message}<button aria-label="Cerrar aviso de ubicación" onClick={() => setMessage('')}>×</button></div>}
    {vehicle && <div className="map-selected-label"><span className="status-dot" /> {vehicle.label || vehicle.id}{vehicle.positionSource === 'estimate' ? ' · ESTIMADA' : ' seleccionado'}</div>}
  </div>;
}
