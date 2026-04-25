import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpCircle, ArrowDownCircle, Save, Pencil, Trash2, X, List, PlusCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getFinanceCategoryLabel, getEntryNetAmount } from '../lib/financeLabels';

interface TeamMember { id: string; name: string; role: string; team_id?: string | null; }
interface TeamItem { id: string; name: string; active: boolean; }
interface ServiceItem {
  id: string;
  name: string;
  commission_type: 'percentage' | 'fixed';
  commission_value: number;
}
interface SelectedServiceItem {
  key: string;
  service_id: string;
  amount: string;
}
type ExpenseRecurrence = 'one_time' | 'daily' | 'weekly' | 'monthly' | 'annual' | 'specific_date';
type MainTab = 'new' | 'list';

export const FinanceInput = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mainTab, setMainTab] = useState<MainTab>('new');
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('service_revenue');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamMemberId, setTeamMemberId] = useState('');
  const [taxFee, setTaxFee] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceSelections, setServiceSelections] = useState<SelectedServiceItem[]>([
    { key: crypto.randomUUID(), service_id: '', amount: '' },
  ]);
  const [nightHours, setNightHours] = useState('');
  const [nightRate, setNightRate] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [overtimeRate, setOvertimeRate] = useState('');
  const [expenseRecurrence, setExpenseRecurrence] = useState<ExpenseRecurrence>('one_time');
  const [specificDueDate, setSpecificDueDate] = useState('');

  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTeamId, setFilterTeamId] = useState('');
  const [filterMemberId, setFilterMemberId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    fetchTeam();
    fetchTeams();
    fetchServices();
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [filterType, filterCategory, filterTeamId, filterMemberId, filterDateFrom, filterDateTo]);

  const fetchTeam = async () => {
    const { data } = await supabase.from('team_members').select('id, name, role, team_id').eq('active', true).order('name');
    if (data) setTeam(data);
  };

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('id, name, active').eq('active', true).order('name');
    if (data) setTeams(data as TeamItem[]);
  };

  const fetchServices = async () => {
    const { data } = await supabase.from('service_catalog').select('id, name, commission_type, commission_value').order('name');
    if (data) setServices(data as ServiceItem[]);
  };

  const fetchEntries = async () => {
    let q = supabase
      .from('finance_entries')
      .select('id, entry_type, category, amount, tax_fee, net_amount, created_at, movement_date, description, due_date, metadata, team_member_id, team_id')
      .order('created_at', { ascending: false })
      .limit(300);

    if (filterType !== 'all') q = q.eq('entry_type', filterType);
    if (filterCategory) q = q.eq('category', filterCategory);
    if (filterTeamId) q = q.eq('team_id', filterTeamId);
    if (filterMemberId) q = q.eq('team_member_id', filterMemberId);
    if (filterDateFrom) q = q.gte('movement_date', filterDateFrom);
    if (filterDateTo) q = q.lte('movement_date', filterDateTo);

    const { data } = await q;
    if (data) setEntries(data);
  };

  const teamById = useMemo(() => Object.fromEntries(team.map(t => [t.id, t])), [team]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams]);

  const roleLabel = (role: string) => {
    if (role === 'technician') return 'Técnico';
    if (role === 'servant') return 'Servente';
    return 'Auxiliar';
  };

  const recurrenceLabel = (value?: string) => {
    if (!value || value === 'one_time') return 'Única';
    if (value === 'daily') return 'Diária';
    if (value === 'weekly') return 'Semanal';
    if (value === 'monthly') return 'Mensal';
    if (value === 'annual') return 'Anual';
    if (value === 'specific_date') return 'Data específica';
    return value;
  };

  const grossAmount = Number(amount || '0');
  const selectedServiceRows = serviceSelections
    .map((row) => {
      const service = services.find(s => s.id === row.service_id);
      const amountPart = Number(row.amount || 0);
      if (!service || amountPart <= 0) return null;
      const commission = service.commission_type === 'percentage'
        ? (amountPart * Number(service.commission_value || 0)) / 100
        : Number(service.commission_value || 0);
      return {
        service,
        amountPart,
        commission,
      };
    })
    .filter((row): row is { service: ServiceItem; amountPart: number; commission: number } => Boolean(row));
  const totalServicesAmount = selectedServiceRows.reduce((sum, row) => sum + row.amountPart, 0);
  const computedServiceCommission = selectedServiceRows.reduce((sum, row) => sum + row.commission, 0);
  const computedNight = Number(nightHours || 0) * Number(nightRate || 0);
  const computedOvertime = Number(overtimeHours || 0) * Number(overtimeRate || 0);
  const totalCommission = computedServiceCommission + computedNight + computedOvertime;

  const selectedMember = teamMemberId ? teamById[teamMemberId] : null;

  const filteredRows = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e: any) => {
      const cat = getFinanceCategoryLabel(e.category).toLowerCase();
      const desc = (e.description || '').toLowerCase();
      return cat.includes(q) || desc.includes(q) || String(e.amount).includes(q);
    });
  }, [entries, filterSearch]);

  const listPeriodLabel = useMemo(() => {
    const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');
    if (filterDateFrom && filterDateTo) return `${fmt(filterDateFrom)} — ${fmt(filterDateTo)}`;
    if (filterDateFrom) return `A partir de ${fmt(filterDateFrom)}`;
    if (filterDateTo) return `Até ${fmt(filterDateTo)}`;
    return 'Sem intervalo de datas (últimos registros retornados)';
  }, [filterDateFrom, filterDateTo]);

  const listSummary = useMemo(() => {
    let netIncome = 0;
    let grossIncome = 0;
    let incomeFees = 0;
    let totalExpenses = 0;
    let totalCommissions = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    for (const e of filteredRows) {
      const amount = Number(e.amount) || 0;
      const tax = Number(e.tax_fee) || 0;
      if (e.entry_type === 'income') {
        incomeCount += 1;
        grossIncome += amount;
        incomeFees += tax;
        netIncome += getEntryNetAmount(e);
        const c = Number(e.metadata?.commission_total);
        if (!Number.isNaN(c) && c > 0) totalCommissions += c;
      } else {
        expenseCount += 1;
        totalExpenses += amount;
      }
    }
    const netProfit = netIncome - totalExpenses - totalCommissions;
    return {
      count: filteredRows.length,
      netIncome,
      grossIncome,
      incomeFees,
      totalExpenses,
      totalCommissions,
      netProfit,
      incomeCount,
      expenseCount,
    };
  }, [filteredRows]);

  const clearForm = () => {
    setEditingId(null);
    setAmount('');
    setDescription('');
    setTeamId('');
    setTeamMemberId('');
    setTaxFee('');
    setMovementDate(new Date().toISOString().slice(0, 10));
    setServiceSelections([{ key: crypto.randomUUID(), service_id: '', amount: '' }]);
    setNightHours('');
    setNightRate('');
    setOvertimeHours('');
    setOvertimeRate('');
    setExpenseRecurrence('one_time');
    setSpecificDueDate('');
  };

  const loadEntryForEdit = (row: any) => {
    setMainTab('new');
    setEditingId(row.id);
    setEntryType(row.entry_type);
    setCategory(row.category || (row.entry_type === 'income' ? 'service_revenue' : 'material_cost'));
    setAmount(String(row.amount ?? ''));
    setDescription(row.description || '');
    setTeamId(row.team_id || '');
    setTeamMemberId(row.team_member_id || '');
    setMovementDate(row.movement_date || new Date(row.created_at).toISOString().slice(0, 10));
    setTaxFee(row.tax_fee != null ? String(row.tax_fee) : '');
    const md = row.metadata || {};
    if (Array.isArray(md.services) && md.services.length > 0) {
      const normalized = md.services.map((item: any) => ({
        key: crypto.randomUUID(),
        service_id: typeof item?.service_id === 'string' ? item.service_id : '',
        amount: item?.amount != null ? String(item.amount) : '',
      }));
      setServiceSelections(normalized);
    } else if (md.service_id) {
      setServiceSelections([{ key: crypto.randomUUID(), service_id: String(md.service_id), amount: String(row.amount ?? '') }]);
    } else {
      setServiceSelections([{ key: crypto.randomUUID(), service_id: '', amount: '' }]);
    }
    setNightHours(md.commission_night_hours != null ? String(md.commission_night_hours) : '');
    setNightRate(md.commission_night_rate != null ? String(md.commission_night_rate) : '');
    setOvertimeHours(md.commission_overtime_hours != null ? String(md.commission_overtime_hours) : '');
    setOvertimeRate(md.commission_overtime_rate != null ? String(md.commission_overtime_rate) : '');
    setExpenseRecurrence((md.recurrence as ExpenseRecurrence) || 'one_time');
    setSpecificDueDate(md.specific_due_date || row.due_date || '');
    setSuccess('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadEntryRef = useRef(loadEntryForEdit);
  loadEntryRef.current = loadEntryForEdit;

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('finance_entries').select('*').eq('id', editId).maybeSingle();
      if (cancelled) return;
      setSearchParams({}, { replace: true });
      if (!data) {
        setError('Lançamento não encontrado ou sem permissão.');
        setMainTab('list');
        return;
      }
      loadEntryRef.current(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const buildPayload = () => {
    const insertData: any = {
      entry_type: entryType,
      category,
      amount: parseFloat(amount),
      description: description || null,
      status: 'paid',
      metadata: {} as Record<string, unknown>,
    };
    insertData.movement_date = movementDate || new Date().toISOString().slice(0, 10);
    insertData.team_id = teamId || null;
    insertData.team_member_id = teamMemberId || null;
    insertData.tax_fee = taxFee ? parseFloat(taxFee) : 0;

    if (entryType === 'income' && selectedServiceRows.length > 0) {
      const serviceMetadata = selectedServiceRows.map((row) => ({
        service_id: row.service.id,
        service_name: row.service.name,
        amount: Number(row.amountPart.toFixed(2)),
        commission_type: row.service.commission_type,
        commission_value: row.service.commission_value,
        commission_amount: Number(row.commission.toFixed(2)),
      }));
      const primaryService = selectedServiceRows[0];
      insertData.metadata = {
        services: serviceMetadata,
        service_id: primaryService.service.id,
        service_name: primaryService.service.name,
        commission_type: primaryService.service.commission_type,
        commission_value: primaryService.service.commission_value,
        commission_service_amount: Number(computedServiceCommission.toFixed(2)),
        commission_night_hours: Number(nightHours || 0),
        commission_night_rate: Number(nightRate || 0),
        commission_night_amount: Number(computedNight.toFixed(2)),
        commission_overtime_hours: Number(overtimeHours || 0),
        commission_overtime_rate: Number(overtimeRate || 0),
        commission_overtime_amount: Number(computedOvertime.toFixed(2)),
        commission_total: Number(totalCommission.toFixed(2)),
      };
    } else if (entryType === 'income') {
      insertData.metadata = {
        commission_night_hours: Number(nightHours || 0),
        commission_night_rate: Number(nightRate || 0),
        commission_night_amount: Number(computedNight.toFixed(2)),
        commission_overtime_hours: Number(overtimeHours || 0),
        commission_overtime_rate: Number(overtimeRate || 0),
        commission_overtime_amount: Number(computedOvertime.toFixed(2)),
        commission_service_amount: 0,
        commission_total: Number((computedNight + computedOvertime).toFixed(2)),
      };
    }

    if (entryType === 'expense') {
      const recurrenceMetadata: Record<string, unknown> = { recurrence: expenseRecurrence };
      if (expenseRecurrence === 'specific_date' && specificDueDate) {
        insertData.due_date = specificDueDate;
        insertData.movement_date = specificDueDate;
        recurrenceMetadata.specific_due_date = specificDueDate;
      } else {
        insertData.due_date = null;
      }
      insertData.metadata = { ...insertData.metadata, ...recurrenceMetadata };
    } else {
      insertData.due_date = null;
    }

    return insertData;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');
    setError('');

    try {
      if (entryType === 'expense' && expenseRecurrence === 'specific_date' && !specificDueDate) {
        throw new Error('Informe a data específica da despesa.');
      }
      if (!movementDate?.trim()) {
        throw new Error('Informe a data do lançamento.');
      }
      if (entryType === 'income' && selectedServiceRows.length > 0 && totalServicesAmount - grossAmount > 0.01) {
        throw new Error('A soma dos serviços não pode ser maior que o valor total.');
      }
      if (entryType === 'income' && totalCommission >= 0.01 && !teamMemberId?.trim()) {
        throw new Error(
          'Receitas com comissão precisam ter um funcionário vinculado. Selecione o profissional responsável.'
        );
      }

      const payload = buildPayload();

      if (editingId) {
        const { error: err } = await supabase.from('finance_entries').update(payload).eq('id', editingId);
        if (err) throw err;
        setSuccess('Lançamento atualizado com sucesso.');
      } else {
        const { error: err } = await supabase.from('finance_entries').insert(payload);
        if (err) throw err;
        setSuccess(entryType === 'income' ? 'Receita registrada com sucesso.' : 'Despesa registrada com sucesso.');
      }

      clearForm();
      setCategory(entryType === 'income' ? 'service_revenue' : 'material_cost');
      fetchEntries();
    } catch (err: any) {
      setError('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento? Esta ação não pode ser desfeita.')) return;
    setError('');
    const { error: err } = await supabase.from('finance_entries').delete().eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    if (editingId === id) clearForm();
    setSuccess('Lançamento excluído.');
    fetchEntries();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Financeiro — Lançamentos</h2>
        <p>Novo lançamento, consulta com filtros, edição e exclusão. Comissão aparece em tempo real ao vincular funcionário e serviço.</p>
      </div>

      <div className="toggle-tabs" style={{ marginBottom: '1.25rem' }}>
        <div
          className={`toggle-tab ${mainTab === 'new' ? 'active-income' : ''}`}
          onClick={() => { setMainTab('new'); setError(''); setSuccess(''); }}
          style={{ borderColor: mainTab === 'new' ? 'var(--success)' : undefined }}
        >
          <PlusCircle size={18} /> Novo lançamento
        </div>
        <div
          className={`toggle-tab ${mainTab === 'list' ? 'active-expense' : ''}`}
          onClick={() => { setMainTab('list'); setError(''); setSuccess(''); fetchEntries(); }}
          style={{ borderColor: mainTab === 'list' ? 'var(--danger)' : undefined }}
        >
          <List size={18} /> Consultar e editar
        </div>
      </div>

      {mainTab === 'new' && (
        <>
          <div className="toggle-tabs">
            <div
              className={`toggle-tab ${entryType === 'income' ? 'active-income' : ''}`}
              onClick={() => { setEntryType('income'); setCategory('service_revenue'); }}
            >
              <ArrowUpCircle size={18} /> Receita
            </div>
            <div
              className={`toggle-tab ${entryType === 'expense' ? 'active-expense' : ''}`}
              onClick={() => { setEntryType('expense'); setCategory('material_cost'); }}
            >
              <ArrowDownCircle size={18} /> Despesa
            </div>
          </div>

          {editingId && (
            <div className="alert alert-success" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <span>Editando lançamento <strong>{editingId.slice(0, 8)}…</strong></span>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => { clearForm(); setSuccess(''); setError(''); }}>
                <X size={14} /> Cancelar edição
              </button>
            </div>
          )}

          <div className="finance-grid-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="card">
              {success && <div className="alert alert-success">{success}</div>}
              {error && <div className="alert alert-danger">{error}</div>}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-group">
                  <label>{entryType === 'income' ? 'Tipo de serviço' : 'Categoria de custo'}</label>
                  {entryType === 'income' ? (
                    <select value={category} onChange={e => setCategory(e.target.value)}>
                      <option value="service_revenue">Instalação padrão</option>
                      <option value="service_electrical">Elétrica</option>
                      <option value="service_cleaning">Limpeza</option>
                      <option value="service_uninstall">Desinstalação</option>
                    </select>
                  ) : (
                    <select value={category} onChange={e => setCategory(e.target.value)}>
                      <option value="material_cost">Compra de material</option>
                      <option value="logistics_lunch">Almoço</option>
                      <option value="logistics_transport">Passagem</option>
                      <option value="logistics_fuel">Combustível</option>
                      <option value="marketing_ads">Tráfego pago</option>
                      <option value="fixed_payroll">Folha de pagamento</option>
                      <option value="tax">Imposto / taxa</option>
                    </select>
                  )}
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Valor (R$)</label>
                    <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Data do lançamento</label>
                    <input type="date" value={movementDate} onChange={e => setMovementDate(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Taxa gateway (R$) — opcional</label>
                    <input type="number" step="0.01" min="0" value={taxFee} onChange={e => setTaxFee(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Equipe responsável</label>
                  <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                    <option value="">— Não definida —</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Funcionário responsável (comissão / responsável)</label>
                  <select value={teamMemberId} onChange={e => {
                    const nextId = e.target.value;
                    setTeamMemberId(nextId);
                    const member = team.find(m => m.id === nextId);
                    if (member?.team_id) setTeamId(member.team_id);
                  }}>
                    <option value="">— Nenhum —</option>
                    {team
                      .filter(t => !teamId || t.team_id === teamId)
                      .map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({roleLabel(t.role)})</option>
                    ))}
                  </select>
                </div>

                {entryType === 'income' && (
                  <div className="card" style={{ padding: '1rem' }}>
                    <h4 style={{ marginBottom: '0.75rem' }}>Serviços do catálogo (múltiplos)</h4>
                    {serviceSelections.map((row) => (
                      <div key={row.key} className="form-grid" style={{ alignItems: 'end', marginBottom: '0.5rem' }}>
                        <div className="form-group">
                          <label>Serviço</label>
                          <select
                            value={row.service_id}
                            onChange={e =>
                              setServiceSelections(prev => prev.map(item => item.key === row.key ? { ...item, service_id: e.target.value } : item))
                            }
                          >
                            <option value="">— Sem serviço —</option>
                            {services.map(service => (
                              <option key={service.id} value={service.id}>
                                {service.name} ({service.commission_type === 'percentage' ? `${service.commission_value}%` : `R$ ${Number(service.commission_value).toFixed(2)}`})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Valor do serviço (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.amount}
                            onChange={e =>
                              setServiceSelections(prev => prev.map(item => item.key === row.key ? { ...item, amount: e.target.value } : item))
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => setServiceSelections(prev => prev.length > 1 ? prev.filter(item => item.key !== row.key) : prev)}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setServiceSelections(prev => [...prev, { key: crypto.randomUUID(), service_id: '', amount: '' }])}
                    >
                      + Adicionar serviço
                    </button>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Soma dos serviços: R$ {totalServicesAmount.toFixed(2)} · Valor total: R$ {grossAmount.toFixed(2)}
                    </p>
                  </div>
                )}

                {entryType === 'income' && selectedMember && (
                  <div className="card" style={{ padding: '1rem', borderLeft: '3px solid var(--accent)' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>Prévia de ganhos — {selectedMember.name}</h4>
                    {selectedServiceRows.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                        Escolha um ou mais <strong>serviços do catálogo</strong> para calcular a comissão sobre os valores. Adicione noturno/hora extra abaixo se aplicável.
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                        {selectedServiceRows.length} serviço(s) selecionado(s) · Valor bruto R$ {grossAmount.toFixed(2)}
                      </p>
                    )}
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.7 }}>
                      <div>Comissão do serviço: <strong>R$ {computedServiceCommission.toFixed(2)}</strong></div>
                      <div>Adicional noturno: <strong>R$ {computedNight.toFixed(2)}</strong></div>
                      <div>Hora extra: <strong>R$ {computedOvertime.toFixed(2)}</strong></div>
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: '1rem' }}>
                        Total estimado ao salvar: <span className="text-success">R$ {totalCommission.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {entryType === 'income' && (
                  <div className="card" style={{ padding: '1rem' }}>
                    <h4 style={{ marginBottom: '0.75rem' }}>Noturno e hora extra</h4>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Horas noturnas</label>
                        <input type="number" min="0" value={nightHours} onChange={e => setNightHours(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>R$/hora noturna</label>
                        <input type="number" min="0" value={nightRate} onChange={e => setNightRate(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Horas extras</label>
                        <input type="number" min="0" value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>R$/hora extra</label>
                        <input type="number" min="0" value={overtimeRate} onChange={e => setOvertimeRate(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {entryType === 'expense' && (
                  <div className="card" style={{ padding: '1rem' }}>
                    <h4 style={{ marginBottom: '0.75rem' }}>Periodicidade</h4>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Tipo</label>
                        <select value={expenseRecurrence} onChange={e => setExpenseRecurrence(e.target.value as ExpenseRecurrence)}>
                          <option value="one_time">Única</option>
                          <option value="daily">Diária</option>
                          <option value="weekly">Semanal</option>
                          <option value="monthly">Mensal</option>
                          <option value="annual">Anual</option>
                          <option value="specific_date">Data específica</option>
                        </select>
                      </div>
                      {expenseRecurrence === 'specific_date' && (
                        <div className="form-group">
                          <label>Data</label>
                          <input type="date" value={specificDueDate} onChange={e => setSpecificDueDate(e.target.value)} required />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Descrição</label>
                  <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                </div>

                <button type="submit" className={`btn btn-block ${entryType === 'income' ? 'btn-success' : 'btn-danger'}`} disabled={loading}>
                  <Save size={18} /> {loading ? 'Salvando...' : editingId ? 'Atualizar lançamento' : entryType === 'income' ? 'Registrar receita' : 'Registrar despesa'}
                </button>
              </form>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '0.75rem' }}>Dicas</h4>
              <ul style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', paddingLeft: '1.1rem', lineHeight: 1.6 }}>
                <li>Use <strong>Consultar e editar</strong> para filtrar e alterar lançamentos antigos.</li>
                <li>Para comissão completa: preencha <strong>valor</strong>, <strong>funcionário</strong> e <strong>serviço do catálogo</strong>.</li>
                <li>Taxas do meio de pagamento reduzem o líquido no painel, mas a comissão usa o valor bruto informado.</li>
              </ul>
            </div>
          </div>
        </>
      )}

      {mainTab === 'list' && (
        <div className="card">
          <h4 style={{ marginBottom: '1rem' }}>Filtros</h4>
          <div className="form-grid" style={{ marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Tipo</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value as 'all' | 'income' | 'expense')}>
                <option value="all">Todos</option>
                <option value="income">Receitas</option>
                <option value="expense">Despesas</option>
              </select>
            </div>
            <div className="form-group">
              <label>Categoria</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="">Todas</option>
                <option value="service_revenue">Instalação padrão</option>
                <option value="service_electrical">Elétrica</option>
                <option value="service_cleaning">Limpeza</option>
                <option value="service_uninstall">Desinstalação</option>
                <option value="material_cost">Material</option>
                <option value="logistics_lunch">Almoço</option>
                <option value="logistics_transport">Passagem</option>
                <option value="logistics_fuel">Combustível</option>
                <option value="marketing_ads">Tráfego</option>
                <option value="fixed_payroll">Folha</option>
                <option value="tax">Imposto</option>
              </select>
            </div>
            <div className="form-group">
              <label>Equipe</label>
              <select value={filterTeamId} onChange={e => setFilterTeamId(e.target.value)}>
                <option value="">Todas</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Funcionário</label>
              <select value={filterMemberId} onChange={e => setFilterMemberId(e.target.value)}>
                <option value="">Todos</option>
                {team.filter(t => !filterTeamId || t.team_id === filterTeamId).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Data inicial</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Data final</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Busca (texto)</label>
              <input placeholder="Categoria ou descrição" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-secondary" style={{ marginBottom: '1rem' }} onClick={fetchEntries}>Aplicar filtros no servidor</button>

          <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.1rem', background: 'rgba(0, 242, 254, 0.06)', border: '1px solid rgba(0, 242, 254, 0.15)' }}>
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>Resumo do período consultado</h4>
            <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              <strong>{listPeriodLabel}</strong>
              {filterSearch.trim() ? ' · busca por texto aplicada à tabela abaixo' : ''}
              . Os totais são da <strong>lista exibida</strong> ({listSummary.count} lançamento{listSummary.count !== 1 ? 's' : ''}
              {listSummary.incomeCount || listSummary.expenseCount
                ? ` · ${listSummary.incomeCount} receita(s), ${listSummary.expenseCount} despesa(s)`
                : ''}).
            </p>
            <div className="stat-grid" style={{ marginBottom: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))', gap: '0.65rem' }}>
              <div className="card stat-card" style={{ margin: 0, padding: '0.65rem 0.75rem' }}>
                <div className="stat-label" style={{ fontSize: '0.72rem' }}>Receita bruta</div>
                <div className="stat-value sm text-success" style={{ fontSize: '0.95rem' }}>R$ {listSummary.grossIncome.toFixed(2)}</div>
              </div>
              {listSummary.incomeFees > 0 && (
                <div className="card stat-card" style={{ margin: 0, padding: '0.65rem 0.75rem' }}>
                  <div className="stat-label" style={{ fontSize: '0.72rem' }}>Taxas recebimento</div>
                  <div className="stat-value sm text-danger" style={{ fontSize: '0.95rem' }}>R$ {listSummary.incomeFees.toFixed(2)}</div>
                </div>
              )}
              <div className="card stat-card" style={{ margin: 0, padding: '0.65rem 0.75rem' }}>
                <div className="stat-label" style={{ fontSize: '0.72rem' }}>Receita líquida</div>
                <div className="stat-value sm text-success" style={{ fontSize: '0.95rem' }}>R$ {listSummary.netIncome.toFixed(2)}</div>
              </div>
              <div className="card stat-card" style={{ margin: 0, padding: '0.65rem 0.75rem' }}>
                <div className="stat-label" style={{ fontSize: '0.72rem' }}>Despesas</div>
                <div className="stat-value sm text-danger" style={{ fontSize: '0.95rem' }}>R$ {listSummary.totalExpenses.toFixed(2)}</div>
              </div>
              <div className="card stat-card" style={{ margin: 0, padding: '0.65rem 0.75rem' }}>
                <div className="stat-label" style={{ fontSize: '0.72rem' }}>Comissões</div>
                <div className="stat-value sm text-warning" style={{ fontSize: '0.95rem' }}>R$ {listSummary.totalCommissions.toFixed(2)}</div>
              </div>
              <div className="card stat-card" style={{ margin: 0, padding: '0.65rem 0.75rem', borderLeft: '3px solid var(--accent)' }}>
                <div className="stat-label" style={{ fontSize: '0.72rem' }}>Lucro líquido</div>
                <div className={`stat-value sm ${listSummary.netProfit >= 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.95rem' }}>
                  R$ {listSummary.netProfit.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Equipe</th>
                  <th>Funcionário</th>
                  <th>Valor</th>
                  <th>Comissão</th>
                  <th>Período</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Nenhum lançamento encontrado.</td></tr>
                ) : filteredRows.map((e: any) => {
                  const tax = Number(e.tax_fee) || 0;
                  const gross = Number(e.amount) || 0;
                  const net = e.entry_type === 'income' ? getEntryNetAmount(e) : gross;
                  const recurrence = recurrenceLabel(e?.metadata?.recurrence);
                  const dueDateLabel = e?.due_date ? new Date(`${e.due_date}T00:00:00`).toLocaleDateString('pt-BR') : null;
                  const mem = e.metadata || {};
                  const comm = e.entry_type === 'income' ? Number(mem.commission_total) || 0 : null;
                  const tm = e.team_member_id ? teamById[e.team_member_id] : null;
                  const t = e.team_id ? teamsById[e.team_id] : null;
                  return (
                    <tr key={e.id}>
                      <td><span className={`tag ${e.entry_type === 'income' ? 'tag-income' : 'tag-expense'}`}>{e.entry_type === 'income' ? 'Receita' : 'Despesa'}</span></td>
                      <td style={{ fontWeight: 600 }}>{getFinanceCategoryLabel(e.category)}</td>
                      <td style={{ fontSize: '0.82rem' }}>{t ? t.name : '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{tm ? `${tm.name}` : '—'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>R$ {net.toFixed(2)}{e.entry_type === 'income' && tax > 0 ? ' líq.' : ''}</div>
                        {e.entry_type === 'income' && tax > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Bruto {gross.toFixed(2)} · Taxa {tax.toFixed(2)}</div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{comm != null && e.entry_type === 'income' ? `R$ ${comm.toFixed(2)}` : '—'}</td>
                      <td style={{ fontSize: '0.78rem' }}>
                        {e.entry_type === 'expense' ? recurrence : '—'}
                        {dueDateLabel && <div style={{ color: 'var(--text-secondary)' }}>Venc. {dueDateLabel}</div>}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {e.movement_date ? new Date(`${e.movement_date}T12:00:00`).toLocaleDateString('pt-BR') : new Date(e.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => loadEntryForEdit(e)}><Pencil size={14} /></button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(e.id)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
