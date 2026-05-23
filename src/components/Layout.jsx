import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GitFork, ClipboardList, Calculator, LayoutDashboard, BookOpen, MessageSquare, TrendingUp, RotateCcw, Lock } from 'lucide-react';
import Stepper from './Stepper';
import { useApp } from '../context/AppContext';

const STORAGE_KEY = 'coachFiscal.state';
const GITHUB_URL = 'https://github.com/coach-fiscal/coach-fiscal';
const VERSION = '0.1.0';
const HIDE_STEPPER = ['/', '/about', '/privacy', '/dashboard'];
const FULL_WIDTH_PAGES = ['/', '/dashboard', '/profile', '/setup', '/rapport', '/opportunites', '/checklist', '/simulator', '/declaration'];

const NAV_LINKS = [
  { to: '/dashboard',   Icon: LayoutDashboard, label: 'Dashboard',   mobileLabel: 'Board'    },
  { to: '/opportunites',Icon: TrendingUp,       label: 'Opportunites',mobileLabel: 'Opport.'  },
  { to: '/checklist',   Icon: ClipboardList,    label: 'Checklist',   mobileLabel: 'Check'    },
  { to: '/simulator',   Icon: Calculator,       label: 'Simulateur',  mobileLabel: 'Simul.'   },
  { to: '/declaration', Icon: BookOpen,         label: 'Declaration', mobileLabel: 'Déclar.'  },
  { to: '/chat',        Icon: MessageSquare,    label: 'Chat',        mobileLabel: 'Chat'     },
];

function KapioLogo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group shrink-0">
      <div className="relative w-8 h-8 flex items-center justify-center">
        <img src="/kapio-mark.svg" alt="Kapio" className="w-full h-full transition-transform duration-300 group-hover:scale-105" />
      </div>
      <span className="font-bold text-ink-0 tracking-tight text-base group-hover:text-kapio-300 transition-colors">Kapio</span>
    </Link>
  );
}

