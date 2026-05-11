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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'text-sm',
          success: { duration: 3000 },
          error:   { duration: 5000 },
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
      <main className="flex-1">
        <div className="max-w-[720px] mx-auto px-4 py-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-[720px] mx-auto px-4 py-4 flex items-center justify-between">
          <PrivacyBadge />
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>v{VERSION}</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-600 transition-colors"
            >
              Open source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
