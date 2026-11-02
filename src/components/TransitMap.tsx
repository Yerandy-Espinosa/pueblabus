import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, ImageOverlay, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Layers3, LocateFixed, Minus, Plus, Route as RouteIcon } from 'lucide-react';
import type { Feed, Point, Stop, Vehicle } from '../transit';

const busSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M9 6h6"/><path d="M8 15h1m6 0h1"/></svg>';

function busIcon(vehicle: Vehicle, color: string, selected: boolean) {
  const wrapper = document.createElement('div');
  wrapper.className = `bus-pin ${selected ? 'selected' : ''} ${vehicle.positionSource === 'estimate' ? 'estimated-pin' : ''}`;
  wrapper.style.setProperty('--pin-color', vehicle.positionSource === 'estimate' ? '#b18236' : color);
  wrapper.innerHTML = busSvg;
  const label = document.createElement('span');
  label.textContent = `${vehicle.positionSource === 'estimate' ? 'EST · ' : ''}${vehicle.label || vehicle.id}`;
  wrapper.append(label);
  return L.divIcon({ html: wrapper, className: 'bus-marker', iconSize: [42, 42], iconAnchor: [21, 21] });
}

type Props = {
  feed: Feed; routeId: string; selectedVehicle: string | null;
  selectedStop: Stop | null; showStops: boolean;
  onVehicle: (v: Vehicle) => void; onStop: (s: Stop) => void;
};

function MapControls({ feed, focus, setMessage }: { feed: Feed; focus: Point | null; setMessage: (m: string) => void }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [userPosition, setUserPosition] = useState<Point | null>(null);
  const pendingFocus = useRef<Point | null>(null);
  const fit = () => map.fitBounds(L.latLngBounds(feed.routes.flatMap(r => r.shape)), { padding: [60, 70], maxZoom: 13 });
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
  }, [map]); // Keep the user's zoom on feed refreshes.
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
  const [baseMap, setBaseMap] = useState(true);
  const vehicle = feed.vehicles.find(v => v.id === selectedVehicle);
  // Stop focus is stable: live vehicle updates must not repeatedly recenter the user's map.
  const focus = useMemo(() => selectedStop?.position ?? (selectedVehicle ? feed.vehicles.find(v => v.id === selectedVehicle)?.position : null) ?? null, [selectedStop?.id, selectedVehicle]);
  const routes = feed.routes.filter(r => routeId === 'all' || r.id === routeId);
  const visibleStopIds = new Set(routes.flatMap(r => r.stopIds));

  return <div className="map-wrapper">
    <MapContainer center={[37.265, -6.09]} zoom={11} zoomControl={false} scrollWheelZoom maxZoom={19} className="transit-map" aria-label="Mapa de autobuses entre Isla Mayor y Sevilla">
      {(!baseMap || tileFailed) && <ImageOverlay url="/area-map.svg" bounds={[[37.105, -6.25], [37.43, -5.895]]} />}
      {baseMap && <TileLayer maxZoom={19} url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' eventHandlers={{ tileerror: () => setTileFailed(true), load: () => {} }} />}
      {routes.map(route => <Polyline key={`${route.id}-halo`} positions={route.shape} pathOptions={{ color: '#fff', weight: 9, opacity: .95 }} />)}
      {routes.map((route, i) => <Polyline key={route.id} positions={route.shape.map(p => [p[0], p[1] + (i > 0 && !route.geometry ? .0015 : 0)] as Point)} pathOptions={{ color: route.color, weight: i > 0 ? 3 : 5, opacity: .95, dashArray: route.geometry === 'stops' || i > 0 ? '6 8' : undefined }} />)}
      {showStops && feed.stops.filter(s => visibleStopIds.has(s.id)).map(stop => <CircleMarker key={stop.id} center={stop.position} radius={selectedStop?.id === stop.id ? 9 : 5} pathOptions={{ color: '#21796a', fillColor: '#fff', fillOpacity: 1, weight: 3 }} eventHandlers={{ click: () => onStop(stop) }}>
        <Tooltip permanent={['isla', 'sevilla', 'puebla', 'coria'].includes(stop.id) || selectedStop?.id === stop.id || routes.some(r => r.stopIds[0] === stop.id || r.stopIds.at(-1) === stop.id)} direction={stop.id === 'isla' ? 'right' : 'left'} offset={stop.id === 'isla' ? [10, 0] : [-10, 0]} className="stop-tooltip">{stop.name}</Tooltip>
      </CircleMarker>)}
      {feed.vehicles.filter(v => routeId === 'all' || v.routeId === routeId).map(v => <Marker key={v.id} position={v.position} title={`${v.label || v.id}${v.positionSource === 'estimate' ? ' · posición estimada' : v.positionSource === 'demo' ? ' · demostración' : ' · GPS'}`} alt={`${v.label || v.id}${v.positionSource === 'estimate' ? ' · posición estimada' : v.positionSource === 'demo' ? ' · demostración' : ''}`} icon={busIcon(v, feed.routes.find(r => r.id === v.routeId)?.color || '#21796a', v.id === selectedVehicle)} eventHandlers={{ click: () => onVehicle(v) }} />)}
      <MapControls feed={feed} focus={focus} setMessage={setMessage} />
    </MapContainer>
    <div className="map-area-label"><span className="area-dot" /> ALJARAFE Y MARISMAS <span className="area-separator">/</span> SEVILLA</div>
    <div className="map-bottom-left">
      <button className={`layer-button ${!baseMap ? 'active' : ''}`} onClick={() => setBaseMap(v => !v)} aria-pressed={!baseMap}><Layers3 size={18} /><span>{baseMap ? 'Mapa base' : 'Esquema'}</span></button>
      {(tileFailed || !baseMap) && <span className="map-offline">Mapa esquemático · no apto para navegar</span>}
    </div>
    {message && <div className="map-message" role="status"><Crosshair size={16} />{message}<button aria-label="Cerrar aviso de ubicación" onClick={() => setMessage('')}>×</button></div>}
    {vehicle && <div className="map-selected-label"><span className="status-dot" /> {vehicle.label || vehicle.id}{vehicle.positionSource === 'estimate' ? ' · ESTIMADA' : ' seleccionado'}</div>}
  </div>;
}
