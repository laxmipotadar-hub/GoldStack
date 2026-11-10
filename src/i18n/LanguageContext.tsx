import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import en from './locales/en.json';
import hi from './locales/hi.json';
import kn from './locales/kn.json';

export type Language = 'en' | 'hi' | 'kn';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'goldstack-lang';

const translations: Record<Language, any> = {
  en,
  hi,
  kn
};

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'hi' || saved === 'kn') {
      return saved;
    }
    const browserLang = navigator.language?.toLowerCase() || '';
    if (browserLang.startsWith('kn')) return 'kn';
    if (browserLang.startsWith('hi')) return 'hi';
  } catch {
    // ignore
  }
  return 'en';
}

function resolveKey(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
  });
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLangState] = useState<Language>(getInitialLanguage);

  const setLanguage = (lang: Language) => {
    setLangState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>): string => {
      const currentDict = translations[language];
      const enDict = translations.en;

      const raw = resolveKey(currentDict, key) ?? resolveKey(enDict, key) ?? key;
      return interpolate(raw, params);
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};

// Convenient short alias
export const useT = useTranslation;

