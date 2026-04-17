import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Mail, Lock, User, Eye, EyeOff, CheckCircle } from 'lucide-react';

interface Props { onSwitch: () => void; }

export const RegisterPage = ({ onSwitch }: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPass) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      setLoading(false);
      return;
    }

    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (authError) throw authError;

      // Deslogar imediatamente (usuário precisa ser aprovado antes)
      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        setError('Este email já está registrado.');
      } else {
        setError(err.message || 'Erro ao criar conta.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', background: 'var(--success-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem'
          }}>
            <CheckCircle size={40} color="var(--success)" />
          </div>
          <h2 style={{ marginBottom: '0.75rem' }}>Conta Criada!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Sua conta foi criada com sucesso.<br />
            <strong style={{ color: 'var(--warning)' }}>Aguarde a aprovação de um administrador</strong> para poder acessar o painel.
          </p>
          <button className="btn btn-primary btn-block" onClick={onSwitch}>
            <LogInIcon /> Voltar para o Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <h1><span>Ilha</span> Breeze</h1>
          <p>Criar Nova Conta</p>
        </div>

        <h2 style={{ marginBottom: '0.5rem' }}>Cadastre-se</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Após o registro, um administrador precisará aprovar seu acesso.
        </p>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label><User size={14} /> Nome Completo</label>
            <input type="text" placeholder="Seu nome" value={fullName} onChange={e => setFullName(e.target.value)} required />
          </div>

          <div className="form-group">
            <label><Mail size={14} /> Email</label>
            <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="form-group">
            <label><Lock size={14} /> Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
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

          <div className="form-group">
            <label><Lock size={14} /> Confirmar Senha</label>
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Repita a senha"
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            <UserPlus size={18} /> {loading ? 'Criando...' : 'Criar Conta'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Já tem conta?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Fazer Login
          </a>
        </p>
      </div>
    </div>
  );
};

// Ícone auxiliar para não importar duplicados
const LogInIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
  </svg>
);
