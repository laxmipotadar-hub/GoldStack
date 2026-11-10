import React, { useState } from 'react';
import {
  X,
  Phone,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  User,
  RefreshCw,
  Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { Role, PartyRole } from '../../shared/types.js';
import { useToast } from './Toast.js';

interface LoginModalProps {
  onClose: () => void;
  defaultRole?: Role;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, defaultRole = 'JEWELLER' }) => {
  const { verifyOtp, sendOtp } = useAuth();
  const toast = useToast();

  const [role, setRole] = useState<Role>(defaultRole);
  const [phone, setPhone] = useState<string>(
    defaultRole === 'JEWELLER'
      ? '+91 98201 12345'
      : defaultRole === 'MEDIATOR'
      ? '+91 98205 56789'
      : '+91 98202 23456'
  );
  const [otp, setOtp] = useState<string>('123456');
  const [otpSent, setOtpSent] = useState<boolean>(true); // Pre-sent for demo speed
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const DEMO_ACCOUNTS = [
    {
      role: 'JEWELLER' as const,
      name: 'Lalit Soni (Lalit Jewellers)',
      phone: '+91 98201 12345',
      bench: 'Zaveri Bazaar Showroom'
    },
    {
      role: 'KARIGAR' as const,
      name: 'Ramesh Soni (Master Karigar)',
      phone: '+91 98202 23456',
      bench: 'Bench #4 • Master Goldsmith'
    },
    {
      role: 'KARIGAR' as const,
      name: 'Priya Goldsmith (Filigree Artist)',
      phone: '+91 98203 34567',
      bench: 'Bench #7 • Antique Specialist'
    },
    {
      role: 'KARIGAR' as const,
      name: 'Manoj Filigree (Kundan Karigar)',
      phone: '+91 98204 45678',
      bench: 'Bench #12 • Kundan & Meenakari'
    },
    {
      role: 'KARIGAR' as const,
      name: 'Deepa Verma (Heritage Apprentice)',
      phone: '+91 98206 67890',
      bench: 'Bench #15 • Polki Setting Apprentice (Cold-Start)'
    },
    {
      role: 'MEDIATOR' as const,
      name: 'Vikramaditya Shreshthi (Trade Mediator)',
      phone: '+91 98205 56789',
      bench: 'Zaveri Bazaar Trade Guild (मध्यस्थ)'
    }
  ];

  const handleSelectAccount = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setRole(acc.role);
    setPhone(acc.phone);
    setOtp('123456');
    setOtpSent(true);
  };

  const handleSendOtp = async () => {
    if (!phone) {
      toast.error('Phone Required', 'Please enter your 10-digit mobile number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await sendOtp(phone);
      setOtpSent(true);
      setOtp(res.demoOtp || '123456');
      toast.info('OTP Sent (Demo Mode)', `Demo OTP: ${res.demoOtp || '123456'} entered automatically.`);
    } catch (err: any) {
      toast.error('Failed to send OTP', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      toast.error('OTP Required', 'Please enter the 6-digit OTP code.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await verifyOtp(phone, otp, role);
      toast.success('Login Successful', res.message);
      onClose();
    } catch (err: any) {
      toast.error('Login Failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-outline-variant/30 bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-headline-sm text-lg font-bold text-on-surface">GoldStack Login</h3>
              <p className="font-label-vernacular text-xs text-primary font-bold">
                सुरक्षित फोन एवं ओटीपी लॉगिन (OTP Verification)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleVerify} className="p-5 sm:p-6 space-y-4">
          {/* Role Tabs */}
          <div>
            <label className="block font-label-sm text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              Select Your Role • भूमिका चुनें
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRole('JEWELLER');
                  setPhone('+91 98201 12345');
                }}
                className={`h-11 rounded-xl font-label-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  role === 'JEWELLER'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                <span>Jeweller (मालिक)</span>
                {role === 'JEWELLER' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRole('KARIGAR');
                  setPhone('+91 98202 23456');
                }}
                className={`h-11 rounded-xl font-label-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  role === 'KARIGAR'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                <span>Karigar (कारीगर)</span>
                {role === 'KARIGAR' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRole('MEDIATOR');
                  setPhone('+91 98205 56789');
                }}
                className={`h-11 rounded-xl font-label-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  role === 'MEDIATOR'
                    ? 'bg-purple-800 text-purple-100 shadow-sm'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                <span>Mediator (मध्यस्थ)</span>
                {role === 'MEDIATOR' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Quick Demo Personas */}
          <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30 space-y-2">
            <span className="text-[10px] uppercase font-bold text-secondary flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Quick Demo Accounts (1-Click Selection)</span>
            </span>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.phone}
                  type="button"
                  onClick={() => handleSelectAccount(acc)}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-all flex items-center justify-between ${
                    phone === acc.phone
                      ? 'bg-primary-container/30 border border-primary text-on-surface font-bold'
                      : 'bg-surface-container-lowest hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  <div className="truncate">
                    <span className="font-semibold text-on-surface">{acc.name}</span>
                    <span className="text-[10px] block opacity-80">{acc.bench}</span>
                  </div>
                  <span className="text-[11px] font-mono text-primary ml-2">{acc.phone}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Phone Input */}
          <div>
            <label className="block font-label-sm text-xs font-bold uppercase text-on-surface-variant mb-1">
              Phone Number • मोबाइल नंबर
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98201 12345"
                className="w-full h-11 pl-9 pr-24 bg-surface-container-low rounded-xl text-sm font-mono text-on-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isSubmitting}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-2.5 bg-surface-container-high hover:bg-surface-container-highest text-primary font-bold text-xs rounded-lg transition-colors"
              >
                Send OTP
              </button>
            </div>
          </div>

          {/* OTP Input with Demo Mode Alert */}
          {otpSent && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <label className="block font-label-sm text-xs font-bold uppercase text-on-surface-variant">
                Enter 6-Digit OTP • ओटीपी दर्ज करें
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="w-full h-12 pl-9 pr-3 bg-surface-container-low rounded-xl text-lg font-mono tracking-widest font-bold text-on-surface border border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
                />
              </div>

              {/* Demo Mode Notice */}
              <div className="p-2 rounded-lg bg-[#f0f8f3] border border-[#477b55]/30 flex items-center gap-1.5 text-xs text-[#1e4629]">
                <Info className="w-4 h-4 shrink-0 text-[#477b55]" />
                <span>
                  Demo Mode: Pre-filled with <strong>123456</strong> (HTTP-only JWT cookie will be issued).
                </span>
              </div>
            </div>
          )}

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-primary hover:bg-[#634914] text-on-primary font-label-md text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            <span>Verify & Enter Khata (लॉगिन करें)</span>
          </button>
        </form>
      </div>
    </div>
  );
};

