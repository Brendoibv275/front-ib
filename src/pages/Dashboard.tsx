import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Target, Zap, DollarSign, Users, CalendarCheck } from 'lucide-react';
import { getEntryNetAmount } from '../lib/financeLabels';

interface Metrics {
  grossRevenue: number;
  netRevenueAfterFees: number;
  totalIncomeFees: number;
  totalCommissions: number;
  totalExpenses: number;
  adsCost: number;
  logisticsCost: number;
  materialCost: number;
  payrollCost: number;
  taxExpenseCost: number;
  otherExpenseCost: number;
  netProfit: number;
  commissionsWithoutMember: number;
  totalLeads: number;
  scheduledVisits: number;
  dailyTarget: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

type QuickPeriod = 'today' | 'week' | 'month' | 'custom';

export const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<QuickPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [memberFilter, setMemberFilter] = useState('all');
  const [memberPerformance, setMemberPerformance] = useState({ installations: 0, cleanings: 0, electrical: 0, repairs: 0, total: 0 });
  const [metrics, setMetrics] = useState<Metrics>({
    grossRevenue: 0, netRevenueAfterFees: 0, totalIncomeFees: 0, totalCommissions: 0, totalExpenses: 0,
    adsCost: 0, logisticsCost: 0, materialCost: 0, payrollCost: 0,
    taxExpenseCost: 0, otherExpenseCost: 0, netProfit: 0, commissionsWithoutMember: 0,
    totalLeads: 0, scheduledVisits: 0, dailyTarget: 600
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const now = new Date();
    const monthAgo = new Date();
    monthAgo.setDate(now.getDate() - 30);
    setCustomStart(monthAgo.toISOString().slice(0, 10));
    setCustomEnd(now.toISOString().slice(0, 10));
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    if (!customStart || !customEnd) return;
    fetchAll();
  }, [period, customStart, customEnd, memberFilter]);

