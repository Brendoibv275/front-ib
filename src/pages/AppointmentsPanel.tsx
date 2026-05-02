import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CalendarCheck, Clock, CheckCircle, XCircle, User } from 'lucide-react';
import { AddressCell } from '../components/AddressCell';

interface AppointmentRow {
  id: string; lead_id: string; window_label: string; status: string;
  notes: string; calendar_event_id: string; created_at: string;
  lead?: { display_name: string; phone: string; address: string; service_type: string; };
}

type FeedbackKind = 'success' | 'error';
interface Feedback { kind: FeedbackKind; message: string; }

// Status que permitem confirmar (backend aceita pending_team_assignment ou proposed)
const CONFIRMABLE_STATUSES = new Set(['proposed', 'pending_team_assignment']);

export const AppointmentsPanel = () => {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

  useEffect(() => { fetchAppointments(); }, []);

  // Auto-dismiss do feedback após 4s
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const fetchAppointments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select('*, lead:leads(display_name, phone, address, service_type)')
      .order('created_at', { ascending: false });
    if (data) setAppointments(data as AppointmentRow[]);
    setLoading(false);
  };

  const callAdk = async (path: string, body: Record<string, unknown>): Promise<void> => {
    if (!backendBaseUrl) {
      throw new Error('VITE_BACKEND_URL não configurado.');
    }
    const response = await fetch(`${backendBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const j = await response.json();
        if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
      } catch { /* ignore */ }
      throw new Error(detail);
    }
  };

  // --- Ações (versão inicial: prompts nativos; modais ricos virão em commit seguinte) ---
  const handleConfirm = async (a: AppointmentRow) => {
    const teamId = window.prompt('Team ID (opcional, deixe em branco para pular):', '') ?? '';
    setActionLoadingId(a.id);
    try {
      const body: Record<string, unknown> = {};
      if (teamId.trim()) body.team_id = teamId.trim();
      await callAdk(`/appointments/${a.id}/confirm`, body);
      setFeedback({ kind: 'success', message: 'Agendamento confirmado com sucesso.' });
      await fetchAppointments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao confirmar.';
      setFeedback({ kind: 'error', message: `Erro ao confirmar: ${msg}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRealloc = async (a: AppointmentRow) => {
    const newDate = window.prompt('Nova data (YYYY-MM-DD):', '') ?? '';
    if (!newDate.trim()) return;
    const newSlot = window.prompt(
      'Novo slot (morning_early | morning_late | afternoon_early | afternoon_late):',
      'morning_early',
    ) ?? '';
    if (!newSlot.trim()) return;
    setActionLoadingId(a.id);
    try {
      await callAdk(`/appointments/${a.id}/realloc`, {
        new_date: newDate.trim(),
        new_slot: newSlot.trim(),
      });
      setFeedback({ kind: 'success', message: 'Realocação enviada pro cliente.' });
      await fetchAppointments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao realocar.';
      setFeedback({ kind: 'error', message: `Erro ao realocar: ${msg}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (a: AppointmentRow) => {
    if (!window.confirm(`Cancelar agendamento de ${a.lead?.display_name || 'cliente'}?`)) return;
    const reason = window.prompt('Motivo (opcional):', '') ?? '';
    setActionLoadingId(a.id);
    try {
      const body: Record<string, unknown> = {};
      if (reason.trim()) body.reason = reason.trim();
      await callAdk(`/appointments/${a.id}/cancel`, body);
      setFeedback({ kind: 'success', message: 'Agendamento cancelado.' });
      await fetchAppointments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao cancelar.';
      setFeedback({ kind: 'error', message: `Erro ao cancelar: ${msg}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const filtered = useMemo(
    () => (filter === 'all' ? appointments : appointments.filter(a => a.status === filter)),
    [appointments, filter],
  );

  const proposed = appointments.filter(a => a.status === 'proposed' || a.status === 'pending_team_assignment').length;
  const confirmed = appointments.filter(a => a.status === 'confirmed').length;
  const completed = appointments.filter(a => a.status === 'completed').length;
  const cancelled = appointments.filter(a => a.status === 'cancelled').length;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Agendamentos & Visitas Técnicas</h2>
        <p>Gerencie visitas agendadas pelo Agente IA para a equipe técnica</p>
      </div>

      {feedback && (
        <div
          className="card"
          style={{
            marginBottom: '1rem',
            borderLeft: `4px solid ${feedback.kind === 'success' ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}`,
            background: feedback.kind === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <span>{feedback.message}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setFeedback(null)}>Fechar</button>
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card" onClick={() => setFilter('proposed')} style={{ cursor: 'pointer' }}>
          <Clock size={80} className="stat-icon" />
          <div className="stat-label">Propostas / Pendentes</div>
          <div className="stat-value sm text-warning">{proposed}</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('confirmed')} style={{ cursor: 'pointer' }}>
          <CalendarCheck size={80} className="stat-icon" />
          <div className="stat-label">Confirmadas</div>
          <div className="stat-value sm text-success">{confirmed}</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('completed')} style={{ cursor: 'pointer' }}>
          <CheckCircle size={80} className="stat-icon" />
          <div className="stat-label">Concluídas</div>
          <div className="stat-value sm">{completed}</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('cancelled')} style={{ cursor: 'pointer' }}>
          <XCircle size={80} className="stat-icon" />
          <div className="stat-label">Canceladas</div>
          <div className="stat-value sm text-danger">{cancelled}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['all', 'proposed', 'confirmed', 'completed', 'cancelled'].map(f => (
            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : f === 'proposed' ? 'Pendentes' : f === 'confirmed' ? 'Confirmados' : f === 'completed' ? 'Concluídos' : 'Cancelados'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            {loading ? 'Carregando...' : 'Nenhum agendamento encontrado.'}
          </p>
        ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Cliente</th><th>Janela</th><th>Serviço</th><th>Endereço</th><th>Status</th><th>Criado em</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const canConfirm = CONFIRMABLE_STATUSES.has(a.status);
                const canRealloc = a.status !== 'cancelled' && a.status !== 'completed';
                const canCancel = a.status !== 'cancelled' && a.status !== 'completed';
                const busy = actionLoadingId === a.id;
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={14} color="var(--text-secondary)" />
                        <div>
                          <div style={{ fontWeight: 600 }}>{a.lead?.display_name || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{a.lead?.phone || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{a.window_label}</td>
                    <td>{a.lead?.service_type || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      <AddressCell address={a.lead?.address} />
                    </td>
                    <td>
                      <span className={`tag ${a.status === 'proposed' || a.status === 'pending_team_assignment' ? 'tag-scheduled' : a.status === 'confirmed' ? 'tag-qualified' : a.status === 'completed' ? 'tag-completed' : 'tag-lost'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {canConfirm && (
                          <button className="btn btn-sm btn-success" disabled={busy} onClick={() => handleConfirm(a)}>
                            Confirmar
                          </button>
                        )}
                        {canRealloc && (
                          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => handleRealloc(a)}>
                            Realocar
                          </button>
                        )}
                        {canCancel && (
                          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => handleCancel(a)}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
};
