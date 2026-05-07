import { useState, useEffect, useCallback } from 'react';
import { getCurrentLang, loadLang, setLang, onLangChange, type LangCode, type Strings, TRANSLATIONS } from './i18n';

export function useLanguage() {
  const [lang, setLangState] = useState<LangCode>(getCurrentLang());

  useEffect(() => {
    loadLang().then(setLangState);
    return onLangChange(setLangState);
  }, []);

  // Returns a new reference when lang changes so the React Compiler treats
  // every t('key') call as reactive and doesn't cache stale translations.
  const t = useCallback(
    (key: keyof Strings) => (TRANSLATIONS[lang] ?? TRANSLATIONS.en)[key] as string,
    [lang],
  );

  return {
    lang,
    t,
    changeLang: (code: LangCode) => setLang(code),
  };
}
