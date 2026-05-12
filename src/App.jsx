import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout    from './components/Layout';
import Home      from './pages/Home';
import Setup     from './pages/Setup';
import Anonymize from './pages/Anonymize';
import Collect   from './pages/Collect';
import Profile   from './pages/Profile';
import Chat      from './pages/Chat';
import Checklist    from './pages/Checklist';
import Opportunites from './pages/Opportunites';
import Simulator        from './pages/Simulator';
import DeclarationGuide from './pages/DeclarationGuide';
import Dashboard        from './pages/Dashboard';
import Rapport          from './pages/Rapport';
import About            from './pages/About';
import Privacy   from './pages/Privacy';
import NotFound  from './pages/NotFound';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/"          element={<Home />}      />
            <Route path="/setup"     element={<Setup />}     />
            <Route path="/anonymize" element={<Anonymize />} />
            <Route path="/collect"   element={<Collect />}   />
            <Route path="/profile"    element={<Profile />}    />
            <Route path="/dashboard"  element={<Dashboard />}  />
            <Route path="/chat"      element={<Chat />}      />
            <Route path="/checklist"    element={<Checklist />}    />
            <Route path="/opportunites" element={<Opportunites />} />
            <Route path="/simulator"    element={<Simulator />}    />
            <Route path="/declaration"  element={<DeclarationGuide />} />
            <Route path="/rapport"      element={<Rapport />}         />
            <Route path="/about"     element={<About />}     />
            <Route path="/privacy"   element={<Privacy />}   />
            <Route path="*"          element={<NotFound />}  />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
