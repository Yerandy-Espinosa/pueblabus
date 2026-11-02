import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpRight, BusFront, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Heart, HelpCircle, Info, Map, MapPin, Navigation, Radio, RefreshCw, Search, Sprout, WifiOff, X } from 'lucide-react';
import TransitMap from './components/TransitMap';
import { addMinutes, departuresFor, displayTime, journeysFor, normalize, serviceDate, type Feed, type Route, type Snapshot, type Stop, type Vehicle } from './transit';

type Tab = 'buses' | 'stops' | 'schedule' | 'favorites';

function useTransit() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    let pending = false;
    let nextFetch = 0;
    const load = async () => {
      if (pending || Date.now() < nextFetch) return;
      pending = true;
      try {
        const response = await fetch('/api/transit', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12_000)]) });
        const data: Snapshot = await response.json();
        if (!['demo', 'live', 'scheduled'].includes(data.mode) || !['ok', 'stale', 'unavailable'].includes(data.status)) throw new Error('Invalid response');
        if (active) { setSnapshot(data); setError(false); nextFetch = Date.now() + (data.mode === 'scheduled' ? 60_000 : 0); }
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); pending = false; }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 5_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; abort.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const age = snapshot?.data ? Math.max(0, Math.floor((now - Date.parse(snapshot.data.updatedAt)) / 1000)) : 0;
  return { snapshot, error, loading, now, age, retry: () => { setLoading(true); setRefresh(v => v + 1); } };
}

function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem('pueblabus:favorites') || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []; } catch { return []; }
  });
  const toggle = (id: string) => setFavorites(current => {
    const next = current.includes(id) ? current.filter(v => v !== id) : [...current, id];
    try { localStorage.setItem('pueblabus:favorites', JSON.stringify(next)); } catch { /* Storage may be disabled. Favorites still work for this session. */ }
    return next;
  });
  return { favorites, toggle };
}

function RouteBadge({ route, small = false }: { route?: Route; small?: boolean }) {
  return <span className={`route-badge ${small ? 'small' : ''}`} style={route ? { color: route.color, background: `${route.color}12` } : undefined}><BusFront size={small ? 12 : 14} />{route?.shortName || 'PB · Demo'}</span>;
}

