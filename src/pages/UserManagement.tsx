import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldCheck, ShieldOff, UserCheck, Clock, Trash2 } from 'lucide-react';

interface UserProfile {
  id: string; email: string; full_name: string; role: string;
  approved: boolean; approved_at: string | null; created_at: string;
}

export const UserManagement = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');

  useEffect(() => {
    fetchUsers();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
    setLoading(false);
  };

  const approveUser = async (userId: string) => {
    await supabase.from('user_profiles').update({
      approved: true,
      approved_by: currentUserId,
      approved_at: new Date().toISOString()
    }).eq('id', userId);
    fetchUsers();
  };

  const revokeUser = async (userId: string) => {
    await supabase.from('user_profiles').update({ approved: false, approved_by: null, approved_at: null }).eq('id', userId);
    fetchUsers();
  };

  const toggleAdmin = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'operator' : 'admin';
    await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId);
    fetchUsers();
  };

  const filtered = users.filter(u => {
    if (filter === 'pending') return !u.approved;
    if (filter === 'approved') return u.approved;
    return true;
  });

  const pendingCount = users.filter(u => !u.approved).length;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Gestão de Usuários</h2>
        <p>Aprove novos membros da equipe e gerencie permissões de acesso</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card" onClick={() => setFilter('all')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Total de Usuários</div>
          <div className="stat-value sm text-accent">{users.length}</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('pending')} style={{ cursor: 'pointer', borderLeft: pendingCount > 0 ? '3px solid var(--warning)' : undefined }}>
          <Clock size={80} className="stat-icon" />
          <div className="stat-label">Aguardando Aprovação</div>
          <div className="stat-value sm text-warning">{pendingCount}</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('approved')} style={{ cursor: 'pointer' }}>
          <UserCheck size={80} className="stat-icon" />
          <div className="stat-label">Aprovados</div>
          <div className="stat-value sm text-success">{users.filter(u => u.approved).length}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'pending', 'approved'] as const).map(f => (
            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : f === 'pending' ? `Pendentes (${pendingCount})` : 'Aprovados'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Carregando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Nenhum usuário encontrado.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Nome</th><th>Email</th><th>Função</th><th>Status</th><th>Registrado em</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>
                    {u.full_name}
                    {u.id === currentUserId && <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginLeft: '0.5rem' }}>(Você)</span>}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td>
                    <span className={`tag ${u.role === 'admin' ? 'tag-new' : 'tag-completed'}`}>
                      {u.role === 'admin' ? 'Admin' : 'Operador'}
                    </span>
                  </td>
                  <td>
                    {u.approved ? (
                      <span className="tag tag-qualified">Aprovado</span>
                    ) : (
                      <span className="tag tag-scheduled">Pendente</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {!u.approved && (
                        <button className="btn btn-sm btn-success" onClick={() => approveUser(u.id)}>
                          <ShieldCheck size={14} /> Aprovar
                        </button>
                      )}
                      {u.approved && u.id !== currentUserId && (
                        <button className="btn btn-sm btn-danger" onClick={() => revokeUser(u.id)}>
                          <ShieldOff size={14} /> Revogar
                        </button>
                      )}
                      {u.id !== currentUserId && (
                        <button className="btn btn-sm btn-secondary" onClick={() => toggleAdmin(u.id, u.role)}>
                          {u.role === 'admin' ? 'Rebaixar' : 'Promover Admin'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
