import { lazy, Suspense } from 'react';
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

export default function App() {
  return (
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
              <Route path="*"           element={<NotFound />}       />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  );
}