export default function App() {
  const { snapshot, error, loading, age, retry, now } = useTransit();
  const { favorites, toggle } = useFavorites();
  const [tab, setTab] = useState<Tab>('buses');
  const [routeId, setRouteId] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [showStops, setShowStops] = useState(true);
  const [help, setHelp] = useState(false);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [date, setDate] = useState(serviceDate());
  const helpRef = useRef<HTMLDialogElement>(null);
  const feed = snapshot?.data;
  const demo = snapshot?.mode === 'demo';
  const scheduled = snapshot?.mode === 'scheduled';
  const stale = error || snapshot?.status === 'stale' || (snapshot?.mode === 'live' && age > 60);
  const changeTab = (next: Tab) => { setTab(next); setSelectedStop(null); setSelectedVehicle(null); if (next !== 'buses') setMobileView('list'); };
  const selectStop = (stop: Stop) => { setSelectedStop(stop); setSelectedVehicle(null); setTab('stops'); setMobileView('list'); };
  const selectVehicle = (vehicle: Vehicle) => { setSelectedVehicle(v => v === vehicle.id ? null : vehicle.id); setSelectedStop(null); setTab('buses'); };
  useEffect(() => { const dialog = helpRef.current; if (help && dialog && !dialog.open) dialog.showModal(); if (!help && dialog?.open) dialog.close(); }, [help]);
  const displayedVehicles = feed?.vehicles.filter(v => (routeId === 'all' || v.routeId === routeId) && normalize(`${v.id} ${feed.routes.find(r => r.id === v.routeId)?.destination} ${feed.stops.find(s => s.id === v.nextStopId)?.name}`).includes(normalize(query))) || [];
  const visibleStopIds = new Set(feed?.routes.filter(r => routeId === 'all' || r.id === routeId).flatMap(r => r.stopIds));
  const displayedStops = feed?.stops.filter(s => visibleStopIds.has(s.id) && normalize(`${s.name} ${s.town}`).includes(normalize(query)) && (tab !== 'favorites' || favorites.includes(s.id))) || [];
  const activeVehicle = feed?.vehicles.find(v => v.id === selectedVehicle);
  const clock = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(now);

  return <div className="app">
    <header className="site-header">
      <button className="brand" onClick={() => { changeTab('buses'); setMobileView('map'); }} aria-label="Pueblabus, inicio"><span className="brand-icon"><BusFront size={25} strokeWidth={1.8} /></span><span className="brand-name">puebla<span>bus</span><small>ISLA MAYOR <span>↔</span> SEVILLA</small></span></button>
      <nav className="main-nav" aria-label="Navegación principal">
        <button className={tab === 'buses' || tab === 'stops' ? 'active' : ''} onClick={() => { changeTab('buses'); setMobileView('map'); }}><Map size={17} />Mapa</button>
        <button className={tab === 'schedule' ? 'active' : ''} onClick={() => changeTab('schedule')}><Clock3 size={17} />Horarios</button>
        <button className={tab === 'favorites' ? 'active' : ''} onClick={() => changeTab('favorites')}><Heart size={17} />Mis paradas{favorites.length > 0 && <span className="nav-count">{favorites.length}</span>}</button>
      </nav>
      <div className="header-right"><span className="local-time"><span className="status-dot" />{clock}<small>Hora local</small></span><button className="help-button" aria-label="Información sobre los datos" onClick={() => setHelp(true)}><HelpCircle size={21} /></button></div>
    </header>

    <div className={`workspace mobile-${mobileView}`}>
      <aside className="sidebar" aria-label="Consulta de transporte">
        <div className="sidebar-intro"><span className="eyebrow">TU CONEXIÓN CON SEVILLA</span><h1>Vamos donde<br />tú vas<span>.</span></h1><p>Tu autobús, tus paradas y tu próximo<br className="desktop-break" /> viaje. Todo en un mismo lugar.</p></div>
        <div className="sidebar-search"><Search size={18} /><input type="search" aria-label="Buscar parada o autobús" placeholder="Busca una parada o autobús" value={query} onChange={e => { setQuery(e.target.value); if (tab === 'schedule') setTab('stops'); }} />{query && <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X size={15} /></button>}</div>
        <div className="direction-filter"><ArrowDownUp size={16} /><label className="sr-only" htmlFor="direction">Sentido del recorrido</label><select id="direction" value={routeId} onChange={e => { setRouteId(e.target.value); setSelectedVehicle(null); setSelectedStop(null); }}><option value="all">Todos los sentidos</option>{feed?.routes.map(r => <option key={r.id} value={r.id}>Hacia {r.destination}</option>)}</select><ChevronDown size={15} /></div>
        <div className="sidebar-tabs" role="tablist" aria-label="Contenido del panel">
          <button role="tab" aria-selected={tab === 'buses'} className={tab === 'buses' ? 'active' : ''} onClick={() => changeTab('buses')}><BusFront size={16} />Autobuses{feed && <span>{feed.vehicles.filter(v => routeId === 'all' || v.routeId === routeId).length}</span>}</button>
          <button role="tab" aria-selected={tab === 'stops' || tab === 'favorites'} className={tab === 'stops' || tab === 'favorites' ? 'active' : ''} onClick={() => changeTab('stops')}><MapPin size={16} />Paradas</button>
          <button role="tab" aria-selected={tab === 'schedule'} className={tab === 'schedule' ? 'active' : ''} onClick={() => changeTab('schedule')}><Clock3 size={16} />Horarios</button>
        </div>

        <div className="sidebar-content" role="tabpanel">
          {(!feed || (loading && !snapshot)) && <div className="empty-state">{loading ? <><RefreshCw className="spin" size={28} /><h3>Cargando tu recorrido…</h3></> : <><WifiOff size={28} /><h3>No podemos cargar los datos</h3><p>{snapshot?.message || 'Revisa tu conexión y vuelve a intentarlo.'}</p><button className="primary-button" onClick={retry}>Reintentar</button></>}</div>}
          {feed && <>
            <div className={`data-notice ${demo ? 'demo' : stale ? 'warning' : 'live'}`}><span className="status-dot" /><span>{demo ? 'Demostración · datos de ejemplo' : stale ? 'Datos sin actualizar' : scheduled ? 'Horarios de CTAN · sin GPS' : 'Conectado con el operador'}</span><button aria-label="Ver origen de los datos" onClick={() => setHelp(true)}><Info size={14} /></button></div>
            {stale && <div className="connection-notice" role="alert"><WifiOff size={15} /><span>{scheduled ? snapshot?.message : 'Sin información reciente. Las posiciones pueden haber cambiado.'}</span><button onClick={retry} aria-label="Reintentar conexión"><RefreshCw size={16} /></button></div>}
            {tab === 'buses' && <>
              <div className="list-heading"><h2>{displayedVehicles.length} autobuses {demo ? 'de ejemplo' : 'con posición recibida'}</h2><span>{scheduled ? 'Sin GPS' : demo ? 'Simulación' : age < 5 ? 'Ahora' : `Hace ${age} s`}</span></div>
              {displayedVehicles.length === 0 && <Empty icon="bus" title={scheduled ? "Ubicación en directo no disponible" : "No hay autobuses para mostrar"} text={scheduled ? "Puedes consultar horarios y paradas oficiales. La fuente de horarios no publica posiciones de vehículos." : query ? 'Prueba con otro nombre o cambia el sentido.' : 'No se han recibido posiciones de autobuses para este sentido.'} />}
              <div className="vehicle-list">{displayedVehicles.map(vehicle => {
                const route = feed.routes.find(r => r.id === vehicle.routeId)!;
                const next = feed.stops.find(s => s.id === vehicle.nextStopId);
                return <button key={vehicle.id} className={`vehicle-card ${selectedVehicle === vehicle.id ? 'selected' : ''}`} onClick={() => selectVehicle(vehicle)} aria-pressed={selectedVehicle === vehicle.id}>
                  <div className="vehicle-card-top"><RouteBadge route={route} /><span className="vehicle-number">{vehicle.id}<span className="mini-dot" style={{ background: route.color }} /></span></div>
                  <div className="vehicle-destination"><h3>Hacia {route.destination}</h3><ArrowUpRight size={19} /></div>
                  <div className="vehicle-next"><span className="next-stop-line"><i /><span>Próxima parada<strong>{next?.name || 'Sin parada indicada'}</strong></span></span><span className="arrival"><strong>{vehicle.arrivalMinutes}</strong> min<small>{demo ? 'ejemplo' : 'estimados'}</small></span></div>
                  {selectedVehicle === vehicle.id && <div className="vehicle-expanded"><Check size={14} />Seleccionado en el mapa <span>{stale ? 'Sin actualizar' : demo ? 'Posición simulada' : 'Posición GPS'}</span></div>}
                </button>;
              })}</div>
              {activeVehicle && <button className="text-button show-mobile" onClick={() => setMobileView('map')}><Map size={16} />Ver autobús en el mapa<ArrowRight size={16} /></button>}
            </>}
            {(tab === 'stops' || tab === 'favorites') && <>
              {selectedStop ? <StopDetail stop={selectedStop} feed={feed} demo={demo} date={date} favorite={favorites.includes(selectedStop.id)} onFavorite={() => toggle(selectedStop.id)} onBack={() => setSelectedStop(null)} onMap={() => setMobileView('map')} /> : <>
                <div className="list-heading"><h2>{tab === 'favorites' ? 'Tus paradas guardadas' : `${displayedStops.length} paradas${demo ? ' de ejemplo' : ''}`}</h2>{tab === 'favorites' && <Heart size={15} />}</div>
                {displayedStops.length === 0 && <Empty icon={tab === 'favorites' ? 'heart' : 'stop'} title={tab === 'favorites' ? 'Tu viaje empieza aquí' : 'No encontramos esa parada'} text={tab === 'favorites' ? 'Pulsa el corazón de una parada para tenerla siempre a mano.' : 'Prueba con otro nombre o cambia el sentido.'} />}
                <div className="stop-list">{displayedStops.map((stop, i) => <div className="stop-card" key={stop.id}><button className="stop-main" onClick={() => selectStop(stop)}><span className="stop-index">{String(i + 1).padStart(2, '0')}</span><span><strong>{stop.name}</strong><small>{stop.town}</small></span><ChevronRight size={17} /></button><button className={`favorite-button ${favorites.includes(stop.id) ? 'saved' : ''}`} aria-label={`${favorites.includes(stop.id) ? 'Quitar' : 'Guardar'} ${stop.name}`} aria-pressed={favorites.includes(stop.id)} onClick={() => toggle(stop.id)}><Heart size={18} fill={favorites.includes(stop.id) ? 'currentColor' : 'none'} /></button></div>)}</div>
              </>}
            </>}
            {tab === 'schedule' && <Schedule feed={feed} routeId={routeId} date={date} onDate={setDate} demo={demo} />}
          </>}
        </div>
        <footer className="sidebar-footer"><span className="footer-illustration"><Sprout size={29} strokeWidth={1.3} /><span /><BusFront size={29} strokeWidth={1.3} /></span><span>Del pueblo a la ciudad.<br /><strong>Siempre conectados.</strong></span><span className="footer-heart">♡</span></footer>
      </aside>

      <main className="main-map" aria-label="Mapa del recorrido">
        <div className="map-heading"><div><div className="map-kicker"><span className="status-dot" /> TU RECORRIDO</div><h2>Isla Mayor <span>↔</span> Sevilla</h2></div><button className={`stops-toggle ${showStops ? 'active' : ''}`} aria-pressed={showStops} onClick={() => setShowStops(v => !v)}><MapPin size={17} /><span>Mostrar paradas</span><span className="toggle-track"><span /></span></button></div>
        <div className="map-card">
          {feed ? <TransitMap feed={feed} routeId={routeId} selectedVehicle={selectedVehicle} selectedStop={selectedStop} showStops={showStops} onVehicle={selectVehicle} onStop={selectStop} /> : <div className="map-loading"><Map size={45} strokeWidth={1} /><p>{loading ? 'Preparando el mapa…' : 'El mapa estará disponible al recuperar los datos.'}</p></div>}
          <div className="map-floating-status"><span className={`floating-icon ${demo ? 'demo' : ''}`}><Radio size={19} /></span><span><strong>{!feed ? 'Esperando información' : scheduled ? 'Horarios y paradas de CTAN' : demo ? 'Explora Pueblabus' : stale ? 'Conexión interrumpida' : 'Tu autobús, en el mapa'}</strong><small>{!feed ? 'Todavía no hay posiciones disponibles' : scheduled ? 'Posiciones GPS todavía no disponibles' : demo ? 'Autobuses en movimiento · modo demo' : stale ? 'Mostrando la última posición recibida' : 'Posiciones actualizadas cada 5 segundos'}</small></span><span className="floating-tag">{!feed ? 'SIN DATOS' : scheduled ? 'SIN GPS' : demo ? 'DEMO' : stale ? 'SIN SEÑAL' : 'EN DIRECTO'}</span></div>
          <div className="map-legend">{(feed?.routes.filter((r, i, all) => all.findIndex(other => other.destination === r.destination) === i).slice(0, 2) || []).map(r => <span key={r.id}><i style={{ background: r.color }} />{r.destination}</span>)}</div>
        </div>
        <div className="map-footer"><span><Info size={14} />{demo ? 'Posiciones, paradas y horarios de ejemplo. No utilizar para planificar viajes.' : snapshot?.message || 'Conectando con el servicio de transporte.'}</span><button onClick={() => setHelp(true)}>Sobre los datos<ArrowUpRight size={13} /></button></div>
      </main>
    </div>
    <div className="mobile-view-switch" aria-label="Vista de la aplicación"><button className={mobileView === 'map' ? 'active' : ''} onClick={() => setMobileView('map')}><Map size={17} />Mapa</button><button className={mobileView === 'list' ? 'active' : ''} onClick={() => setMobileView('list')}><BusFront size={17} />{tab === 'schedule' ? 'Horarios' : tab === 'favorites' ? 'Mis paradas' : tab === 'stops' ? 'Paradas' : 'Autobuses'}</button></div>
    <dialog ref={helpRef} className="help-dialog" onCancel={() => setHelp(false)} onClose={() => setHelp(false)} onClick={e => { if (e.target === helpRef.current) setHelp(false); }}>
      <div className="dialog-heading"><span className="brand-icon"><BusFront size={24} /></span><button aria-label="Cerrar información" onClick={() => setHelp(false)}><X size={21} /></button></div><span className="eyebrow">VIAJA CON INFORMACIÓN</span><h2>Primero, la claridad.</h2>
      <p>{demo ? 'Estás viendo una demostración de Pueblabus. Los autobuses se mueven para que puedas probar el mapa, pero no representan vehículos reales.' : scheduled ? 'Los horarios y las paradas proceden del GTFS público de CTAN. No se muestran posiciones de autobuses porque esta fuente no las incluye.' : 'Pueblabus muestra los datos de la fuente de transporte configurada. Las estimaciones pueden cambiar con el tráfico y la disponibilidad del servicio.'}</p>
      {feed?.source && <div className="help-note"><Info size={20} /><p>Fuente: {feed.source.name}. Importación: {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'Europe/Madrid' }).format(new Date(feed.source.fetchedAt))}. Calendario hasta {feed.source.validUntil || 'fecha no indicada'}.</p></div>}
      {demo && <div className="help-note"><Info size={20} /><p>Los horarios, nombres de paradas, recorridos y destino en Sevilla son ejemplos sin verificar. No los utilices para planificar un viaje.</p></div>}
      <div className="help-feature"><Radio size={20} /><div><strong>¿Y los autobuses reales?</strong><p>Para verlos necesitamos conectar una fuente GPS autorizada del operador. Hasta entonces, identificamos todos los datos de ejemplo como «Demo».</p></div></div>
      <div className="help-feature"><CalendarDays size={20} /><div><strong>Horarios oficiales</strong><p>Consulta el servicio del Consorcio de Transporte para confirmar tu viaje. Los festivos pueden tener horarios especiales.</p><a href="https://www.ctas.es/" target="_blank" rel="noreferrer">Web del Consorcio de Sevilla<ArrowUpRight size={15} /></a></div></div>
      <div className="help-feature"><Heart size={20} /><div><strong>Tus paradas, contigo</strong><p>Los favoritos se guardan en este navegador. No necesitas una cuenta y no enviamos tu ubicación al servidor.</p></div></div>
      <button className="primary-button dialog-close" onClick={() => setHelp(false)}>Entendido<ArrowRight size={17} /></button>
    </dialog>
  </div>;
}

