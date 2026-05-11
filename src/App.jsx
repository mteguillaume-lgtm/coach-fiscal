import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout    from './components/Layout';
import Home      from './pages/Home';
import Setup     from './pages/Setup';
import Anonymize from './pages/Anonymize';
import Collect   from './pages/Collect';
import Profile   from './pages/Profile';
import Chat      from './pages/Chat';
import About     from './pages/About';
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
            <Route path="/profile"   element={<Profile />}   />
            <Route path="/chat"      element={<Chat />}      />
            <Route path="/about"     element={<About />}     />
            <Route path="/privacy"   element={<Privacy />}   />
            <Route path="*"          element={<NotFound />}  />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
