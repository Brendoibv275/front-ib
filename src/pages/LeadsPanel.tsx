import { Fragment, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare, CalendarCheck, Search, ChevronDown, ChevronUp, Phone, MapPin } from 'lucide-react';

interface Lead {
  id: string; display_name: string; phone: string; external_user_id: string;
  stage: string; service_type: string; btus: number; address: string;
  quoted_amount: number; created_at: string; last_inbound_at: string;
  equipe_responsavel?: string | null;
  bot_paused?: boolean | null;
  bot_paused_at?: string | null;
  bot_paused_by?: string | null;
  bot_paused_reason?: string | null;
  bot_reactivated_at?: string | null;
  bot_reactivated_by?: string | null;
}
interface Message { id: string; role: string; body: string; created_at: string; }
interface Appointment { id: string; lead_id: string; window_label: string; status: string; notes: string; created_at: string; }
interface BotStatus {
  bot_paused?: boolean | null;
  bot_paused_at?: string | null;
  bot_paused_by?: string | null;
  bot_paused_reason?: string | null;
  bot_reactivated_at?: string | null;
  bot_reactivated_by?: string | null;
  equipe_responsavel?: string | null;
}

const stageLabel: Record<string, string> = {
  new: 'Novo', qualified: 'Qualificado', quoted: 'Orçado', awaiting_slot: 'Aguardando Vaga',
  scheduled: 'Agendado', completed: 'Concluído', lost: 'Perdido', emergency_handoff: 'Emergência',
};
const stageTag: Record<string, string> = {
  new: 'tag-new', qualified: 'tag-qualified', quoted: 'tag-scheduled', awaiting_slot: 'tag-scheduled',
  scheduled: 'tag-qualified', completed: 'tag-completed', lost: 'tag-lost', emergency_handoff: 'tag-lost',
};

