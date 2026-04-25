import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Target, Zap, DollarSign, Users, CalendarCheck } from 'lucide-react';
import { getEntryNetAmount } from '../lib/financeLabels';
import { dayEndIsoFromYmd, dayStartIsoFromYmd, formatDateYmd, shiftDaysYmd, toDateTimeYmd, todayYmd } from '../lib/date';
import { clampByCompanyStart, DEFAULT_APP_SETTINGS, loadSettingsContext, resolveCosts } from '../lib/appSettings';

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

interface TeamItem {
  id: string;
  name: string;
  active: boolean;
}

interface TeamMemberCost {
  id: string;
  team_id?: string | null;
  fixed_cost: number;
  active: boolean;
}

type QuickPeriod = 'today' | 'week' | 'month' | 'custom';

export const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<QuickPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [teamFilter, setTeamFilter] = useState('all');
  const [companyStartDate, setCompanyStartDate] = useState(DEFAULT_APP_SETTINGS.company_start_date);
  const [teamPerformance, setTeamPerformance] = useState({ installations: 0, cleanings: 0, electrical: 0, repairs: 0, total: 0 });
  const [metrics, setMetrics] = useState<Metrics>({
    grossRevenue: 0, netRevenueAfterFees: 0, totalIncomeFees: 0, totalCommissions: 0, totalExpenses: 0,
    adsCost: 0, logisticsCost: 0, materialCost: 0, payrollCost: 0,
    taxExpenseCost: 0, otherExpenseCost: 0, netProfit: 0, commissionsWithoutMember: 0,
    totalLeads: 0, scheduledVisits: 0, dailyTarget: 600
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const now = new Date();
    setCustomStart(shiftDaysYmd(now, -30));
    setCustomEnd(todayYmd());
    fetchTeams();
  }, []);

  useEffect(() => {
    if (!customStart || !customEnd) return;
    fetchAll();
  }, [period, customStart, customEnd, teamFilter]);

  const getDateRange = () => {
    const now = new Date();
    if (period === 'today') {
      const current = todayYmd();
      return { startYmd: current, endYmd: current };
    }
    if (period === 'week') {
      return { startYmd: shiftDaysYmd(now, -7), endYmd: todayYmd() };
    }
    if (period === 'month') {
      return { startYmd: shiftDaysYmd(now, -30), endYmd: todayYmd() };
    }
    return { startYmd: customStart, endYmd: customEnd };
  };

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('id, name, active').eq('active', true).order('name');
    if (data) setTeams(data as TeamItem[]);
  };

  const calcPerformance = (entries: any[]) => {
    if (teamFilter === 'all') {
      setTeamPerformance({ installations: 0, cleanings: 0, electrical: 0, repairs: 0, total: 0 });
      return;
    }
    const teamEntries = entries.filter(
      (e: any) => e.entry_type === 'income' && e.team_id === teamFilter
    );
    const perf = { installations: 0, cleanings: 0, electrical: 0, repairs: 0, total: teamEntries.length };
    teamEntries.forEach((entry: any) => {
      const category = entry.category || '';
      const desc = (entry.description || '').toLowerCase();
      if (category === 'service_revenue') perf.installations += 1;
      if (category === 'service_cleaning') perf.cleanings += 1;
      if (category === 'service_electrical') perf.electrical += 1;
      if (category === 'service_uninstall' || desc.includes('conserto') || desc.includes('manutenção')) perf.repairs += 1;
    });
    setTeamPerformance(perf);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const requested = getDateRange();
      const settingsContext = await loadSettingsContext(supabase);
      setCompanyStartDate(settingsContext.app.company_start_date || DEFAULT_APP_SETTINGS.company_start_date);
      const clamped = clampByCompanyStart(requested.startYmd, requested.endYmd, settingsContext.app.company_start_date);
      const rangeStartIso = dayStartIsoFromYmd(clamped.startYmd);
      const rangeEndIso = dayEndIsoFromYmd(clamped.endYmd);
      const targetDate = period === 'custom'
        ? (customStart < settingsContext.app.company_start_date ? settingsContext.app.company_start_date : customStart)
        : todayYmd();
      const startDate = new Date(`${clamped.startYmd}T00:00:00`);
      const endDate = new Date(`${clamped.endYmd}T00:00:00`);
      const [finRes, leadsRes, apptRes, targetRes, membersRes] = await Promise.all([
        supabase.from('finance_entries').select('*').gte('movement_date', clamped.startYmd).lte('movement_date', clamped.endYmd),
        supabase.from('leads').select('id, stage, created_at').gte('created_at', rangeStartIso).lte('created_at', rangeEndIso),
        supabase.from('appointments').select('id, status, created_at').gte('created_at', rangeStartIso).lte('created_at', rangeEndIso),
        supabase.from('operational_targets').select('daily_profit_target, daily_ads_budget').gte('target_date', clamped.startYmd).lte('target_date', clamped.endYmd),
        supabase.from('team_members').select('id, team_id, fixed_cost, active').eq('active', true),
      ]);

      let entries = finRes.data || [];
      if (teamFilter !== 'all') {
        entries = entries.filter((entry: any) => entry.team_id === teamFilter);
      }
      const leads = leadsRes.data || [];
      const appts = apptRes.data || [];
      const activeMembers = (membersRes.data || []) as TeamMemberCost[];
      const scopedDefaults = resolveCosts(settingsContext, {
        teamId: teamFilter !== 'all' ? teamFilter : null,
      });
      const targetRows = Array.isArray(targetRes.data) ? targetRes.data : [];
      const configuredTarget = targetRows.length > 0
        ? targetRows.reduce((sum: number, row: any) => sum + Number(row.daily_profit_target || 0), 0) / targetRows.length
        : Number(scopedDefaults.dailyTarget ?? DEFAULT_APP_SETTINGS.default_daily_profit_target);
      const configuredDailyAds = targetRows.length > 0
        ? targetRows.reduce((sum: number, row: any) => sum + Number(row.daily_ads_budget || 0), 0) / targetRows.length
        : Number(scopedDefaults.adsBudget ?? DEFAULT_APP_SETTINGS.default_daily_ads_budget);
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
      let proratedPayroll = 0;
      const monthlyPayrollEntries: any[] = [];
      const dailyMap: Record<string, { revenueNet: number; expense: number; commissions: number }> = {};
      const dayLabel = (dateKey: string) =>
        new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      entries.forEach((e: any) => {
        const val = Number(e.amount) || 0;
        const tax = Number(e.tax_fee) || 0;
        const day = toDateTimeYmd(typeof e.movement_date === 'string' ? e.movement_date : e.created_at);
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
          const isMonthlyProrated = e.category === 'fixed_payroll' && Boolean(e.metadata?.is_monthly_prorated);
          if (isMonthlyProrated) {
            monthlyPayrollEntries.push(e);
            return;
          }
          totalExpAll += val;
          dailyMap[day].expense += val;
          if (e.category === 'marketing_ads') ads += val;
          else if (e.category?.startsWith('logistics')) logistics += val;
          else if (e.category === 'material_cost') material += val;
          else if (e.category === 'fixed_payroll') payroll += val;
          else if (e.category === 'tax') taxExp += val;
        }
      });

      const iterateDays = (from: Date, to: Date, fn: (dt: Date) => void) => {
        const current = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        const limit = new Date(to.getFullYear(), to.getMonth(), to.getDate());
        while (current <= limit) {
          fn(current);
          current.setDate(current.getDate() + 1);
        }
      };

      // Custo fixo base vindo de "Equipe & Metas": folha mensal (rateio diário) + ads diário.
      // Isso garante que o dashboard reflita perda diária mesmo sem lançamentos manuais.
      const membersForCost = teamFilter === 'all'
        ? activeMembers
        : activeMembers.filter((member) => member.team_id === teamFilter);
      const payrollMonthlyTotal = membersForCost.reduce((sum, member) => sum + (Number(member.fixed_cost) || 0), 0);
      iterateDays(startDate, endDate, (dt) => {
        const dateKey = formatDateYmd(dt);
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { revenueNet: 0, expense: 0, commissions: 0 };
        const daysInMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        const payrollPerDay = payrollMonthlyTotal / daysInMonth;
        payroll += payrollPerDay;
        ads += configuredDailyAds;
        totalExpAll += payrollPerDay + configuredDailyAds;
        dailyMap[dateKey].expense += payrollPerDay + configuredDailyAds;
      });

      monthlyPayrollEntries.forEach((entry: any) => {
        const amount = Number(entry.amount) || 0;
        const movementDate = typeof entry.movement_date === 'string'
          ? new Date(`${entry.movement_date}T12:00:00`)
          : new Date(entry.created_at);
        const year = movementDate.getFullYear();
        const month = movementDate.getMonth();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        const daysInMonth = monthEnd.getDate();
        const effectiveStart = startDate > monthStart ? startDate : monthStart;
        const effectiveEnd = endDate < monthEnd ? endDate : monthEnd;
        if (effectiveStart > effectiveEnd) return;
        const perDay = amount / daysInMonth;
        iterateDays(effectiveStart, effectiveEnd, (dt) => {
          const key = formatDateYmd(dt);
          if (!dailyMap[key]) dailyMap[key] = { revenueNet: 0, expense: 0, commissions: 0 };
          dailyMap[key].expense += perDay;
          proratedPayroll += perDay;
        });
      });

      payroll += proratedPayroll;
      totalExpAll += proratedPayroll;
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

      const chart = Object.entries(dailyMap)
        .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
        .map(([day, vals]) => ({
        name: dayLabel(day),
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
              <input
                type="date"
                min={companyStartDate}
                value={customStart}
                onChange={e => setCustomStart(e.target.value < companyStartDate ? companyStartDate : e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Data fim</label>
              <input
                type="date"
                min={companyStartDate}
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value < companyStartDate ? companyStartDate : e.target.value)}
              />
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
        <h4 style={{ marginBottom: '1rem' }}>Desempenho por Equipe</h4>
        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <div className="form-group">
            <label>Equipe</label>
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
              <option value="all">Selecione para detalhar</option>
              {teams.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>
        {teamFilter === 'all' ? (
          <p style={{ color: 'var(--text-secondary)' }}>Selecione uma equipe para metrificar limpezas, instalações e consertos no período.</p>
        ) : (
          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="card stat-card"><div className="stat-label">Instalações</div><div className="stat-value sm">{teamPerformance.installations}</div></div>
            <div className="card stat-card"><div className="stat-label">Limpezas</div><div className="stat-value sm">{teamPerformance.cleanings}</div></div>
            <div className="card stat-card"><div className="stat-label">Elétricas</div><div className="stat-value sm">{teamPerformance.electrical}</div></div>
            <div className="card stat-card"><div className="stat-label">Consertos/Manutenção</div><div className="stat-value sm">{teamPerformance.repairs}</div></div>
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
            <span className="detail-label">Folha de pagamento (rateio mensal + lançamentos)</span>
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
