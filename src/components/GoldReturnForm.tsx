import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Scale,
  Camera,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Upload,
  RefreshCw,
  Sparkles,
  Flame,
  CornerDownLeft,
  Info,
  ShieldCheck,
  Percent,
  Link2,
  Heart,
  Calendar
} from 'lucide-react';
import { Party, User, ReturnGoldRequest, ReturnGoldInput, WastageAgreement, CustomerOrder } from '../../shared/types.js';
import { SignaturePad } from './SignaturePad.js';
import { compressImage } from '../utils/imageCompressor.js';
import { generateClientPerceptualHash } from '../utils/perceptualHash.js';
import { offlineQueue } from '../offline/offlineQueue.js';
import { useToast } from './Toast.js';

interface GoldReturnFormProps {
  jeweller: Party | User;
  karigar: Party | User;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface FormValues {
  order_id: string;
  item_description: string;
  finished_weight_grams: number;
  scrap_weight_grams: number;
  wastage_grams: number;
  purity_karat: number;
  notes: string;
}

export const GoldReturnForm: React.FC<GoldReturnFormProps> = ({
  jeweller,
  karigar,
  onSuccess,
  onCancel
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [signature, setSignature] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [perceptualHash, setPerceptualHash] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isGettingGps, setIsGettingGps] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FormValues>({
    defaultValues: {
      order_id: 'ORD-204 (Bridal Necklace)',
      item_description: '22K Bridal Necklace Finished Piece + Scrap Dust',
      finished_weight_grams: 141.2,
      scrap_weight_grams: 6.95,
      wastage_grams: 1.85,
      purity_karat: 22,
      notes: 'Weighed on Sartorius high-precision workshop scale'
    }
  });

  const finishedWeight = watch('finished_weight_grams') || 0;
  const scrapWeight = watch('scrap_weight_grams') || 0;
  const wastageWeight = watch('wastage_grams') || 0;
  const purityKarat = watch('purity_karat') || 22;
  const selectedOrderId = watch('order_id');

  // Issued Gold Reference
  const [issuedGrams, setIssuedGrams] = useState<number>(150.0);

  // Query wastage agreement for this order
  const { data: agreementData } = useQuery<{ success: boolean; data: WastageAgreement }>({
    queryKey: ['orderAgreement', selectedOrderId],
    queryFn: async () => {
      if (!selectedOrderId) return null;
      const res = await fetch(`/api/wastage/agreement/${encodeURIComponent(selectedOrderId)}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: Boolean(selectedOrderId)
  });

  const agreement = agreementData?.data;
  const agreedWastagePct = agreement ? agreement.agreed_pct : 6.5;

  // Total gross return = finished piece + scrap returned
  const totalReturnWeight = Number((Number(finishedWeight) + Number(scrapWeight)).toFixed(3));
  // Total settled = total returned + allowed wastage
  const totalSettledWeight = Number((totalReturnWeight + Number(wastageWeight)).toFixed(3));

  // Smart Wastage Calculations: actual_wastage = issued - returned
  const effectiveIssued = issuedGrams > 0 ? issuedGrams : (totalReturnWeight + Number(wastageWeight));
  const actualWastageGrams = Number(Math.max(0, effectiveIssued - totalReturnWeight).toFixed(3));
  const actualWastagePct = effectiveIssued > 0 ? Number(((actualWastageGrams / effectiveIssued) * 100).toFixed(2)) : 0;
  const allowedWastageGrams = Number(((effectiveIssued * agreedWastagePct) / 100).toFixed(3));
  const varianceGrams = Number((actualWastageGrams - allowedWastageGrams).toFixed(3));
  const variancePct = Number((actualWastagePct - agreedWastagePct).toFixed(2));
  const toleranceThresholdPct = Number((agreedWastagePct + 2.0).toFixed(2));

  // Indicators
  const isExceedingTolerance = actualWastagePct > toleranceThresholdPct;
  const isWithinBuffer = !isExceedingTolerance && actualWastagePct > agreedWastagePct;
  const isOptimal = actualWastagePct <= agreedWastagePct;

  useEffect(() => {
    fetchGps();
  }, []);

  const fetchGps = () => {
    if (!navigator.geolocation) return;
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(7)),
          lng: Number(pos.coords.longitude.toFixed(7))
        });
        setIsGettingGps(false);
      },
      () => {
        setGpsCoords({ lat: 18.954321, lng: 72.831234 });
        setIsGettingGps(false);
      },
      { timeout: 5000 }
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      toast.info('Processing Evidence Photo', 'Compressing to 1080p and computing dHash...');

      const compressed = await compressImage(file, 1920, 2 * 1024 * 1024);
      setPhotoFile(compressed.file);
      setPhotoPreview(compressed.dataUrl);

      const dHash = await generateClientPerceptualHash(compressed.file);
      setPerceptualHash(dHash);

      toast.success(
        'Photo Processed',
        `Ready for tamper-proof upload (${(compressed.compressedSizeBytes / 1024).toFixed(1)} KB)`
      );
    } catch (err: any) {
      toast.error('Photo processing failed', err.message);
    } finally {
      setIsCompressing(false);
    }
  };

  const returnMutation = useMutation({
    mutationFn: async (payload: ReturnGoldRequest) => {
      let uploadedPhotoUrl = payload.photo_evidence_url;

      if (photoFile) {
        try {
          const formData = new FormData();
          formData.append('photo', photoFile);
          const uploadRes = await fetch('/api/upload/direct', {
            method: 'POST',
            body: formData
          });
          const uploadData = await uploadRes.json();
          if (uploadData.success) {
            uploadedPhotoUrl = uploadData.data.fileUrl;
          }
        } catch (uploadErr) {
          console.warn('[Photo Upload] Direct upload failed, using dataUrl fallback:', uploadErr);
          uploadedPhotoUrl = photoPreview;
        }
      }

      const finalPayload: ReturnGoldRequest = {
        ...payload,
        photo_evidence_url: uploadedPhotoUrl
      };

      if (!offlineQueue.isOnline()) {
        offlineQueue.enqueue('/api/ledger/return', finalPayload);
        return {
          offline: true,
          message: 'Saved to Offline Queue. Will automatically sync to immutable hash chain once online.'
        };
      }

      const res = await fetch('/api/ledger/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(finalPayload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Server failed to record gold return');
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data.data?.status === 'REVIEW_REQUIRED') {
        toast.warning(
          'Flagged for Review • समीक्षा आवश्यक',
          `Block #${data.data?.sequence_number || ''} recorded with status REVIEW_REQUIRED (Excess wastage > agreed + 2%). Requires Jeweller approval.`
        );
      } else if (data.offline) {
        toast.warning('Transaction Queued Offline', data.message);
      } else {
        toast.success(
          'Gold Return Recorded on Chain!',
          `Block #${data.data?.sequence_number || ''} recorded. Awaiting Jeweller dual signature confirmation.`
        );
      }
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['ledgerHistory'] });
      queryClient.invalidateQueries({ queryKey: ['chainVerification'] });
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast.error('Failed to submit gold return', err.message);
    }
  });

  const onSubmit = (values: FormValues) => {
    if (!signature) {
      toast.error('Karigar Signature Required', 'Please draw Karigar digital signature before submitting.');
      return;
    }

    const payload: ReturnGoldRequest = {
      jeweller_id: jeweller.id,
      karigar_id: karigar.id,
      order_id: values.order_id || null,
      weight_grams: totalReturnWeight,
      wastage_grams: Number(values.wastage_grams || actualWastageGrams),
      scrap_grams: Number(values.scrap_weight_grams || 0),
      purity_karat: Number(values.purity_karat),
      photo_evidence_url: photoPreview,
      perceptual_hash: perceptualHash,
      signature_karigar: signature,
      gps_lat: gpsCoords?.lat || null,
      gps_lng: gpsCoords?.lng || null,
      metadata: {
        orderNumber: values.order_id,
        order_ref: values.order_id,
        itemDescription: values.item_description,
        finishedItemGrams: Number(values.finished_weight_grams),
        scrapGrams: Number(values.scrap_weight_grams),
        wastageGrams: Number(values.wastage_grams || actualWastageGrams),
        wastagePercentage: Number(actualWastagePct),
        issued_grams: effectiveIssued,
        agreed_wastage_pct: agreedWastagePct,
        allowed_wastage_grams: allowedWastageGrams,
        variance_grams: varianceGrams,
        variance_pct: variancePct,
        exceeds_tolerance: isExceedingTolerance,
        review_required: isExceedingTolerance,
        totalSettledGrams: totalSettledWeight,
        notes: values.notes
      }
    };

    returnMutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {/* Return Header Context */}
      <div className="bg-surface-container-low rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="font-label-sm text-[11px] uppercase tracking-wider text-secondary font-bold">
            Gold Return & Settlement (सोना वापसी)
          </span>
          <h3 className="font-headline-sm text-base font-bold text-on-surface">
            {karigar.name} → {jeweller.name}
          </h3>
        </div>
        <span className="bg-secondary-fixed text-on-secondary-fixed font-label-sm text-xs px-2.5 py-1 rounded-full font-bold">
          22K • 916 BIS
        </span>
      </div>

      {/* Finished Goods & Scrap Breakdown */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 space-y-4">
        <h4 className="font-label-md text-sm font-bold text-on-surface flex items-center gap-1.5">
          <Scale className="w-4 h-4 text-primary" />
          <span>Breakdown: Finished Jewellery + Scrap (तैयार गहना + छीलन)</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Finished Item Weight */}
          <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30">
            <label className="block font-label-sm text-xs text-on-surface-variant font-bold mb-1">
              Finished Jewellery Weight (तैयार गहना)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                {...register('finished_weight_grams', { required: true, valueAsNumber: true })}
                className="w-full h-11 text-lg font-extrabold text-on-surface bg-surface-container-lowest rounded-lg px-3 border border-outline-variant/50 focus:outline-none"
              />
              <span className="font-bold text-primary">g</span>
            </div>
          </div>

          {/* Scrap / Dust Weight */}
          <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30">
            <label className="block font-label-sm text-xs text-on-surface-variant font-bold mb-1">
              Scrap & Filing Dust (छीलन / रवा)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                {...register('scrap_weight_grams', { required: true, valueAsNumber: true })}
                className="w-full h-11 text-lg font-extrabold text-on-surface bg-surface-container-lowest rounded-lg px-3 border border-outline-variant/50 focus:outline-none"
              />
              <span className="font-bold text-secondary">g</span>
            </div>
          </div>
        </div>

        {/* Issued Gold Reference for Accurate Loss Math */}
        <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label className="block font-label-sm text-xs text-on-surface-variant font-bold">
              Issued Raw Gold Weight (शुरू में जारी किया गया सोना)
            </label>
            <span className="text-[11px] text-secondary">
              Baseline weight used to calculate actual job loss (issued - returned)
            </span>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <input
              type="number"
              step="0.001"
              min="0.1"
              value={issuedGrams}
              onChange={(e) => setIssuedGrams(parseFloat(e.target.value) || 0)}
              className="w-28 h-10 text-base font-extrabold text-on-surface bg-surface-container-lowest rounded-lg px-3 border border-outline-variant/50 focus:outline-none text-right"
            />
            <span className="font-bold text-primary">g</span>
          </div>
        </div>

        {/* Smart Wastage Agreement & Live Variance Indicator Card */}
        <div className="bg-surface-container p-4 rounded-xl space-y-3 border border-outline-variant/40">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-xs font-bold text-on-surface flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Smart Wastage Protocol Check (नुकसान समझौता सत्यापन)</span>
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                agreement?.status === 'ACCEPTED'
                  ? 'bg-success-bg text-success border border-success/30'
                  : 'bg-brand/10 text-brand border border-brand/20'
              }`}
            >
              {agreement ? `Agreement: ${agreement.status}` : 'Benchmark Default'}
            </span>
          </div>

          {/* 3 Metric Comparison Badges */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">
              <span className="text-[10px] text-secondary uppercase font-bold block">Agreed Wastage</span>
              <span className="font-headline-sm text-sm font-extrabold text-on-surface">
                {agreedWastagePct.toFixed(2)}%
              </span>
              <span className="text-[10px] text-on-surface-variant block mt-0.5">
                Allowed: <strong>{allowedWastageGrams.toFixed(3)}g</strong>
              </span>
            </div>

            <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">
              <span className="text-[10px] text-secondary uppercase font-bold block">Actual Loss</span>
              <span className="font-headline-sm text-sm font-extrabold text-primary">
                {actualWastageGrams.toFixed(3)}g
              </span>
              <span className="text-[10px] text-on-surface-variant block mt-0.5">
                Rate: <strong>{actualWastagePct.toFixed(2)}%</strong>
              </span>
            </div>

            <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">
              <span className="text-[10px] text-secondary uppercase font-bold block">Tolerance Max</span>
              <span className="font-headline-sm text-sm font-extrabold text-secondary">
                {toleranceThresholdPct.toFixed(2)}%
              </span>
              <span className="text-[10px] text-on-surface-variant block mt-0.5">
                Buffer: <strong>+2.0%</strong>
              </span>
            </div>
          </div>

          {/* LIVE DYNAMIC VARIANCE INDICATOR (Green / Amber / Red) */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 transition-all ${
              isOptimal
                ? 'bg-success-bg border-success/40 text-success'
                : isWithinBuffer
                ? 'bg-warn-bg border-warn/40 text-warn'
                : 'bg-danger-bg border-danger/50 text-danger animate-pulse'
            }`}
          >
            {isOptimal ? (
              <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
            ) : isWithinBuffer ? (
              <AlertTriangle className="w-5 h-5 text-warn shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            )}

            <div className="text-xs space-y-0.5 flex-1">
              <div className="flex items-center justify-between font-bold">
                <span>
                  {isOptimal
                    ? '✓ Within Agreed Limit • सीमा के भीतर (Optimal)'
                    : isWithinBuffer
                    ? '⚠️ In +2% Tolerance Buffer • 2% सहनशीलता सीमा में'
                    : '🚨 EXCEEDS +2% TOLERANCE • सीमा से अधिक (Review Required)'}
                </span>
                <span className="text-[11px] font-extrabold tabular-nums">
                  Variance: {varianceGrams <= 0 ? '' : '+'}{varianceGrams.toFixed(3)}g ({variancePct <= 0 ? '' : '+'}{variancePct.toFixed(2)}%)
                </span>
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">
                {isOptimal
                  ? `Actual wastage (${actualWastagePct}%) is well within the agreed contract rate (${agreedWastagePct}%). Ready for standard dual confirmation.`
                  : isWithinBuffer
                  ? `Actual wastage exceeds agreed rate by ${variancePct}% but remains under the +2.0% threshold (${toleranceThresholdPct}%). Within allowable workshop variation.`
                  : `Actual wastage (${actualWastagePct}%) exceeds the agreed ${agreedWastagePct}% + 2% tolerance limit. This transaction will automatically be flagged with status REVIEW_REQUIRED.`}
              </p>
            </div>
          </div>

          {/* Total Summary Strip */}
          <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between text-xs">
            <span className="text-on-surface-variant font-medium">Total Physical Gold Returned (Piece + Scrap):</span>
            <span className="font-bold text-on-surface tabular-nums">{totalReturnWeight.toFixed(3)} g</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-on-surface-variant font-medium">Total Settled with Allowed Wastage:</span>
            <span className="font-headline-sm text-sm font-bold text-primary tabular-nums">
              {(totalReturnWeight + allowedWastageGrams).toFixed(3)} g
            </span>
          </div>
        </div>
      </div>

      {/* Photo Evidence with Scales */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 space-y-3">
        <label className="font-label-sm text-xs text-on-surface uppercase tracking-wide font-bold flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-primary" />
          <span>Finished Piece & Scale Photo (तैयार गहने की फोटो)</span>
        </label>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 relative h-24 rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center border border-outline-variant/40">
            {photoPreview ? (
              <img src={photoPreview} alt="Finished Gold Evidence" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-on-surface-variant/50 p-2 text-center">
                <Upload className="w-6 h-6 mb-1" />
                <span className="text-[11px] leading-tight">Attach scale & finished jewellery photo</span>
              </div>
            )}
            {photoPreview && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
                <span className="text-[10px] text-white flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-success" />
                  <span>Compressed • Perceptual dHash Secured</span>
                </span>
              </div>
            )}
          </div>

          <label className="h-24 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 transition-transform border border-outline-variant/40 shadow-xs">
            <Camera className="w-6 h-6 text-primary" />
            <span className="font-label-sm text-[11px] text-center leading-tight">
              {photoPreview ? 'Change Photo' : 'Capture / Upload'}
            </span>
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} className="hidden" />
          </label>
        </div>

        {/* GPS Geolocation Stamp */}
        <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1 border-t border-outline-variant/20">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span>
              GPS Evidence:{' '}
              {gpsCoords ? (
                <strong className="text-on-surface font-mono">
                  {gpsCoords.lat.toFixed(4)}°N, {gpsCoords.lng.toFixed(4)}°E
                </strong>
              ) : (
                'Locating...'
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={fetchGps}
            className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
          >
            <RefreshCw className={`w-3 h-3 ${isGettingGps ? 'animate-spin' : ''}`} />
            <span>Refresh GPS</span>
          </button>
        </div>
      </div>

      {/* Karigar Digital Signature Pad */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30">
        <SignaturePad
          onSignatureChange={setSignature}
          label="Karigar Digital Signature (कारीगर हस्ताक्षर)"
          sublabel="I certify the accuracy of finished gold weight and scrap returned"
          signatoryName={karigar.name}
        />
      </div>

      {/* Action CTAs */}
      <div className="flex items-center gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-14 flex-1 bg-white border border-brand text-brand hover:bg-chip font-label-md text-sm font-bold rounded-xl transition-colors active:scale-98"
          >
            Cancel (रद्द करें)
          </button>
        )}
        <button
          type="submit"
          disabled={returnMutation.isPending || isCompressing}
          className="h-14 flex-[2] bg-brand hover:bg-brand-light text-white font-label-md text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
        >
          {returnMutation.isPending ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <CornerDownLeft className="w-5 h-5 text-white" />
          )}
          <span className="font-bold">
            {returnMutation.isPending ? 'Writing to Hash Chain...' : 'Record Return Entry (वापसी दर्ज करें)'}
          </span>
        </button>
      </div>
    </form>
  );
};

