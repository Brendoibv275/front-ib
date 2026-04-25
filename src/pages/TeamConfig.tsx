import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Save, UserPlus, Trash2, Target, Calculator } from 'lucide-react';

interface TeamMember {
  id: string; name: string; role: string; fixed_cost: number; active: boolean; team_id?: string | null;
}
interface TeamItem {
  id: string; name: string; active: boolean;
}
interface ServiceItem {
  id: string; name: string; base_price: number; commission_type: string; commission_value: number;
}

export const TeamConfig = () => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyTarget, setDailyTarget] = useState('600');
  const [adsBudget, setAdsBudget] = useState('100');
  const [success, setSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  // Novo membro
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('helper');
  const [newCost, setNewCost] = useState('');
  const [newMemberTeamId, setNewMemberTeamId] = useState('');

  // Novo serviço
  const [svcName, setSvcName] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcCommission, setSvcCommission] = useState('25');
  const [svcCommissionType, setSvcCommissionType] = useState<'percentage' | 'fixed'>('percentage');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [tRes, sRes, teamsRes] = await Promise.all([
      supabase.from('team_members').select('*').order('created_at'),
      supabase.from('service_catalog').select('*').order('created_at'),
      supabase.from('teams').select('id, name, active').eq('active', true).order('name'),
    ]);
    if (tRes.data) setTeam(tRes.data);
    if (sRes.data) setServices(sRes.data);
    if (teamsRes.data) setTeams(teamsRes.data as TeamItem[]);
    const today = new Date().toISOString().slice(0, 10);
    const { data: targets } = await supabase
      .from('operational_targets')
      .select('daily_ads_budget, daily_profit_target')
      .eq('target_date', today)
      .maybeSingle();
    if (targets) {
      setDailyTarget(String(Number(targets.daily_profit_target)));
      setAdsBudget(String(Number(targets.daily_ads_budget)));
    }
    setLoading(false);
  };

  const totalPayroll = team.filter(t => t.active).reduce((sum, t) => sum + Number(t.fixed_cost), 0);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyPayroll = totalPayroll / daysInMonth;
  const dailyAds = Number(adsBudget);
  const dailyFixedCost = dailyPayroll + dailyAds;
  const target = Number(dailyTarget);
  const dailyMargin = target - dailyFixedCost;

  const addMember = async () => {
    if (!newName || !newCost) return;
    await supabase.from('team_members').insert({
      name: newName,
      role: newRole,
      fixed_cost: parseFloat(newCost),
      team_id: newMemberTeamId || null,
    });
    setNewName(''); setNewCost(''); setNewRole('helper'); setNewMemberTeamId('');
    fetchAll();
  };

  const removeMember = async (id: string) => {
    await supabase.from('team_members').update({ active: false }).eq('id', id);
    fetchAll();
  };

  const updateMember = async (member: TeamMember) => {
    setSaveError('');
    setSuccess('');
    const { error } = await supabase
      .from('team_members')
      .update({
        name: member.name.trim(),
        role: member.role,
        fixed_cost: Number(member.fixed_cost),
        team_id: member.team_id || null,
      })
      .eq('id', member.id);
    if (error) {
      setSaveError(`Não foi possível salvar o membro: ${error.message}`);
      return;
    }
    setSuccess('Membro atualizado com sucesso.');
    await fetchAll();
  };

  const updateService = async (service: ServiceItem) => {
    setSaveError('');
    setSuccess('');
    const { error } = await supabase
      .from('service_catalog')
      .update({
        name: service.name.trim(),
        base_price: Number(service.base_price),
        commission_type: service.commission_type,
        commission_value: Number(service.commission_value),
      })
      .eq('id', service.id);
    if (error) {
      setSaveError(`Não foi possível salvar o serviço: ${error.message}`);
      return;
    }
    setSuccess('Serviço e comissão atualizados com sucesso.');
    await fetchAll();
  };

  const addService = async () => {
    if (!svcName || !svcPrice) return;
    await supabase.from('service_catalog').insert({
      name: svcName, base_price: parseFloat(svcPrice),
      commission_type: svcCommissionType, commission_value: parseFloat(svcCommission || '0')
    });
    setSvcName(''); setSvcPrice(''); setSvcCommission('25'); setSvcCommissionType('percentage');
    fetchAll();
  };

  const removeService = async (id: string) => {
    await supabase.from('service_catalog').delete().eq('id', id);
    fetchAll();
  };

  const saveTargets = async () => {
    setSaveError('');
    setSuccess('');
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('operational_targets').upsert({
      target_date: today,
      daily_ads_budget: Number(adsBudget || '0'),
      daily_profit_target: Number(dailyTarget || '0'),
    }, { onConflict: 'target_date' });
    if (error) {
      setSaveError(`Não foi possível salvar as metas: ${error.message}`);
      return;
    }
    setSuccess('Metas diárias salvas com sucesso.');
  };

  const updateMemberField = (id: string, field: keyof TeamMember, value: string | number | boolean | null) => {
    setTeam(prev => prev.map(member => member.id === id ? { ...member, [field]: value } : member));
  };

  const updateServiceField = (id: string, field: keyof ServiceItem, value: string | number) => {
    setServices(prev => prev.map(service => service.id === id ? { ...service, [field]: value } : service));
  };

  return (
    <div className="page page-team-config">
      <div className="page-header">
        <h2>Equipe, Metas & Comissões</h2>
        <p>Gerencie o custo fixo da equipe, catálogo de serviços e validação da meta diária</p>
      </div>

      {/* VALIDAÇÃO DE META */}
      <div className="card" style={{ marginBottom: '1rem', borderLeft: dailyMargin >= 0 ? '3px solid var(--success)' : '3px solid var(--danger)' }}>
        <div className="sim-header">
          <Calculator size={18} color="var(--accent)" />
          <h4>Simulador de Meta Diária</h4>
        </div>
        <div className="form-grid" style={{ marginBottom: '0.65rem' }}>
          <div className="form-group">
            <label>Meta diária por técnico (R$)</label>
            <input type="number" value={dailyTarget} onChange={e => setDailyTarget(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Orçamento diário de Ads (R$)</label>
            <input type="number" value={adsBudget} onChange={e => setAdsBudget(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={saveTargets} style={{ marginBottom: '0.35rem' }}><Save size={13} /> Salvar metas</button>
        <div className="sim-kpis">
          <div>
            <div className="stat-label">Folha mensal total</div>
            <div className="sim-kpi-val">R$ {totalPayroll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="stat-label">Folha / dia ({daysInMonth} úteis)</div>
            <div className="sim-kpi-val">R$ {dailyPayroll.toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Custo fixo diário (folha + ads)</div>
            <div className="sim-kpi-val" style={{ color: 'var(--danger)' }}>R$ {dailyFixedCost.toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Margem diária estimada</div>
            <div className="sim-kpi-val" style={{ color: dailyMargin >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              R$ {dailyMargin.toFixed(2)} {dailyMargin < 0 ? '⚠' : '✓'}
            </div>
          </div>
        </div>
        {dailyMargin < 0 && (
          <div className="alert alert-danger" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            A meta de R$ {dailyTarget} não cobre os custos fixos diários. Considere pelo menos R$ {Math.ceil(dailyFixedCost + 50)}.
          </div>
        )}
      </div>

      <div className="two-col-equipe">
        {/* EQUIPE */}
        <div className="card">
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Target size={16} /> Equipe cadastrada
          </h4>
          <p className="help-text">
            Edite a linha e use o ícone de salvar. Erros em vermelho vêm do Supabase (rede ou permissão).
          </p>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Nome</th><th>Função</th><th>Equipe</th><th>Custo fixo</th><th className="col-actions" aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {team.filter(t => t.active).map(t => (
                <tr key={t.id}>
                  <td><input value={t.name} onChange={e => updateMemberField(t.id, 'name', e.target.value)} /></td>
                  <td>
                    <select value={t.role} onChange={e => updateMemberField(t.id, 'role', e.target.value)}>
                      <option value="technician">Técnico</option>
                      <option value="helper">Ajudante</option>
                      <option value="servant">Servente</option>
                    </select>
                  </td>
                  <td>
                    <select value={t.team_id || ''} onChange={e => updateMemberField(t.id, 'team_id', e.target.value || null)}>
                      <option value="">Sem equipe</option>
                      {teams.map(teamItem => (
                        <option key={teamItem.id} value={teamItem.id}>{teamItem.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={t.fixed_cost == null ? '' : String(t.fixed_cost)}
                      onChange={e => {
                        const v = e.target.value;
                        updateMemberField(t.id, 'fixed_cost', v === '' ? 0 : Number(v));
                      }}
                    />
                  </td>
                  <td className="col-actions">
                    <div className="team-row-actions">
                      <button type="button" className="btn btn-sm btn-secondary btn-icon-only" onClick={() => updateMember(t)} title="Salvar esta linha" aria-label="Salvar">
                        <Save size={15} strokeWidth={2} />
                      </button>
                      <button type="button" className="btn btn-sm btn-danger btn-icon-only" onClick={() => removeMember(t.id)} title="Inativar membro" aria-label="Excluir">
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="team-add-section">
            <p className="team-add-title">Adicionar membro</p>
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
                  <option value="servant">Servente</option>
                </select>
              </div>
              <div className="form-group">
                <label>Equipe</label>
                <select value={newMemberTeamId} onChange={e => setNewMemberTeamId(e.target.value)}>
                  <option value="">Sem equipe</option>
                  {teams.map(teamItem => (
                    <option key={teamItem.id} value={teamItem.id}>{teamItem.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '0.45rem' }}>
              <label>Custo fixo mensal (R$)</label>
              <input type="number" placeholder="4000.00" value={newCost} onChange={e => setNewCost(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={addMember}><UserPlus size={15} /> Adicionar</button>
          </div>
        </div>

        {/* CATÁLOGO DE SERVIÇOS */}
        <div className="card">
          <h4>Catálogo de serviços & comissões</h4>
          <p className="help-text">
            Ajuste preço ou comissão e salve pela linha (ícone de disquete).
          </p>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Serviço</th><th>Preço base</th><th>Comissão</th><th className="col-actions" aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id}>
                  <td><input value={s.name} onChange={e => updateServiceField(s.id, 'name', e.target.value)} /></td>
                  <td style={{ maxWidth: '6.5rem' }}><input type="number" value={Number(s.base_price)} onChange={e => updateServiceField(s.id, 'base_price', Number(e.target.value))} /></td>
                  <td style={{ minWidth: '7.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.25rem' }}>
                      <select value={s.commission_type} onChange={e => updateServiceField(s.id, 'commission_type', e.target.value)}>
                        <option value="percentage">%</option>
                        <option value="fixed">R$</option>
                      </select>
                      <input type="number" value={Number(s.commission_value)} onChange={e => updateServiceField(s.id, 'commission_value', Number(e.target.value))} />
                    </div>
                  </td>
                  <td className="col-actions">
                    <div className="team-row-actions">
                      <button type="button" className="btn btn-sm btn-secondary btn-icon-only" onClick={() => updateService(s)} title="Salvar esta linha" aria-label="Salvar">
                        <Save size={15} strokeWidth={2} />
                      </button>
                      <button type="button" className="btn btn-sm btn-danger btn-icon-only" onClick={() => removeService(s.id)} title="Remover serviço" aria-label="Excluir">
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="team-add-section">
            <p className="team-add-title">Adicionar serviço</p>
            <div className="form-group">
              <label>Nome do serviço</label>
              <input placeholder="Ex.: Manutenção preventiva" value={svcName} onChange={e => setSvcName(e.target.value)} />
            </div>
            <div className="form-grid" style={{ marginTop: '0.45rem' }}>
              <div className="form-group">
                <label>Preço base (R$)</label>
                <input type="number" placeholder="200.00" value={svcPrice} onChange={e => setSvcPrice(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Comissão</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.25rem' }}>
                  <select value={svcCommissionType} onChange={e => setSvcCommissionType(e.target.value as 'percentage' | 'fixed')}>
                    <option value="percentage">%</option>
                    <option value="fixed">R$</option>
                  </select>
                  <input type="number" placeholder="25" value={svcCommission} onChange={e => setSvcCommission(e.target.value)} />
                </div>
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={addService}><Save size={15} /> Adicionar</button>
          </div>
        </div>
      </div>
      {loading && <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Carregando equipe e catálogo...</p>}
      {saveError && <div className="alert alert-danger" style={{ marginTop: '1rem' }}>{saveError}</div>}
      {success && <div className="alert alert-success" style={{ marginTop: '1rem' }}>{success}</div>}
    </div>
  );
};
