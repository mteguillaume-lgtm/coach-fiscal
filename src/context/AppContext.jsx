import { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { parseProfile } from '../lib/profileParser';

const STORAGE_KEY = 'kapio.state';
const API_KEY_STORAGE = 'kapio.apiKey';

const COLLECT_PROFILE_DEFAULT = {
  foyer: { statut: '', parts: 1, enfants: 0, enfantsGardeAlternee: 0 },
  declarants: [
    { id: 'D1', actif: true,  type: '' },
    { id: 'D2', actif: false, type: '' },
  ],
  modules: {
    salaires:             true,
    fraisReels:           false,
    foncier:              false,
    immobilier:           false,
    capitauxMobiliers:    false,
    crypto:               false,
    livrets:              false,
    pel:                  false,
    pea:                  false,
    assuranceVie:         false,
    cto:                  false,
    epargneSalariale:     false,
    perVolontaire:        false,
    pensionsAlimentaires: false,
    creditsImpot:         false,
    investissementsLocatifs: false,
    international:         false,
  },
  onboardingDone: false,
  expertMode:     false,
};

// Champs de collecte qui activent rétroactivement un module enveloppe (migration).
// Les enveloppes étaient autrefois toujours affichées ; depuis le guidage par
// l'onboarding elles sont gated par module. On réactive le module si une valeur
// a déjà été saisie, pour ne jamais masquer une donnée existante.
const ENVELOPE_MODULE_FIELDS = {
  livrets:      ['livret_a', 'ldd', 'lep', 'livret_plus'],
  pel:          ['pel'],
  pea:          ['pea', 'pea_verse'],
  assuranceVie: ['av', 'av_verse'],
  cto:          ['cto'],
};

const _hasValue = v =>
  v != null && v !== '' && v !== '0' && parseFloat(String(v).replace(/[^\d.-]/g, '')) > 0;

// Normalise un collectProfile hydraté depuis localStorage : complète les clés de
// modules manquantes (nouveaux modules ajoutés après coup) et active les enveloppes
// pour lesquelles une donnée a déjà été saisie.
function migrateCollectProfile(cp, ...dataBags) {
  if (!cp || typeof cp !== 'object') return cp;
  const storedMods = cp.modules || {};
  const modules = { ...COLLECT_PROFILE_DEFAULT.modules, ...storedMods };
  for (const [mod, keys] of Object.entries(ENVELOPE_MODULE_FIELDS)) {
    // Ne touche qu'aux modules absents du stockage (migration legacy) — on ne
    // contredit jamais un choix explicite (true/false) issu de l'onboarding.
    if (mod in storedMods) continue;
    if (dataBags.some(d => d && keys.some(k => _hasValue(d[k])))) modules[mod] = true;
  }
  return { ...COLLECT_PROFILE_DEFAULT, ...cp, modules };
}

const initialState = {
  mode: 'solo',         // "solo" | "couple"
  model: 'auto',        // "auto" | "sonnet" | "opus"  — auto = adaptatif par complexité
  formData: {},          // données foyer (formulaire collecte)
  d1Data: {},            // déclarant 1 (mode couple)
  d2Data: {},            // déclarant 2 (mode couple)
  anonymizedFiles: [],   // Blob URLs (session only, pas persistés)
  extractedDocs: [],     // données extraites par IA
  profile: '',           // profil fiscal généré (texte brut)
  parsedProfile: {},     // résultat de parseProfile(profile) — toujours synchronisé
  chatHistory: [],       // [{ role: "user"|"assistant", content: "" }]
  perSimulation: { versementD1: 0, versementD2: 0 },
  collectProfile: COLLECT_PROFILE_DEFAULT,
  // Dev fixtures
  isFixture: false,          // true quand un profil de test est actif
  userProfileBackup: null,   // sauvegarde du vrai profil avant chargement fixture
  // Demo mode
  isDemo: false,             // true quand le mode démo est actif
  demoBackup: null,          // sauvegarde de l'état avant entrée en démo
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_MODEL':
      return { ...state, model: action.payload };
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
      return { ...state, profile: action.payload, parsedProfile: parseProfile(action.payload) };
    case 'SET_PARSED_PROFILE':
      return { ...state, parsedProfile: action.payload };
    case 'SET_CHAT_HISTORY':
      return { ...state, chatHistory: action.payload };
    case 'APPEND_CHAT':
      return { ...state, chatHistory: [...state.chatHistory, action.payload] };
    case 'CLEAR_CHAT':
      return { ...state, chatHistory: [] };
    case 'SET_PER_SIMULATION':
      return { ...state, perSimulation: action.payload };
    case 'SET_COLLECT_PROFILE':
      return { ...state, collectProfile: { ...COLLECT_PROFILE_DEFAULT, ...action.payload } };
    // ── Dev fixtures ────────────────────────────────────────────────────────
    case 'LOAD_FIXTURE': {
      // Sauvegarde le profil réel seulement si pas déjà sauvegardé
      const backup = state.userProfileBackup !== null ? state.userProfileBackup : (state.profile || '');
      return {
        ...state,
        profile: action.payload,
        parsedProfile: parseProfile(action.payload),
        isFixture: true,
        userProfileBackup: backup,
      };
    }
    case 'RESTORE_USER_PROFILE': {
      const restored = state.userProfileBackup ?? '';
      return {
        ...state,
        profile: restored,
        parsedProfile: parseProfile(restored),
        isFixture: false,
        userProfileBackup: null,
      };
    }
    // ── Mode démo ────────────────────────────────────────────────────────────
    case 'ENTER_DEMO': {
      return {
        ...state,
        profile: action.payload,
        parsedProfile: parseProfile(action.payload),
        isDemo: true,
        demoBackup: {
          profile:  state.profile  || '',
          formData: state.formData || {},
          d1Data:   state.d1Data   || {},
          d2Data:   state.d2Data   || {},
        },
      };
    }
    case 'EXIT_DEMO': {
      const bk = state.demoBackup || {};
      const restored = bk.profile || '';
      return {
        ...state,
        profile:       restored,
        parsedProfile: restored ? parseProfile(restored) : {},
        formData:      bk.formData || {},
        d1Data:        bk.d1Data   || {},
        d2Data:        bk.d2Data   || {},
        isDemo:        false,
        demoBackup:    null,
      };
    }
    // ────────────────────────────────────────────────────────────────────────
    case 'RESET':
    case 'RESET_ALL':
      return initialState;
    case 'HYDRATE': {
      const next = { ...state, ...action.payload };
      if (next.collectProfile) {
        next.collectProfile = migrateCollectProfile(
          next.collectProfile, next.formData, next.d1Data, next.d2Data,
        );
      }
      return next;
    }
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
        const { anonymizedFiles, extractedDocs, parsedProfile: _pp2, ...rest } = parsed;
        dispatch({ type: 'HYDRATE', payload: rest });
        if (rest.profile) {
          dispatch({ type: 'SET_PARSED_PROFILE', payload: parseProfile(rest.profile) });
        }
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
      const { anonymizedFiles, extractedDocs, parsedProfile: _pp, ...persistable } = state;
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
        '[Kapio] Clé API chargée depuis localStorage. ' +
        'Ne partagez pas cet onglet ni vos outils de développement.'
      );
    }
    return key;
  };

  const setApiKey = (key) => {
    if (key) {
      console.warn(
        '[Kapio] Clé API stockée dans localStorage. ' +
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
