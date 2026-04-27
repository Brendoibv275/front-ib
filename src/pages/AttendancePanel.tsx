import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Save, Wand2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatYmdPtBr, getBusinessDayFactorFromYmd, getMonthBusinessUnitsFromYmd, shiftDaysYmd, todayYmd } from '../lib/date';
import {
  clampByCompanyStart,
  DEFAULT_APP_SETTINGS,
  type SettingsContext,
  loadSettingsContext,
  resolveCosts,
} from '../lib/appSettings';

type AttendanceStatus = 'present' | 'absent' | 'holiday';

interface TeamItem {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  team_id?: string | null;
  fixed_cost: number;
  active: boolean;
}

interface AttendanceRow {
  id: string;
  attendance_date: string;
  team_member_id: string;
  team_id?: string | null;
  status: AttendanceStatus;
  include_daily: boolean;
  include_lunch: boolean;
  daily_amount?: number | null;
  lunch_amount?: number | null;
  notes?: string | null;
  generated_at?: string | null;
}

const dayList = (fromYmd: string, toYmd: string): string[] => {
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T00:00:00`);
  const result: string[] = [];
  const current = new Date(from);
  while (current <= to) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    result.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }
  return result;
};

export const AttendancePanel = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [settingsContext, setSettingsContext] = useState<SettingsContext>({
    app: DEFAULT_APP_SETTINGS,
    teamCostMap: {},
    memberCostMap: {},
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    setStartDate(shiftDaysYmd(now, -6));
    setEndDate(todayYmd());
    bootstrap();
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchRows();
  }, [startDate, endDate, teamFilter, settingsContext.app.company_start_date]);

  const membersMap = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);
  const teamsMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t.name])), [teams]);

  const bootstrap = async () => {
    setLoading(true);
    const [teamsRes, membersRes, ctx] = await Promise.all([
      supabase.from('teams').select('id, name').eq('active', true).order('name'),
      supabase.from('team_members').select('id, name, role, team_id, fixed_cost, active').eq('active', true).order('name'),
      loadSettingsContext(supabase),
    ]);
    if (teamsRes.data) setTeams(teamsRes.data as TeamItem[]);
    if (membersRes.data) {
      setMembers((membersRes.data as TeamMember[]).map(m => ({ ...m, fixed_cost: Number(m.fixed_cost || 0) })));
    }
    setSettingsContext(ctx);
    setLoading(false);
  };

  const fetchRows = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    const clamped = clampByCompanyStart(startDate, endDate, settingsContext.app.company_start_date);
    let query = supabase
      .from('team_attendance')
      .select('id, attendance_date, team_member_id, team_id, status, include_daily, include_lunch, daily_amount, lunch_amount, notes, generated_at')
      .gte('attendance_date', clamped.startYmd)
      .lte('attendance_date', clamped.endYmd)
      .order('attendance_date', { ascending: false });

    if (teamFilter !== 'all') query = query.eq('team_id', teamFilter);
    const { data, error } = await query;
    if (error) {
      setMessage({ type: 'err', text: error.message });
      setLoading(false);
      return;
    }
    setRows((data || []) as AttendanceRow[]);
    setLoading(false);
  };

  const seedRange = async () => {
    if (!startDate || !endDate) return;
    setSeeding(true);
    setMessage(null);
    const clamped = clampByCompanyStart(startDate, endDate, settingsContext.app.company_start_date);
    const rangeDays = dayList(clamped.startYmd, clamped.endYmd);
    const targetMembers = members.filter(m => teamFilter === 'all' || m.team_id === teamFilter);
    const payload: any[] = [];
    for (const day of rangeDays) {
      for (const member of targetMembers) {
        payload.push({
          attendance_date: day,
          team_member_id: member.id,
          team_id: member.team_id || null,
          status: 'absent',
          include_daily: false,
          include_lunch: false,
        });
      }
    }
    if (payload.length > 0) {
      const { error } = await supabase
        .from('team_attendance')
        .upsert(payload, { onConflict: 'attendance_date,team_member_id', ignoreDuplicates: true });
      if (error) {
        setMessage({ type: 'err', text: error.message });
        setSeeding(false);
        return;
      }
    }
    setMessage({ type: 'ok', text: 'Base de frequência preparada para o período.' });
    await fetchRows();
    setSeeding(false);
  };

  const updateRowField = (id: string, field: keyof AttendanceRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row: AttendanceRow) => {
    setSavingId(row.id);
    setMessage(null);
    const member = membersMap[row.team_member_id];
    const normalizedTeamId = member?.team_id || row.team_id || null;
    const payload = {
      attendance_date: row.attendance_date,
      team_member_id: row.team_member_id,
      team_id: normalizedTeamId,
      status: row.status,
      include_daily: Boolean(row.include_daily),
      include_lunch: Boolean(row.include_lunch),
      daily_amount: row.daily_amount == null ? null : Number(row.daily_amount),
      lunch_amount: row.lunch_amount == null ? null : Number(row.lunch_amount),
      notes: row.notes || null,
    };
    const { error } = await supabase.from('team_attendance').update(payload).eq('id', row.id);
    if (error) setMessage({ type: 'err', text: error.message });
    else setMessage({ type: 'ok', text: 'Frequência salva.' });
    setSavingId(null);
  };

  const generateExpenses = async () => {
    setGenerating(true);
    setMessage(null);
    const presentRows = rows.filter(r => r.status === 'present');
    const clampedStart = startDate < settingsContext.app.company_start_date ? settingsContext.app.company_start_date : startDate;
    const clampedEnd = endDate < settingsContext.app.company_start_date ? settingsContext.app.company_start_date : endDate;
    const rangeDays = dayList(clampedStart, clampedEnd);

    const { data: existingEntries, error: existingError } = await supabase
      .from('finance_entries')
      .select('metadata, movement_date, team_id, team_member_id, category')
      .eq('entry_type', 'expense')
      .gte('movement_date', clampedStart)
      .lte('movement_date', clampedEnd);

    if (existingError) {
      setMessage({ type: 'err', text: existingError.message });
      setGenerating(false);
      return;
    }

    const existingKeys = new Set<string>();
    const existingAutoKeys = new Set<string>();
    (existingEntries || []).forEach((entry: any) => {
      if (entry?.metadata?.source === 'attendance') {
        const attendanceId = entry?.metadata?.attendance_id;
        const attendanceKind = entry?.metadata?.attendance_kind;
        if (attendanceId && attendanceKind) existingKeys.add(`${attendanceId}:${attendanceKind}`);
      }
      if (entry?.metadata?.source === 'auto_fixed_cost' && typeof entry?.metadata?.auto_key === 'string') {
        existingAutoKeys.add(entry.metadata.auto_key);
      }
    });

    const nowIso = new Date().toISOString();
    const inserts: any[] = [];
    let missingTeamCount = 0;
    let attendanceGenerated = 0;
    let autoPayrollGenerated = 0;
    let autoAdsGenerated = 0;

    for (const row of presentRows) {
      const member = membersMap[row.team_member_id];
      if (!member) continue;
      const monthDate = new Date(`${row.attendance_date}T00:00:00`);
      const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
      const memberDerivedDaily = daysInMonth > 0 ? Number(member.fixed_cost || 0) / daysInMonth : 0;
      const scoped = resolveCosts(settingsContext, {
        teamId: row.team_id || member.team_id || null,
        teamMemberId: row.team_member_id,
      });
      const fallbackDaily = Number(scoped.dailyAmount || 0) > 0
        ? Number(scoped.dailyAmount || 0)
        : Number(memberDerivedDaily.toFixed(2));
      const dailyAmount = Number(row.daily_amount || 0) > 0 ? Number(row.daily_amount) : fallbackDaily;
      const lunchAmount = Number(row.lunch_amount || 0) > 0
        ? Number(row.lunch_amount)
        : Number(scoped.lunchAmount || 0);
      const teamId = row.team_id || member.team_id || null;
      if (!teamId) {
        missingTeamCount += 1;
        continue;
      }
      const baseMetadata = {
        source: 'attendance',
        attendance_id: row.id,
        generated_at: nowIso,
      };

      if (row.include_daily && dailyAmount > 0 && !existingKeys.has(`${row.id}:daily`)) {
        inserts.push({
          entry_type: 'expense',
          category: 'fixed_payroll',
          amount: Number(dailyAmount.toFixed(2)),
          status: 'paid',
          team_id: teamId,
          team_member_id: row.team_member_id,
          movement_date: row.attendance_date,
          description: `Diária por frequência - ${member.name}`,
          metadata: { ...baseMetadata, attendance_kind: 'daily' },
        });
        attendanceGenerated += 1;
      }

      if (row.include_lunch && lunchAmount > 0 && !existingKeys.has(`${row.id}:lunch`)) {
        inserts.push({
          entry_type: 'expense',
          category: 'logistics_lunch',
          amount: Number(lunchAmount.toFixed(2)),
          status: 'paid',
          team_id: teamId,
          team_member_id: row.team_member_id,
          movement_date: row.attendance_date,
          description: `Almoço por frequência - ${member.name}`,
          metadata: { ...baseMetadata, attendance_kind: 'lunch' },
        });
        attendanceGenerated += 1;
      }
    }

    const scopedMembers = members.filter((member) => {
      if (!member.active) return false;
      if (teamFilter === 'all') return true;
      return member.team_id === teamFilter;
    });

    for (const day of rangeDays) {
      const factor = getBusinessDayFactorFromYmd(day);
      if (factor <= 0) continue;
      for (const member of scopedMembers) {
        if (!member.team_id) {
          missingTeamCount += 1;
          continue;
        }
        const monthUnits = getMonthBusinessUnitsFromYmd(day);
        if (monthUnits <= 0) continue;
        const monthlyCost = Number(member.fixed_cost || 0);
        if (monthlyCost <= 0) continue;
        const amount = (monthlyCost / monthUnits) * factor;
        const autoKey = `auto_fixed_payroll:${member.id}:${day}`;
        if (existingAutoKeys.has(autoKey)) continue;
        inserts.push({
          entry_type: 'expense',
          category: 'fixed_payroll',
          amount: Number(amount.toFixed(2)),
          status: 'pending',
          team_id: member.team_id,
          team_member_id: member.id,
          movement_date: day,
          description: `Folha diária automática - ${member.name}`,
          metadata: {
            source: 'auto_fixed_cost',
            auto_kind: 'payroll',
            auto_key: autoKey,
            business_factor: factor,
            month_units: monthUnits,
            generated_at: nowIso,
          },
        });
        existingAutoKeys.add(autoKey);
        autoPayrollGenerated += 1;
      }
    }

    const scopedTeams = teams.filter((item) => teamFilter === 'all' || item.id === teamFilter);
    for (const day of rangeDays) {
      const factor = getBusinessDayFactorFromYmd(day);
      if (factor <= 0) continue;
      for (const teamItem of scopedTeams) {
        const scoped = resolveCosts(settingsContext, { teamId: teamItem.id });
        const baseAds = Number(scoped.adsBudget || 0);
        if (baseAds <= 0) continue;
        const amount = baseAds * factor;
        const autoKey = `auto_fixed_ads:${teamItem.id}:${day}`;
        if (existingAutoKeys.has(autoKey)) continue;
        inserts.push({
          entry_type: 'expense',
          category: 'marketing_ads',
          amount: Number(amount.toFixed(2)),
          status: 'pending',
          team_id: teamItem.id,
          team_member_id: null,
          movement_date: day,
          description: `Tráfego diário automático - ${teamItem.name}`,
          metadata: {
            source: 'auto_fixed_cost',
            auto_kind: 'ads',
            auto_key: autoKey,
            business_factor: factor,
            generated_at: nowIso,
          },
        });
        existingAutoKeys.add(autoKey);
        autoAdsGenerated += 1;
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('finance_entries').insert(inserts);
      if (error) {
        setMessage({ type: 'err', text: error.message });
        setGenerating(false);
        return;
      }
    }

    const rowsToMark = presentRows.map(r => r.id);
    if (rowsToMark.length > 0) {
      await supabase.from('team_attendance').update({ generated_at: nowIso }).in('id', rowsToMark);
    }

    setMessage({
      type: 'ok',
      text: inserts.length > 0
        ? `${inserts.length} despesa(s) gerada(s): ${attendanceGenerated} por frequência, ${autoPayrollGenerated} de folha automática e ${autoAdsGenerated} de ads automáticos.${missingTeamCount > 0 ? ` ${missingTeamCount} item(ns) sem equipe vinculada foram ignorados.` : ''}`
        : `Nenhuma nova despesa gerada.${missingTeamCount > 0 ? ` ${missingTeamCount} item(ns) sem equipe vinculada foram ignorados.` : ' Itens já estavam lançados.'}`,
    });
    await fetchRows();
    setGenerating(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Frequência da equipe</h2>
        <p>Marque presença/ausência/feriado e gere despesas rastreáveis, incluindo dívidas automáticas de folha e ads por dia útil.</p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-grid">
          <div className="form-group">
            <label>Data inicial</label>
            <input
              type="date"
              min={settingsContext.app.company_start_date}
              value={startDate}
              onChange={e => setStartDate(e.target.value < settingsContext.app.company_start_date ? settingsContext.app.company_start_date : e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Data final</label>
            <input
              type="date"
              min={settingsContext.app.company_start_date}
              value={endDate}
              onChange={e => setEndDate(e.target.value < settingsContext.app.company_start_date ? settingsContext.app.company_start_date : e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Equipe</label>
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
              <option value="all">Todas</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={seedRange} disabled={seeding}>
            <CalendarCheck size={16} /> {seeding ? 'Preparando...' : 'Preparar frequência do período'}
          </button>
          <button type="button" className="btn btn-primary" onClick={generateExpenses} disabled={generating}>
            <Wand2 size={16} /> {generating ? 'Gerando...' : 'Gerar despesas do período'}
          </button>
        </div>
        {message && (
          <div className={`alert ${message.type === 'ok' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem', marginBottom: 0 }}>
            {message.text}
          </div>
        )}
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Carregando frequência...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Sem registros para o período. Clique em “Preparar frequência do período”.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Equipe</th>
                  <th>Colaborador</th>
                  <th>Status</th>
                  <th>Diária</th>
                  <th>Almoço</th>
                  <th>Valor diária</th>
                  <th>Valor almoço</th>
                  <th>Obs.</th>
                  <th>Última geração</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const member = membersMap[row.team_member_id];
                  return (
                    <tr key={row.id}>
                      <td>{formatYmdPtBr(row.attendance_date)}</td>
                      <td>{row.team_id ? teamsMap[row.team_id] || '—' : '—'}</td>
                      <td>{member ? `${member.name} (${member.role})` : row.team_member_id}</td>
                      <td>
                        <select value={row.status} onChange={e => updateRowField(row.id, 'status', e.target.value as AttendanceStatus)}>
                          <option value="present">Presente</option>
                          <option value="absent">Ausente</option>
                          <option value="holiday">Feriado</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(row.include_daily)}
                          onChange={e => updateRowField(row.id, 'include_daily', e.target.checked)}
                          disabled={row.status !== 'present'}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(row.include_lunch)}
                          onChange={e => updateRowField(row.id, 'include_lunch', e.target.checked)}
                          disabled={row.status !== 'present'}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.daily_amount ?? ''}
                          onChange={e => updateRowField(row.id, 'daily_amount', e.target.value === '' ? null : Number(e.target.value))}
                          placeholder={String(resolveCosts(settingsContext, {
                            teamId: row.team_id || member?.team_id || null,
                            teamMemberId: row.team_member_id,
                          }).dailyAmount)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.lunch_amount ?? ''}
                          onChange={e => updateRowField(row.id, 'lunch_amount', e.target.value === '' ? null : Number(e.target.value))}
                          placeholder={String(resolveCosts(settingsContext, {
                            teamId: row.team_id || member?.team_id || null,
                            teamMemberId: row.team_member_id,
                          }).lunchAmount)}
                        />
                      </td>
                      <td>
                        <input value={row.notes || ''} onChange={e => updateRowField(row.id, 'notes', e.target.value)} placeholder="Opcional" />
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {row.generated_at ? new Date(row.generated_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => saveRow(row)} disabled={savingId === row.id}>
                          <Save size={14} /> {savingId === row.id ? '...' : 'Salvar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
