import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, TrendingUp, Pencil, Wand2 } from 'lucide-react';
import { getFinanceCategoryLabel } from '../lib/financeLabels';
import {
  type CatalogService,
  getStoredCommissionParts,
  getSuggestedCommissionFromCatalog,
  mergeCatalogCommissionIntoMetadata,
} from '../lib/commissionRecalc';
import { formatYmdPtBr, shiftDaysYmd, todayYmd } from '../lib/date';
import { clampByCompanyStart, DEFAULT_APP_SETTINGS, loadAppSettings } from '../lib/appSettings';

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

interface AggRow {
  memberId: string;
  name: string;
  role: string;
  servicesCount: number;
  commissionService: number;
  commissionNight: number;
  commissionOvertime: number;
  commissionTotal: number;
  grossRevenue: number;
  /** true se alguma linha usou sugestão do catálogo no resumo */
  hasProjection: boolean;
}

type Period = 'week' | 'month' | 'custom';

type IncomeEntry = {
  id: string;
  amount: number;
  category: string;
  team_member_id: string;
  team_id?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  movement_date?: string | null;
  description: string | null;
};

export const EmployeeEarnings = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rows, setRows] = useState<AggRow[]>([]);
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [serviceById, setServiceById] = useState<Record<string, CatalogService>>({});
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [companyStartDate, setCompanyStartDate] = useState(DEFAULT_APP_SETTINGS.company_start_date);

  useEffect(() => {
    const now = new Date();
    const rawStart = shiftDaysYmd(now, -30);
    const safeStart = rawStart < companyStartDate ? companyStartDate : rawStart;
    setStart(safeStart);
    setEnd(todayYmd());
  }, [companyStartDate]);

  useEffect(() => {
    loadAppSettings(supabase).then((cfg) => setCompanyStartDate(cfg.company_start_date || DEFAULT_APP_SETTINGS.company_start_date));
  }, []);

  useEffect(() => {
    if (!start || !end) return;
    fetchAggregates();
  }, [period, start, end]);

  const rangeIso = () => {
    const s = start;
    const e = end;
    return { s, e };
  };

  const fetchAggregates = async () => {
    setLoading(true);
    setActionMsg(null);
    try {
      const requested = rangeIso();
      const { startYmd: s, endYmd: e } = clampByCompanyStart(requested.s, requested.e, companyStartDate);
      const [{ data: teamRows }, { data: entryRows }, { data: catalogRows }] = await Promise.all([
        supabase.from('team_members').select('id, name, role').eq('active', true),
        supabase
          .from('finance_entries')
          .select('id, entry_type, category, amount, team_member_id, team_id, metadata, created_at, movement_date, description')
          .eq('entry_type', 'income')
          .not('team_member_id', 'is', null)
          .gte('movement_date', s)
          .lte('movement_date', e)
          .order('movement_date', { ascending: false })
          .limit(800),
        supabase.from('service_catalog').select('id, name, commission_type, commission_value'),
      ]);

      const catalog = (catalogRows || []) as CatalogService[];
      const svcMap = Object.fromEntries(catalog.map(sv => [sv.id, sv]));
      setServiceById(svcMap);

      const teamList = (teamRows || []) as TeamMember[];
      const list = (entryRows || []) as IncomeEntry[];
      setEntries(list);

      const byMember: Record<string, AggRow> = {};

      const ensure = (id: string) => {
        const m = teamList.find(t => t.id === id);
        if (!byMember[id]) {
          byMember[id] = {
            memberId: id,
            name: m?.name || 'Funcionário',
            role: m?.role || '',
            servicesCount: 0,
            commissionService: 0,
            commissionNight: 0,
            commissionOvertime: 0,
            commissionTotal: 0,
            grossRevenue: 0,
            hasProjection: false,
          };
        }
        return byMember[id];
      };

      list.forEach(row => {
        const id = row.team_member_id;
        if (!id) return;
        const a = ensure(id);
        a.servicesCount += 1;
        a.grossRevenue += Number(row.amount) || 0;
        const st = getStoredCommissionParts(row.metadata);
        const sug = getSuggestedCommissionFromCatalog(row, svcMap);

        const useStoredTotal = st.total >= 0.005;
        const effSvc = st.service >= 0.005 ? st.service : sug.hasService ? sug.serviceAmount : 0;
        let effTotal = st.total;
        if (!useStoredTotal && sug.hasService) {
          effTotal = sug.total;
          a.hasProjection = true;
        } else if (!useStoredTotal) {
          effTotal = st.night + st.overtime;
        }

        a.commissionService += effSvc;
        a.commissionNight += st.night;
        a.commissionOvertime += st.overtime;
        a.commissionTotal += effTotal;
      });

      setRows(Object.values(byMember).sort((x, y) => y.commissionTotal - x.commissionTotal));
    } finally {
      setLoading(false);
    }
  };

  const totalCommission = rows.reduce((s, r) => s + r.commissionTotal, 0);
  const anyProjection = rows.some(r => r.hasProjection);

  const linesDetail = useMemo(() => {
    return entries.map(row => {
      const st = getStoredCommissionParts(row.metadata);
      const sug = getSuggestedCommissionFromCatalog(row, serviceById);
      const md = row.metadata || {};
      const serviceNames = Array.isArray(md.services)
        ? md.services
            .map((item: any) => (typeof item?.service_name === 'string' ? item.service_name : null))
            .filter((value: string | null): value is string => Boolean(value))
        : [];
      const serviceLabel = serviceNames.length > 0 ? serviceNames.join(', ') : (sug.service ? sug.service.name : '—');
      const team = rows.find(r => r.memberId === row.team_member_id);
      const name = team?.name || '—';
      const canApply = Boolean(sug.hasService && sug.service);
      const needsApply = canApply && st.total < 0.005 && sug.total >= 0.005;
      const drift = canApply && st.total >= 0.005 && Math.abs(st.total - sug.total) >= 0.02;
      return { row, st, sug, name, canApply, needsApply, drift, serviceLabel };
    });
  }, [entries, serviceById, rows]);

  const pendingCatalogCount = useMemo(
    () => linesDetail.filter(l => l.needsApply || l.drift).length,
    [linesDetail]
  );

  const applyOne = async (entry: IncomeEntry) => {
    const sug = getSuggestedCommissionFromCatalog(entry, serviceById);
    if (!sug.service) return;
    setApplyingId(entry.id);
    setActionMsg(null);
    try {
      const metadata = mergeCatalogCommissionIntoMetadata(entry, sug.service);
      const { error } = await supabase.from('finance_entries').update({ metadata }).eq('id', entry.id);
      if (error) throw error;
      setActionMsg({ type: 'ok', text: 'Comissão atualizada com as regras do catálogo.' });
      await fetchAggregates();
    } catch (e: any) {
      setActionMsg({ type: 'err', text: e.message || 'Falha ao gravar.' });
    } finally {
      setApplyingId(null);
    }
  };

  const applyBulkMissing = async () => {
    const targets = linesDetail.filter(l => l.needsApply || l.drift).map(l => l.row);
    if (targets.length === 0) return;
    setBulkApplying(true);
    setActionMsg(null);
    try {
      for (const entry of targets) {
        const sug = getSuggestedCommissionFromCatalog(entry, serviceById);
        if (!sug.service) continue;
        const metadata = mergeCatalogCommissionIntoMetadata(entry, sug.service);
        const { error } = await supabase.from('finance_entries').update({ metadata }).eq('id', entry.id);
        if (error) throw error;
      }
      setActionMsg({ type: 'ok', text: `${targets.length} lançamento(s) atualizado(s) com o catálogo.` });
      await fetchAggregates();
    } catch (e: any) {
      setActionMsg({ type: 'err', text: e.message || 'Falha em lote.' });
    } finally {
      setBulkApplying(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Ganhos da equipe</h2>
        <p>
          Comissões por receita com funcionário vinculado. Lançamentos antigos sem metadados usam o <strong>catálogo atual</strong> como
          sugestão até você <strong>Aplicar</strong> ou <strong>Editar</strong> para gravar.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid" style={{ alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Período rápido</label>
            <select
              value={period}
              onChange={ev => {
                const p = ev.target.value as Period;
                setPeriod(p);
                const now = new Date();
                if (p === 'week') {
                  const a = new Date();
                  const safeStart = shiftDaysYmd(a, -7);
                  setStart(safeStart < companyStartDate ? companyStartDate : safeStart);
                  setEnd(todayYmd());
                } else if (p === 'month') {
                  const a = new Date();
                  const safeStart = shiftDaysYmd(a, -30);
                  setStart(safeStart < companyStartDate ? companyStartDate : safeStart);
                  setEnd(todayYmd());
                }
              }}
            >
              <option value="week">Últimos 7 dias</option>
              <option value="month">Últimos 30 dias</option>
              <option value="custom">Datas personalizadas</option>
            </select>
          </div>
          {period === 'custom' && (
            <>
              <div className="form-group">
                <label>Início</label>
                <input
                  type="date"
                  value={start}
                  min={companyStartDate}
                  onChange={e => setStart(e.target.value < companyStartDate ? companyStartDate : e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Fim</label>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={fetchAggregates}>
            Atualizar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={bulkApplying || pendingCatalogCount === 0}
            onClick={applyBulkMissing}
            title="Grava comissão de serviço conforme catálogo (lançamentos sem comissão gravada ou muito diferentes da regra atual)"
          >
            <Wand2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {bulkApplying ? 'Aplicando…' : `Aplicar catálogo (${pendingCatalogCount})`}
          </button>
        </div>
        {actionMsg && (
          <div className={`alert ${actionMsg.type === 'ok' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem', marginBottom: 0 }}>
            {actionMsg.text}
          </div>
        )}
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card">
          <Users size={80} className="stat-icon" />
          <div className="stat-label">Profissionais com receitas</div>
          <div className="stat-value sm text-accent">{rows.length}</div>
        </div>
        <div className="card stat-card">
          <TrendingUp size={80} className="stat-icon" />
          <div className="stat-label">Total comissões (período)</div>
          <div className="stat-value sm text-success">R$ {totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          {anyProjection && (
            <div className="stat-sub" style={{ color: 'var(--warning)', fontSize: '0.78rem' }}>
              Parte do valor usa estimativa do catálogo — use &quot;Aplicar&quot; para gravar no banco.
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Resumo por funcionário</h4>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Carregando...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            Nenhuma receita com funcionário neste período. Em <strong>Lançamentos</strong>, vincule o técnico ao salvar a receita.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Serviços</th>
                  <th>Faturamento atribuído</th>
                  <th>Com. serviço</th>
                  <th>Noturno</th>
                  <th>Hora extra</th>
                  <th>Total comissão</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.memberId}>
                    <td style={{ fontWeight: 600 }}>
                      {r.name}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {r.role === 'technician' ? 'Técnico' : r.role === 'servant' ? 'Servente' : 'Auxiliar'}
                      </div>
                    </td>
                    <td>{r.servicesCount}</td>
                    <td>R$ {r.grossRevenue.toFixed(2)}</td>
                    <td>
                      R$ {r.commissionService.toFixed(2)}
                      {r.hasProjection && <span style={{ color: 'var(--warning)', fontSize: '0.7rem' }}> *</span>}
                    </td>
                    <td>R$ {r.commissionNight.toFixed(2)}</td>
                    <td>R$ {r.commissionOvertime.toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                      R$ {r.commissionTotal.toFixed(2)}
                      {r.hasProjection && <span style={{ color: 'var(--warning)', fontSize: '0.7rem' }}> *</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
          * Asterisco: inclui estimativa do catálogo onde a comissão ainda não estava gravada no lançamento. &quot;Aplicar catálogo&quot; grava os metadados e alinha o dashboard.
        </p>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '1rem' }}>Lançamentos do período (ajustar comissão)</h4>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
        ) : entries.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Nenhum lançamento para listar.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Funcionário</th>
                  <th>Categoria</th>
                  <th>Valor bruto</th>
                  <th>Serviço (lançamento)</th>
                  <th>Com. gravada</th>
                  <th>Sugestão (catálogo)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {linesDetail.map(({ row, st, sug, name, canApply, needsApply, drift, serviceLabel }) => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {row.movement_date ? formatYmdPtBr(row.movement_date) : new Date(row.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ fontWeight: 600 }}>{name}</td>
                    <td style={{ fontSize: '0.82rem' }}>{getFinanceCategoryLabel(row.category)}</td>
                    <td>R$ {Number(row.amount).toFixed(2)}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {serviceLabel}
                      {!canApply && (
                        <div style={{ color: 'var(--warning)', fontSize: '0.72rem' }}>Sem serviço no lançamento — edite e escolha no catálogo</div>
                      )}
                    </td>
                    <td>R$ {st.total.toFixed(2)}</td>
                    <td>
                      {canApply ? `R$ ${sug.total.toFixed(2)}` : '—'}
                      {drift && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>difere do gravado</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={!canApply || applyingId === row.id}
                        title="Gravar comissão conforme regra atual do serviço no catálogo"
                        onClick={() => applyOne(row)}
                      >
                        <Wand2 size={14} /> {applyingId === row.id ? '…' : 'Aplicar'}
                      </button>{' '}
                      <Link className="btn btn-sm btn-primary" to={`/finance?edit=${row.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Pencil size={14} /> Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
          <strong>Aplicar</strong> só funciona se o lançamento tiver <code>serviço do catálogo</code> vinculado. Caso contrário, use <strong>Editar</strong>,
          selecione o serviço e salve — a comissão será calculada como em um lançamento novo.
        </p>
      </div>
    </div>
  );
};
