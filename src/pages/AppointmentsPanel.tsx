import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CalendarCheck, Clock, CheckCircle, XCircle, User } from 'lucide-react';
import { AddressCell } from '../components/AddressCell';

interface AppointmentRow {
  id: string; lead_id: string; window_label: string; status: string;
  notes: string; calendar_event_id: string; created_at: string;
  scheduled_date?: string | null;
  slot?: string | null;
  lead?: { display_name: string; phone: string; address: string; service_type: string; };
}

interface TeamItem { id: string; name: string; }

type SlotKey = 'morning_early' | 'morning_late' | 'afternoon_early' | 'afternoon_late';

// Rótulo curto para a coluna "Data/Slot" da tabela
const SLOT_SHORT: Record<string, string> = {
  morning_early: '08h–10h',
  morning_late: '10h–12h',
  afternoon_early: '13h–15h',
  afternoon_late: '15h–17h',
};

const SLOT_LABELS: Record<SlotKey, string> = {
  morning_early: 'Manhã cedo (08–10h)',
  morning_late: 'Manhã tarde (10–12h)',
  afternoon_early: 'Tarde cedo (13–15h)',
  afternoon_late: 'Tarde fim (15–17h)',
};

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
  const [teams, setTeams] = useState<TeamItem[]>([]);

  // Modal state
  const [confirmTarget, setConfirmTarget] = useState<AppointmentRow | null>(null);
  const [confirmTeamId, setConfirmTeamId] = useState('');
  const [reallocTarget, setReallocTarget] = useState<AppointmentRow | null>(null);
  const [reallocDate, setReallocDate] = useState('');
  const [reallocSlot, setReallocSlot] = useState<SlotKey>('morning_early');
  const [cancelTarget, setCancelTarget] = useState<AppointmentRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

  useEffect(() => { fetchAppointments(); fetchTeams(); }, []);

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
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('slot', { ascending: true })
      .order('created_at', { ascending: false });
    if (data) setAppointments(data as AppointmentRow[]);
    setLoading(false);
  };

  const fetchTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setTeams(data as TeamItem[]);
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

  // --- Confirmar ---
  const openConfirm = (a: AppointmentRow) => {
    setConfirmTarget(a);
    setConfirmTeamId('');
  };

  const submitConfirm = async () => {
    if (!confirmTarget) return;
    const id = confirmTarget.id;
    setActionLoadingId(id);
    try {
      const body: Record<string, unknown> = {};
      if (confirmTeamId.trim()) body.team_id = confirmTeamId.trim();
      await callAdk(`/appointments/${id}/confirm`, body);
      setFeedback({ kind: 'success', message: 'Agendamento confirmado com sucesso.' });
      setConfirmTarget(null);
      await fetchAppointments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao confirmar.';
      setFeedback({ kind: 'error', message: `Erro ao confirmar: ${msg}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // --- Realocar ---
  const openRealloc = (a: AppointmentRow) => {
    setReallocTarget(a);
    // sugestão: amanhã
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setReallocDate(tomorrow.toISOString().slice(0, 10));
    setReallocSlot('morning_early');
  };

  const submitRealloc = async () => {
    if (!reallocTarget) return;
    if (!reallocDate) {
      setFeedback({ kind: 'error', message: 'Escolha uma nova data.' });
      return;
    }
    const id = reallocTarget.id;
    setActionLoadingId(id);
    try {
      await callAdk(`/appointments/${id}/realloc`, {
        new_date: reallocDate,
        new_slot: reallocSlot,
      });
      setFeedback({ kind: 'success', message: 'Realocação enviada pro cliente.' });
      setReallocTarget(null);
      await fetchAppointments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao realocar.';
      setFeedback({ kind: 'error', message: `Erro ao realocar: ${msg}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // --- Cancelar ---
  const openCancel = (a: AppointmentRow) => {
    setCancelTarget(a);
    setCancelReason('');
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setActionLoadingId(id);
    try {
      const body: Record<string, unknown> = {};
      if (cancelReason.trim()) body.reason = cancelReason.trim();
      await callAdk(`/appointments/${id}/cancel`, body);
      setFeedback({ kind: 'success', message: 'Agendamento cancelado.' });
      setCancelTarget(null);
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
              <tr><th>Cliente</th><th>Data/Slot</th><th>Janela</th><th>Serviço</th><th>Endereço</th><th>Status</th><th>Criado em</th><th>Ações</th></tr>
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
                    <td style={{ fontSize: '0.82rem' }}>
                      {a.scheduled_date
                        ? `${new Date(a.scheduled_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}${a.slot ? ' · ' + (SLOT_SHORT[a.slot] || a.slot) : ''}`
                        : '—'}
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
                          <button className="btn btn-sm btn-success" disabled={busy} onClick={() => openConfirm(a)}>
                            Confirmar
                          </button>
                        )}
                        {canRealloc && (
                          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => openRealloc(a)}>
                            Realocar
                          </button>
                        )}
                        {canCancel && (
                          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => openCancel(a)}>
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

      {/* Modal Confirmar */}
      {confirmTarget && (
        <ModalShell title="Confirmar agendamento" onClose={() => setConfirmTarget(null)}>
          <p style={{ marginBottom: '0.75rem' }}>
            Cliente: <strong>{confirmTarget.lead?.display_name || '—'}</strong><br />
            Janela: <strong>{confirmTarget.window_label}</strong>
          </p>
          <label style={labelStyle}>
            Equipe
          </label>
          <select
            className="input"
            value={confirmTeamId}
            onChange={e => setConfirmTeamId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Sem atribuir (decidir depois) —</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div style={modalActions}>
            <button className="btn btn-secondary" onClick={() => setConfirmTarget(null)} disabled={actionLoadingId === confirmTarget.id}>
              Cancelar
            </button>
            <button className="btn btn-success" onClick={submitConfirm} disabled={actionLoadingId === confirmTarget.id}>
              {actionLoadingId === confirmTarget.id ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal Realocar */}
      {reallocTarget && (
        <ModalShell title="Realocar agendamento" onClose={() => setReallocTarget(null)}>
          <p style={{ marginBottom: '0.75rem' }}>
            Cliente: <strong>{reallocTarget.lead?.display_name || '—'}</strong><br />
            Janela atual: <strong>{reallocTarget.window_label}</strong>
          </p>
          <label style={labelStyle}>Nova data</label>
          <input
            type="date"
            className="input"
            value={reallocDate}
            onChange={e => setReallocDate(e.target.value)}
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: '0.75rem' }}>Novo slot</label>
          <select
            className="input"
            value={reallocSlot}
            onChange={e => setReallocSlot(e.target.value as SlotKey)}
            style={inputStyle}
          >
            {(Object.keys(SLOT_LABELS) as SlotKey[]).map(k => (
              <option key={k} value={k}>{SLOT_LABELS[k]}</option>
            ))}
          </select>
          <div style={modalActions}>
            <button className="btn btn-secondary" onClick={() => setReallocTarget(null)} disabled={actionLoadingId === reallocTarget.id}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={submitRealloc} disabled={actionLoadingId === reallocTarget.id}>
              {actionLoadingId === reallocTarget.id ? 'Enviando...' : 'Realocar'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal Cancelar */}
      {cancelTarget && (
        <ModalShell title="Cancelar agendamento" onClose={() => setCancelTarget(null)}>
          <p style={{ marginBottom: '0.75rem' }}>
            Tem certeza que quer cancelar o agendamento de <strong>{cancelTarget.lead?.display_name || '—'}</strong> ({cancelTarget.window_label})?
          </p>
          <label style={labelStyle}>Motivo (opcional)</label>
          <input
            type="text"
            className="input"
            placeholder="Ex.: cliente pediu pra cancelar"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            style={inputStyle}
          />
          <div style={modalActions}>
            <button className="btn btn-secondary" onClick={() => setCancelTarget(null)} disabled={actionLoadingId === cancelTarget.id}>
              Voltar
            </button>
            <button className="btn btn-danger" onClick={submitCancel} disabled={actionLoadingId === cancelTarget.id}>
              {actionLoadingId === cancelTarget.id ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
};

// --- estilos inline (o projeto ainda não tem sistema de modal/toast pronto) ---
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
};

const modalActions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
  marginTop: '1.25rem',
};

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const ModalShell = ({ title, onClose, children }: ModalShellProps) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}
  >
    <div
      onClick={e => e.stopPropagation()}
      className="card"
      style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button className="btn btn-sm btn-secondary" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      {children}
    </div>
  </div>
);
