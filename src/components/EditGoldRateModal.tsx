import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, TrendingUp, Sparkles, Check, Clock, History } from 'lucide-react';
import { GoldRate } from '../../shared/types.js';
import { useToast } from './Toast.js';

interface EditGoldRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRate: number;
}

export const EditGoldRateModal: React.FC<EditGoldRateModalProps> = ({
  isOpen,
  onClose,
  currentRate
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [rateInput, setRateInput] = useState<number>(currentRate);
  const [effectiveDate, setEffectiveDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Fetch Historical Rates
  const { data: historyRes, isLoading: isHistoryLoading } = useQuery<{ success: boolean; data: GoldRate[] }>({
    queryKey: ['goldRatesHistory'],
    queryFn: async () => {
      const res = await fetch('/api/rates/history');
      if (!res.ok) throw new Error('Failed to fetch rate history');
      return res.json();
    },
    enabled: isOpen
  });

  const rateHistory = historyRes?.data || [];

  const updateRateMutation = useMutation({
    mutationFn: async ({ rate, date }: { rate: number; date?: string }) => {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rate_per_gram_24k: rate, effective_date: date })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update gold rate');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bullionRateCurrent'] });
      queryClient.invalidateQueries({ queryKey: ['goldRatesHistory'] });
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('दर अद्यतित (Bullion Rate Updated)', data.message);
      onClose();
    },
    onError: (err: any) => {
      toast.error('दर अद्यतन त्रुटि (Update Failed)', err.message);
    }
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateInput || rateInput <= 0) {
      toast.warning('अमान्य दर', 'कृपया वैध 24K सोने की दर प्रविष्ट करें');
      return;
    }
    updateRateMutation.mutate({ rate: Number(rateInput), date: effectiveDate });
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full border border-stone-300 shadow-2xl overflow-hidden my-8 animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-brand text-white flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-light" />
              <span>24K बुलियन स्वर्ण दर (Update Bullion Rate)</span>
            </h3>
            <p className="text-xs text-white/80 mt-0.5">
              शो-रूम दैनिक 24K बुलियन भाव अद्यतन करें एवं इतिहास सुरक्षित रखें
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Update Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1">
              नई 24K सोने की दर (Rate per gram 24K) [₹/g] *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-stone-500 text-sm">
                ₹
              </span>
              <input
                type="number"
                step="0.5"
                min="1000"
                max="20000"
                required
                value={rateInput}
                onChange={(e) => setRateInput(parseFloat(e.target.value) || 0)}
                className="w-full text-base font-extrabold pl-8 pr-3 py-2 border border-stone-300 rounded-lg bg-stone-50 text-stone-900 focus:bg-white focus:outline-amber-600 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1">
              प्रभावी तिथि (Effective Date) *
            </label>
            <input
              type="date"
              required
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg bg-stone-50 text-stone-900"
            />
          </div>

          <div className="bg-warn-bg border border-warn/30 rounded-xl p-3 text-xs text-ink">
            <p className="font-semibold flex items-center gap-1.5 text-warn">
              <TrendingUp className="w-4 h-4 text-warn" />
              <span>दर स्नैपशॉट नियम (Settlement Snapshot Rule):</span>
            </p>
            <p className="text-[11px] text-muted mt-1">
              यह दर नए बनने वाले सभी हिसाबों में स्वचालित रूप से स्नैपशॉट होगी। पुराने चुकता हिसाब अपरिवर्तित रहेंगे।
            </p>
          </div>

          {/* Rate History Drawer */}
          <div className="pt-2 border-t border-border">
            <span className="font-bold text-xs text-ink flex items-center gap-1.5 mb-2">
              <History className="w-3.5 h-3.5 text-muted" />
              <span>हालिया दर इतिहास (Rate History):</span>
            </span>

            {isHistoryLoading ? (
              <p className="text-xs text-muted italic">लोड हो रहा है...</p>
            ) : rateHistory.length === 0 ? (
              <p className="text-xs text-muted italic">कोई पिछला इतिहास नहीं मिला</p>
            ) : (
              <div className="max-h-36 overflow-y-auto divide-y divide-border border border-border rounded-lg bg-chip">
                {rateHistory.slice(0, 5).map((r) => (
                  <div key={r.id} className="p-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-muted font-mono">{r.effective_date}</span>
                    <span className="font-bold font-mono text-ink">
                      ₹ {r.rate_per_gram_24k.toLocaleString('en-IN')}/g
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-muted hover:bg-chip border border-border rounded-lg"
            >
              रद्द करें (Cancel)
            </button>
            <button
              type="submit"
              disabled={updateRateMutation.isPending}
              className="px-4 py-1.5 text-xs font-bold text-white bg-brand hover:bg-brand-light rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{updateRateMutation.isPending ? 'सहेज रहे हैं...' : 'दर अद्यतित करें (Save Rate)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

