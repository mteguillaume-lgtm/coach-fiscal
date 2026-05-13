import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GitFork, Lock, ClipboardList, Calculator, LayoutDashboard, BookOpen, MessageSquare, TrendingUp, RotateCcw } from 'lucide-react';
import Stepper from './Stepper';
import { useApp } from '../context/AppContext';

const STORAGE_KEY = 'coachFiscal.state';

const GITHUB_URL  = 'https://github.com/coach-fiscal/coach-fiscal';
const VERSION     = '0.1.0';
const HIDE_STEPPER = ['/', '/about', '/privacy'];

export default function Layout() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const { dispatch } = useApp();

  const handleReset = () => {
    if (!window.confirm(
      'Êtes-vous sûr ? Toutes vos données seront effacées.\nVotre clé API sera conservée.'
    )) return;
    dispatch({ type: 'RESET_ALL' });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    navigate('/');
  };
  const showStepper = !HIDE_STEPPER.some(r => pathname === r || (r !== '/' && pathname.startsWith(r)));
  const isChatPage  = pathname === '/chat';

  return (
    <div className={isChatPage
      ? 'h-screen overflow-hidden flex flex-col bg-gray-50'
      : 'min-h-screen flex flex-col bg-gray-50'
    }>
      <Toaster
        position="top-right"
        toastOptions={{
          className: '!text-sm !font-medium !rounded-2xl !shadow-xl !max-w-sm !border !border-gray-100',
          success: { duration: 3000, iconTheme: { primary: '#0F6E56', secondary: '#E1F5EE' } },
          error:   { duration: 5000, iconTheme: { primary: '#ef4444', secondary: '#fee2e2' } },
        }}
      />

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-gray-200/80 shadow-sm">
        <div className="max-w-[720px] mx-auto px-4 h-14 flex items-center justify-between gap-4">

          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-teal-gradient flex items-center justify-center shadow-sm">
              <Lock size={13} className="text-white" aria-hidden="true" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight group-hover:text-teal-600 transition-colors">
              Coach Fiscal
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link to="/dashboard"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
              <LayoutDashboard size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link to="/opportunites"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
              <TrendingUp size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Opportunités</span>
            </Link>
            <Link to="/checklist"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
              <ClipboardList size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Checklist</span>
            </Link>
            <Link to="/simulator"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
              <Calculator size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Simulateur</span>
            </Link>
            <Link to="/declaration"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
              <BookOpen size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Déclaration</span>
            </Link>
            <Link to="/chat"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
              <MessageSquare size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Chat</span>
            </Link>
            <button
              type="button"
              onClick={handleReset}
              title="Réinitialiser toutes les données"
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-red-500 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-50"
            >
              <RotateCcw size={13} aria-hidden="true" />
            </button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Code source sur GitHub"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
            >
              <GitFork size={14} aria-hidden="true" />
            </a>
          </nav>
        </div>
      </header>

      {/* ── Stepper ─────────────────────────────────────────────── */}
      {showStepper && (
        <div className="bg-white/60 backdrop-blur-sm border-b border-gray-100">
          <div className="max-w-[720px] mx-auto px-4 py-3">
            <Stepper />
          </div>
        </div>
      )}

      {/* ── Contenu ─────────────────────────────────────────────── */}
      <main className={isChatPage
        ? 'flex-1 flex flex-col overflow-hidden min-h-0'
        : 'flex-1'
      }>
        {isChatPage ? (
          <Outlet />
        ) : (
          <div key={pathname} className="max-w-[720px] mx-auto px-4 py-8 animate-fade-in">
            <Outlet />
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      {!isChatPage && (
        <footer className="bg-white/70 backdrop-blur-sm border-t border-gray-100">
          <div className="max-w-[720px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0 justify-between">
            <div className="flex items-center gap-1.5 text-xs text-teal-600 font-medium">
              <Lock size={12} aria-hidden="true" />
              Données 100 % locales
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <Link to="/about"   className="hover:text-gray-600 transition-colors">À propos</Link>
              <Link to="/privacy" className="hover:text-gray-600 transition-colors">Confidentialité</Link>
              <span className="text-gray-200">·</span>
              <span>v{VERSION}</span>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer"
                className="hover:text-gray-600 transition-colors">GitHub</a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
