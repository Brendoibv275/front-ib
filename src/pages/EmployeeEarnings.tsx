import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, TrendingUp } from 'lucide-react';
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
}

type Period = 'week' | 'month' | 'custom';

export const EmployeeEarnings = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rows, setRows] = useState<AggRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const d = new Date();
    d.setDate(now.getDate() - 30);
    setStart(d.toISOString().slice(0, 10));
    setEnd(now.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    if (!start || !end) return;
    fetchAggregates();
  }, [period, start, end]);

  const rangeIso = () => {
    const s = new Date(`${start}T00:00:00`).toISOString();
    const e = new Date(`${end}T23:59:59`).toISOString();
    return { s, e };
  };

  const fetchAggregates = async () => {
    setLoading(true);
    try {
      const { s, e } = rangeIso();
      const [{ data: teamRows }, { data: entryRows }] = await Promise.all([
        supabase.from('team_members').select('id, name, role').eq('active', true),
        supabase
          .from('finance_entries')
          .select('id, entry_type, category, amount, team_member_id, metadata, created_at')
          .eq('entry_type', 'income')
          .not('team_member_id', 'is', null)
          .gte('created_at', s)
          .lte('created_at', e)
          .order('created_at', { ascending: false }),
      ]);

      const teamList = (teamRows || []) as TeamMember[];
      const entries = entryRows || [];
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
          };
        }
        return byMember[id];
      };

      entries.forEach((row: any) => {
        const id = row.team_member_id as string;
        if (!id) return;
        const a = ensure(id);
        a.servicesCount += 1;
        a.grossRevenue += Number(row.amount) || 0;
        const md = row.metadata || {};
        a.commissionService += Number(md.commission_service_amount) || 0;
        a.commissionNight += Number(md.commission_night_amount) || 0;
        a.commissionOvertime += Number(md.commission_overtime_amount) || 0;
        a.commissionTotal += Number(md.commission_total) || 0;
      });

      setRows(Object.values(byMember).sort((x, y) => y.commissionTotal - x.commissionTotal));
    } finally {
      setLoading(false);
    }
  };

  const totalCommission = rows.reduce((s, r) => s + r.commissionTotal, 0);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Ganhos da equipe</h2>
        <p>Comissões calculadas por lançamento de receita com funcionário vinculado (período selecionado)</p>
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
                  a.setDate(now.getDate() - 7);
                  setStart(a.toISOString().slice(0, 10));
                  setEnd(now.toISOString().slice(0, 10));
                } else if (p === 'month') {
                  const a = new Date();
                  a.setDate(now.getDate() - 30);
                  setStart(a.toISOString().slice(0, 10));
                  setEnd(now.toISOString().slice(0, 10));
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
                <input type="date" value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Fim</label>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={fetchAggregates}>Atualizar</button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card">
          <Users size={80} className="stat-icon" />
          <div className="stat-label">Profissionais com ganhos</div>
          <div className="stat-value sm text-accent">{rows.length}</div>
        </div>
        <div className="card stat-card">
          <TrendingUp size={80} className="stat-icon" />
          <div className="stat-label">Total de comissões (período)</div>
          <div className="stat-value sm text-success">R$ {totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '1rem' }}>Resumo por funcionário</h4>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Carregando...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            Nenhuma receita com funcionário e comissão registrada neste período. Em <strong>Lançamentos</strong>, vincule o técnico e o serviço de comissão ao salvar.
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
                    <td>R$ {r.commissionService.toFixed(2)}</td>
                    <td>R$ {r.commissionNight.toFixed(2)}</td>
                    <td>R$ {r.commissionOvertime.toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>R$ {r.commissionTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
          O total por pessoa soma o campo de comissão salvo em cada receita (serviço, noturno, hora extra). Lançamentos antigos sem esses dados aparecem com comissão zero.
        </p>
      </div>
    </div>
  );
};
