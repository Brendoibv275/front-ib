import { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TeamMember { id: string; name: string; role: string; }

export const FinanceInput = () => {
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);

  // Form
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('service_revenue');
  const [description, setDescription] = useState('');
  const [teamMemberId, setTeamMemberId] = useState('');
  const [taxFee, setTaxFee] = useState('');

  useEffect(() => {
    fetchTeam();
    fetchRecent();
  }, []);

  const fetchTeam = async () => {
    const { data } = await supabase.from('team_members').select('id, name, role').eq('active', true);
    if (data) setTeam(data);
  };

  const fetchRecent = async () => {
    const { data } = await supabase.from('finance_entries').select('*').order('created_at', { ascending: false }).limit(10);
    if (data) setRecentEntries(data);
  };

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
      };
      if (teamMemberId) insertData.team_member_id = teamMemberId;
      if (taxFee) insertData.tax_fee = parseFloat(taxFee);

      const { error: err } = await supabase.from('finance_entries').insert(insertData);
      if (err) throw err;

      setSuccess(entryType === 'income' ? '✓ Receita registrada com sucesso!' : '✓ Despesa registrada com sucesso!');
      setAmount('');
      setDescription('');
      setTeamMemberId('');
      setTaxFee('');
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
        <p>Insira receitas de serviços e despesas operacionais da Ilha Breeze</p>
      </div>

      {/* Toggle Receita / Despesa */}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* FORMULÁRIO */}
        <div className="card">
          {success && <div className="alert alert-success">{success}</div>}
          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label>{entryType === 'income' ? 'Tipo de Serviço' : 'Categoria de Custo'}</label>
              {entryType === 'income' ? (
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="service_revenue">Instalação Padrão</option>
                  <option value="service_electrical">Elétrica (+R$ 200)</option>
                  <option value="service_cleaning">Limpeza (+R$ 150)</option>
                  <option value="service_uninstall">Desinstalação</option>
                </select>
              ) : (
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="material_cost">Compra de Material</option>
                  <option value="logistics_lunch">Almoço (R$ 20/funcionário)</option>
                  <option value="logistics_transport">Passagem (R$ 10)</option>
                  <option value="logistics_fuel">Combustível / Gasolina</option>
                  <option value="marketing_ads">Tráfego Pago (Meta Ads)</option>
                  <option value="fixed_payroll">Folha de Pagamento</option>
                  <option value="tax">Imposto / Taxa</option>
                </select>
              )}
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>Valor (R$)</label>
                <input type="number" step="0.01" min="0.01" placeholder="Ex: 150.00" value={amount} onChange={e => setAmount(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Taxa PagBank (R$) — Opcional</label>
                <input type="number" step="0.01" min="0" placeholder="Ex: 4.50" value={taxFee} onChange={e => setTaxFee(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Técnico / Funcionário Responsável (Opcional)</label>
              <select value={teamMemberId} onChange={e => setTeamMemberId(e.target.value)}>
                <option value="">— Nenhum —</option>
                {team.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.role === 'technician' ? 'Técnico' : 'Ajudante'})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Descrição / Anotação</label>
              <textarea rows={3} placeholder={entryType === 'income' ? 'Ex: Instalação do cliente João, Centro' : 'Ex: Tubulação 3m cobre, obra Barra'} value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <button type="submit" className={`btn btn-block ${entryType === 'income' ? 'btn-success' : 'btn-danger'}`} disabled={loading}>
              <Save size={18} /> {loading ? 'Registrando...' : entryType === 'income' ? 'Registrar Receita' : 'Registrar Despesa'}
            </button>
          </form>
        </div>

        {/* ÚLTIMOS LANÇAMENTOS */}
        <div className="card">
          <h4 style={{ marginBottom: '1rem' }}>Últimos Lançamentos</h4>
          {recentEntries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Nenhum lançamento ainda. Comece registrando um serviço!</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Tipo</th><th>Categoria</th><th>Valor</th><th>Data</th></tr>
              </thead>
              <tbody>
                {recentEntries.map((e: any) => (
                  <tr key={e.id}>
                    <td><span className={`tag ${e.entry_type === 'income' ? 'tag-income' : 'tag-expense'}`}>{e.entry_type === 'income' ? 'Receita' : 'Despesa'}</span></td>
                    <td style={{ fontSize: '0.82rem' }}>{e.category}</td>
                    <td style={{ fontWeight: 600 }}>R$ {Number(e.amount).toFixed(2)}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{new Date(e.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