function Empty({ icon, title, text }: { icon: 'bus' | 'heart' | 'stop'; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon">{icon === 'bus' ? <BusFront size={25} /> : icon === 'heart' ? <Heart size={25} /> : <Search size={25} />}</span><h3>{title}</h3><p>{text}</p></div>;
}

function Schedule({ feed, routeId, date, onDate, demo }: { feed: Feed; routeId: string; date: string; onDate: (d: string) => void; demo: boolean }) {
  return <div className="schedule"><div className="list-heading"><h2>Organiza tu próximo viaje</h2></div><label className="date-picker"><CalendarDays size={18} /><span>Fecha del viaje</span><input aria-label="Fecha del viaje" type="date" value={date} required onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onDate(e.target.value); }} /></label><p className="schedule-note">{demo ? 'Horarios de ejemplo, sin validez para viajar.' : 'Hora peninsular. Confirma los horarios especiales de festivos con el operador.'}</p>
    {feed.routes.filter(r => routeId === 'all' || r.id === routeId).map(route => {
      const rows = feed.journeys ? journeysFor(feed, route.id, date) : departuresFor(feed, route.id, date).map((time, i) => ({ id: `${time}-${i}`, departure: time, arrival: addMinutes(time, route.durationMinutes) }));
      return <section className="schedule-route" key={route.id}><div className="schedule-route-heading"><RouteBadge route={route} /><span>{route.durationMinutes} min{demo ? ' · ejemplo' : ' aprox.'}</span></div><h3>{route.name}</h3><div className="schedule-table"><div className="schedule-table-header"><span>Salida</span><ArrowRight size={13} /><span>Llegada{demo ? ' de ejemplo' : feed.journeys ? ' programada' : ' estimada'}</span></div>{rows.map(row => <div className="schedule-row" key={row.id}><strong>{displayTime(row.departure)}</strong><span className="schedule-dots" /><span>{displayTime(row.arrival)}</span></div>)}</div>{rows.length === 0 && <p className="schedule-note">No hay salidas publicadas para esta fecha.</p>}</section>;
    })}
  </div>;
}

