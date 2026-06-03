import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/ui/Logo';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.trim()) return setError('Email is required');
    if (!password) return setError('Password is required');

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8faff] p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-[#e2e8f0] bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <div className="flex justify-center">
            <Logo size={24} subtitle={false} />
          </div>
          <p className="mt-2 text-sm text-[#6b7280]">Internal Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="you@swahilipothub.co.ke"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#374151]">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 pr-10 text-sm text-[#374151] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[#6b7280] hover:text-[#374151]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </Button>

          {error && <p className="text-center text-sm text-[#dc2626]">{error}</p>}

          <div className="text-center">
            <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
              Forgot password?
            </Link>
          </div>
        </form>

        <p className="mt-6 border-t border-[#e2e8f0] pt-4 text-center text-xs leading-relaxed text-[#6b7280]">
          By signing in, you agree to our{' '}
          <Link to="/terms" className="font-medium text-brand-600 hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="font-medium text-brand-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
