import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GitFork, ClipboardList, Calculator, LayoutDashboard, BookOpen, MessageSquare, TrendingUp, RotateCcw, Lock, FlaskConical } from 'lucide-react';
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
    <Link to="/" className="flex items-center gap-3 group shrink-0">
      <div className="relative w-9 h-9 flex items-center justify-center">
        <img src="/favicon.svg" alt="Kapio" className="w-full h-full transition-transform duration-300 group-hover:scale-105" />
      </div>
      <span className="font-bold text-ink-0 tracking-tight text-lg group-hover:text-kapio-300 transition-colors">Kapio</span>
    </Link>
  );
}

function NavItem({ to, Icon, label, isActive }) {
  const baseClass = 'flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl transition-all duration-200';
  const activeClass = 'text-ink-0 bg-white/[0.08]';
  const inactiveClass = 'text-ink-200 hover:text-ink-0 hover:bg-white/[0.05]';
  return (
    <Link to={to} className={baseClass + ' ' + (isActive ? activeClass : inactiveClass)}>
      <Icon size={16} aria-hidden="true" />
      <span className="hidden lg:inline">{label}</span>
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
  const { state, dispatch } = useApp();
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
    ? 'max-w-7xl mx-auto px-4 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4'
    : 'max-w-[1100px] mx-auto px-4 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4';

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
      <header className="sticky top-0 z-30 bg-ink-900/95 backdrop-blur border-b border-white/[0.06]">
        {/* Bandeau fixture (dev uniquement) */}
        {state.isFixture && (
          <div className="bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-3 py-1.5 px-4">
            <FlaskConical size={13} className="shrink-0" aria-hidden="true" />
            <span>Profil de test chargé — données réelles non modifiées</span>
            <button
              type="button"
              onClick={() => { dispatch({ type: 'RESTORE_USER_PROFILE' }); navigate('/'); }}
              className="underline underline-offset-2 hover:no-underline transition-all"
            >
              Restaurer mon profil
            </button>
            <Link to="/dev/fixtures" className="border border-white/40 rounded px-2 py-0.5 hover:bg-white/10 transition-colors">
              Changer
            </Link>
          </div>
        )}
        <div className={headerInnerClass}>
          <KapioLogo />

          {/* Nav desktop (cachée sur mobile) */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map(link => {
              const isActive = pathname === link.to || (link.to !== '/' && pathname.startsWith(link.to));
              return <NavItem key={link.to} to={link.to} Icon={link.Icon} label={link.label} isActive={isActive} />;
            })}
            {import.meta.env.DEV && (
              <NavItem
                to="/dev/fixtures"
                Icon={FlaskConical}
                label="Fixtures"
                isActive={pathname.startsWith('/dev/fixtures')}
              />
            )}
            <div className="ml-3 pl-3 border-l border-white/[0.08] flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleReset}
                title="Reinitialiser"
                aria-label="Reinitialiser"
                className="flex items-center justify-center w-9 h-9 text-ink-300 hover:text-danger-400 hover:bg-danger-500/10 rounded-xl transition-all duration-200"
              >
                <RotateCcw size={16} aria-hidden="true" />
              </button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="flex items-center justify-center w-9 h-9 text-ink-300 hover:text-ink-0 hover:bg-white/[0.06] rounded-xl transition-all duration-200"
              >
                <GitFork size={16} aria-hidden="true" />
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
              <img src="/favicon.svg" alt="" aria-hidden="true" className="w-6 h-6" />
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
      <nav className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-ink-900 border-t border-white/[0.06]">
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
