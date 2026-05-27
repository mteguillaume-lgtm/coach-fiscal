import { lazy, Suspense, Component } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';

const Home           = lazy(() => import('./pages/Home'));
const Setup          = lazy(() => import('./pages/Setup'));
const Anonymize      = lazy(() => import('./pages/Anonymize'));
const Collect        = lazy(() => import('./pages/Collect'));
const Profile        = lazy(() => import('./pages/Profile'));
const Chat           = lazy(() => import('./pages/Chat'));
const Checklist      = lazy(() => import('./pages/Checklist'));
const Opportunites   = lazy(() => import('./pages/Opportunites'));
const Simulator      = lazy(() => import('./pages/Simulator'));
const DeclarationGuide = lazy(() => import('./pages/DeclarationGuide'));
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Rapport        = lazy(() => import('./pages/Rapport'));
const About          = lazy(() => import('./pages/About'));
const Privacy        = lazy(() => import('./pages/Privacy'));
const NotFound       = lazy(() => import('./pages/NotFound'));
// Dev-only — tree-shaken en production (import.meta.env.DEV = false)
const DevFixtures = import.meta.env.DEV
  ? lazy(() => import('./pages/DevFixtures'))
  : null;

/* ── ErrorBoundary — affiche l'erreur au lieu d'une page noire ── */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-ink-900 text-ink-0 flex items-center justify-center p-8">
          <div className="max-w-lg text-center space-y-4">
            <p className="text-2xl font-bold text-danger-400">Une erreur est survenue</p>
            <p className="text-ink-200 text-sm font-mono bg-ink-850 rounded-xl p-4 text-left break-all">
              {this.state.error?.message || String(this.state.error)}
            </p>
            <button
              className="btn-primary mt-4"
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            >
              Recharger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen bg-ink-900" />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/"           element={<Home />}           />
                <Route path="/setup"      element={<Setup />}          />
                <Route path="/anonymize"  element={<Anonymize />}      />
                <Route path="/collect"    element={<Collect />}        />
                <Route path="/profile"    element={<Profile />}        />
                <Route path="/dashboard"  element={<Dashboard />}      />
                <Route path="/chat"       element={<Chat />}           />
                <Route path="/checklist"  element={<Checklist />}      />
                <Route path="/opportunites" element={<Opportunites />} />
                <Route path="/simulator"  element={<Simulator />}      />
                <Route path="/declaration" element={<DeclarationGuide />} />
                <Route path="/rapport"    element={<Rapport />}        />
                <Route path="/about"      element={<About />}          />
                <Route path="/privacy"    element={<Privacy />}        />
                {import.meta.env.DEV && DevFixtures && (
                  <Route path="/dev/fixtures" element={<DevFixtures />} />
                )}
                <Route path="*"           element={<NotFound />}       />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
