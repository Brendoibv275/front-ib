import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, Users, Bot, CalendarCheck, ShieldCheck, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Dashboard } from './pages/Dashboard';
import { FinanceInput } from './pages/FinanceInput';
import { TeamConfig } from './pages/TeamConfig';
import { LeadsPanel } from './pages/LeadsPanel';
import { AppointmentsPanel } from './pages/AppointmentsPanel';
import { UserManagement } from './pages/UserManagement';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import './index.css';

interface UserProfile {
  id: string; email: string; full_name: string; role: string; approved: boolean;
}

const navSections = [
  {
    label: 'Principal',
    items: [
      { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { path: '/finance', label: 'Lançamentos', icon: <Wallet size={18} /> },
    ]
  },
  {
    label: 'Operação',
    items: [
      { path: '/team', label: 'Equipe & Metas', icon: <Users size={18} /> },
      { path: '/leads', label: 'Leads (SDR IA)', icon: <Bot size={18} /> },
      { path: '/appointments', label: 'Agendamentos', icon: <CalendarCheck size={18} /> },
    ]
  }
];

const Sidebar = ({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) => {
  const location = useLocation();
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1><span>Ilha</span> Breeze</h1>
        <p>Painel Executivo</p>
      </div>
      {navSections.map(section => (
        <div key={section.label}>
          <div className="sidebar-label">{section.label}</div>
          {section.items.map(item => (
            <Link key={item.path} to={item.path} className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}>
              {item.icon} {item.label}
            </Link>
          ))}
        </div>
      ))}

      {profile.role === 'admin' && (
        <>
          <div className="sidebar-label">Administração</div>
          <Link to="/users" className={`nav-item ${location.pathname === '/users' ? 'active' : ''}`}>
            <ShieldCheck size={18} /> Usuários
          </Link>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{profile.full_name}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{profile.email}</div>
          <span className={`tag ${profile.role === 'admin' ? 'tag-new' : 'tag-completed'}`} style={{ marginTop: '4px' }}>
            {profile.role === 'admin' ? 'Admin' : 'Operador'}
          </span>
        </div>
        <button className="nav-item" onClick={onLogout} style={{ color: 'var(--danger)' }}>
          <LogOut size={18} /> Sair
        </button>
      </div>
    </aside>
  );
};

function AppRoutes({ profile }: { profile: UserProfile }) {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/finance" element={<FinanceInput />} />
      <Route path="/team" element={<TeamConfig />} />
      <Route path="/leads" element={<LeadsPanel />} />
      <Route path="/appointments" element={<AppointmentsPanel />} />
      {profile.role === 'admin' && <Route path="/users" element={<UserManagement />} />}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  useEffect(() => {
    // Checar sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Escutar mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
    if (data && data.approved) {
      setProfile(data);
    } else {
      // Não aprovado: deslogar
      await supabase.auth.signOut();
      setProfile(null);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setAuthView('login');
  };

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-brand">
            <h1><span>Ilha</span> Breeze</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  // Não logado → mostrar login ou registro
  if (!session || !profile) {
    if (authView === 'register') {
      return <RegisterPage onSwitch={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitch={() => setAuthView('register')} />;
  }

  // Logado e aprovado → app principal
  return (
    <Router>
      <Sidebar profile={profile} onLogout={handleLogout} />
      <main className="main">
        <AppRoutes profile={profile} />
      </main>
    </Router>
  );
}

export default App;
