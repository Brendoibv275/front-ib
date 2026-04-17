import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Save, UserPlus, Trash2, Target, Calculator } from 'lucide-react';

interface TeamMember {
  id: string; name: string; role: string; fixed_cost: number; active: boolean;
}
interface ServiceItem {
  id: string; name: string; base_price: number; commission_type: string; commission_value: number;
}

export const TeamConfig = () => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyTarget, setDailyTarget] = useState('600');
  const [adsBudget, setAdsBudget] = useState('100');
  const [success, setSuccess] = useState('');

  // Novo membro
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('helper');
  const [newCost, setNewCost] = useState('');

  // Novo serviço
  const [svcName, setSvcName] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcCommission, setSvcCommission] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [tRes, sRes] = await Promise.all([
      supabase.from('team_members').select('*').order('created_at'),
      supabase.from('service_catalog').select('*').order('created_at'),
    ]);
    if (tRes.data) setTeam(tRes.data);
    if (sRes.data) setServices(sRes.data);
    setLoading(false);
  };

  const totalPayroll = team.filter(t => t.active).reduce((sum, t) => sum + Number(t.fixed_cost), 0);
  const daysInMonth = 22; // Dias úteis
  const dailyPayroll = totalPayroll / daysInMonth;
  const dailyAds = Number(adsBudget);
  const dailyFixedCost = dailyPayroll + dailyAds;
  const target = Number(dailyTarget);
  const dailyMargin = target - dailyFixedCost;

  const addMember = async () => {
    if (!newName || !newCost) return;
    await supabase.from('team_members').insert({ name: newName, role: newRole, fixed_cost: parseFloat(newCost) });
    setNewName(''); setNewCost('');
    fetchAll();
  };

  const removeMember = async (id: string) => {
    await supabase.from('team_members').update({ active: false }).eq('id', id);
    fetchAll();
  };

  const addService = async () => {
    if (!svcName || !svcPrice) return;
    await supabase.from('service_catalog').insert({
      name: svcName, base_price: parseFloat(svcPrice),
      commission_type: 'fixed', commission_value: parseFloat(svcCommission || '0')
    });
    setSvcName(''); setSvcPrice(''); setSvcCommission('');
    fetchAll();
  };

  const removeService = async (id: string) => {
    await supabase.from('service_catalog').delete().eq('id', id);
    fetchAll();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Equipe, Metas & Comissões</h2>
        <p>Gerencie o custo fixo da equipe, catálogo de serviços e validação da meta diária</p>
      </div>

      {/* VALIDAÇÃO DE META */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: dailyMargin >= 0 ? '3px solid var(--success)' : '3px solid var(--danger)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Calculator size={22} color="var(--accent)" />
          <h4>Simulador de Meta Diária</h4>
        </div>
        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <div className="form-group">
            <label>Meta diária por técnico (R$)</label>
            <input type="number" value={dailyTarget} onChange={e => setDailyTarget(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Orçamento diário de Ads (R$)</label>
            <input type="number" value={adsBudget} onChange={e => setAdsBudget(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div>
            <div className="stat-label">Folha Mensal Total</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>R$ {totalPayroll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="stat-label">Folha / Dia ({daysInMonth} dias úteis)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>R$ {dailyPayroll.toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Custo Fixo Diário (Folha+Ads)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)' }}>R$ {dailyFixedCost.toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Margem Diária Estimada</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: dailyMargin >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              R$ {dailyMargin.toFixed(2)} {dailyMargin < 0 ? '⚠️' : '✓'}
            </div>
          </div>
        </div>
        {dailyMargin < 0 && (
          <div className="alert alert-danger" style={{ marginTop: '1rem', marginBottom: 0 }}>
            ⚠️ A meta de R$ {dailyTarget} NÃO cobre os custos fixos diários. Considere aumentar para pelo menos R$ {Math.ceil(dailyFixedCost + 50)}.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* EQUIPE */}
        <div className="card">
          <h4 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={18} /> Equipe Cadastrada
          </h4>
          <table className="data-table">
            <thead>
              <tr><th>Nome</th><th>Função</th><th>Custo Fixo</th><th></th></tr>
            </thead>
            <tbody>
              {team.filter(t => t.active).map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td><span className={`tag ${t.role === 'technician' ? 'tag-qualified' : 'tag-scheduled'}`}>{t.role === 'technician' ? 'Técnico' : 'Ajudante'}</span></td>
                  <td>R$ {Number(t.fixed_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => removeMember(t.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.85rem' }}>Adicionar Membro</p>
            <div className="form-grid">
              <div className="form-group">
                <label>Nome</label>
                <input placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Função</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="technician">Técnico</option>
                  <option value="helper">Ajudante</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Custo Fixo Mensal (R$)</label>
              <input type="number" placeholder="4000.00" value={newCost} onChange={e => setNewCost(e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={addMember}><UserPlus size={16} /> Adicionar</button>
          </div>
        </div>

        {/* CATÁLOGO DE SERVIÇOS */}
        <div className="card">
          <h4 style={{ marginBottom: '1.25rem' }}>Catálogo de Serviços & Comissões</h4>
          <table className="data-table">
            <thead>
              <tr><th>Serviço</th><th>Preço Base</th><th>Comissão</th><th></th></tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>R$ {Number(s.base_price).toFixed(2)}</td>
                  <td>R$ {Number(s.commission_value).toFixed(2)}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => removeService(s.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.85rem' }}>Adicionar Serviço</p>
            <div className="form-group">
              <label>Nome do Serviço</label>
              <input placeholder="Ex: Manutenção Preventiva" value={svcName} onChange={e => setSvcName(e.target.value)} />
            </div>
            <div className="form-grid" style={{ marginTop: '0.75rem' }}>
              <div className="form-group">
                <label>Preço Base (R$)</label>
                <input type="number" placeholder="200.00" value={svcPrice} onChange={e => setSvcPrice(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Comissão Fixa (R$)</label>
                <input type="number" placeholder="30.00" value={svcCommission} onChange={e => setSvcCommission(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={addService}><Save size={16} /> Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  );
};
