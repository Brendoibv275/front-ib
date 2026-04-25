import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, Users, Bot, CalendarCheck, ShieldCheck, LogOut, Menu, X, CircleDollarSign, ClipboardCheck, Settings2 } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Dashboard } from './pages/Dashboard';
import { FinanceInput } from './pages/FinanceInput';
import { TeamConfig } from './pages/TeamConfig';
import { LeadsPanel } from './pages/LeadsPanel';
import { AppointmentsPanel } from './pages/AppointmentsPanel';
import { UserManagement } from './pages/UserManagement';
import { EmployeeEarnings } from './pages/EmployeeEarnings';
import { AttendancePanel } from './pages/AttendancePanel';
import { GlobalSettings } from './pages/GlobalSettings';
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
      { path: '/earnings', label: 'Ganhos da equipe', icon: <CircleDollarSign size={18} /> },
    ]
  },
  {
    label: 'Operação',
    items: [
      { path: '/team', label: 'Equipe & Metas', icon: <Users size={18} /> },
      { path: '/attendance', label: 'Frequência', icon: <ClipboardCheck size={18} /> },
      { path: '/settings', label: 'Configurações', icon: <Settings2 size={18} /> },
      { path: '/leads', label: 'Leads (SDR IA)', icon: <Bot size={18} /> },
      { path: '/appointments', label: 'Agendamentos', icon: <CalendarCheck size={18} /> },
    ]
  }
];

const bottomNavItems = [
  { path: '/', label: 'Início', icon: <LayoutDashboard /> },
  { path: '/finance', label: 'Lançar', icon: <Wallet /> },
  { path: '/earnings', label: 'Ganhos', icon: <CircleDollarSign /> },
  { path: '/leads', label: 'Leads', icon: <Bot /> },
  { path: '/appointments', label: 'Agenda', icon: <CalendarCheck /> },
];

// ─── SIDEBAR (Desktop) ───
const Sidebar = ({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) => {
  const location = useLocation();
  return (
    <aside className="sidebar">
      <SidebarContent profile={profile} onLogout={onLogout} location={location} />
    </aside>
  );
};

// ─── SIDEBAR CONTENT (Shared between Desktop & Mobile) ───
const SidebarContent = ({ profile, onLogout, location, onNavigate }: {
  profile: UserProfile; onLogout: () => void; location: { pathname: string }; onNavigate?: () => void;
}) => (
  <>
    <div className="sidebar-brand">
      <h1><span>Ilha</span> Breeze</h1>
      <p>Painel Executivo</p>
    </div>
    {navSections.map(section => (
      <div key={section.label}>
        <div className="sidebar-label">{section.label}</div>
        {section.items.map(item => (
          <Link key={item.path} to={item.path} onClick={onNavigate}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}>
            {item.icon} {item.label}
          </Link>
        ))}
      </div>
    ))}

    {profile.role === 'admin' && (
      <>
        <div className="sidebar-label">Administração</div>
        <Link to="/users" onClick={onNavigate}
          className={`nav-item ${location.pathname === '/users' ? 'active' : ''}`}>
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
      <button className="nav-item" onClick={() => { onNavigate?.(); onLogout(); }} style={{ color: 'var(--danger)' }}>
        <LogOut size={18} /> Sair
      </button>
    </div>
  </>
);

// ─── MOBILE TOPBAR ───
const MobileTopbar = ({ onMenuToggle }: { onMenuToggle: () => void }) => (
  <div className="mobile-topbar">
    <h1><span>Ilha</span> Breeze</h1>
    <button className="hamburger" onClick={onMenuToggle}><Menu size={24} /></button>
  </div>
);

// ─── MOBILE SIDEBAR OVERLAY ───
const MobileSidebarOverlay = ({ open, onClose, profile, onLogout }: {
  open: boolean; onClose: () => void; profile: UserProfile; onLogout: () => void;
}) => {
  const location = useLocation();
  if (!open) return null;
  return (
    <>
      <div className="sidebar-overlay open" onClick={onClose} />
      <div className="sidebar-mobile">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <button className="hamburger" onClick={onClose}><X size={22} /></button>
        </div>
        <SidebarContent profile={profile} onLogout={onLogout} location={location} onNavigate={onClose} />
      </div>
    </>
  );
};

// ─── MOBILE BOTTOM NAV ───
const BottomNav = () => {
  const location = useLocation();
  return (
    <div className="bottom-nav">
      <div className="bottom-nav-inner">
        {bottomNavItems.map(item => (
          <Link key={item.path} to={item.path}
            className={`bottom-nav-item ${location.pathname === item.path ? 'active' : ''}`}>
            {item.icon}
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
};

// ─── ROUTES ───
function AppRoutes({ profile }: { profile: UserProfile }) {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/finance" element={<FinanceInput />} />
      <Route path="/earnings" element={<EmployeeEarnings />} />
      <Route path="/team" element={<TeamConfig />} />
      <Route path="/attendance" element={<AttendancePanel />} />
      <Route path="/settings" element={<GlobalSettings />} />
      <Route path="/leads" element={<LeadsPanel />} />
      <Route path="/appointments" element={<AppointmentsPanel />} />
      {profile.role === 'admin' && <Route path="/users" element={<UserManagement />} />}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

// ─── MAIN APP ───
function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

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
          <div className="auth-brand"><h1><span>Ilha</span> Breeze</h1></div>
          <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    if (authView === 'register') {
      return <RegisterPage onSwitch={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitch={() => setAuthView('register')} />;
  }

  return (
    <Router>
      {/* Desktop sidebar */}
      <Sidebar profile={profile} onLogout={handleLogout} />

      {/* Mobile top bar */}
      <MobileTopbar onMenuToggle={() => setMobileMenuOpen(true)} />

      {/* Mobile sidebar overlay */}
      <MobileSidebarOverlay
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        profile={profile}
        onLogout={handleLogout}
      />

      <main className="main">
        <AppRoutes profile={profile} />
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </Router>
  );
}

export default App;
