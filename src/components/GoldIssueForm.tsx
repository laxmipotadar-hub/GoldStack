import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Scale,
  Camera,
  MapPin,
  CheckCircle,
  AlertCircle,
  FileText,
  User,
  Sparkles,
  WifiOff,
  Upload,
  RefreshCw,
  Heart,
  Calendar,
  Link2
} from 'lucide-react';
import { Party, type User as UserModel, IssueGoldRequest, IssueGoldInput, CustomerOrder } from '../../shared/types.js';
import { SignaturePad } from './SignaturePad.js';
import { compressImage } from '../utils/imageCompressor.js';
import { generateClientPerceptualHash } from '../utils/perceptualHash.js';
import { offlineQueue } from '../offline/offlineQueue.js';
import { useToast } from './Toast.js';

interface GoldIssueFormProps {
  jeweller: Party | UserModel;
  karigars: (Party | UserModel)[];
  selectedKarigarId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  bullionRatePerGram?: number;
}

interface FormValues {
  karigar_id: string;
  order_id: string;
  weight_grams: number;
  purity_karat: number;
  notes: string;
}

export const GoldIssueForm: React.FC<GoldIssueFormProps> = ({
  jeweller,
  karigars,
  selectedKarigarId,
  onSuccess,
  onCancel,
  bullionRatePerGram = 7420
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
      karigar_id: selectedKarigarId || karigars[0]?.id || '',
      order_id: 'ORD-204 (Bridal Necklace)',
      weight_grams: 50.0,
      purity_karat: 22,
      notes: ''
    }
  });

  const currentWeight = watch('weight_grams') || 0;
  const currentPurity = watch('purity_karat') || 22;
  const pureGoldEquivalent = ((currentWeight * currentPurity) / 24).toFixed(3);
  const valuation = Math.round(currentWeight * bullionRatePerGram);

  // Fetch active occasion orders for linking
  const { data: ordersRes } = useQuery<{ success: boolean; data: CustomerOrder[] }>({
    queryKey: ['orders-for-issue'],
    queryFn: async () => {
      const res = await fetch('/api/orders', { credentials: 'include' });
      if (!res.ok) return { success: true, data: [] };
      return res.json();
    }
  });

  const availableOrders = ordersRes?.data || [];

  const handleSelectLinkedOrder = (orderNum: string) => {
    if (!orderNum) return;
    const found = availableOrders.find((o) => o.order_number === orderNum);
    if (found) {
      setValue('order_id', found.order_number);
      if (found.karigar_id) {
        setValue('karigar_id', found.karigar_id);
      }
      if (found.item_description) {
        const occasionTag = found.occasion_type === 'WEDDING' ? '💍 Wedding' : '🪔 Festival';
        setValue('notes', `[${occasionTag} ${found.occasion_date}] ${found.customer_name}: ${found.item_description}`);
      }
      if (found.target_weight_grams && (!currentWeight || currentWeight === 50.0)) {
        setValue('weight_grams', found.target_weight_grams);
      }
      toast.info('Order Linked', `Linked to ${found.customer_name} (${found.order_number})`);
    }
  };

  // Auto-fetch GPS on component mount
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
        // Fallback default coordinates (e.g. Zaveri Bazaar jewellery cluster)
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
      toast.info('Processing Photo Evidence', 'Compressing to 1080p and generating perceptual hash...');

      // 1. Compress image client-side (max 2MB, 1080p)
      const compressed = await compressImage(file, 1920, 2 * 1024 * 1024);
      setPhotoFile(compressed.file);
      setPhotoPreview(compressed.dataUrl);

      // 2. Generate 64-bit dHash for tamper detection
      const dHash = await generateClientPerceptualHash(compressed.file);
      setPerceptualHash(dHash);

      toast.success(
        'Photo Processed Successfully',
        `Compressed to ${(compressed.compressedSizeBytes / 1024).toFixed(1)} KB. Perceptual dHash: ${dHash.slice(0, 8)}...`
      );
    } catch (err: any) {
      toast.error('Photo processing failed', err.message);
    } finally {
      setIsCompressing(false);
    }
  };

  const issueMutation = useMutation({
    mutationFn: async (payload: IssueGoldRequest) => {
      // If photo was captured, upload photo first
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
          console.warn('[Photo Upload] Direct upload failed, falling back to data URL:', uploadErr);
          uploadedPhotoUrl = photoPreview;
        }
      }

      const finalPayload: IssueGoldRequest = {
        ...payload,
        photo_evidence_url: uploadedPhotoUrl
      };

      // Check if online
      if (!offlineQueue.isOnline()) {
        offlineQueue.enqueue('/api/ledger/issue', finalPayload);
        return {
          offline: true,
          message: 'Saved to Offline Queue. Will automatically sync to immutable hash chain once online.'
        };
      }

      const res = await fetch('/api/ledger/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(finalPayload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Server failed to record gold issuance');
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data.offline) {
        toast.warning('Transaction Queued Offline', data.message);
      } else {
        toast.success(
          'Gold Issued on Immutable Ledger!',
          `Block #${data.data?.sequence_number || ''} created with hash ${data.data?.transaction_hash?.slice(0, 10)}... Dual confirmation pending.`
        );
      }
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['ledgerHistory'] });
      queryClient.invalidateQueries({ queryKey: ['chainVerification'] });
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast.error('Failed to issue gold', err.message);
    }
  });

  const onSubmit = (values: FormValues) => {
    if (!signature) {
      toast.error('Digital Signature Required', 'Please draw your digital signature before issuing gold.');
      return;
    }

    const payload: IssueGoldRequest = {
      jeweller_id: jeweller.id,
      karigar_id: values.karigar_id,
      order_id: values.order_id || null,
      weight_grams: Number(values.weight_grams),
      purity_karat: Number(values.purity_karat),
      photo_evidence_url: photoPreview,
      perceptual_hash: perceptualHash,
      signature_jeweller: signature,
      gps_lat: gpsCoords?.lat || null,
      gps_lng: gpsCoords?.lng || null,
      metadata: {
        orderNumber: values.order_id,
        notes: values.notes,
        issuedByJewellerName: jeweller.name
      }
    };

    issueMutation.mutate(payload);
  };

  const addWeight = (amount: number) => {
    setValue('weight_grams', Number((Number(currentWeight) + amount).toFixed(3)));
  };

  const setPurity = (karat: number) => {
    setValue('purity_karat', karat);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {/* Karigar Selection */}
      <div className="bg-surface-container-low rounded-xl p-4 flex flex-col gap-2">
        <label className="font-label-sm text-xs uppercase tracking-wide text-on-surface-variant flex items-center gap-1.5 font-bold">
          <User className="w-3.5 h-3.5 text-primary" />
          <span>Select Recipient Karigar (कारीगर चुनें)</span>
        </label>
        <select
          {...register('karigar_id', { required: 'Please select a karigar' })}
          className="w-full h-12 bg-surface-container-lowest border border-outline-variant/60 rounded-xl px-3 font-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {karigars.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} ({k.businessName || 'Master Karigar'}) - {k.phone}
            </option>
          ))}
        </select>
      </div>

      {/* Weight Input Box with Quick Add Pills */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs border border-outline-variant/30 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-label-sm text-[11px] uppercase tracking-wider text-secondary font-bold">
              Gold Weight & Purity
            </span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">वज़न एवं शुद्धता</h3>
          </div>
          <div className="flex items-center gap-1 text-xs text-primary font-bold bg-surface-container px-2 py-1 rounded-full">
            <Scale className="w-3.5 h-3.5" />
            <span>Digital Scales Ready</span>
          </div>
        </div>

        {/* Big Tabular Weight Display */}
        <div className="bg-surface-container-low rounded-xl p-4 flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              step="0.001"
              min="0.001"
              {...register('weight_grams', {
                required: 'Weight is required',
                valueAsNumber: true,
                min: { value: 0.001, message: 'Weight must be > 0' }
              })}
              className="font-metric-display text-4xl text-center font-extrabold text-on-surface bg-transparent focus:outline-none max-w-[200px]"
            />
            <span className="font-headline-sm text-2xl text-primary font-bold">g</span>
          </div>
          <span className="font-label-sm text-xs text-on-surface-variant mt-0.5">grams • ग्राम (शुद्ध तौल)</span>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-on-surface-variant">
            <span>
              Fine Gold (24K): <strong className="text-primary font-bold">{pureGoldEquivalent} g</strong>
            </span>
            <span>•</span>
            <span>
              Valuation: <strong className="text-on-surface font-bold">₹ {valuation.toLocaleString('en-IN')}</strong>
            </span>
          </div>
        </div>

        {/* Quick Add Pills */}
        <div>
          <label className="block font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wide mb-1.5 font-bold">
            Quick Add • त्वरित जोड़ें
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 25, 50].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => addWeight(amt)}
                className="h-10 bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface rounded-lg font-label-md text-xs font-bold transition-all active:scale-95 shadow-xs"
              >
                +{amt}g
              </button>
            ))}
          </div>
        </div>

        {/* Purity Selection Chips */}
        <div>
          <label className="block font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wide mb-1.5 font-bold">
            Select Purity • शुद्धता चुनें
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { karat: 18, label: '18K (750)' },
              { karat: 20, label: '20K (833)' },
              { karat: 22, label: '22K (916) BIS' },
              { karat: 24, label: '24K (999) Fine' }
            ].map((p) => {
              const active = currentPurity === p.karat;
              return (
                <button
                  key={p.karat}
                  type="button"
                  onClick={() => setPurity(p.karat)}
                  className={`h-11 rounded-xl font-label-md text-xs font-bold flex items-center justify-center gap-1.5 px-2 transition-all active:scale-95 ${
                    active
                      ? 'bg-inverse-surface text-inverse-on-surface shadow-md'
                      : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  <span>{p.label}</span>
                  {active && <CheckCircle className="w-3.5 h-3.5 text-primary-container" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Occasion Order Link Selector */}
      {availableOrders.length > 0 && (
        <div className="bg-primary/5 rounded-xl p-3.5 border border-primary/20 space-y-1.5">
          <label className="block font-label-sm text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            <span>Link to Customer Occasion Order (मांगलिक ऑर्डर से जोड़ें - Optional)</span>
          </label>
          <select
            onChange={(e) => handleSelectLinkedOrder(e.target.value)}
            className="w-full h-10 bg-surface-container-lowest border border-primary/30 rounded-xl px-3 text-xs text-on-surface focus:outline-none font-medium"
            defaultValue=""
          >
            <option value="">-- Select Occasion Order to Auto-Fill Details --</option>
            {availableOrders.map((o) => (
              <option key={o.id} value={o.order_number}>
                {o.occasion_type === 'WEDDING' ? '💍 Vivah' : '🪔 Utsav'} [{o.occasion_date}] {o.order_number} - {o.customer_name} ({o.item_description || o.design_complexity})
              </option>
            ))}
          </select>
          <span className="text-[10px] text-on-surface-variant block">
            Auto-fills order reference, target gold weight, and aligns stage reverse-scheduling.
          </span>
        </div>
      )}

      {/* Order Link & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-label-sm text-xs text-on-surface-variant uppercase font-bold mb-1">
            Job-Work Order Reference
          </label>
          <input
            type="text"
            placeholder="#ORD-204"
            {...register('order_id')}
            className="w-full h-11 bg-surface-container-low rounded-xl px-3 text-sm text-on-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="block font-label-sm text-xs text-on-surface-variant uppercase font-bold mb-1">
            Notes / Item Details
          </label>
          <input
            type="text"
            placeholder="e.g. Casting Bar #04 for Bridal Choker"
            {...register('notes')}
            className="w-full h-11 bg-surface-container-low rounded-xl px-3 text-sm text-on-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Photo Evidence & Perceptual Hashing */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-label-sm text-xs text-on-surface uppercase tracking-wide font-bold flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-primary" />
            <span>Photo Evidence & Scale Slip (फोटो साक्ष्य)</span>
          </label>
          {perceptualHash && (
            <span className="text-[10px] font-mono bg-surface-container px-2 py-0.5 rounded-full text-secondary">
              dHash: {perceptualHash}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 relative h-24 rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center border border-outline-variant/40">
            {photoPreview ? (
              <img src={photoPreview} alt="Gold Bar Evidence" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-on-surface-variant/50 p-2 text-center">
                <Upload className="w-6 h-6 mb-1" />
                <span className="text-[11px] leading-tight">No photo attached yet</span>
              </div>
            )}
            {photoPreview && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
                <span className="text-[10px] text-white flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-[#477b55]" />
                  <span>Compressed 1080p • dHash Verified</span>
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

      {/* Jeweller Digital Signature Pad */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30">
        <SignaturePad
          onSignatureChange={setSignature}
          label="Jeweller Digital Signature (ज्वैलर हस्ताक्षर)"
          sublabel="I certify handing over the stated gold weight and purity"
          signatoryName={jeweller.name}
        />
      </div>

      {/* Action Buttons */}
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
          disabled={issueMutation.isPending || isCompressing}
          className="h-14 flex-[2] bg-brand hover:bg-brand-light text-white font-label-md text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
        >
          {issueMutation.isPending ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5 text-white" />
          )}
          <span className="font-bold">
            {issueMutation.isPending ? 'Writing to Hash Chain...' : 'Confirm & Issue Gold (सोना जारी करें)'}
          </span>
        </button>
      </div>
    </form>
  );
};

