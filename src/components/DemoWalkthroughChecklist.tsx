import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Wifi,
  WifiOff,
  Scale,
  Calendar,
  AlertTriangle,
  Receipt,
  Award,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { offlineQueue } from '../offline/offlineQueue.js';
import { useToast } from './Toast.js';
import { useTranslation } from '../i18n/LanguageContext.js';

export interface DemoStep {
  id: string;
  number: number;
  stepKey: string;
  icon: any;
  targetTab: 'LEDGER' | 'ISSUE' | 'RETURN' | 'WASTAGE' | 'ORDERS' | 'SETTLEMENTS' | 'TRUST' | 'DISPUTES' | 'OFFLINE';
  targetRole?: 'JEWELLER' | 'KARIGAR' | 'MEDIATOR';
  targetKarigarId?: string;
}

interface DemoWalkthroughChecklistProps {
  activeTab: string;
  onNavigateTab: (tab: any) => void;
  onSwitchUser?: (role: 'JEWELLER' | 'KARIGAR' | 'MEDIATOR', userId?: string) => void;
  onLoadDemoBazaar: () => Promise<void>;
  isSeeding: boolean;
  isSimulatedOffline: boolean;
  onToggleOffline: () => void;
  offlineQueueCount: number;
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 'step-issue',
    number: 1,
    stepKey: 'step1',
    icon: Scale,
    targetTab: 'ISSUE',
    targetRole: 'JEWELLER'
  },
  {
    id: 'step-confirm',
    number: 2,
    stepKey: 'step2',
    icon: CheckCircle2,
    targetTab: 'LEDGER',
    targetRole: 'KARIGAR',
    targetKarigarId: '22222222-2222-2222-2222-222222222222'
  },
  {
    id: 'step-cpm',
    number: 3,
    stepKey: 'step3',
    icon: Calendar,
    targetTab: 'ORDERS',
    targetRole: 'JEWELLER'
  },
  {
    id: 'step-wastage',
    number: 4,
    stepKey: 'step4',
    icon: AlertTriangle,
    targetTab: 'WASTAGE',
    targetRole: 'JEWELLER'
  },
  {
    id: 'step-settlement',
    number: 5,
    stepKey: 'step5',
    icon: Receipt,
    targetTab: 'SETTLEMENTS',
    targetRole: 'JEWELLER'
  },
  {
    id: 'step-dispute',
    number: 6,
    stepKey: 'step6',
    icon: ShieldAlert,
    targetTab: 'DISPUTES',
    targetRole: 'JEWELLER'
  },
  {
    id: 'step-resolution',
    number: 7,
    stepKey: 'step7',
    icon: Award,
    targetTab: 'DISPUTES',
    targetRole: 'MEDIATOR'
  },
  {
    id: 'step-trust',
    number: 8,
    stepKey: 'step8',
    icon: Sparkles,
    targetTab: 'TRUST',
    targetRole: 'JEWELLER'
  }
];

const STORAGE_KEY = 'goldstack_demo_checklist_v1';