function StopDetail({ stop, feed, demo, date, favorite, onFavorite, onBack, onMap }: { stop: Stop; feed: Feed; demo: boolean; date: string; favorite: boolean; onFavorite: () => void; onBack: () => void; onMap: () => void }) {
  const stopTimes = (route: Route) => feed.journeys
    ? journeysFor(feed, route.id, date).flatMap(j => j.stopTimes.filter(t => t.stopId === stop.id).map(t => ({ id: j.id, time: t.time })))
    : departuresFor(feed, route.id, date).map((time, i) => ({ id: `${time}-${i}`, time: addMinutes(time, route.stopIds[0] === feed.stops[0]?.id ? stop.minutesFromStart : route.durationMinutes - stop.minutesFromStart) }));
  return <div className="stop-detail"><button className="back-button" onClick={onBack}><ArrowLeft size={16} />Todas las paradas</button><div className="stop-detail-title"><span className="stop-detail-icon"><MapPin size={23} /></span><button className={`favorite-button ${favorite ? 'saved' : ''}`} aria-label={favorite ? `Quitar ${stop.name}` : `Guardar ${stop.name}`} aria-pressed={favorite} onClick={onFavorite}><Heart size={21} fill={favorite ? 'currentColor' : 'none'} /></button></div><h2>{stop.name}</h2><p>{stop.town}{demo ? ' · ubicación de ejemplo' : ''}</p><button className="text-button show-mobile" onClick={onMap}><Navigation size={16} />Ver parada en el mapa<ArrowRight size={16} /></button><div className="detail-section-title"><Clock3 size={16} /><h3>{demo ? 'Pasos de ejemplo' : 'Pasos previstos'}</h3></div><p className="schedule-note">{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'Europe/Madrid' }).format(new Date(`${date}T12:00:00Z`))}{demo ? ' · sin validez para viajar' : ''}</p>{feed.routes.filter(r => r.stopIds.includes(stop.id) && r.stopIds.at(-1) !== stop.id).map(route => <div className="stop-departures" key={route.id}><RouteBadge route={route} small /><h3>Hacia {route.destination}</h3><div className="departure-pills">{stopTimes(route).map(row => <span key={row.id}>{displayTime(row.time)}</span>)}</div></div>)}<div className="stop-detail-note"><Info size={16} /><p>{demo ? 'Esta parada y sus pasos son ilustrativos. Los datos oficiales se incorporarán al conectar al operador.' : feed.journeys ? 'Horas programadas de paso publicadas en el GTFS. No son mediciones GPS ni garantizan puntualidad.' : 'Los pasos por paradas intermedias son estimaciones a partir de la salida.'}</p></div></div>;
}
