import { useEffect, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';
import type { DepartureBoard } from '../transit';

export default function NextDepartures({ stopId }: { stopId: string }) {
  const [board, setBoard] = useState<DepartureBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let busy = false;
    setBoard(null); setLoading(true); setFailed(false);
    const load = async () => {
      if (busy || abort.signal.aborted) return;
      busy = true;
      try {
        const response = await fetch(`/api/departures?stopId=${encodeURIComponent(stopId)}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
        const result: DepartureBoard = await response.json();
        if (!response.ok || result.status !== 'ok' || !Array.isArray(result.departures)) throw new Error('Unavailable');
        if (!abort.signal.aborted) { setBoard(result); setFailed(false); }
      } catch { if (!abort.signal.aborted) setFailed(true); }
      finally { if (!abort.signal.aborted) setLoading(false); busy = false; }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [stopId, refresh]);

  return <section className="departure-board" aria-label="Próximas salidas de CTAN">
    <div className="departure-board-heading"><Clock3 size={16} /><h3>Próximas salidas · CTAN</h3><button aria-label="Actualizar salidas" onClick={() => setRefresh(v => v + 1)} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /></button></div>
    {loading && <p className="schedule-note">Consultando el servicio oficial…</p>}
    {failed && <p className="departure-board-warning" role="status">No se pudo actualizar CTAN. Consulta los horarios guardados debajo.</p>}
    {board?.departures.map(d => <div key={d.id} className="departure-board-row"><strong>{d.time}</strong><span><b>{d.line} → {d.destination}</b><small>{d.boarding ? `En ${d.inMinutes} min según horario` : 'Solo bajada'}</small></span></div>)}
    {board && board.departures.length === 0 && <p className="schedule-note">No hay salidas de estas líneas en la franja consultada.</p>}
    {board && <p className="departure-board-note">{board.sourceLabel || 'Horas programadas'} · consulta a las {new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(board.checkedAt))}. No son predicciones GPS.</p>}
  </section>;
}
