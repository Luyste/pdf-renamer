import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type Lang = 'hu' | 'en';

const STORAGE_KEY = 'pdf-renamer:lang';

const translations = {
  hu: {
    appTitle: 'PDF Átnevező',
    ocrWarning:
      'A magyar OCR csomag nem elérhető — visszaváltás erre: "{{lang}}"',
    uploadDropHint: 'Húzza ide a beszkennelt számla PDF-eket',
    uploadClickHint: 'vagy kattintson a fájlok kiválasztásához',
    sidebarInvoices: 'Számlák ({{count}})',
    sidebarScanning: '{{count}} feldolgozás alatt…',
    sidebarAddFiles: 'Fájlok hozzáadása',
    sidebarNavigate: 'navigálás',
    fieldInvoice: 'Sorszám',
    fieldFulfilDate: 'Teljesítés',
    fieldCustomer: 'Vevő',
    detailScanning: 'Feldolgozás…',
    detailRenderingPreview: 'Előnézet betöltése…',
    detailFilenameLabel: 'Fájlnév',
    detailFilenamePlaceholder: 'fajlnev.pdf',
    detailConfirm: 'Megerősítés',
    detailSkip: 'Kihagyás',
    detailSelectFile: 'Válasszon egy fájlt az ellenőrzéshez',
    footerReadyStatus: '{{ready}} kész, {{needsReview}} felülvizsgálandó',
    footerStillScanning: '{{count}} még feldolgozás alatt',
    footerConfirmAll: 'Megerősítés és letöltés',
    parsingWarningTitle: '{{count}} fájl még feldolgozás alatt',
    parsingWarningDesc:
      'Ezeknél a fájloknál még nem fejeződött be az OCR, és a jelenleg beállított (valószínűleg üres) fájlnévvel kerülnek megerősítésre. Várjon a feldolgozás befejezéséig, vagy erősítse meg mindenképp, és javítsa ki később.',
    wait: 'Várakozás',
    confirmAnyway: 'Megerősítés mindenképp',
    deleteOriginalsTitle: 'Törli a feltöltött {{count}} eredeti fájlt?',
    deleteOriginalsDesc:
      'Az átnevezett fájlokat már letöltötte. Ez véglegesen eltávolítja a feltöltött eredeti fájlokat a tárhelyről.',
    keep: 'Megtartás',
    delete: 'Törlés',
    toastDownloadStarted: 'Letöltés elindult',
    toastOriginalsDeleted: 'Eredeti fájlok törölve',
  },
  en: {
    appTitle: 'PDF Renamer',
    ocrWarning: 'Hungarian OCR pack unavailable — falling back to "{{lang}}"',
    uploadDropHint: 'Drop scanned invoice PDFs here',
    uploadClickHint: 'or click to choose files',
    sidebarInvoices: 'Invoices ({{count}})',
    sidebarScanning: 'scanning {{count}}…',
    sidebarAddFiles: 'Add files',
    sidebarNavigate: 'navigate',
    fieldInvoice: 'Invoice no.',
    fieldFulfilDate: 'Fulfilment date',
    fieldCustomer: 'Customer',
    detailScanning: 'Scanning…',
    detailRenderingPreview: 'Rendering preview…',
    detailFilenameLabel: 'Filename',
    detailFilenamePlaceholder: 'filename.pdf',
    detailConfirm: 'Confirm',
    detailSkip: 'Skip',
    detailSelectFile: 'Select a file to review',
    footerReadyStatus: '{{ready}} ready, {{needsReview}} need review',
    footerStillScanning: '{{count}} still scanning',
    footerConfirmAll: 'Confirm and Download',
    parsingWarningTitle: '{{count}} file(s) still scanning',
    parsingWarningDesc:
      "These files haven't finished OCR yet and will be confirmed with whatever filename is currently set (likely blank). Wait for scanning to finish, or confirm anyway and fix them up later.",
    wait: 'Wait',
    confirmAnyway: 'Confirm anyway',
    deleteOriginalsTitle: 'Delete {{count}} uploaded originals?',
    deleteOriginalsDesc:
      'The renamed files have been downloaded. This removes the uploaded originals from storage and cannot be undone.',
    keep: 'Keep',
    delete: 'Delete',
    toastDownloadStarted: 'Download started',
    toastOriginalsDeleted: 'Originals deleted',
  },
} as const;

export type TranslationKey = keyof (typeof translations)['hu'];

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'hu' || stored === 'en') return stored;
  } catch {
    // storage unavailable — fall through to default
  }
  return 'hu';
}

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — language just won't persist across reloads
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      interpolate(translations[lang][key], vars),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