function NavItem({ to, Icon, label, isActive }) {
  const baseClass = 'flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-all duration-200';
  const activeClass = 'text-ink-0 bg-white/[0.06]';
  const inactiveClass = 'text-ink-100 hover:text-ink-0 hover:bg-white/[0.04]';
  return (
    <Link to={to} className={baseClass + ' ' + (isActive ? activeClass : inactiveClass)}>
      <Icon size={14} aria-hidden="true" />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}

function MobileNavItem({ to, Icon, label, isActive }) {
  return (
    <Link
      to={to}
      className={[
        'flex flex-col items-center gap-0.5 px-1 py-2 rounded-xl transition-all duration-200 min-w-[52px]',
        isActive ? 'text-kapio-300' : 'text-ink-300',
      ].join(' ')}
    >
      <Icon size={20} aria-hidden="true" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </Link>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const pathname = location.pathname;

  const handleReset = () => {
    const ok = window.confirm('Etes-vous sur ? Toutes vos donnees seront effacees.');
    if (!ok) return;
    dispatch({ type: 'RESET_ALL' });
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    navigate('/');
  };

  const showStepper = !HIDE_STEPPER.some(r => pathname === r || (r !== '/' && pathname.startsWith(r)));
  const isChatPage = pathname === '/chat';
  const isFullWidth = FULL_WIDTH_PAGES.includes(pathname);

  const wrapperClass = isChatPage
    ? 'h-screen overflow-x-hidden overflow-y-hidden flex flex-col bg-ink-900'
    : 'min-h-screen overflow-x-hidden flex flex-col bg-ink-900';

  const headerInnerClass = isFullWidth
    ? 'max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3'
    : 'max-w-[1100px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3';

  const mainContentClass = isFullWidth
    ? 'w-full animate-fade-in'
    : 'max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-fade-in';

  const footerInnerClass = isFullWidth
    ? 'max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-0 justify-between'
    : 'max-w-[1100px] mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-0 justify-between';

  return (
    <div className={wrapperClass}>
      <Toaster
        position="top-right"
        toastOptions={{
          className: '!text-sm !font-medium !rounded-xl !shadow-2xl !max-w-sm !border !bg-ink-800 !text-ink-0 !border-white/[0.08]',
          success: { duration: 3000, iconTheme: { primary: '#2EB88A', secondary: '#0A0A0B' } },
          error:   { duration: 5000, iconTheme: { primary: '#ef4444', secondary: '#0A0A0B' } },
        }}
      />

      {/* ─── Header desktop + mobile (logo + nav desktop uniquement) ─── */}
      <header className="sticky top-0 z-30 bg-ink-900/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className={headerInnerClass}>
          <KapioLogo />

          {/* Nav desktop (cachée sur mobile) */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {NAV_LINKS.map(link => {
              const isActive = pathname === link.to || (link.to !== '/' && pathname.startsWith(link.to));
              return <NavItem key={link.to} to={link.to} Icon={link.Icon} label={link.label} isActive={isActive} />;
            })}
            <div className="ml-2 pl-2 border-l border-white/[0.08] flex items-center gap-1">
              <button
                type="button"
                onClick={handleReset}
                title="Reinitialiser"
                aria-label="Reinitialiser"
                className="flex items-center justify-center w-8 h-8 text-ink-200 hover:text-danger-400 hover:bg-danger-500/10 rounded-lg transition-all duration-200"
              >
                <RotateCcw size={14} aria-hidden="true" />
              </button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="flex items-center justify-center w-8 h-8 text-ink-200 hover:text-ink-0 hover:bg-white/[0.06] rounded-lg transition-all duration-200"
              >
                <GitFork size={14} aria-hidden="true" />
              </a>
            </div>
          </nav>

          {/* Actions mobiles dans le header */}
          <div className="flex sm:hidden items-center gap-1">
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reinitialiser"
              className="flex items-center justify-center w-9 h-9 text-ink-200 hover:text-danger-400 rounded-lg transition-all"
            >
              <RotateCcw size={16} />
            </button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="flex items-center justify-center w-9 h-9 text-ink-200 hover:text-ink-0 rounded-lg transition-all"
            >
              <GitFork size={16} />
            </a>
          </div>
        </div>
      </header>

      {showStepper ? (
        <div className="bg-ink-850/60 backdrop-blur-sm border-b border-white/[0.04]">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-3">
            <Stepper />
          </div>
        </div>
      ) : null}

      <main className={
        isChatPage
          ? 'flex-1 flex flex-col overflow-hidden min-h-0 pb-16 sm:pb-0'
          : 'flex-1 pb-16 sm:pb-0'
      }>
        {isChatPage
          ? <Outlet />
          : <div key={pathname} className={mainContentClass}><Outlet /></div>
        }
      </main>

      {isChatPage ? null : (
        <footer className="hidden sm:block bg-ink-850/40 backdrop-blur-sm border-t border-white/[0.04]">
          <div className={footerInnerClass}>
            <div className="flex items-center gap-3">
              <img src="/kapio-mark.svg" alt="" aria-hidden="true" className="w-6 h-6" />
              <span className="text-xs text-ink-100">
                <span className="font-semibold text-ink-50">Kapio</span> &middot; 100 % local
                <Lock size={11} className="inline ml-1.5 text-kapio-300 align-text-bottom" />
              </span>
            </div>
            <div className="flex items-center gap-5 text-xs text-ink-200">
              <Link to="/about" className="hover:text-ink-0 transition-colors">A propos</Link>
              <Link to="/privacy" className="hover:text-ink-0 transition-colors">Confidentialite</Link>
              <span className="text-ink-400">&middot;</span>
              <span className="font-mono">v{VERSION}</span>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink-0 transition-colors inline-flex items-center gap-1.5">
                <GitFork size={11} /> GitHub
              </a>
            </div>
          </div>
        </footer>
      )}

      {/* ─── Bottom tab bar mobile (cachée sur sm+) ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-ink-900/95 backdrop-blur-xl border-t border-white/[0.06]">
        <div className="flex items-center justify-around px-2 py-1">
          {NAV_LINKS.map(link => {
            const isActive = pathname === link.to || (link.to !== '/' && pathname.startsWith(link.to));
            return (
              <MobileNavItem
                key={link.to}
                to={link.to}
                Icon={link.Icon}
                label={link.mobileLabel}
                isActive={isActive}
              />
            );
          })}
        </div>
      </nav>
    </div>
  );
}
