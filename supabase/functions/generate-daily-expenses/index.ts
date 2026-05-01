// Edge Function: generate-daily-expenses
// Gera folha diária automática + tráfego Meta Ads pra um período, idempotente por auto_key.
//
// Uso:
//   POST /functions/v1/generate-daily-expenses
//   Body opcional:
//     { "start": "2026-04-29", "end": "2026-05-01" }  -> gera pro range específico
//     { "mode": "yesterday" }                          -> gera SÓ pra D-1 (default do cron)
//     { "mode": "today" }                              -> gera SÓ pra hoje
//     (sem body)                                       -> gera pra D-1 (yesterday)
//
// Autenticação: exige header Authorization: Bearer <SERVICE_ROLE_KEY> (chamada via pg_cron+pg_net já injeta).
//
// Replica 1:1 a lógica de AttendancePanel.tsx generateExpenses (blocos de folha + tráfego),
// incluindo business_factor (0 domingo / 0.5 sábado / 1 seg-sex) e month_units por mês.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ===================== helpers de data (porta de lib/date.ts) =====================

function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dayList(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor.getTime() <= end.getTime()) {
    out.push(formatDateYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
    if (out.length > 400) break; // guardrail
  }
  return out;
}

function getBusinessDayFactorFromDate(date: Date): number {
  const w = date.getDay();
  if (w === 0) return 0;    // domingo
  if (w === 6) return 0.5;  // sábado
  return 1;                 // seg-sex
}

function getBusinessDayFactorFromYmd(ymd: string): number {
  return getBusinessDayFactorFromDate(parseYmd(ymd));
}

function getMonthBusinessUnitsFromYmd(ymd: string): number {
  const base = parseYmd(ymd);
  const year = base.getFullYear();
  const month = base.getMonth();
  const monthEnd = new Date(year, month + 1, 0).getDate();
  let units = 0;
  for (let d = 1; d <= monthEnd; d++) {
    units += getBusinessDayFactorFromDate(new Date(year, month, d));
  }
  return units;
}