export const LeadsPanel = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [reactivatingLeadId, setReactivatingLeadId] = useState<string | null>(null);
  const [statusLoadingLeadId, setStatusLoadingLeadId] = useState<string | null>(null);
  const [botStatusMap, setBotStatusMap] = useState<Record<string, BotStatus>>({});
  const [botStatusErrorMap, setBotStatusErrorMap] = useState<Record<string, string>>({});
  const [fetchError, setFetchError] = useState<string>('');

  const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    setFetchError('');
    const [lRes, aRes] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').order('created_at', { ascending: false }),
    ]);
    if (lRes.error) {
      setFetchError(`Erro ao carregar leads: ${lRes.error.message}`);
    }
    if (aRes.error) {
      setFetchError(prev => prev || `Erro ao carregar agendamentos: ${aRes.error.message}`);
    }
    if (lRes.data) setLeads(lRes.data as Lead[]);
    if (aRes.data) setAppointments(aRes.data);
    setLoading(false);
  };

  const toggleExpand = async (leadId: string) => {
    if (expandedLead === leadId) { setExpandedLead(null); return; }
    setExpandedLead(leadId);
    const { data } = await supabase.from('messages').select('*').eq('lead_id', leadId).order('created_at', { ascending: true });
    if (data) setMessages(data);
    fetchBotStatus(leadId);
  };

  const fetchBotStatus = async (leadId: string) => {
    setStatusLoadingLeadId(leadId);
    setBotStatusErrorMap(prev => ({ ...prev, [leadId]: '' }));
    try {
      const response = await fetch(`${backendBaseUrl}/leads/${leadId}/bot-status`, { method: 'GET' });
      if (!response.ok) throw new Error('Não foi possível consultar status do bot.');
      const status = (await response.json()) as BotStatus;
      setBotStatusMap(prev => ({ ...prev, [leadId]: status }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao consultar status do bot.';
      setBotStatusErrorMap(prev => ({ ...prev, [leadId]: message }));
    } finally {
      setStatusLoadingLeadId(prev => (prev === leadId ? null : prev));
    }
  };

  const reactivateBot = async (leadId: string) => {
    setReactivatingLeadId(leadId);
    try {
      const response = await fetch(`${backendBaseUrl}/leads/${leadId}/bot/reactivate`, { method: 'POST' });
      if (!response.ok) throw new Error('Não foi possível reativar o bot.');
      await fetchAll();
      await fetchBotStatus(leadId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao reativar bot.';
      setBotStatusErrorMap(prev => ({ ...prev, [leadId]: message }));
    } finally {
      setReactivatingLeadId(null);
    }
  };

  const getLeadBotStatus = (lead: Lead): BotStatus => ({ ...lead, ...(botStatusMap[lead.id] || {}) });

  const updateStage = async (leadId: string, newStage: string) => {
    await supabase.from('leads').update({ stage: newStage }).eq('id', leadId);
    fetchAll();
  };

  const filtered = leads.filter(l => {
    const matchSearch = !search || (l.display_name || l.phone || l.external_user_id || '').toLowerCase().includes(search.toLowerCase());
    const matchStage = filterStage === 'all' || l.stage === filterStage;
    return matchSearch && matchStage;
  });

  const leadAppts = (leadId: string) => appointments.filter(a => a.lead_id === leadId);

  // KPIs
  const totalLeads = leads.length;
  const newLeads = leads.filter(l => l.stage === 'new').length;
  const qualifiedLeads = leads.filter(l => l.stage === 'qualified' || l.stage === 'quoted').length;
  const scheduledLeads = leads.filter(l => l.stage === 'scheduled').length;
  const pausedLeads = leads.filter(l => Boolean(getLeadBotStatus(l).bot_paused)).length;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Gestão de Leads & Agendamentos (SDR IA)</h2>
        <p>Gerencie todos os clientes captados pelo Agente de IA — leads, conversas e visitas técnicas</p>
      </div>

      {/* Mini KPIs */}
      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card"><div className="stat-label">Total de Leads</div><div className="stat-value sm text-accent">{totalLeads}</div></div>
        <div className="card stat-card"><div className="stat-label">Novos (Sem Contato)</div><div className="stat-value sm text-warning">{newLeads}</div></div>
        <div className="card stat-card"><div className="stat-label">Qualificados / Orçados</div><div className="stat-value sm text-success">{qualifiedLeads}</div></div>
        <div className="card stat-card"><div className="stat-label">Visitas Agendadas</div><div className="stat-value sm">{scheduledLeads}</div></div>
        <div className="card stat-card"><div className="stat-label">Bots Pausados</div><div className="stat-value sm text-warning">{pausedLeads}</div></div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid" style={{ alignItems: 'flex-end' }}>
          <div className="form-group">
            <label><Search size={14} /> Buscar lead</label>
            <input placeholder="Nome, telefone ou ID WhatsApp" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Estágio</label>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}>
              <option value="all">Todos</option>
              {Object.entries(stageLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Leads */}
      <div className="card">
        {fetchError && (
          <p style={{ color: 'var(--danger)', padding: '1rem 1rem 0' }}>{fetchError}</p>
        )}
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>
            {loading ? 'Carregando...' : 'Nenhum lead encontrado.'}
          </p>
        ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Nome / WhatsApp</th><th>Serviço</th><th>Endereço</th><th>Equipe Responsável</th><th>Estágio</th><th>Orçamento</th><th>Data</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const leadStatus = getLeadBotStatus(lead);
                const isPaused = Boolean(leadStatus.bot_paused);
                return (
                <Fragment key={lead.id}>
                  <tr key={lead.id} style={{ cursor: 'pointer' }} onClick={() => toggleExpand(lead.id)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{lead.display_name || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={11} /> {lead.phone || lead.external_user_id}
                      </div>
                    </td>
                    <td>{lead.service_type || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {lead.address ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} />{lead.address}</span> : '—'}
                    </td>
                    <td>{leadStatus.equipe_responsavel || '—'}</td>
                    <td>
                      <select
                        className={`tag ${stageTag[lead.stage] || ''}`}
                        value={lead.stage}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateStage(lead.id, e.target.value)}
                        style={{ padding: '4px 8px', fontSize: '0.72rem', border: 'none', cursor: 'pointer', width: 'auto' }}
                      >
                        {Object.entries(stageLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td style={{ fontWeight: 600 }}>{lead.quoted_amount ? `R$ ${Number(lead.quoted_amount).toFixed(2)}` : '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{new Date(lead.created_at).toLocaleDateString('pt-BR')}</td>
                    <td style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span className={`tag ${isPaused ? 'tag-lost' : 'tag-qualified'}`}>{isPaused ? 'Bot pausado' : 'Bot ativo'}</span>
                      {expandedLead === lead.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                  </tr>
                  {expandedLead === lead.id && (
                    <tr key={`${lead.id}-detail`}>
                      <td colSpan={8} style={{ padding: '1.25rem', background: 'var(--bg-secondary)' }}>
                        <div className="form-grid" style={{ gap: '1.5rem' }}>
                          {/* Mensagens */}
                          <div>
                            <h5 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <MessageSquare size={16} /> Histórico de Mensagens
                            </h5>
                            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {messages.length === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Sem mensagens registradas.</p>
                              ) : messages.map(m => (
                                <div key={m.id} style={{
                                  background: m.role === 'assistant' ? 'var(--accent-soft)' : 'var(--bg-card)',
                                  padding: '0.6rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem',
                                  alignSelf: m.role === 'assistant' ? 'flex-start' : 'flex-end', maxWidth: '85%'
                                }}>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                    {m.role === 'assistant' ? '🤖 Agente IA' : '👤 Cliente'} — {new Date(m.created_at).toLocaleString('pt-BR')}
                                  </div>
                                  {m.body}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Agendamentos + Detalhes */}
                          <div>
                            <h5 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <CalendarCheck size={16} /> Agendamentos
                            </h5>
                            {leadAppts(lead.id).length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Sem agendamentos.</p>
                            ) : leadAppts(lead.id).map(a => (
                              <div key={a.id} className="card" style={{ marginBottom: '0.5rem', padding: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ fontWeight: 600 }}>{a.window_label}</span>
                                  <span className={`tag ${a.status === 'confirmed' ? 'tag-qualified' : 'tag-scheduled'}`}>{a.status}</span>
                                </div>
                                {a.notes && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{a.notes}</p>}
                              </div>
                            ))}

                            <h5 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Detalhes Técnicos</h5>
                            <div className="detail-row"><span className="detail-label">BTUs</span><span className="detail-value">{lead.btus || '—'}</span></div>
                            <div className="detail-row"><span className="detail-label">Serviço</span><span className="detail-value">{lead.service_type || '—'}</span></div>
                            <div className="detail-row"><span className="detail-label">Endereço</span><span className="detail-value">{lead.address || '—'}</span></div>
                            <div className="detail-row"><span className="detail-label">Equipe responsável</span><span className="detail-value">{leadStatus.equipe_responsavel || '—'}</span></div>

                            <h5 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Status do Bot</h5>
                            <div className="detail-row"><span className="detail-label">Situação</span><span className="detail-value">{leadStatus.bot_paused ? 'Pausado' : 'Ativo'}</span></div>
                            <div className="detail-row"><span className="detail-label">Pausado em</span><span className="detail-value">{leadStatus.bot_paused_at ? new Date(leadStatus.bot_paused_at as string).toLocaleString('pt-BR') : '—'}</span></div>
                            <div className="detail-row"><span className="detail-label">Pausado por</span><span className="detail-value">{leadStatus.bot_paused_by || '—'}</span></div>
                            <div className="detail-row"><span className="detail-label">Motivo da pausa</span><span className="detail-value">{leadStatus.bot_paused_reason || '—'}</span></div>
                            <div className="detail-row"><span className="detail-label">Reativado em</span><span className="detail-value">{leadStatus.bot_reactivated_at ? new Date(leadStatus.bot_reactivated_at as string).toLocaleString('pt-BR') : '—'}</span></div>
                            <div className="detail-row"><span className="detail-label">Reativado por</span><span className="detail-value">{leadStatus.bot_reactivated_by || '—'}</span></div>
                            {botStatusErrorMap[lead.id] && (
                              <p style={{ marginTop: '0.6rem', color: 'var(--danger)' }}>{botStatusErrorMap[lead.id]}</p>
                            )}
                            <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => fetchBotStatus(lead.id)}
                                disabled={statusLoadingLeadId === lead.id}
                              >
                                {statusLoadingLeadId === lead.id ? 'Atualizando status...' : 'Atualizar status do bot'}
                              </button>
                              {leadStatus.bot_paused && (
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => reactivateBot(lead.id)}
                                  disabled={reactivatingLeadId === lead.id}
                                >
                                  {reactivatingLeadId === lead.id ? 'Reativando...' : 'Reativar bot'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
