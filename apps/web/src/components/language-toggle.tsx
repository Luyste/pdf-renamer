import { useLanguage } from '@/lib/i18n';

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex items-center rounded-md border p-0.5 text-xs font-medium">
      <button
        type="button"
        onClick={() => setLang('hu')}
        aria-pressed={lang === 'hu'}
        className={`rounded px-2 py-1 transition-colors ${
          lang === 'hu'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        HU
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`rounded px-2 py-1 transition-colors ${
          lang === 'en'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}
