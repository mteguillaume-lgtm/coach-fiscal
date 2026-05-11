import { Outlet, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ExternalLink } from 'lucide-react';
import Stepper from './Stepper';
import PrivacyBadge from './PrivacyBadge';

const GITHUB_URL = 'https://github.com/coach-fiscal/coach-fiscal';
const VERSION = '0.1.0';
const STEP_ROUTES = ['/anonymize', '/collect', '/profile', '/chat'];

export default function Layout() {
  const { pathname } = useLocation();
  const showStepper = STEP_ROUTES.some(r => pathname.startsWith(r));
  const isChatPage  = pathname === '/chat';

  return (
    <div className={isChatPage
      ? 'h-screen overflow-hidden flex flex-col bg-gray-50'
      : 'min-h-screen flex flex-col bg-gray-50'
    }>
      <Toaster
        position="top-right"
        toastOptions={{
          className: '!text-sm !font-medium !rounded-xl !shadow-lg !max-w-sm',
          success: {
            duration: 3000,
            iconTheme: { primary: '#0F6E56', secondary: '#E1F5EE' },
          },
          error: {
            duration: 5000,
            iconTheme: { primary: '#ef4444', secondary: '#fee2e2' },
          },
        }}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[720px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="font-semibold text-teal-600 text-lg hover:text-teal-700 transition-colors"
          >
            Coach Fiscal
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Code source sur GitHub"
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            GitHub <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </header>

      {/* Stepper (étapes 1–4 uniquement) */}
      {showStepper && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-[720px] mx-auto px-4 py-3">
            <Stepper />
          </div>
        </div>
      )}

      {/* Contenu principal */}
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

      {/* Footer masqué sur /chat (l'input du chat fait office de pied de page) */}
      {!isChatPage && <footer className="bg-white border-t border-gray-200">
        <div className="max-w-[720px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0 justify-between">
          <PrivacyBadge />
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <Link to="/about"   className="hover:text-gray-600 transition-colors">À propos</Link>
            <Link to="/privacy" className="hover:text-gray-600 transition-colors">Confidentialité</Link>
            <span>v{VERSION}</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-600 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>}
    </div>
  );
}