// Horário oficial da operação: America/Sao_Paulo (UTC-3, sem DST atualmente).
// Pra manter determinístico, usamos offset fixo de -03:00.
function nowYmdBRT(): string {
  const now = new Date();
  const brtMs = now.getTime() - 3 * 60 * 60 * 1000;
  const brt = new Date(brtMs);
  return formatDateYmd(new Date(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
}

function shiftDaysYmd(ymd: string, diff: number): string {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + diff);
  return formatDateYmd(d);
}

// ===================== settings context (porta de lib/appSettings.ts) =====================

interface AppSettings {
  default_lunch_amount: number;
  default_daily_amount: number;
  default_daily_ads_budget: number;
  default_daily_profit_target: number;
  company_start_date: string;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  default_lunch_amount: 0,
  default_daily_amount: 0,
  default_daily_ads_budget: 100,
  default_daily_profit_target: 600,
  company_start_date: '2026-04-19',
};

interface CostCfg {
  default_daily_ads_budget: number;
}

async function loadSettingsContext(client: SupabaseClient) {
  const [appRes, teamRes, memberRes] = await Promise.all([
    client.from('app_settings').select('*').eq('singleton_key', 'default').maybeSingle(),
    client.from('team_cost_settings').select('team_id, default_daily_ads_budget'),
    client.from('team_member_cost_settings').select('team_member_id, default_daily_ads_budget'),
  ]);

  const app: AppSettings = appRes.data
    ? {
        default_lunch_amount: Number(appRes.data.default_lunch_amount || 0),
        default_daily_amount: Number(appRes.data.default_daily_amount || 0),
        default_daily_ads_budget: Number(appRes.data.default_daily_ads_budget || 100),
        default_daily_profit_target: Number(appRes.data.default_daily_profit_target || 600),
        company_start_date: appRes.data.company_start_date || DEFAULT_APP_SETTINGS.company_start_date,
      }
    : { ...DEFAULT_APP_SETTINGS };

  const teamCostMap: Record<string, CostCfg> = {};
  (teamRes.data || []).forEach((r: any) => {
    if (!r.team_id) return;
    teamCostMap[r.team_id] = { default_daily_ads_budget: Number(r.default_daily_ads_budget || 0) };
  });

  const memberCostMap: Record<string, CostCfg> = {};
  (memberRes.data || []).forEach((r: any) => {
    if (!r.team_member_id) return;
    memberCostMap[r.team_member_id] = { default_daily_ads_budget: Number(r.default_daily_ads_budget || 0) };
  });

  return { app, teamCostMap, memberCostMap };
}

function resolveAdsBudget(
  ctx: { app: AppSettings; teamCostMap: Record<string, CostCfg>; memberCostMap: Record<string, CostCfg> },
  teamId?: string | null
): number {
  const teamCfg = teamId ? ctx.teamCostMap[teamId] : undefined;
  return teamCfg?.default_daily_ads_budget ?? ctx.app.default_daily_ads_budget;
}

// ===================== core generator =====================

interface GenResult {
  range: { start: string; end: string };
  members_considered: number;
  teams_considered: number;
  payroll_rows_inserted: number;
  ads_rows_inserted: number;
  skipped_missing_team: number;
  skipped_existing_auto_key: number;
}

async function generateForRange(client: SupabaseClient, startYmd: string, endYmd: string): Promise<GenResult> {
  const result: GenResult = {
    range: { start: startYmd, end: endYmd },
    members_considered: 0,
    teams_considered: 0,
    payroll_rows_inserted: 0,
    ads_rows_inserted: 0,
    skipped_missing_team: 0,
    skipped_existing_auto_key: 0,
  };

  const rangeDays = dayList(startYmd, endYmd);
  if (rangeDays.length === 0) return result;

  // 1) carrega membros, equipes, settings
  const [membersRes, teamsRes, settings] = await Promise.all([
    client.from('team_members').select('id, name, role, team_id, fixed_cost, active').eq('active', true),
    client.from('teams').select('id, name').eq('active', true),
    loadSettingsContext(client),
  ]);

  const members = (membersRes.data || []) as Array<{
    id: string;
    team_id: string | null;
    fixed_cost: number | string;
  }>;
  const teams = (teamsRes.data || []) as Array<{ id: string; name: string }>;

  result.members_considered = members.length;
  result.teams_considered = teams.length;

  // 2) busca auto_keys já existentes no range (uma query só)
  const { data: existing } = await client
    .from('finance_entries')
    .select('metadata')
    .eq('entry_type', 'expense')
    .gte('movement_date', startYmd)
    .lte('movement_date', endYmd)
    .in('category', ['fixed_payroll', 'marketing_ads']);

  const existingAutoKeys = new Set<string>();
  (existing || []).forEach((row: any) => {
    const k = row?.metadata?.auto_key;
    if (typeof k === 'string') existingAutoKeys.add(k);
  });

  const nowIso = new Date().toISOString();
  const inserts: any[] = [];

  // 3) folha diária por membro
  for (const day of rangeDays) {
    const factor = getBusinessDayFactorFromYmd(day);
    if (factor <= 0) continue;
    for (const member of members) {
      if (!member.team_id) {
        result.skipped_missing_team += 1;
        continue;
      }
      const monthUnits = getMonthBusinessUnitsFromYmd(day);
      if (monthUnits <= 0) continue;
      const monthlyCost = Number(member.fixed_cost || 0);
      if (monthlyCost <= 0) continue;
      const amount = (monthlyCost / monthUnits) * factor;
      const autoKey = `auto_fixed_payroll:${member.id}:${day}`;
      if (existingAutoKeys.has(autoKey)) {
        result.skipped_existing_auto_key += 1;
        continue;
      }
      inserts.push({
        entry_type: 'expense',
        category: 'fixed_payroll',
        amount: Number(amount.toFixed(2)),
        status: 'pending',
        team_id: member.team_id,
        team_member_id: member.id,
        movement_date: day,
        description: `Folha diária automática - ${(member as any).name}`,
        metadata: {
          source: 'auto_fixed_cost',
          auto_kind: 'payroll',
          auto_key: autoKey,
          business_factor: factor,
          month_units: monthUnits,
          generated_at: nowIso,
          generated_by: 'edge_function',
        },
      });
      existingAutoKeys.add(autoKey);
      result.payroll_rows_inserted += 1;
    }
  }

  // 4) tráfego Meta Ads por equipe
  for (const day of rangeDays) {
    const factor = getBusinessDayFactorFromYmd(day);
    if (factor <= 0) continue;
    for (const team of teams) {
      const baseAds = resolveAdsBudget(settings, team.id);
      if (baseAds <= 0) continue;
      const amount = baseAds * factor;
      const autoKey = `auto_fixed_ads:${team.id}:${day}`;
      if (existingAutoKeys.has(autoKey)) {
        result.skipped_existing_auto_key += 1;
        continue;
      }
      inserts.push({
        entry_type: 'expense',
        category: 'marketing_ads',
        amount: Number(amount.toFixed(2)),
        status: 'pending',
        team_id: team.id,
        team_member_id: null,
        movement_date: day,
        description: `Tráfego diário automático - ${team.name}`,
        metadata: {
          source: 'auto_fixed_cost',
          auto_kind: 'ads',
          auto_key: autoKey,
          business_factor: factor,
          generated_at: nowIso,
          generated_by: 'edge_function',
        },
      });
      existingAutoKeys.add(autoKey);
      result.ads_rows_inserted += 1;
    }
  }

  if (inserts.length > 0) {
    const { error } = await client.from('finance_entries').insert(inserts);
    if (error) {
      throw new Error(`insert finance_entries failed: ${error.message}`);
    }
  }

  return result;
}

// ===================== HTTP handler =====================

function resolveRange(body: any): { start: string; end: string } {
  const today = nowYmdBRT();
  const mode = body?.mode as string | undefined;

  if (body?.start && body?.end) {
    return { start: String(body.start), end: String(body.end) };
  }
  if (mode === 'today') return { start: today, end: today };
  if (mode === 'yesterday' || !mode) {
    const y = shiftDaysYmd(today, -1);
    return { start: y, end: y };
  }
  // fallback
  return { start: today, end: today };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(
      JSON.stringify({ error: 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: any = {};
  try {
    if (req.method === 'POST') {
      const txt = await req.text();
      body = txt ? JSON.parse(txt) : {};
    }
  } catch (_e) {
    body = {};
  }

  const range = resolveRange(body);
  const client = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  try {
    const result = await generateForRange(client, range.start, range.end);
    return new Response(JSON.stringify({ ok: true, result }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg, range }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
