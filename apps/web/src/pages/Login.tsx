import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLogin } from '../hooks/useApi';
import { useAuthStore } from '../stores/auth.store';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@cabodehornos.cl');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useLogin();
  const authLogin = useAuthStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await login.mutateAsync({ email, password });
      authLogin(data.access_token, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error de autenticación');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-green to-brand-blue mb-4 shadow-lg shadow-brand-blue/20">
            <span className="text-white font-bold text-xl">W</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">WMS PRO</h1>
          <p className="text-text-muted text-sm mt-1">Cabo de Hornos — Sistema de Bodegas</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-bg-secondary rounded-2xl border border-border-primary p-6 shadow-xl shadow-black/20">
          {error && (
            <div className="mb-4 p-3 bg-brand-red/10 border border-brand-red/30 rounded-lg text-brand-red text-sm text-center">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-muted mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-bg-tertiary border border-border-primary rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue transition-all"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-muted mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-bg-tertiary border border-border-primary rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-brand-blue to-brand-green text-white font-medium rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-brand-blue/30 disabled:opacity-50 text-sm"
          >
            {login.isPending ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
