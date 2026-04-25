import type { SupabaseClient } from '@supabase/supabase-js';

export interface AppSettings {
  id?: string;
  singleton_key?: string;
  default_lunch_amount: number;
  default_daily_amount: number;
  default_daily_ads_budget: number;
  default_daily_profit_target: number;
  company_start_date: string;
}

export interface TeamCostSettings {
  team_id: string;
  default_lunch_amount: number;
  default_daily_amount: number;
  default_daily_ads_budget: number;
  default_daily_profit_target: number;
}

export interface MemberCostSettings {
  team_member_id: string;
  default_lunch_amount: number;
  default_daily_amount: number;
  default_daily_ads_budget: number;
  default_daily_profit_target: number;
}

export interface SettingsContext {
  app: AppSettings;
  teamCostMap: Record<string, TeamCostSettings>;
  memberCostMap: Record<string, MemberCostSettings>;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  singleton_key: 'default',
  default_lunch_amount: 0,
  default_daily_amount: 0,
  default_daily_ads_budget: 100,
  default_daily_profit_target: 600,
  company_start_date: '2026-04-19',
};

export async function loadAppSettings(client: SupabaseClient): Promise<AppSettings> {
  const { data, error } = await client
    .from('app_settings')
    .select('id, singleton_key, default_lunch_amount, default_daily_amount, default_daily_ads_budget, default_daily_profit_target, company_start_date')
    .eq('singleton_key', 'default')
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_APP_SETTINGS };
  return {
    id: data.id,
    singleton_key: data.singleton_key || 'default',
    default_lunch_amount: Number(data.default_lunch_amount || 0),
    default_daily_amount: Number(data.default_daily_amount || 0),
    default_daily_ads_budget: Number(data.default_daily_ads_budget || 100),
    default_daily_profit_target: Number(data.default_daily_profit_target || 600),
    company_start_date: typeof data.company_start_date === 'string'
      ? data.company_start_date
      : DEFAULT_APP_SETTINGS.company_start_date,
  };
}

export async function loadSettingsContext(client: SupabaseClient): Promise<SettingsContext> {
  const [app, teamRes, memberRes] = await Promise.all([
    loadAppSettings(client),
    client
      .from('team_cost_settings')
      .select('team_id, default_lunch_amount, default_daily_amount, default_daily_ads_budget, default_daily_profit_target'),
    client
      .from('team_member_cost_settings')
      .select('team_member_id, default_lunch_amount, default_daily_amount, default_daily_ads_budget, default_daily_profit_target'),
  ]);

  const teamCostMap: Record<string, TeamCostSettings> = {};
  (teamRes.data || []).forEach((row: any) => {
    if (!row.team_id) return;
    teamCostMap[row.team_id] = {
      team_id: row.team_id,
      default_lunch_amount: Number(row.default_lunch_amount || 0),
      default_daily_amount: Number(row.default_daily_amount || 0),
      default_daily_ads_budget: Number(row.default_daily_ads_budget || 0),
      default_daily_profit_target: Number(row.default_daily_profit_target || 0),
    };
  });

  const memberCostMap: Record<string, MemberCostSettings> = {};
  (memberRes.data || []).forEach((row: any) => {
    if (!row.team_member_id) return;
    memberCostMap[row.team_member_id] = {
      team_member_id: row.team_member_id,
      default_lunch_amount: Number(row.default_lunch_amount || 0),
      default_daily_amount: Number(row.default_daily_amount || 0),
      default_daily_ads_budget: Number(row.default_daily_ads_budget || 0),
      default_daily_profit_target: Number(row.default_daily_profit_target || 0),
    };
  });

  return { app, teamCostMap, memberCostMap };
}

export function resolveCosts(
  context: SettingsContext,
  options?: { teamId?: string | null; teamMemberId?: string | null }
) {
  const memberCfg = options?.teamMemberId ? context.memberCostMap[options.teamMemberId] : undefined;
  const teamCfg = options?.teamId ? context.teamCostMap[options.teamId] : undefined;
  const base = context.app;
  return {
    lunchAmount: memberCfg?.default_lunch_amount ?? teamCfg?.default_lunch_amount ?? base.default_lunch_amount,
    dailyAmount: memberCfg?.default_daily_amount ?? teamCfg?.default_daily_amount ?? base.default_daily_amount,
    adsBudget: memberCfg?.default_daily_ads_budget ?? teamCfg?.default_daily_ads_budget ?? base.default_daily_ads_budget,
    dailyTarget: memberCfg?.default_daily_profit_target ?? teamCfg?.default_daily_profit_target ?? base.default_daily_profit_target,
  };
}

export function clampByCompanyStart(startYmd: string, endYmd: string, companyStartYmd: string) {
  const safeStart = startYmd < companyStartYmd ? companyStartYmd : startYmd;
  const safeEnd = endYmd < companyStartYmd ? companyStartYmd : endYmd;
  return { startYmd: safeStart, endYmd: safeEnd };
}
