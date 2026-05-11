import { createContext, useContext, useReducer, useEffect, useRef } from 'react';

const STORAGE_KEY = 'coachFiscal.state';
const API_KEY_STORAGE = 'coachFiscal.apiKey';

const initialState = {
  mode: 'solo',         // "solo" | "couple"
  formData: {},          // données foyer (formulaire collecte)
  d1Data: {},            // déclarant 1 (mode couple)
  d2Data: {},            // déclarant 2 (mode couple)
  anonymizedFiles: [],   // Blob URLs (session only, pas persistés)
  extractedDocs: [],     // données extraites par IA
  profile: '',           // profil fiscal généré (texte brut)
  chatHistory: [],       // [{ role: "user"|"assistant", content: "" }]
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_FORM_DATA':
      return { ...state, formData: action.payload };
    case 'SET_D1_DATA':
      return { ...state, d1Data: action.payload };
    case 'SET_D2_DATA':
      return { ...state, d2Data: action.payload };
    case 'SET_ANONYMIZED_FILES':
      return { ...state, anonymizedFiles: action.payload };
    case 'SET_EXTRACTED_DOCS':
      return { ...state, extractedDocs: action.payload };
    case 'SET_PROFILE':
      return { ...state, profile: action.payload };
    case 'SET_CHAT_HISTORY':
      return { ...state, chatHistory: action.payload };
    case 'APPEND_CHAT':
      return { ...state, chatHistory: [...state.chatHistory, action.payload] };
    case 'CLEAR_CHAT':
      return { ...state, chatHistory: [] };
    case 'RESET':
      return initialState;
    case 'HYDRATE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const timerRef = useRef(null);

  // Hydratation initiale depuis localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Blob URLs ne survivent pas entre sessions
        // eslint-disable-next-line no-unused-vars
        const { anonymizedFiles, extractedDocs, ...rest } = parsed;
        dispatch({ type: 'HYDRATE', payload: rest });
      }
    } catch {
      // Ignore silencieusement (JSON invalide, quota, mode privé)
    }
  }, []);

  // Persistance avec debounce 500ms (sans les Blob URLs)
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // eslint-disable-next-line no-unused-vars
      const { anonymizedFiles, extractedDocs, ...persistable } = state;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
      } catch {
        // Ignore (quota exceeded, mode privé)
      }
    }, 500);
    return () => clearTimeout(timerRef.current);
  }, [state]);

  // La clé API est traitée séparément pour isolation et traçabilité
  const getApiKey = () => {
    const key = localStorage.getItem(API_KEY_STORAGE) || '';
    if (key) {
      console.warn(
        '[Coach Fiscal] Clé API chargée depuis localStorage. ' +
        'Ne partagez pas cet onglet ni vos outils de développement.'
      );
    }
    return key;
  };

  const setApiKey = (key) => {
    if (key) {
      console.warn(
        '[Coach Fiscal] Clé API stockée dans localStorage. ' +
        'Ne partagez pas cet onglet ni vos outils de développement.'
      );
      localStorage.setItem(API_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch, getApiKey, setApiKey }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans <AppProvider>');
  return ctx;
}
