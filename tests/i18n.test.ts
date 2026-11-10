import { describe, it, expect, beforeEach } from 'vitest';
import en from '../src/i18n/locales/en.json';
import hi from '../src/i18n/locales/hi.json';
import kn from '../src/i18n/locales/kn.json';

describe('Internationalization (i18n) Engine & Locales', () => {
  const locales = { en, hi, kn };

  it('loads valid JSON for all 3 supported locales (EN, HI, KN)', () => {
    expect(en).toBeDefined();
    expect(hi).toBeDefined();
    expect(kn).toBeDefined();
    expect(typeof en).toBe('object');
    expect(typeof hi).toBe('object');
    expect(typeof kn).toBe('object');
  });

  it('guarantees identical schema keys across en, hi, and kn', () => {
    function getKeys(obj: Record<string, any>, prefix = ''): string[] {
      return Object.keys(obj).flatMap((key) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          return getKeys(obj[key], fullKey);
        }
        return [fullKey];
      });
    }

    const enKeys = getKeys(en).sort();
    const hiKeys = getKeys(hi).sort();
    const knKeys = getKeys(kn).sort();

    expect(hiKeys).toEqual(enKeys);
    expect(knKeys).toEqual(enKeys);
  });

  it('translates navigation tabs accurately across all three languages', () => {
    expect(en.nav.passbook).toBe('Passbook Ledger');
    expect(hi.nav.passbook).toBe('स्वर्ण बही-खाता');
    expect(kn.nav.passbook).toBe('ಚಿನ್ನದ ಪಾಸ್‌ಬುಕ್ ಲೆಡ್ಜರ್');

    expect(en.nav.settlements).toBe('Settlements');
    expect(hi.nav.settlements).toBe('हिसाब-किताब');
    expect(kn.nav.settlements).toBe('ಲೆಕ್ಕಪತ್ರ ಇತ್ಯರ್ಥ');

    expect(en.nav.disputeCenter).toBe('Dispute Center');
    expect(hi.nav.disputeCenter).toBe('विवाद निवारण');
    expect(kn.nav.disputeCenter).toBe('ವಿವಾದ ಪರಿಹಾರ ಕೇಂದ್ರ');
  });

  it('translates dashboard metric cards accurately across all three languages', () => {
    expect(en.dashboard.remainingGold).toBe('Remaining Gold in Custody');
    expect(hi.dashboard.remainingGold).toBe('हाथ में शेष शुद्ध सोना');
    expect(kn.dashboard.remainingGold).toBe('ವಶದಲ್ಲಿರುವ ಬಾಕಿ ಶುದ್ಧ ಚಿನ್ನ');

    expect(en.dashboard.goldIssued).toBe('Gold Issued');
    expect(hi.dashboard.goldIssued).toBe('सोना दिया (कुल जारी)');
    expect(kn.dashboard.goldIssued).toBe('ವಿತರಿಸಲಾದ ಚಿನ್ನ (ಒಟ್ಟು)');

    expect(en.dashboard.allowedWastage).toBe('Allowed Wastage');
    expect(hi.dashboard.allowedWastage).toBe('स्वीकृत घट (वेस्टेज)');
    expect(kn.dashboard.allowedWastage).toBe('ಅನುಮತಿಸಲಾದ ವೇಸ್ಟೇಜ್');
  });

  it('translates status badges accurately across all three languages', () => {
    expect(en.status.onlineSynced).toBe('Online Synced');
    expect(hi.status.onlineSynced).toBe('ऑनलाइन समकालिक');
    expect(kn.status.onlineSynced).toBe('ಆನ್‌ಲೈನ್ ಸಿಂಕ್ ಆಗಿದೆ');

    expect(en.status.chainIntact).toBe('100% INTACT');
    expect(hi.status.chainIntact).toBe('100% अक्षुण्ण');
    expect(kn.status.chainIntact).toBe('100% ಸುರಕ್ಷಿತ');

    expect(en.status.liveVaultScaleSynced).toBe('Live Vault Scale Synced');
    expect(hi.status.liveVaultScaleSynced).toBe('लाइव तिजोरी तराजू समकालिक');
    expect(kn.status.liveVaultScaleSynced).toBe('ಲೈವ್ ವಾಲ್ಟ್ ತೂಕ ಯಂತ್ರ ಸಿಂಕ್ ಆಗಿದೆ');
  });

  it('translates roles & auth items accurately across all three languages', () => {
    expect(en.roles.jeweller).toBe('Jeweller');
    expect(hi.roles.jeweller).toBe('स्वर्णकार / सुनार');
    expect(kn.roles.jeweller).toBe('ಚಿನ್ನದ ವ್ಯಾಪಾರಿ / ಜ್ಯುವೆಲ್ಲರ್');

    expect(en.roles.karigar).toBe('Karigar');
    expect(hi.roles.karigar).toBe('कारीगर');
    expect(kn.roles.karigar).toBe('ಕಾರಿಗಾರ / ಕುಶಲಕರ್ಮಿ');

    expect(en.roles.mediator).toBe('Mediator');
    expect(hi.roles.mediator).toBe('मध्यस्थ');
    expect(kn.roles.mediator).toBe('ಮಧ್ಯಸ್ಥಗಾರ');
  });

  it('translates demo steps accurately across all three languages', () => {
    expect(en.demo.walkthroughTitle).toBe('Demo Walkthrough');
    expect(hi.demo.walkthroughTitle).toBe('डेमो वॉकथ्रू');
    expect(kn.demo.walkthroughTitle).toBe('ಡೆಮೊ ವಶಪರಿಶೀಲನೆ');

    expect(en.demo.step1Title).toBe('Issue Gold');
    expect(hi.demo.step1Title).toBe('सोना जारी करें');
    expect(kn.demo.step1Title).toBe('ಚಿನ್ನ ವಿತರಿಸಿ');

    expect(en.demo.step7Title).toBe('Guild Mediation Resolution');
    expect(hi.demo.step7Title).toBe('व्यापार गिल्ड मध्यस्थता समाधान');
    expect(kn.demo.step7Title).toBe('ಟ್ರೇಡ್ ಗಿಲ್ಡ್ ಮಧ್ಯಸ್ಥಿಕೆ ಪರಿಹಾರ');
  });

  it('translates trust score strings accurately across all three languages', () => {
    expect(en.trust.trustScore).toBe('Trust Score:');
    expect(hi.trust.trustScore).toBe('साख स्कोर:');
    expect(kn.trust.trustScore).toBe('ವಿಶ್ವಾಸಾರ್ಹತೆ ಸ್ಕೋರ್:');

    expect(en.trust.gradeAPlus).toBe('Grade A+ (Elite Artisan)');
    expect(hi.trust.gradeAPlus).toBe('ग्रेड A+ (सर्वश्रेष्ठ कारीगर)');
    expect(kn.trust.gradeAPlus).toBe('ಗ್ರೇಡ್ A+ (ಉನ್ನತ ಕುಶಲಕರ್ಮಿ)');

    expect(en.trust.viewArtisanTrust).toBe('View Artisan Trust');
    expect(hi.trust.viewArtisanTrust).toBe('कारीगर साख देखें');
    expect(kn.trust.viewArtisanTrust).toBe('ಕುಶಲಕರ್ಮಿ ವಿಶ್ವಾಸಾರ್ಹತೆ ವೀಕ್ಷಿಸಿ');

    expect(en.trust.sharePassport).toBe('Share Passport');
    expect(hi.trust.sharePassport).toBe('पासपोर्ट साझा करें');
    expect(kn.trust.sharePassport).toBe('ಪಾಸ್‌ಪೋರ್ಟ್ ಹಂಚಿಕೊಳ್ಳಿ');
  });

  describe('Translation Function (t) & Interpolation', () => {
    function resolveKey(obj: any, path: string): string | undefined {
      const parts = path.split('.');
      let current = obj;
      for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
      }
      return typeof current === 'string' ? current : undefined;
    }

    function createTranslator(lang: 'en' | 'hi' | 'kn') {
      return (key: string, params?: Record<string, string | number>) => {
        const dict = locales[lang];
        let raw = resolveKey(dict, key) ?? resolveKey(en, key) ?? key;
        if (params) {
          raw = raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_: string, k: string) => {
            return params[k] !== undefined ? String(params[k]) : `{{${k}}}`;
          });
        }
        return raw;
      };
    }

    it('interpolates parameters correctly in English', () => {
      const t = createTranslator('en');
      const formatted = t('status.offlineMode', { count: 3 });
      expect(formatted).toBe('Offline Mode (3)');

      const approx = t('dashboard.approxValue', { value: '74,200', rate: 7420 });
      expect(approx).toBe('Approx. Value: ₹ 74,200 (@ ₹7420/g)');
    });

    it('interpolates parameters correctly in Hindi', () => {
      const t = createTranslator('hi');
      const formatted = t('status.offlineMode', { count: 5 });
      expect(formatted).toBe('ऑफ़लाइन मोड (5)');

      const pending = t('status.pendingGramsWaiting', { grams: '15.500' });
      expect(pending).toBe('15.500 ग्राम सोना प्रतिपक्ष हस्ताक्षर की प्रतीक्षा में');
    });

    it('interpolates parameters correctly in Kannada', () => {
      const t = createTranslator('kn');
      const formatted = t('status.offlineMode', { count: 2 });
      expect(formatted).toBe('ಆಫ್‌ಲೈನ್ ಮೋಡ್ (2)');

      const blocks = t('status.allBlocksValidated', { count: 12, hash: 'a1b2c3d4' });
      expect(blocks).toBe('ಎಲ್ಲಾ 12 ಬ್ಲಾಕ್‌ಗಳನ್ನು ಮೌಲ್ಯೀಕರಿಸಲಾಗಿದೆ. ಜೆನೆಸಿಸ್ ಹ್ಯಾಶ್‌ಗೆ ಲಿಂಕ್ ಮಾಡಲಾಗಿದೆ: a1b2c3d4...');
    });

    it('smoke test: switching locale changes a known label across all three languages', () => {
      const tEn = createTranslator('en');
      const tHi = createTranslator('hi');
      const tKn = createTranslator('kn');

      const knownKey = 'nav.passbook';
      const labelEn = tEn(knownKey);
      const labelHi = tHi(knownKey);
      const labelKn = tKn(knownKey);

      expect(labelEn).toBe('Passbook Ledger');
      expect(labelHi).toBe('स्वर्ण बही-खाता');
      expect(labelKn).toBe('ಚಿನ್ನದ ಪಾಸ್‌ಬುಕ್ ಲೆಡ್ಜರ್');

      expect(labelEn).not.toEqual(labelHi);
      expect(labelHi).not.toEqual(labelKn);
      expect(labelKn).not.toEqual(labelEn);
    });

    it('falls back to English when a key is missing in a target locale', () => {
      const mockHi = { ...hi, nav: { ...hi.nav, passbook: undefined } };
      const fallbackTranslator = (key: string) => {
        return resolveKey(mockHi, key) ?? resolveKey(en, key) ?? key;
      };
      expect(fallbackTranslator('nav.passbook')).toBe('Passbook Ledger');
    });
  });
});

