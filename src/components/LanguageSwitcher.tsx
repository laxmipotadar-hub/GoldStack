import React from 'react';
import { useTranslation, Language } from '../i18n/LanguageContext.js';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useTranslation();

  const options: { code: Language; label: string; title: string }[] = [
    { code: 'en', label: 'EN', title: 'English' },
    { code: 'hi', label: 'हिं', title: 'हिंदी (Hindi)' },
    { code: 'kn', label: 'ಕನ್ನಡ', title: 'ಕನ್ನಡ (Kannada)' }
  ];

  return (
    <div
      className="inline-flex items-center bg-chip rounded-xl p-0.5 border border-border shadow-xs text-xs font-semibold"
      role="group"
      aria-label="Language switcher"
    >
      {options.map((opt) => {
        const isActive = language === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLanguage(opt.code)}
            title={opt.title}
            className={`px-2 py-1 rounded-lg transition-all text-xs font-bold ${
              isActive
                ? 'bg-brand text-white shadow-xs'
                : 'text-muted hover:text-ink hover:bg-card'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