  const getDateRange = () => {
    const now = new Date();
    const start = new Date();
    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    if (period === 'week') {
      start.setDate(now.getDate() - 7);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    if (period === 'month') {
      start.setDate(now.getDate() - 30);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    const customStartDate = new Date(`${customStart}T00:00:00`);
    const customEndDate = new Date(`${customEnd}T23:59:59`);
    return { start: customStartDate.toISOString(), end: customEndDate.toISOString() };
  };

  const fetchTeamMembers = async () => {
    const { data } = await supabase.from('team_members').select('id, name, role').eq('active', true).order('name');
    if (data) setTeam(data);
  };

  const calcPerformance = (entries: any[]) => {
    if (memberFilter === 'all') {
      setMemberPerformance({ installations: 0, cleanings: 0, electrical: 0, repairs: 0, total: 0 });
      return;
    }
    const memberEntries = entries.filter(
      (e: any) => e.entry_type === 'income' && e.team_member_id === memberFilter
    );
    const perf = { installations: 0, cleanings: 0, electrical: 0, repairs: 0, total: memberEntries.length };
    memberEntries.forEach((entry: any) => {
      const category = entry.category || '';
      const desc = (entry.description || '').toLowerCase();
      if (category === 'service_revenue') perf.installations += 1;
      if (category === 'service_cleaning') perf.cleanings += 1;
      if (category === 'service_electrical') perf.electrical += 1;
      if (category === 'service_uninstall' || desc.includes('conserto') || desc.includes('manutenção')) perf.repairs += 1;
    });
    setMemberPerformance(perf);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const targetDate = period === 'custom' ? customStart : new Date().toISOString().slice(0, 10);
      const [finRes, leadsRes, apptRes, targetRes] = await Promise.all([
        supabase.from('finance_entries').select('*').gte('created_at', start).lte('created_at', end),
        supabase.from('leads').select('id, stage, created_at').gte('created_at', start).lte('created_at', end),
        supabase.from('appointments').select('id, status, created_at').gte('created_at', start).lte('created_at', end),
        supabase.from('operational_targets').select('daily_profit_target').eq('target_date', targetDate).maybeSingle(),
      ]);

      const entries = finRes.data || [];
      const leads = leadsRes.data || [];
      const appts = apptRes.data || [];
      const configuredTarget = Number(targetRes.data?.daily_profit_target || 600);
      let gross = 0;
      let netRev = 0;
      let incomeFees = 0;
      let ads = 0;
      let logistics = 0;
      let material = 0;
      let payroll = 0;
      let taxExp = 0;
      let totalExpAll = 0;
      let totalCommissions = 0;
      let commissionsWithoutMember = 0;
      const dailyMap: Record<string, { revenueNet: number; expense: number; commissions: number }> = {};

      entries.forEach((e: any) => {
        const val = Number(e.amount) || 0;
        const tax = Number(e.tax_fee) || 0;
        const day = new Date(e.created_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
        if (!dailyMap[day]) dailyMap[day] = { revenueNet: 0, expense: 0, commissions: 0 };

        if (e.entry_type === 'income') {
          gross += val;
          incomeFees += tax;
          const netLine = getEntryNetAmount(e);
          netRev += netLine;
          dailyMap[day].revenueNet += netLine;
          const comm = Number(e.metadata?.commission_total);
          if (!Number.isNaN(comm) && comm > 0) {
            totalCommissions += comm;
            dailyMap[day].commissions += comm;
            if (!e.team_member_id) commissionsWithoutMember += 1;
          }
        } else {
          totalExpAll += val;
          dailyMap[day].expense += val;
          if (e.category === 'marketing_ads') ads += val;
          else if (e.category?.startsWith('logistics')) logistics += val;
          else if (e.category === 'material_cost') material += val;
          else if (e.category === 'fixed_payroll') payroll += val;
          else if (e.category === 'tax') taxExp += val;
        }
      });

      const bucketSum = ads + logistics + material + payroll + taxExp;
      const otherExp = Math.max(0, totalExpAll - bucketSum);
      const net = netRev - totalExpAll - totalCommissions;
      const scheduled = appts.filter((a: any) => a.status === 'proposed' || a.status === 'confirmed').length;

      setMetrics({
        grossRevenue: gross,
        netRevenueAfterFees: netRev,
        totalIncomeFees: incomeFees,
        totalCommissions,
        totalExpenses: totalExpAll,
        adsCost: ads,
        logisticsCost: logistics,
        materialCost: material,
        payrollCost: payroll,
        taxExpenseCost: taxExp,
        otherExpenseCost: otherExp,
        netProfit: net,
        commissionsWithoutMember,
        totalLeads: leads.length,
        scheduledVisits: scheduled,
        dailyTarget: configuredTarget,
      });

      const chart = Object.entries(dailyMap).map(([day, vals]) => ({
        name: day,
        Receita: vals.revenueNet,
        Despesa: vals.expense,
        Lucro: vals.revenueNet - vals.expense - vals.commissions,
      }));
      setChartData(chart.length > 0 ? chart : [
        { name: 'Sem dados', Receita: 0, Despesa: 0, Lucro: 0 }
      ]);
      calcPerformance(entries);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const hitTarget = metrics.netRevenueAfterFees >= metrics.dailyTarget;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Visão Executiva</h2>
          <p>Lucro após taxas de recebimento, comissões de serviço e todas as despesas do período</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(['today', 'week', 'month'] as const).map(p => (
            <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p)}>
              {p === 'today' ? 'Hoje' : p === 'week' ? '7 dias' : '30 dias'}
            </button>
          ))}
          <button className={`btn btn-sm ${period === 'custom' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod('custom')}>
            Intervalo
          </button>
          <button className="btn btn-sm btn-secondary" onClick={fetchAll}>↻</button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Data início</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Data fim</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="card card-accent stat-card">
          <DollarSign size={80} className="stat-icon" />
          <div className="stat-label">Lucro líquido real</div>
          <div className={`stat-value ${metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            R$ {metrics.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className={`stat-sub ${metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            {metrics.netProfit >= 0 ? <><TrendingUp size={14} /> Caixa positivo</> : <><TrendingDown size={14} /> Prejuízo</>}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-label">Receita líquida (após taxas)</div>
          <div className="stat-value sm text-success">R$ {metrics.netRevenueAfterFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
            Bruto R$ {metrics.grossRevenue.toFixed(2)}
            {metrics.totalIncomeFees > 0 ? ` · Taxas R$ ${metrics.totalIncomeFees.toFixed(2)}` : ''}
            {metrics.totalCommissions > 0 ? ` · Comissões R$ ${metrics.totalCommissions.toFixed(2)}` : ''}
          </div>
        </div>

        <div className="card stat-card" style={{ borderLeft: hitTarget ? '3px solid var(--success)' : '3px solid var(--warning)' }}>
          <Target size={80} className="stat-icon" />
          <div className="stat-label">Meta do dia (R$ {metrics.dailyTarget}) · receita líquida</div>
          <div className={`stat-value sm ${hitTarget ? 'text-success' : 'text-warning'}`}>
            {hitTarget ? 'Atingida' : 'Pendente'}
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
            Falta R$ {Math.max(0, metrics.dailyTarget - metrics.netRevenueAfterFees).toFixed(2)}
          </div>
        </div>

        <div className="card stat-card">
          <Zap size={80} className="stat-icon" />
          <div className="stat-label">Gasto Tráfego (Ads)</div>
          <div className="stat-value sm text-danger">R$ {metrics.adsCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card">
          <Users size={80} className="stat-icon" />
          <div className="stat-label">Total de Leads</div>
          <div className="stat-value sm text-accent">{metrics.totalLeads}</div>
        </div>
        <div className="card stat-card">
          <CalendarCheck size={80} className="stat-icon" />
          <div className="stat-label">Visitas Agendadas</div>
          <div className="stat-value sm">{metrics.scheduledVisits}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Custos Logísticos</div>
          <div className="stat-value sm">R$ {metrics.logisticsCost.toFixed(2)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Custos de Material</div>
          <div className="stat-value sm">R$ {metrics.materialCost.toFixed(2)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Impostos / Taxas (despesa)</div>
          <div className="stat-value sm text-danger">R$ {metrics.taxExpenseCost.toFixed(2)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Comissões (custos de serviço)</div>
          <div className="stat-value sm text-warning">R$ {metrics.totalCommissions.toFixed(2)}</div>
          {metrics.commissionsWithoutMember > 0 && (
            <div className="stat-sub" style={{ color: 'var(--warning)' }}>
              {metrics.commissionsWithoutMember} lançamento(s) sem funcionário — edite em Lançamentos
            </div>
          )}
        </div>
        <div className="card stat-card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <div className="stat-label">Lucro após comissões e despesas</div>
          <div className={`stat-value sm ${metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            R$ {metrics.netProfit.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Desempenho Individual</h4>
        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <div className="form-group">
            <label>Funcionário</label>
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
              <option value="all">Selecione para detalhar</option>
              {team.map(member => (
                <option key={member.id} value={member.id}>{member.name} ({member.role === 'technician' ? 'Técnico' : 'Auxiliar'})</option>
              ))}
            </select>
          </div>
        </div>
        {memberFilter === 'all' ? (
          <p style={{ color: 'var(--text-secondary)' }}>Selecione um funcionário para metrificar limpezas, instalações e consertos no período.</p>
        ) : (
          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="card stat-card"><div className="stat-label">Instalações</div><div className="stat-value sm">{memberPerformance.installations}</div></div>
            <div className="card stat-card"><div className="stat-label">Limpezas</div><div className="stat-value sm">{memberPerformance.cleanings}</div></div>
            <div className="card stat-card"><div className="stat-label">Elétricas</div><div className="stat-value sm">{memberPerformance.electrical}</div></div>
            <div className="card stat-card"><div className="stat-label">Consertos/Manutenção</div><div className="stat-value sm">{memberPerformance.repairs}</div></div>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ marginBottom: '1rem' }}>Desempenho por dia (lucro = receita líquida − despesas − comissões)</h4>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f2fe" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#00f2fe" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDesp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="#8b949e" fontSize={12} />
                <YAxis stroke="#8b949e" fontSize={12} />
                <Tooltip contentStyle={{ background: '#1a2332', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e6edf3' }} />
                <Area type="monotone" dataKey="Receita" stroke="#00f2fe" fill="url(#gRec)" strokeWidth={2} />
                <Area type="monotone" dataKey="Despesa" stroke="#ef4444" fill="url(#gDesp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h4 style={{ marginBottom: '1rem' }}>Detalhamento (líquido × despesas)</h4>
          <div style={{ marginBottom: '0.75rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Resumo Fiscal</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Impostos / taxas lançados como despesa</td>
                  <td>R$ {metrics.taxExpenseCost.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Comissões (registradas nos lançamentos)</td>
                  <td>R$ {metrics.totalCommissions.toFixed(2)}</td>
                </tr>
                <tr>
                  <td><strong>Lucro líquido real</strong></td>
                  <td><strong>R$ {metrics.netProfit.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          {metrics.commissionsWithoutMember > 0 && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              Existem comissões em receitas <strong>sem funcionário vinculado</strong>. Corrija em <strong>Lançamentos → Consultar e editar</strong> para o painel e a página Ganhos refletirem o responsável.
            </div>
          )}
          <div className="detail-row">
            <span className="detail-label">Receita bruta</span>
            <span className="detail-value text-success">+ R$ {metrics.grossRevenue.toFixed(2)}</span>
          </div>
          {metrics.totalIncomeFees > 0 && (
            <div className="detail-row">
              <span className="detail-label">Taxas sobre recebimentos (ex.: PagBank)</span>
              <span className="detail-value text-danger">- R$ {metrics.totalIncomeFees.toFixed(2)}</span>
            </div>
          )}
          <div className="detail-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.35rem' }}>
            <span className="detail-label" style={{ fontWeight: 600 }}>Receita líquida</span>
            <span className="detail-value text-success">+ R$ {metrics.netRevenueAfterFees.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Comissões sobre serviços (custo da empresa)</span>
            <span className="detail-value text-danger">- R$ {metrics.totalCommissions.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Tráfego pago (Meta Ads)</span>
            <span className="detail-value text-danger">- R$ {metrics.adsCost.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Logística (almoço, passagem, combustível)</span>
            <span className="detail-value text-danger">- R$ {metrics.logisticsCost.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Material aplicado</span>
            <span className="detail-value text-danger">- R$ {metrics.materialCost.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Folha de pagamento</span>
            <span className="detail-value text-danger">- R$ {metrics.payrollCost.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Impostos / taxas (lançados como despesa)</span>
            <span className="detail-value text-danger">- R$ {metrics.taxExpenseCost.toFixed(2)}</span>
          </div>
          {metrics.otherExpenseCost > 0 && (
            <div className="detail-row">
              <span className="detail-label">Outras despesas</span>
              <span className="detail-value text-danger">- R$ {metrics.otherExpenseCost.toFixed(2)}</span>
            </div>
          )}
          <div className="detail-row" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <span className="detail-label">Total de despesas</span>
            <span className="detail-value">R$ {metrics.totalExpenses.toFixed(2)}</span>
          </div>
          <div className="detail-row" style={{ borderTop: '2px solid var(--accent)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <span className="detail-label" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Lucro líquido real</span>
            <span className={`detail-value ${metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '1.2rem' }}>
              R$ {metrics.netProfit.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      {loading && <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Atualizando indicadores...</p>}
    </div>
  );
};
