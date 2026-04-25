import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  loadSettingsContext,
  type TeamCostSettings,
  type MemberCostSettings,
} from '../lib/appSettings';

interface TeamItem {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  team_id?: string | null;
}

export const GlobalSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [teamSettingsMap, setTeamSettingsMap] = useState<Record<string, TeamCostSettings>>({});
  const [memberSettingsMap, setMemberSettingsMap] = useState<Record<string, MemberCostSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [ctx, teamRows, memberRows] = await Promise.all([
      loadSettingsContext(supabase),
      supabase.from('teams').select('id, name').eq('active', true).order('name'),
      supabase.from('team_members').select('id, name, role, team_id').eq('active', true).order('name'),
    ]);
    setSettings(ctx.app);
    setTeamSettingsMap(ctx.teamCostMap);
    setMemberSettingsMap(ctx.memberCostMap);
    if (teamRows.data) setTeams(teamRows.data as TeamItem[]);
    if (memberRows.data) setMembers(memberRows.data as TeamMember[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const payload = {
      singleton_key: 'default',
      default_lunch_amount: Number(settings.default_lunch_amount || 0),
      default_daily_amount: Number(settings.default_daily_amount || 0),
      default_daily_ads_budget: Number(settings.default_daily_ads_budget || 0),
      default_daily_profit_target: Number(settings.default_daily_profit_target || 0),
      company_start_date: settings.company_start_date || DEFAULT_APP_SETTINGS.company_start_date,
    };
    const { error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'singleton_key' });
    if (error) {
      setMessage({ type: 'err', text: error.message });
    } else {
      setMessage({ type: 'ok', text: 'Configurações gerais salvas com sucesso.' });
      await fetchData();
    }
    setSaving(false);
  };

  const selectedTeamSettings = selectedTeamId
    ? (teamSettingsMap[selectedTeamId] || {
      team_id: selectedTeamId,
      default_lunch_amount: 0,
      default_daily_amount: 0,
      default_daily_ads_budget: 0,
      default_daily_profit_target: 0,
    })
    : null;

  const selectedMemberSettings = selectedMemberId
    ? (memberSettingsMap[selectedMemberId] || {
      team_member_id: selectedMemberId,
      default_lunch_amount: 0,
      default_daily_amount: 0,
      default_daily_ads_budget: 0,
      default_daily_profit_target: 0,
    })
    : null;

  const saveTeamSettings = async () => {
    if (!selectedTeamId || !selectedTeamSettings) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from('team_cost_settings').upsert({
      team_id: selectedTeamId,
      default_lunch_amount: Number(selectedTeamSettings.default_lunch_amount || 0),
      default_daily_amount: Number(selectedTeamSettings.default_daily_amount || 0),
      default_daily_ads_budget: Number(selectedTeamSettings.default_daily_ads_budget || 0),
      default_daily_profit_target: Number(selectedTeamSettings.default_daily_profit_target || 0),
    }, { onConflict: 'team_id' });
    if (error) setMessage({ type: 'err', text: error.message });
    else setMessage({ type: 'ok', text: 'Configuração da equipe salva.' });
    await fetchData();
    setSaving(false);
  };

  const saveMemberSettings = async () => {
    if (!selectedMemberId || !selectedMemberSettings) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from('team_member_cost_settings').upsert({
      team_member_id: selectedMemberId,
      default_lunch_amount: Number(selectedMemberSettings.default_lunch_amount || 0),
      default_daily_amount: Number(selectedMemberSettings.default_daily_amount || 0),
      default_daily_ads_budget: Number(selectedMemberSettings.default_daily_ads_budget || 0),
      default_daily_profit_target: Number(selectedMemberSettings.default_daily_profit_target || 0),
    }, { onConflict: 'team_member_id' });
    if (error) setMessage({ type: 'err', text: error.message });
    else setMessage({ type: 'ok', text: 'Configuração do funcionário salva.' });
    await fetchData();
    setSaving(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Configurações Gerais</h2>
        <p>Parametrize custos padrão da operação sem editar código.</p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Carregando configurações...</p>
        ) : (
          <>
            <h4 style={{ marginBottom: '0.75rem' }}>Padrão global</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Valor padrão de almoço (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.default_lunch_amount}
                  onChange={e => setSettings(prev => ({ ...prev, default_lunch_amount: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="form-group">
                <label>Valor padrão de diária (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.default_daily_amount}
                  onChange={e => setSettings(prev => ({ ...prev, default_daily_amount: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="form-group">
                <label>Orçamento diário padrão de Ads (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.default_daily_ads_budget}
                  onChange={e => setSettings(prev => ({ ...prev, default_daily_ads_budget: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="form-group">
                <label>Meta diária padrão de lucro (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.default_daily_profit_target}
                  onChange={e => setSettings(prev => ({ ...prev, default_daily_profit_target: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="form-group">
                <label>Data de início da operação</label>
                <input
                  type="date"
                  value={settings.company_start_date}
                  onChange={e => setSettings(prev => ({ ...prev, company_start_date: e.target.value }))}
                />
              </div>
            </div>

            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar configurações globais'}
            </button>
            <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Precedência usada no sistema: funcionário &gt; equipe &gt; global.
            </p>
            {message && (
              <div className={`alert ${message.type === 'ok' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem' }}>
                {message.text}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.75rem' }}>Configuração por equipe</h4>
        <div className="form-group">
          <label>Equipe</label>
          <select value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)}>
            <option value="">Selecione</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>
        {selectedTeamSettings && (
          <>
            <div className="form-grid">
              <div className="form-group">
                <label>Almoço (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedTeamSettings.default_lunch_amount}
                  onChange={e => setTeamSettingsMap(prev => ({
                    ...prev,
                    [selectedTeamId]: { ...selectedTeamSettings, default_lunch_amount: Number(e.target.value || 0) },
                  }))}
                />
              </div>
              <div className="form-group">
                <label>Diária (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedTeamSettings.default_daily_amount}
                  onChange={e => setTeamSettingsMap(prev => ({
                    ...prev,
                    [selectedTeamId]: { ...selectedTeamSettings, default_daily_amount: Number(e.target.value || 0) },
                  }))}
                />
              </div>
              <div className="form-group">
                <label>Ads diário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedTeamSettings.default_daily_ads_budget}
                  onChange={e => setTeamSettingsMap(prev => ({
                    ...prev,
                    [selectedTeamId]: { ...selectedTeamSettings, default_daily_ads_budget: Number(e.target.value || 0) },
                  }))}
                />
              </div>
              <div className="form-group">
                <label>Meta diária (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedTeamSettings.default_daily_profit_target}
                  onChange={e => setTeamSettingsMap(prev => ({
                    ...prev,
                    [selectedTeamId]: { ...selectedTeamSettings, default_daily_profit_target: Number(e.target.value || 0) },
                  }))}
                />
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={saveTeamSettings} disabled={saving}>
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar equipe'}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h4 style={{ marginBottom: '0.75rem' }}>Configuração por funcionário</h4>
        <div className="form-group">
          <label>Funcionário</label>
          <select value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)}>
            <option value="">Selecione</option>
            {members.map(member => (
              <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
            ))}
          </select>
        </div>
        {selectedMemberSettings && (
          <>
            <div className="form-grid">
              <div className="form-group">
                <label>Almoço (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedMemberSettings.default_lunch_amount}
                  onChange={e => setMemberSettingsMap(prev => ({
                    ...prev,
                    [selectedMemberId]: { ...selectedMemberSettings, default_lunch_amount: Number(e.target.value || 0) },
                  }))}
                />
              </div>
              <div className="form-group">
                <label>Diária (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedMemberSettings.default_daily_amount}
                  onChange={e => setMemberSettingsMap(prev => ({
                    ...prev,
                    [selectedMemberId]: { ...selectedMemberSettings, default_daily_amount: Number(e.target.value || 0) },
                  }))}
                />
              </div>
              <div className="form-group">
                <label>Ads diário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedMemberSettings.default_daily_ads_budget}
                  onChange={e => setMemberSettingsMap(prev => ({
                    ...prev,
                    [selectedMemberId]: { ...selectedMemberSettings, default_daily_ads_budget: Number(e.target.value || 0) },
                  }))}
                />
              </div>
              <div className="form-group">
                <label>Meta diária (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedMemberSettings.default_daily_profit_target}
                  onChange={e => setMemberSettingsMap(prev => ({
                    ...prev,
                    [selectedMemberId]: { ...selectedMemberSettings, default_daily_profit_target: Number(e.target.value || 0) },
                  }))}
                />
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={saveMemberSettings} disabled={saving}>
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar funcionário'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
