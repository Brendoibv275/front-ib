import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';

interface Props { onSwitch: () => void; }

export const LoginPage = ({ onSwitch }: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      // Verificar se o usuário foi aprovado
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('approved, role')
        .eq('id', data.user.id)
        .single();

      if (profileError) throw profileError;

      if (!profile.approved) {
        await supabase.auth.signOut();
        setError('Sua conta ainda não foi aprovada por um administrador. Aguarde a liberação.');
        return;
      }
      // Login feito com sucesso — o App.tsx vai detectar a sessão
    } catch (err: any) {
      if (err.message?.includes('Invalid login')) {
        setError('Email ou senha incorretos.');
      } else {
        setError(err.message || 'Erro ao fazer login.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <h1><span>Ilha</span> Breeze</h1>
          <p>Painel Executivo</p>
        </div>

        <h2 style={{ marginBottom: '0.5rem' }}>Entrar</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Acesse o painel de gestão da operação
        </p>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label><Mail size={14} /> Email</label>
            <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="form-group">
            <label><Lock size={14} /> Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0
                }}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            <LogIn size={18} /> {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Não tem conta?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Criar conta
          </a>
        </p>
      </div>
    </div>
  );
};
