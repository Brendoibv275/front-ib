import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CalendarCheck, Clock, CheckCircle, XCircle, User } from 'lucide-react';

interface AppointmentRow {
  id: string; lead_id: string; window_label: string; status: string;
  notes: string; calendar_event_id: string; created_at: string;
  lead?: { display_name: string; phone: string; address: string; service_type: string; };
}

export const AppointmentsPanel = () => {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchAppointments(); }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select('*, lead:leads(display_name, phone, address, service_type)')
      .order('created_at', { ascending: false });
    if (data) setAppointments(data as AppointmentRow[]);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('appointments').update({ status }).eq('id', id);
    fetchAppointments();
  };

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);

  const proposed = appointments.filter(a => a.status === 'proposed').length;
  const confirmed = appointments.filter(a => a.status === 'confirmed').length;
  const completed = appointments.filter(a => a.status === 'completed').length;
  const cancelled = appointments.filter(a => a.status === 'cancelled').length;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Agendamentos & Visitas Técnicas</h2>
        <p>Gerencie visitas agendadas pelo Agente IA para a equipe técnica</p>
      </div>

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
              {filtered.map(a => (
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
                  <td style={{ fontSize: '0.82rem' }}>{a.lead?.address || '—'}</td>
                  <td>
                    <span className={`tag ${a.status === 'proposed' ? 'tag-scheduled' : a.status === 'confirmed' ? 'tag-qualified' : a.status === 'completed' ? 'tag-completed' : 'tag-lost'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {a.status === 'proposed' && <button className="btn btn-sm btn-success" onClick={() => updateStatus(a.id, 'confirmed')}>Confirmar</button>}
                      {(a.status === 'proposed' || a.status === 'confirmed') && <button className="btn btn-sm btn-primary" onClick={() => updateStatus(a.id, 'completed')}>Concluir</button>}
                      {a.status !== 'cancelled' && a.status !== 'completed' && <button className="btn btn-sm btn-danger" onClick={() => updateStatus(a.id, 'cancelled')}>Cancelar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
};