export const DemoWalkthroughChecklist: React.FC<DemoWalkthroughChecklistProps> = ({
  activeTab,
  onNavigateTab,
  onSwitchUser,
  onLoadDemoBazaar,
  isSeeding,
  isSimulatedOffline,
  onToggleOffline,
  offlineQueueCount
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCompletedSteps(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleStepCompleted = (stepId: string) => {
    setCompletedSteps((prev) => {
      const next = { ...prev, [stepId]: !prev[stepId] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleResetChecklist = () => {
    setCompletedSteps({});
    localStorage.removeItem(STORAGE_KEY);
    toast.info('Checklist Reset', 'All walkthrough steps have been reset.');
  };

  const handleStepAction = (step: DemoStep) => {
    if (step.targetRole && onSwitchUser) {
      onSwitchUser(step.targetRole, step.targetKarigarId);
    }
    onNavigateTab(step.targetTab);
    // Auto-mark as completed
    if (!completedSteps[step.id]) {
      toggleStepCompleted(step.id);
    }
    const stepTitle = t(`demo.${step.stepKey}Title`);
    toast.info(
      `Step ${step.number}: ${stepTitle}`,
      `Switched to ${step.targetRole || 'view'} • Tab: ${step.targetTab}`
    );
  };

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const progressPct = Math.round((completedCount / DEMO_STEPS.length) * 100);

  // If dismissed, render a floating shortcut pill to reopen
  if (isDismissed) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsDismissed(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-primary text-on-primary font-label-md text-xs font-bold shadow-xl hover:bg-primary/90 transition-all cursor-pointer ring-2 ring-primary-container"
          title={t('demo.walkthroughTitle')}
        >
          <Sparkles className="w-4 h-4 text-primary-container" />
          <span>{t('demo.demoGuide')} ({completedCount}/{DEMO_STEPS.length})</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 w-full max-w-sm sm:max-w-md bg-surface-container-high border-2 border-primary/40 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl ${
        isMinimized ? 'h-auto' : 'max-h-[85vh] flex flex-col'
      }`}
    >
      {/* Header Bar */}
      <div className="bg-primary px-4 py-3 text-on-primary flex items-center justify-between shadow-xs select-none">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-on-primary/10 flex items-center justify-center font-bold text-xs">
            {completedCount}/{DEMO_STEPS.length}
          </div>
          <div>
            <h4 className="font-headline-sm text-sm font-extrabold flex items-center gap-1.5 leading-tight">
              <span>{t('demo.walkthroughTitle')}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-primary-container text-on-primary-container rounded-full font-bold">
                {progressPct}%
              </span>
            </h4>
            <p className="font-label-vernacular text-[11px] text-primary-container leading-none mt-0.5">
              {t('demo.pitchGuideTitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded-md text-on-primary/80 hover:text-on-primary hover:bg-on-primary/10 transition-colors"
            title={isMinimized ? 'Expand Checklist' : 'Minimize Checklist'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md text-on-primary/80 hover:text-on-primary hover:bg-on-primary/10 transition-colors"
            title="Dismiss Checklist"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-surface-container-highest h-1.5 overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {!isMinimized && (
        <>
          {/* Quick Action Toolbar: Load Demo Bazaar + Toggle Offline */}
          <div className="p-3 bg-surface-container-low border-b border-outline-variant/30 flex flex-wrap items-center gap-2 justify-between">
            <button
              onClick={onLoadDemoBazaar}
              disabled={isSeeding}
              className="flex-1 min-w-[140px] px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-label-md font-bold flex items-center justify-center gap-1.5 shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-all"
              title="Seeds 4 Karigars, 6 Orders, Disputed Settlement & Trust Scores"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : 'text-primary-container'}`} />
              <span>{isSeeding ? t('demo.loadingBazaar') : t('demo.loadBazaar')}</span>
            </button>

            <button
              onClick={onToggleOffline}
              className={`px-3 py-1.5 rounded-xl text-xs font-label-md font-bold flex items-center gap-1.5 transition-all shadow-xs border ${
                isSimulatedOffline
                  ? 'bg-error-container text-on-error-container border-error/40'
                  : 'bg-surface-container-high text-on-surface border-outline-variant/40 hover:bg-surface-container-highest'
              }`}
              title="Toggle Simulated Offline Mode"
            >
              {isSimulatedOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-error" />
                  <span>{t('status.simOffline')} ({offlineQueueCount})</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-success" />
                  <span>{t('demo.goOffline')}</span>
                </>
              )}
            </button>

            <button
              onClick={handleResetChecklist}
              className="p-1.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              title={t('demo.resetChecklist')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Steps List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[50vh]">
            {DEMO_STEPS.map((step) => {
              const isDone = !!completedSteps[step.id];
              const StepIcon = step.icon;
              const isCurrent = activeTab === step.targetTab;

              return (
                <div
                  key={step.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isDone
                      ? 'bg-surface-container-lowest/70 border-outline-variant/20 opacity-90'
                      : isCurrent
                      ? 'bg-primary-container/15 border-primary/50 shadow-xs'
                      : 'bg-surface-container-lowest border-outline-variant/30 hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Toggle Completion */}
                    <button
                      onClick={() => toggleStepCompleted(step.id)}
                      className="mt-0.5 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                      title={isDone ? 'Mark Incomplete' : 'Mark Completed'}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-primary fill-primary-container" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>

                    {/* Step Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`font-label-md text-xs font-bold leading-tight ${
                            isDone ? 'line-through text-on-surface-variant' : 'text-on-surface'
                          }`}
                        >
                          {step.number}. {t(`demo.${step.stepKey}Title`)}
                        </span>
                      </div>

                      <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                        {t(`demo.${step.stepKey}Desc`)}
                      </p>

                      {/* Jump Action Button */}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleStepAction(step)}
                          className="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface text-[11px] font-bold font-label-md flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>{t(`demo.${step.stepKey}Action`)}</span>
                        </button>

                        {step.targetRole && (
                          <span className="text-[10px] font-mono text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container-high">
                            as {step.targetRole}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2 bg-surface-container-lowest border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>Click any step to switch view & role</span>
            <span className="font-bold text-primary">8-Step Demo Path</span>
          </div>
        </>
      )}
    </div>
  );
};

