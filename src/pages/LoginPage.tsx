import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import heroCafeImg from '../assets/images/cafe_interior_hero_1794642357749.jpg';

const LOCKOUT_KEY = 'kapeos_login_lockout_v1';

export const LoginPage: React.FC = () => {
  const { envMode, setEnvMode, supabaseReady, signInProduction, notify } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(LOCKOUT_KEY);
      return saved ? Number(saved) || 0 : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return;
    const ms = lockedUntil - Date.now();
    const timer = window.setTimeout(() => {
      setLockedUntil(0);
      setFailedAttempts(0);
      try {
        localStorage.removeItem(LOCKOUT_KEY);
      } catch {
        // ignore storage failure
      }
    }, ms);
    return () => window.clearTimeout(timer);
  }, [lockedUntil]);

  const handleProductionSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedUntil > Date.now()) {
      const secs = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
      setError(`Too many failed sign-in attempts. Wait ${secs} seconds before retrying.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signInProduction(email, password);
      setFailedAttempts(0);
      setLockedUntil(0);
      try {
        localStorage.removeItem(LOCKOUT_KEY);
      } catch {
        // ignore storage failure
      }
      navigate('/app');
    } catch (err) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 5) {
        const until = Date.now() + 60_000;
        setLockedUntil(until);
        try {
          localStorage.setItem(LOCKOUT_KEY, String(until));
        } catch {
          // ignore storage failure
        }
      }
      const msg = (err as Error).message || 'Invalid credentials';
      setError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#FAF8F5]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 max-w-xl mx-auto w-full">
        <div className="mb-8">
          <span className="text-xs font-medium text-[#6E5040]">
            Single-Cafe Operations · Asia/Manila · PHP (₱)
          </span>
          <h1 className="font-['Fraunces'] text-3xl sm:text-4xl font-semibold text-[#231914] mt-2 text-balance">
            KapeOS Operations Console
          </h1>
          <p className="text-sm text-[#523B2F] mt-2 leading-relaxed">
            Invitation-only staff access. Production transactions require a connected Supabase project and never mix with Demo data.
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-1 p-1 bg-[#F4EFE8] border border-[#E8DFD3] rounded-lg mb-6 w-fit">
          <button
            type="button"
            onClick={() => setEnvMode('demo')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              envMode === 'demo' ? 'bg-white text-[#231914] shadow-sm' : 'text-[#6E5040]'
            }`}
          >
            Isolated Demo Mode
          </button>
          <button
            type="button"
            onClick={() => setEnvMode('production')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              envMode === 'production' ? 'bg-[#231914] text-white shadow-sm' : 'text-[#6E5040]'
            }`}
          >
            Production Mode (Supabase)
          </button>
        </div>

        {envMode === 'demo' ? (
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#3A2920] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-[#231914]">Explore Isolated Demo Environment</h2>
                <p className="text-xs text-[#523B2F] mt-1 leading-relaxed">
                  Test POS checkout, recipe-linked stock reservations, multi-station KDS, table QR carts, digital payment verification, and shift cash counting. Demo records stay strictly isolated in your browser session.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => navigate('/app')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#231914] text-white text-sm font-medium rounded-lg hover:bg-[#3A2920] transition-colors"
              >
                Enter Demo Workspace
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                to="/setup"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#D7C8B6] bg-white text-[#231914] text-sm font-medium rounded-lg hover:bg-[#FAF8F5]"
              >
                Preview Onboarding Wizard
              </Link>
            </div>
          </div>
        ) : !supabaseReady ? (
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-[#231914]">Supabase Connection Required for Production</h2>
                <p className="text-xs text-[#523B2F] mt-1 leading-relaxed">
                  Production mode will not simulate fake backend calls. Configure your Supabase project credentials in environment variables, apply the migrations in <code className="font-mono bg-[#F4EFE8] px-1 rounded">supabase/migrations/</code>, and reload.
                </p>
              </div>
            </div>
            <div className="bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg p-3 font-mono text-xs text-[#3A2920] space-y-1">
              <div>VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co</div>
              <div>VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEnvMode('demo')}
                className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg hover:bg-[#3A2920]"
              >
                Switch to Demo Mode
              </button>
              <Link to="/setup" className="text-xs font-medium text-[#523B2F] underline">
                View 14-Step Setup Wizard
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleProductionSignIn} className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[#523B2F] mb-1">Staff Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@yourcafe.ph"
                className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3A2920]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#523B2F] mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3A2920]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#231914] text-white text-sm font-medium rounded-lg hover:bg-[#3A2920] disabled:opacity-60"
            >
              <Lock className="w-4 h-4" />
              {loading ? 'Signing in...' : 'Sign In to Production'}
            </button>
            <div className="pt-3 border-t border-[#E8DFD3] flex items-center justify-between text-xs text-[#6E5040]">
              <span>No public registration (invite-only)</span>
              <Link to="/setup" className="font-medium text-[#231914] underline">
                First-time Owner Setup
              </Link>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-[#E8DFD3] flex flex-wrap gap-4 text-xs text-[#6E5040]">
          <Link to="/qr/demo-table-1" className="hover:text-[#231914] underline">
            Customer Table QR Demo (T-01)
          </Link>
          <Link to="/kiosk" className="hover:text-[#231914] underline">
            Self-Ordering Kiosk
          </Link>
          <Link to="/queue" className="hover:text-[#231914] underline">
            Public Queue Display
          </Link>
        </div>
      </div>

      <div className="hidden lg:block relative bg-[#231914]">
        <img
          src={heroCafeImg}
          alt="Minimalist specialty cafe espresso bar"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex items-end p-12">
          <div className="max-w-md text-white">
            <p className="text-xs font-mono text-white/80">Single-Business · Multi-Branch Ready</p>
            <h2 className="font-['Fraunces'] text-2xl font-medium mt-2">
              Unified POS, Smart Ingredient Reservations, and Live KDS Sync.
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
};
