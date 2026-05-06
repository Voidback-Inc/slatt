import { useState, useEffect } from 'react';
import { getCurrentLang, loadLang, setLang, onLangChange, type LangCode } from './i18n';

export function useLanguage() {
  const [lang, setLangState] = useState<LangCode>(getCurrentLang());

  useEffect(() => {
    loadLang().then(setLangState);
    return onLangChange(setLangState);
  }, []);

  return {
    lang,
    changeLang: (code: LangCode) => setLang(code),
  };
}
