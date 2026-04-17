import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Target, Zap, DollarSign, Users, CalendarCheck } from 'lucide-react';

interface Metrics {
  grossRevenue: number;
  totalExpenses: number;
  adsCost: number;
  logisticsCost: number;
  materialCost: number;
  payrollCost: number;
  netProfit: number;
  totalLeads: number;
  scheduledVisits: number;
  dailyTarget: number;
}

export const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');
  const [metrics, setMetrics] = useState<Metrics>({
    grossRevenue: 0, totalExpenses: 0, adsCost: 0, logisticsCost: 0,
    materialCost: 0, payrollCost: 0, netProfit: 0,
    totalLeads: 0, scheduledVisits: 0, dailyTarget: 600
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => { fetchAll(); }, [period]);

  const getDateRange = () => {
    const now = new Date();
    const start = new Date();
    if (period === 'today') { start.setHours(0, 0, 0, 0); }
    else if (period === 'week') { start.setDate(now.getDate() - 7); }
    else { start.setDate(now.getDate() - 30); }
    return { start: start.toISOString(), end: now.toISOString() };
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const [finRes, leadsRes, apptRes] = await Promise.all([
        supabase.from('finance_entries').select('*').gte('created_at', start).lte('created_at', end),
        supabase.from('leads').select('id, stage, created_at'),
        supabase.from('appointments').select('id, status'),
      ]);

      const entries = finRes.data || [];
      const leads = leadsRes.data || [];
      const appts = apptRes.data || [];

      let gross = 0, ads = 0, logistics = 0, material = 0, payroll = 0;
      const dailyMap: Record<string, { revenue: number; expense: number }> = {};

      entries.forEach((e: any) => {
        const val = Number(e.amount) || 0;
        const day = new Date(e.created_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
        if (!dailyMap[day]) dailyMap[day] = { revenue: 0, expense: 0 };

        if (e.entry_type === 'income') {
          gross += val;
          dailyMap[day].revenue += val;
        } else {
          dailyMap[day].expense += val;
          if (e.category === 'marketing_ads') ads += val;
          else if (e.category?.startsWith('logistics')) logistics += val;
          else if (e.category === 'material_cost') material += val;
          else if (e.category === 'fixed_payroll') payroll += val;
        }
      });

      const totalExp = ads + logistics + material + payroll;
      const net = gross - totalExp;
      const scheduled = appts.filter((a: any) => a.status === 'proposed' || a.status === 'confirmed').length;

      setMetrics({
        grossRevenue: gross, totalExpenses: totalExp, adsCost: ads,
        logisticsCost: logistics, materialCost: material, payrollCost: payroll,
        netProfit: net, totalLeads: leads.length, scheduledVisits: scheduled, dailyTarget: 600,
      });

      const chart = Object.entries(dailyMap).map(([day, vals]) => ({
        name: day, Receita: vals.revenue, Despesa: vals.expense, Lucro: vals.revenue - vals.expense
      }));
      setChartData(chart.length > 0 ? chart : [
        { name: 'Sem dados', Receita: 0, Despesa: 0, Lucro: 0 }
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const hitTarget = metrics.grossRevenue >= metrics.dailyTarget;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Visão Executiva</h2>
          <p>Lucratividade real — Receitas vs Tráfego vs Operação</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['today', 'week', 'month'] as const).map(p => (
            <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p)}>
              {p === 'today' ? 'Hoje' : p === 'week' ? '7 dias' : '30 dias'}
            </button>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={fetchAll}>↻</button>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="stat-grid">
        <div className="card card-accent stat-card">
          <DollarSign size={80} className="stat-icon" />
          <div className="stat-label">Lucro Líquido Real</div>
          <div className={`stat-value ${metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            R$ {metrics.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className={`stat-sub ${metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            {metrics.netProfit >= 0 ? <><TrendingUp size={14} /> Caixa positivo</> : <><TrendingDown size={14} /> Prejuízo</>}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-label">Faturamento Bruto</div>
          <div className="stat-value sm">R$ {metrics.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>

        <div className="card stat-card" style={{ borderLeft: hitTarget ? '3px solid var(--success)' : '3px solid var(--warning)' }}>
          <Target size={80} className="stat-icon" />
          <div className="stat-label">Meta Diária (R$ {metrics.dailyTarget})</div>
          <div className={`stat-value sm ${hitTarget ? 'text-success' : 'text-warning'}`}>
            {hitTarget ? 'Atingida ✓' : 'Pendente'}
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
            Falta R$ {Math.max(0, metrics.dailyTarget - metrics.grossRevenue).toFixed(2)}
          </div>
        </div>

        <div className="card stat-card">
          <Zap size={80} className="stat-icon" />
          <div className="stat-label">Gasto Tráfego (Ads)</div>
          <div className="stat-value sm text-danger">R$ {metrics.adsCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Segundo bloco de KPIs */}
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
      </div>

      {/* Gráfico + Resumo */}
      <div className="grid-2">
        <div className="card">
          <h4 style={{ marginBottom: '1rem' }}>Desempenho por Dia</h4>
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
          <h4 style={{ marginBottom: '1rem' }}>Breakdown Operacional</h4>
          <div className="detail-row">
            <span className="detail-label">Faturamento Bruto</span>
            <span className="detail-value text-success">+ R$ {metrics.grossRevenue.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Tráfego Pago (Meta Ads)</span>
            <span className="detail-value text-danger">- R$ {metrics.adsCost.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Logística (Almoço/Passagem/Gasolina)</span>
            <span className="detail-value text-danger">- R$ {metrics.logisticsCost.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Material Aplicado</span>
            <span className="detail-value text-danger">- R$ {metrics.materialCost.toFixed(2)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Folha de Pagamento</span>
            <span className="detail-value text-danger">- R$ {metrics.payrollCost.toFixed(2)}</span>
          </div>
          <div className="detail-row" style={{ borderTop: '2px solid var(--accent)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <span className="detail-label" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>LUCRO LÍQUIDO REAL</span>
            <span className={`detail-value ${metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '1.2rem' }}>
              R$ {metrics.netProfit.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
