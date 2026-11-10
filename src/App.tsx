import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Scale,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Flame,
  ShieldCheck,
  Wifi,
  WifiOff,
  UserCheck,
  RefreshCw,
  PlusCircle,
  CornerDownLeft,
  Clock,
  BookOpen,
  Send,
  Database,
  CheckCircle2,
  LogOut,
  User,
  Calendar,
  Receipt,
  Award,
  AlertOctagon
} from 'lucide-react';
import { Party, User as UserModel, Role } from '../shared/types.js';
import { BalanceCard } from './components/BalanceCard.js';
import { GoldIssueForm } from './components/GoldIssueForm.js';
import { GoldReturnForm } from './components/GoldReturnForm.js';
import { LedgerView } from './components/LedgerView.js';
import { WastageAgreementPanel } from './components/WastageAgreementPanel.js';
import { WastageHistoryChart } from './components/WastageHistoryChart.js';
import { OrderManagementPanel } from './components/OrderManagementPanel.js';
import { SettlementPanel } from './components/SettlementPanel.js';
import { KarigarTrustDirectory } from './components/KarigarTrustDirectory.js';
import { KarigarPassportView } from './components/KarigarPassportView.js';
import { DisputeManagementPanel } from './components/DisputeManagementPanel.js';
import { EditGoldRateModal } from './components/EditGoldRateModal.js';
import { NotificationBell } from './components/NotificationBell.js';
import { LoginModal } from './components/LoginModal.js';
import { DemoWalkthroughChecklist } from './components/DemoWalkthroughChecklist.js';
import { LanguageSwitcher } from './components/LanguageSwitcher.js';
import { useTranslation } from './i18n/LanguageContext.js';
import { offlineQueue } from './offline/offlineQueue.js';
import { useToast } from './components/Toast.js';
import { useAuth } from './context/AuthContext.js';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, isAuthenticated, logout, openLoginModal, isLoginModalOpen, closeLoginModal, switchUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'LEDGER' | 'ISSUE' | 'RETURN' | 'WASTAGE' | 'ORDERS' | 'SETTLEMENTS' | 'TRUST' | 'DISPUTES' | 'OFFLINE'>('LEDGER');
  const [selectedKarigarId, setSelectedKarigarId] = useState<string>('22222222-2222-2222-2222-222222222222'); // Ramesh
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [passportModalKarigarId, setPassportModalKarigarId] = useState<string | null>(null);
  const [isSeedingDemo, setIsSeedingDemo] = useState<boolean>(false);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(offlineQueue.isSimulatedOffline());
  const queryClient = useQueryClient();

  const handleToggleOffline = () => {
    const nextState = offlineQueue.toggleSimulatedOffline();
    setIsSimulatedOffline(nextState);
    setIsOnline(!nextState);
    if (nextState) {
      toast.warning(
        'Offline Mode Active',
        'Network disconnected. All transactions will queue locally with cryptographic nonces.'
      );
    } else {
      toast.success(
        'Online Mode Restored',
        'Network reconnected. Triggering auto-sync to immutable hash chain...'
      );
    }
  };

  const handleLoadDemoBazaar = async () => {
    setIsSeedingDemo(true);
    toast.info('Loading Demo Bazaar...', 'Seeding 4 Karigars, 6 Orders, Disputed Settlement, and Trust Scores...');
    try {
      const res = await fetch('/api/demo/seed-bazaar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to seed demo bazaar');
      }

      await queryClient.invalidateQueries();
      toast.success(
        'Demo Bazaar Loaded Successfully!',
        `Seeded 4 Karigars, 6 Orders (${data.data?.atRiskOrder?.orderNumber} AT_RISK due in 3 days), 1 Disputed Settlement & Bayesian Trust Scores.`
      );
    } catch (err: any) {
      toast.error('Failed to load demo bazaar', err.message);
    } finally {
      setIsSeedingDemo(false);
    }
  };

  // Check for direct public artisan passport shareable route (/passport/:karigarId)
  const isDirectPassportRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/passport/');
  const directPassportKarigarId = isDirectPassportRoute
    ? window.location.pathname.replace('/passport/', '').split('/')[0]
    : null;

  // Fetch Current Live Bullion Gold Rate
  const { data: currentBullionRateRes } = useQuery<{
    success: boolean;
    data: { rate_per_gram_24k: number; formatted: string };
  }>({
    queryKey: ['bullionRateCurrent'],
    queryFn: async () => {
      const res = await fetch('/api/rates/current');
      if (!res.ok) throw new Error('Failed to fetch rate');
      return res.json();
    }
  });

  const liveRate = currentBullionRateRes?.data?.rate_per_gram_24k || 7420;

  // Fetch registered parties
  const { data: partiesRes } = useQuery<{ success: boolean; data: Party[] }>({
    queryKey: ['parties'],
    queryFn: async () => {
      const res = await fetch('/api/ledger/parties', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch parties');
      return res.json();
    }
  });

  const parties = partiesRes?.data || [];
  const jewellers = parties.filter((p) => p.role === 'JEWELLER');
  const karigars = parties.filter((p) => p.role === 'KARIGAR');

  // If user is a Karigar, force selectedKarigarId to be their own ID (Data Ownership)
  useEffect(() => {
    if (user?.role === 'KARIGAR') {
      setSelectedKarigarId(user.id);
      if (activeTab === 'ISSUE') {
        setActiveTab('LEDGER');
      }
    }
  }, [user, activeTab]);

  const currentJeweller =
    user?.role === 'JEWELLER'
      ? (user as Party)
      : jewellers[0] || {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Lalit Soni',
          businessName: 'Lalit Jewellers • Zaveri Bazaar',
          role: 'JEWELLER',
          phone: '+91 98201 12345'
        };

  const selectedKarigar =
    user?.role === 'KARIGAR'
      ? (user as Party)
      : karigars.find((k) => k.id === selectedKarigarId) ||
        karigars[0] || {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Ramesh Soni',
          businessName: 'Bench #4 • Master Goldsmith',
          role: 'KARIGAR',
          phone: '+91 98202 23456'
        };

  const currentParty: Party = user
    ? {
        id: user.id,
        role: user.role,
        name: user.name,
        phone: user.phone,
        businessName: user.businessName
      }
    : currentJeweller;

  // Listen to offline queue & online/offline events
  useEffect(() => {
    const updateStatus = () => {
      const online = offlineQueue.isOnline();
      setIsOnline(online);
      setOfflineQueueCount(offlineQueue.getQueue().length);
    };

    updateStatus();
    const unsubscribe = offlineQueue.subscribe(updateStatus);
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      unsubscribe();
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    toast.info('Syncing Offline Queue', 'Submitting queued transactions to the immutable hash chain...');
    try {
      const result = await offlineQueue.triggerSync();
      if (result.processed > 0) {
        toast.success(
          'Offline Sync Complete',
          `Successfully committed ${result.processed} transaction(s) to the ledger.`
        );
      } else if (result.conflicts > 0) {
        toast.warning(
          'Sync Conflict Resolved',
          `${result.conflicts} transaction(s) resolved with Last-Write-Wins and flagged for manual review.`
        );
      } else {
        toast.info('Sync Status', 'Queue is already up to date.');
      }
    } catch (err: any) {
      toast.error('Sync Error', err.message);
    } finally {
      setIsSyncing(false);
      setOfflineQueueCount(offlineQueue.getQueue().length);
    }
  };

  const isKarigarRole = user?.role === 'KARIGAR';

  // Direct public artisan passport shareable route (/passport/:karigarId)
  if (isDirectPassportRoute && directPassportKarigarId) {
    return (
      <div className="min-h-screen bg-surface-container-low font-body-md text-on-surface">
        <div className="max-w-2xl mx-auto p-4 flex items-center justify-between">
          <a
            href="/"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5"
          >
            <Scale className="w-4 h-4" />
            <span>← Back to GoldStack Ledger</span>
          </a>
          <span className="text-[11px] text-on-surface-variant font-mono">
            Public Artisan Verification Portal
          </span>
        </div>
        <KarigarPassportView karigarId={directPassportKarigarId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface flex flex-col antialiased selection:bg-primary-container selection:text-on-primary-container">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-outline-variant/30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-20 flex items-center justify-between gap-3">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold shadow-md">
              <Scale className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-lg sm:text-xl font-bold tracking-tight text-on-surface leading-tight">
                GoldStack
              </span>
              <span className="font-label-vernacular text-xs text-primary font-bold leading-none">
                {t('header.appSubtitle')}
              </span>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* One-Click Load Demo Bazaar (Jeweller View) */}
            {user?.role === 'JEWELLER' && (
              <button
                id="btn-load-demo-bazaar"
                onClick={handleLoadDemoBazaar}
                disabled={isSeedingDemo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-label-md text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50"
                title="Seeds 4 Karigars, 6 Orders, Disputed Settlement & Trust Scores"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isSeedingDemo ? 'animate-spin' : 'text-amber-200'}`} />
                <span>{isSeedingDemo ? t('demo.loadingBazaar') : t('demo.loadBazaar')}</span>
              </button>
            )}

            {/* Simulated Offline Mode Toggle */}
            <button
              id="btn-toggle-offline-sim"
              onClick={handleToggleOffline}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-label-md font-bold transition-all shadow-xs border ${
                isSimulatedOffline
                  ? 'bg-error-container text-on-error-container border-error/50 animate-pulse'
                  : 'bg-surface-container-high text-on-surface border-outline-variant/30 hover:bg-surface-container-highest'
              }`}
              title="Toggle Simulated Offline Mode"
            >
              {isSimulatedOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-error" />
                  <span>{t('status.simOffline')}</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#477b55]" />
                  <span>{t('status.simulateOffline')}</span>
                </>
              )}
            </button>

            {/* Online / Offline Sync Badge */}
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-label-md font-bold transition-all shadow-xs ${
                isOnline
                  ? offlineQueueCount > 0
                    ? 'bg-secondary-container text-on-secondary-container animate-pulse'
                    : 'bg-surface-container-high text-on-surface'
                  : 'bg-error-container text-on-error-container'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#477b55]" />
                  <span>
                    {offlineQueueCount > 0 ? t('status.offlineQueued', { count: offlineQueueCount }) : t('status.onlineSynced')}
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-error" />
                  <span>{t('status.offlineMode', { count: offlineQueueCount })}</span>
                </>
              )}
            </button>

            {/* Live 24K Bullion Rate Pill - Editable by Jeweller */}
            <div
              onClick={() => {
                if (user?.role === 'JEWELLER') {
                  setIsRateModalOpen(true);
                }
              }}
              className={`hidden sm:flex bg-surface-container-high px-2.5 py-1 rounded-xl shadow-xs flex-col items-end transition-all ${
                user?.role === 'JEWELLER'
                  ? 'cursor-pointer hover:bg-surface-container-highest hover:ring-1 hover:ring-primary/40'
                  : ''
              }`}
              title={
                user?.role === 'JEWELLER'
                  ? `${t('common.edit')}: ${t('common.ratePerGram')}`
                  : t('common.ratePerGram')
              }
            >
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold text-primary uppercase">{t('common.ratePerGram')}</span>
                {user?.role === 'JEWELLER' && (
                  <span className="text-[8px] bg-primary/20 text-primary px-1 rounded font-bold">{t('common.edit')}</span>
                )}
              </div>
              <span className="font-label-md text-xs font-extrabold text-on-surface tabular-nums">
                ₹ {liveRate.toLocaleString('en-IN')}/g
              </span>
            </div>

            {/* In-App Notification Bell */}
            <NotificationBell />

            {/* REAL AUTH ROLE LOGIN TOGGLE */}
            <div className="flex items-center bg-surface-container-low rounded-xl p-1 border border-outline-variant/40 shadow-xs">
              <button
                onClick={() => {
                  if (user?.role !== 'JEWELLER') {
                    openLoginModal('JEWELLER');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-label-md font-bold transition-all flex items-center gap-1 ${
                  user?.role === 'JEWELLER'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Log in as Jeweller"
              >
                <span>{t('roles.jeweller')}</span>
                {user?.role === 'JEWELLER' && <CheckCircle2 className="w-3 h-3 text-primary-container" />}
              </button>
              <button
                onClick={() => {
                  if (user?.role !== 'KARIGAR') {
                    openLoginModal('KARIGAR');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-label-md font-bold transition-all flex items-center gap-1 ${
                  user?.role === 'KARIGAR'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Log in as Karigar"
              >
                <span>{t('roles.karigar')}</span>
                {user?.role === 'KARIGAR' && <CheckCircle2 className="w-3 h-3 text-secondary-container" />}
              </button>
              <button
                onClick={() => {
                  if (user?.role !== 'MEDIATOR') {
                    switchUser('MEDIATOR');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-label-md font-bold transition-all flex items-center gap-1 ${
                  user?.role === 'MEDIATOR'
                    ? 'bg-purple-800 text-purple-100 shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Log in as Trade Mediator"
              >
                <span>{t('roles.mediator')}</span>
                {user?.role === 'MEDIATOR' && <CheckCircle2 className="w-3 h-3 text-purple-300" />}
              </button>
            </div>

            {/* Language Switcher [EN | HI | KN] */}
            <LanguageSwitcher />

            {/* Account Profile & Logout button */}
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => openLoginModal(user?.role)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-xs font-label-md font-bold text-on-surface flex items-center gap-1.5 border border-outline-variant/30"
              >
                <User className="w-3.5 h-3.5 text-primary" />
                <span className="max-w-[120px] truncate">{user?.name?.split(' ')[0] || t('roles.login')}</span>
              </button>

              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors"
                title={t('roles.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Auspicious Greeting / Persona Context Bar */}
        <div className="bg-surface-container-low border-t border-outline-variant/20 py-2 px-4">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-on-surface flex items-center gap-1">
                <span>{t('roles.authenticatedAs')}</span>
                <span className="text-primary underline font-extrabold">{currentParty.name}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    isKarigarRole
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-primary-container text-on-primary-container'
                  }`}
                >
                  {currentParty.role}
                </span>
              </span>
              <span>•</span>
              <span className="text-on-surface-variant">{currentParty.businessName}</span>
              <button
                onClick={() => openLoginModal(user?.role)}
                className="text-[11px] text-primary hover:underline font-bold ml-1"
              >
                ({t('roles.switchPersona')})
              </button>
            </div>

            <div className="flex items-center gap-3 text-on-surface-variant">
              <span>卐 {t('header.shubhLaabh')}</span>
              <span>•</span>
              <span>{t('header.hallmarkStandard')}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('LEDGER')}
            className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'LEDGER'
                ? 'bg-inverse-surface text-inverse-on-surface shadow-md'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>{t('nav.passbook')}</span>
          </button>

          {!isKarigarRole && (
            <button
              onClick={() => setActiveTab('ISSUE')}
              className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'ISSUE'
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('nav.issueGold')}</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('RETURN')}
            className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'RETURN'
                ? 'bg-secondary text-on-secondary shadow-md'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <CornerDownLeft className="w-4 h-4" />
            <span>{t('nav.returnGold')}</span>
          </button>

          <button
            onClick={() => setActiveTab('WASTAGE')}
            className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'WASTAGE'
                ? 'bg-inverse-surface text-inverse-on-surface shadow-md'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>{t('nav.wastageAgreement')}</span>
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'ORDERS'
                ? 'bg-primary text-on-primary shadow-md'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <Calendar className="w-4 h-4 text-primary" />
            <span>{t('nav.occasionOrders')}</span>
          </button>

          <button
            onClick={() => setActiveTab('SETTLEMENTS')}
            className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'SETTLEMENTS'
                ? 'bg-amber-900 text-amber-50 shadow-md'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <Receipt className="w-4 h-4 text-amber-500" />
            <span>{t('nav.settlements')}</span>
          </button>

          {!isKarigarRole && (
            <button
              onClick={() => setActiveTab('TRUST')}
              className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'TRUST'
                  ? 'bg-emerald-950 text-emerald-100 shadow-md'
                  : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
              }`}
            >
              <Award className="w-4 h-4 text-amber-500" />
              <span>{t('nav.artisanTrust')}</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('DISPUTES')}
            className={`h-11 px-4 rounded-xl font-label-md text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'DISPUTES'
                ? 'bg-rose-900 text-rose-50 shadow-md'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <AlertOctagon className="w-4 h-4 text-rose-500" />
            <span>{t('nav.disputeCenter')}</span>
          </button>

          <button
            onClick={() => setActiveTab('OFFLINE')}
            className={`h-11 px-3 rounded-xl font-label-md text-sm font-bold flex items-center gap-1.5 transition-all shrink-0 ml-auto ${
              activeTab === 'OFFLINE'
                ? 'bg-secondary-container text-on-secondary-container shadow-xs'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>{t('nav.offlineSync')} ({offlineQueueCount})</span>
          </button>
        </div>

        {/* Tab 1: Ledger Overview & Balance */}
        {activeTab === 'LEDGER' && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            {/* Real-Time Balance Card */}
            <BalanceCard
              karigarId={selectedKarigarId}
              karigars={karigars}
              onOpenIssueModal={() => setActiveTab('ISSUE')}
              onOpenReturnModal={() => setActiveTab('RETURN')}
              onOpenPassport={() => setPassportModalKarigarId(selectedKarigarId)}
            />

            {/* Per-Karigar Wastage Analytics & WMA History Chart (Prominent on Artisan View) */}
            <div className="pt-1">
              <WastageHistoryChart
                karigarId={selectedKarigarId}
                karigarName={selectedKarigar.name}
                isArtisanView={isKarigarRole}
              />
            </div>

            {/* Paginated Filterable Ledger Blockchain Explorer */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <h3 className="font-headline-sm text-lg font-bold text-on-surface">
                    {isKarigarRole ? 'My Personal Passbook Entries' : 'Passbook Entries & Workshop Audit Trail'}
                  </h3>
                  <p className="font-label-vernacular text-xs text-on-surface-variant">
                    {isKarigarRole
                      ? 'Personal Ledger • Enforced Data Ownership'
                      : 'Cryptographically Verified Blocks • Audit Trail'}
                  </p>
                </div>
              </div>

              <LedgerView
                karigars={karigars}
                currentParty={currentParty}
                selectedKarigarId={selectedKarigarId}
                onSelectKarigar={!isKarigarRole ? (id) => setSelectedKarigarId(id) : undefined}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Issue Gold Form (Jewellers Only) */}
        {activeTab === 'ISSUE' && !isKarigarRole && (
          <div className="max-w-2xl mx-auto bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/30 animate-in fade-in-50 duration-200">
            <div className="mb-4 pb-3 border-b border-outline-variant/30 flex items-center justify-between">
              <div>
                <h2 className="font-headline-md text-xl font-bold text-on-surface">Issue Gold Voucher</h2>
                <p className="font-label-vernacular text-xs text-primary font-bold">
                  {t('nav.issueGold')}
                </p>
              </div>
              <span className="font-label-sm text-xs bg-primary-fixed text-on-primary-fixed px-2.5 py-1 rounded-full font-bold">
                Dual Sign Step 1 of 2
              </span>
            </div>

            <GoldIssueForm
              jeweller={currentJeweller}
              karigars={karigars}
              selectedKarigarId={selectedKarigarId}
              onSuccess={() => setActiveTab('LEDGER')}
              onCancel={() => setActiveTab('LEDGER')}
            />
          </div>
        )}

        {/* Tab 3: Return Gold Form */}
        {activeTab === 'RETURN' && (
          <div className="max-w-2xl mx-auto bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/30 animate-in fade-in-50 duration-200">
            <div className="mb-4 pb-3 border-b border-outline-variant/30 flex items-center justify-between">
              <div>
                <h2 className="font-headline-md text-xl font-bold text-on-surface">Return Finished Gold</h2>
                <p className="font-label-vernacular text-xs text-secondary font-bold">
                  {t('nav.returnGold')}
                </p>
              </div>
              <span className="font-label-sm text-xs bg-secondary-fixed text-on-secondary-fixed px-2.5 py-1 rounded-full font-bold">
                Wastage Settlement
              </span>
            </div>

            <GoldReturnForm
              jeweller={currentJeweller}
              karigar={selectedKarigar}
              onSuccess={() => setActiveTab('LEDGER')}
              onCancel={() => setActiveTab('LEDGER')}
            />
          </div>
        )}

        {/* Tab: Smart Wastage Agreement Engine */}
        {activeTab === 'WASTAGE' && (
          <div className="animate-in fade-in-50 duration-200">
            <WastageAgreementPanel
              karigars={karigars}
              jewellers={jewellers}
              selectedKarigarId={selectedKarigarId}
              onAgreementSelected={(agreement) => {
                setActiveTab('RETURN');
              }}
            />
          </div>
        )}

        {/* Tab: Occasion Orders & CPM Milestones */}
        {activeTab === 'ORDERS' && (
          <div className="animate-in fade-in-50 duration-200">
            <OrderManagementPanel
              karigars={karigars}
              onOrderSelectedForIssue={() => setActiveTab('ISSUE')}
            />
          </div>
        )}

        {/* Tab: Job-Work Settlements & Dual Approval */}
        {activeTab === 'SETTLEMENTS' && (
          <div className="animate-in fade-in-50 duration-200">
            <SettlementPanel
              karigars={karigars}
              selectedKarigarId={selectedKarigarId}
              onSelectKarigar={(id) => setSelectedKarigarId(id)}
            />
          </div>
        )}

        {/* Tab: Artisan Trust Decision Directory */}
        {activeTab === 'TRUST' && (
          <div className="animate-in fade-in-50 duration-200">
            <KarigarTrustDirectory
              karigars={karigars}
              currentParty={currentParty}
              onSelectKarigarForJob={(id) => {
                setSelectedKarigarId(id);
                setActiveTab('ISSUE');
              }}
              onOpenPassportModal={(id) => setPassportModalKarigarId(id)}
            />
          </div>
        )}

        {/* Tab: Dispute Management & Arbitration Docket */}
        {activeTab === 'DISPUTES' && (
          <div className="animate-in fade-in-50 duration-200">
            <DisputeManagementPanel currentParty={currentParty} />
          </div>
        )}

        {/* Tab 4: Offline Sync Center & Conflict Resolution */}
        {activeTab === 'OFFLINE' && (
          <div className="max-w-3xl mx-auto bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/30 space-y-5 animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
              <div>
                <h2 className="font-headline-md text-xl font-bold text-on-surface">Offline Queue & Sync Engine</h2>
                <p className="font-label-vernacular text-xs text-on-surface-variant">
                  Local Offline Queue • Last-Write-Wins Conflict Resolution
                </p>
              </div>

              <button
                onClick={handleManualSync}
                disabled={isSyncing || offlineQueueCount === 0}
                className="h-10 px-4 bg-primary text-on-primary font-label-md text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync Now ({offlineQueueCount})</span>
              </button>
            </div>

            {offlineQueueCount === 0 ? (
              <div className="p-8 text-center text-on-surface-variant bg-surface-container-low rounded-xl">
                <CheckCircle2 className="w-10 h-10 text-[#477b55] mx-auto mb-2" />
                <h3 className="font-headline-sm text-base font-bold text-on-surface">All Transactions Synchronized</h3>
                <p className="text-xs mt-1">There are no pending offline transactions in your local browser storage.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {offlineQueue.getQueue().map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/40 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-primary">{item.endpoint}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          item.status === 'RESOLVED_CONFLICT'
                            ? 'bg-secondary-container text-on-secondary-container'
                            : item.status === 'FAILED'
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container-high text-on-surface'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="text-xs text-on-surface font-mono">
                      <span>Payload Weight: </span>
                      <strong>{(item.payload as any).weight_grams}g</strong> •{' '}
                      <span>Purity: </span>
                      <strong>{(item.payload as any).purity_karat}K</strong>
                    </div>

                    {item.lastError && (
                      <p className="text-xs text-[#b34b40] bg-[#fdf2f2] p-2 rounded-lg font-medium">
                        {item.lastError}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-1 border-t border-outline-variant/20">
                      <span>Queued: {new Date(item.createdAt).toLocaleTimeString()}</span>
                      <button
                        onClick={() => {
                          offlineQueue.dequeue(item.id);
                          setOfflineQueueCount(offlineQueue.getQueue().length);
                        }}
                        className="text-error hover:underline font-bold"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Login Modal */}
      {isLoginModalOpen && <LoginModal onClose={closeLoginModal} defaultRole={user?.role} />}

      {/* Edit Bullion Gold Rate Modal (Jeweller Only) */}
      {isRateModalOpen && (
        <EditGoldRateModal
          isOpen={isRateModalOpen}
          onClose={() => setIsRateModalOpen(false)}
          currentRate={liveRate}
        />
      )}

      {/* Shareable Public Artisan Passport Modal */}
      {passportModalKarigarId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <KarigarPassportView
              karigarId={passportModalKarigarId}
              isModal
              onClose={() => setPassportModalKarigarId(null)}
            />
          </div>
        </div>
      )}

      {/* Demo Walkthrough Checklist Panel */}
      <DemoWalkthroughChecklist
        activeTab={activeTab}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onSwitchUser={(role, karigarId) => {
          switchUser(role);
          if (karigarId) {
            setSelectedKarigarId(karigarId);
          }
        }}
        onLoadDemoBazaar={handleLoadDemoBazaar}
        isSeeding={isSeedingDemo}
        isSimulatedOffline={isSimulatedOffline}
        onToggleOffline={handleToggleOffline}
        offlineQueueCount={offlineQueueCount}
      />

      {/* Footer */}
      <footer className="mt-auto py-6 border-t border-outline-variant/20 bg-surface-container-low text-center text-xs text-on-surface-variant">
        <p className="font-label-md font-semibold text-on-surface">
          GoldStack Jewellery Management Platform • Koshish Heritage Immutable Ledger
        </p>
        <p className="text-[11px] text-on-surface-variant mt-1">
          Cryptographically chained with SHA-256 • Perceptual dHash Evidence • Dual Digital Signatures
        </p>
      </footer>
    </div>
  );
};
