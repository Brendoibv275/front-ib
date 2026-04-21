import { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getFinanceCategoryLabel, getEntryNetAmount } from '../lib/financeLabels';

interface TeamMember { id: string; name: string; role: string; }
interface ServiceItem {
  id: string;
  name: string;
  commission_type: 'percentage' | 'fixed';
  commission_value: number;
}
type ExpenseRecurrence = 'one_time' | 'daily' | 'weekly' | 'monthly' | 'annual' | 'specific_date';

export const FinanceInput = () => {
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('service_revenue');
  const [description, setDescription] = useState('');
  const [teamMemberId, setTeamMemberId] = useState('');
  const [taxFee, setTaxFee] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [nightHours, setNightHours] = useState('');
  const [nightRate, setNightRate] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [overtimeRate, setOvertimeRate] = useState('');
  const [expenseRecurrence, setExpenseRecurrence] = useState<ExpenseRecurrence>('one_time');
  const [specificDueDate, setSpecificDueDate] = useState('');

  useEffect(() => {
    fetchTeam();
    fetchServices();
    fetchRecent();
  }, []);

  const fetchTeam = async () => {
    const { data } = await supabase.from('team_members').select('id, name, role').eq('active', true);
    if (data) setTeam(data);
  };

  const fetchServices = async () => {
    const { data } = await supabase.from('service_catalog').select('id, name, commission_type, commission_value').order('name');
    if (data) setServices(data as ServiceItem[]);
  };

  const fetchRecent = async () => {
    const { data } = await supabase
      .from('finance_entries')
      .select('id, entry_type, category, amount, tax_fee, net_amount, created_at, description, due_date, metadata')
      .order('created_at', { ascending: false })
      .limit(15);
    if (data) setRecentEntries(data);
  };

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

  const selectedService = services.find(s => s.id === serviceId);
  const grossAmount = Number(amount || '0');
  const computedServiceCommission = selectedService
    ? selectedService.commission_type === 'percentage'
      ? (grossAmount * Number(selectedService.commission_value || 0)) / 100
      : Number(selectedService.commission_value || 0)
    : 0;
  const computedNight = Number(nightHours || 0) * Number(nightRate || 0);
  const computedOvertime = Number(overtimeHours || 0) * Number(overtimeRate || 0);
  const totalCommission = computedServiceCommission + computedNight + computedOvertime;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');
    setError('');

    try {
      const insertData: any = {
        entry_type: entryType,
        category,
        amount: parseFloat(amount),
        description: description || null,
        status: 'paid',
        metadata: {}
      };
      if (teamMemberId) insertData.team_member_id = teamMemberId;
      if (taxFee) insertData.tax_fee = parseFloat(taxFee);
      if (selectedService) {
        insertData.metadata = {
          service_id: selectedService.id,
          service_name: selectedService.name,
          commission_type: selectedService.commission_type,
          commission_value: selectedService.commission_value,
          commission_service_amount: Number(computedServiceCommission.toFixed(2)),
          commission_night_hours: Number(nightHours || 0),
          commission_night_rate: Number(nightRate || 0),
          commission_night_amount: Number(computedNight.toFixed(2)),
          commission_overtime_hours: Number(overtimeHours || 0),
          commission_overtime_rate: Number(overtimeRate || 0),
          commission_overtime_amount: Number(computedOvertime.toFixed(2)),
          commission_total: Number(totalCommission.toFixed(2)),
        };
      }
      if (entryType === 'expense') {
        const recurrenceMetadata: Record<string, unknown> = {
          recurrence: expenseRecurrence,
        };
        if (expenseRecurrence === 'specific_date' && specificDueDate) {
          insertData.due_date = specificDueDate;
          recurrenceMetadata.specific_due_date = specificDueDate;
        }
        insertData.metadata = { ...insertData.metadata, ...recurrenceMetadata };
      }

      const { error: err } = await supabase.from('finance_entries').insert(insertData);
      if (err) throw err;

      setSuccess(entryType === 'income' ? 'Receita registrada com sucesso.' : 'Despesa registrada com sucesso.');
      setAmount('');
      setDescription('');
      setTeamMemberId('');
      setTaxFee('');
      setServiceId('');
      setNightHours('');
      setNightRate('');
      setOvertimeHours('');
      setOvertimeRate('');
      setExpenseRecurrence('one_time');
      setSpecificDueDate('');
      fetchRecent();
    } catch (err: any) {
      setError('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Lançamentos Diários</h2>
        <p>Insira receitas e despesas com comissionamento detalhado por serviço</p>
      </div>

      <div className="toggle-tabs">
        <div
          className={`toggle-tab ${entryType === 'income' ? 'active-income' : ''}`}
          onClick={() => { setEntryType('income'); setCategory('service_revenue'); }}
        >
          <ArrowUpCircle size={18} /> Receita (Serviço)
        </div>
        <div
          className={`toggle-tab ${entryType === 'expense' ? 'active-expense' : ''}`}
          onClick={() => { setEntryType('expense'); setCategory('material_cost'); }}
        >
          <ArrowDownCircle size={18} /> Despesa (Custo)
        </div>
      </div>

      <div className="finance-grid-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="card">
          {success && <div className="alert alert-success">{success}</div>}
          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label>{entryType === 'income' ? 'Tipo de Serviço' : 'Categoria de Custo'}</label>
              {entryType === 'income' ? (
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="service_revenue">Instalação Padrão</option>
                  <option value="service_electrical">Elétrica</option>
                  <option value="service_cleaning">Limpeza</option>
                  <option value="service_uninstall">Desinstalação</option>
                </select>
              ) : (
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="material_cost">Compra de Material</option>
                  <option value="logistics_lunch">Almoço</option>
                  <option value="logistics_transport">Passagem</option>
                  <option value="logistics_fuel">Combustível</option>
                  <option value="marketing_ads">Tráfego Pago</option>
                  <option value="fixed_payroll">Folha de Pagamento</option>
                  <option value="tax">Imposto / Taxa</option>
                </select>
              )}
            </div>

            {entryType === 'income' && (
              <div className="form-group">
                <label>Serviço para comissão (opcional)</label>
                <select value={serviceId} onChange={e => setServiceId(e.target.value)}>
                  <option value="">— Nenhum —</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.commission_type === 'percentage' ? `${service.commission_value}%` : `R$ ${Number(service.commission_value).toFixed(2)}`})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {entryType === 'expense' && (
              <div className="card" style={{ padding: '1rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Periodicidade da Despesa</h4>
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
                      <label>Data específica</label>
                      <input type="date" value={specificDueDate} onChange={e => setSpecificDueDate(e.target.value)} required />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label>Valor (R$)</label>
                <input type="number" step="0.01" min="0.01" placeholder="Ex: 150.00" value={amount} onChange={e => setAmount(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Taxa PagBank (R$) — opcional</label>
                <input type="number" step="0.01" min="0" placeholder="Ex: 4.50" value={taxFee} onChange={e => setTaxFee(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Técnico / Funcionário responsável</label>
              <select value={teamMemberId} onChange={e => setTeamMemberId(e.target.value)}>
                <option value="">— Nenhum —</option>
                {team.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({roleLabel(t.role)})</option>
                ))}
              </select>
            </div>

            {entryType === 'income' && (
              <div className="card" style={{ padding: '1rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Cálculo de Comissão</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Adicional noturno: horas</label>
                    <input type="number" min="0" value={nightHours} onChange={e => setNightHours(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Valor/hora noturna (R$)</label>
                    <input type="number" min="0" value={nightRate} onChange={e => setNightRate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Hora extra: horas</label>
                    <input type="number" min="0" value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Valor/hora extra (R$)</label>
                    <input type="number" min="0" value={overtimeRate} onChange={e => setOvertimeRate(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                  <div>Comissão do serviço: <strong>R$ {computedServiceCommission.toFixed(2)}</strong></div>
                  <div>Adicional noturno: <strong>R$ {computedNight.toFixed(2)}</strong></div>
                  <div>Hora extra: <strong>R$ {computedOvertime.toFixed(2)}</strong></div>
                  <div style={{ marginTop: '0.35rem' }}>Comissão total: <strong>R$ {totalCommission.toFixed(2)}</strong></div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Descrição / anotação</label>
              <textarea rows={3} placeholder={entryType === 'income' ? 'Ex: Instalação do cliente João, Centro' : 'Ex: Material usado na obra'} value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <button type="submit" className={`btn btn-block ${entryType === 'income' ? 'btn-success' : 'btn-danger'}`} disabled={loading}>
              <Save size={18} /> {loading ? 'Registrando...' : entryType === 'income' ? 'Registrar Receita' : 'Registrar Despesa'}
            </button>
          </form>
        </div>

        <div className="card">
          <h4 style={{ marginBottom: '1rem' }}>Últimos Lançamentos</h4>
          {recentEntries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Nenhum lançamento ainda. Comece registrando um serviço.</p>
          ) : (
            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>Tipo</th><th>Categoria</th><th>Valor</th><th>Periodicidade</th><th>Data</th></tr>
              </thead>
              <tbody>
                {recentEntries.map((e: any) => {
                  const tax = Number(e.tax_fee) || 0;
                  const gross = Number(e.amount) || 0;
                  const net = e.entry_type === 'income' ? getEntryNetAmount(e) : gross;
                  const recurrence = recurrenceLabel(e?.metadata?.recurrence);
                  const dueDateLabel = e?.due_date ? new Date(`${e.due_date}T00:00:00`).toLocaleDateString('pt-BR') : null;
                  return (
                  <tr key={e.id}>
                    <td><span className={`tag ${e.entry_type === 'income' ? 'tag-income' : 'tag-expense'}`}>{e.entry_type === 'income' ? 'Receita' : 'Despesa'}</span></td>
                    <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>{getFinanceCategoryLabel(e.category)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        R$ {net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        {e.entry_type === 'income' && tax > 0 && (
                          <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 6 }}>líquido</span>
                        )}
                      </div>
                      {e.entry_type === 'income' && tax > 0 && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Bruto R$ {gross.toFixed(2)} · Taxas R$ {tax.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{recurrence}</div>
                      {dueDateLabel && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>Venc.: {dueDateLabel}</div>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{new Date(e.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
