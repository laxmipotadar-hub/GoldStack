import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Sparkles,
  Heart,
  PlusCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Filter,
  RefreshCw,
  Scale,
  Zap,
  ArrowRight,
  User,
  ShieldCheck,
  ShieldAlert,
  AlertOctagon
} from 'lucide-react';
import {
  CustomerOrder,
  OccasionType,
  OrderDesignComplexity,
  OrderStatus,
  Party,
  User as UserModel
} from '../../shared/types.js';
import { OrderTimeline } from './OrderTimeline.js';
import { RiskBadge } from './RiskBadge.js';
import { useToast } from './Toast.js';
import { useAuth } from '../context/AuthContext.js';
import { RaiseDisputeModal } from './RaiseDisputeModal.js';

interface OrderManagementPanelProps {
  karigars: (Party | UserModel)[];
  onOrderSelectedForIssue?: (order: CustomerOrder) => void;
}

export const OrderManagementPanel: React.FC<OrderManagementPanelProps> = ({
  karigars,
  onOrderSelectedForIssue
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isJeweller = user?.role === 'JEWELLER';
  const isKarigar = user?.role === 'KARIGAR';

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [disputeTargetOrder, setDisputeTargetOrder] = useState<CustomerOrder | null>(null);

  // New Order Form State
  const [customerName, setCustomerName] = useState<string>('');
  const [occasionType, setOccasionType] = useState<OccasionType>('WEDDING');
  const [occasionDate, setOccasionDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 20); // Default to 20 days out
    return d.toISOString().split('T')[0];
  });
  const [selectedKarigarId, setSelectedKarigarId] = useState<string>(karigars[0]?.id || '');
  const [designComplexity, setDesignComplexity] = useState<OrderDesignComplexity>('COMPLEX');
  const [itemDescription, setItemDescription] = useState<string>('22K Kundan Jadau Bridal Set');
  const [targetWeightGrams, setTargetWeightGrams] = useState<string>('120.0');
  const [deliveryBufferDays, setDeliveryBufferDays] = useState<number>(1);

  // Fetch orders
  const { data: ordersRes, isLoading, refetch, isFetching } = useQuery<{
    success: boolean;
    data: CustomerOrder[];
  }>({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      const url =
        statusFilter === 'ALL'
          ? '/api/orders'
          : `/api/orders?status=${statusFilter}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    }
  });

  const orders = ordersRes?.data || [];

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          karigar_id: selectedKarigarId,
          customer_name: customerName,
          occasion_type: occasionType,
          occasion_date: occasionDate,
          design_complexity: designComplexity,
          item_description: itemDescription,
          target_weight_grams: parseFloat(targetWeightGrams) || undefined,
          delivery_buffer_days: deliveryBufferDays
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create occasion order');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success('ऑर्डर दर्ज हुआ (Order Created)', data.message);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsCreateModalOpen(false);
      if (data.data?.id) {
        setSelectedOrderId(data.data.id);
      }
    },
    onError: (err: any) => {
      toast.error('त्रुटि (Creation Failed)', err.message);
    }
  });

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || orders[0];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-surface-container-high to-surface-container-lowest border border-outline-variant/40 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              💍 Wedding-Date Protection Engine • शुभ विवाह रक्षा प्रणाली
            </span>
            <span className="text-xs text-secondary font-medium">Critical Path Method (CPM)</span>
          </div>
          <h2 className="font-headline-sm text-xl font-bold text-on-surface">
            Customer Occasion Orders & Milestone Scheduling
          </h2>
          <p className="text-xs text-on-surface-variant max-w-2xl mt-1">
            Links gold ledger custody blocks directly to customer wedding and festival dates. Reverse-schedules
            six crafting stages from delivery date and flags <strong className="text-error font-bold">AT_RISK</strong> alerts if delays breach the auspicious occasion.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {isJeweller && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="h-10 px-4 rounded-xl bg-primary text-on-primary font-label-md text-xs font-bold hover:brightness-105 active:scale-95 transition-all shadow-xs flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Occasion Order (नया मांगलिक ऑर्डर)</span>
            </button>
          )}

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-10 w-10 rounded-xl bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all active:scale-95"
            title="Refresh orders"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Grid: Orders List (Left 4 cols) vs Selected Order Timeline (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Order Master List */}
        <div className="lg:col-span-5 space-y-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'ALL', label: 'All Orders' },
              { id: 'AT_RISK', label: '⚠️ At Risk' },
              { id: 'DELAYED', label: '🛑 Delayed' },
              { id: 'ESCALATED', label: '⚡ Escalated' },
              { id: 'IN_PROGRESS', label: 'In Progress' },
              { id: 'READY', label: 'Ready' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Orders Cards List */}
          {isLoading ? (
            <div className="p-12 text-center text-on-surface-variant space-y-2 bg-surface-container-low rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
              <p className="text-xs font-medium">Loading occasion orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant bg-surface-container-low rounded-2xl space-y-2">
              <Calendar className="w-8 h-8 mx-auto text-secondary" />
              <h4 className="font-bold text-sm text-on-surface">No Occasion Orders Found</h4>
              <p className="text-xs">
                {isKarigar
                  ? 'There are no active wedding orders assigned to your artisan bench.'
                  : 'Click "+ New Occasion Order" above to register a wedding or festival job.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => {
                const isSelected = selectedOrder?.id === o.id;
                const isAtRisk = o.is_at_risk || o.status === 'AT_RISK';
                const daysRemaining = o.days_to_occasion;

                return (
                  <div
                    key={o.id}
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2.5 ${
                      isSelected
                        ? 'bg-surface-container-lowest border-primary shadow-sm ring-1 ring-primary'
                        : isAtRisk
                        ? 'bg-error-container/10 border-error/40 hover:bg-error-container/20'
                        : 'bg-surface-container-lowest border-outline-variant/30 hover:border-outline-variant/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        {o.occasion_type === 'WEDDING' ? (
                          <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span className="font-mono font-bold text-primary">{o.order_number}</span>
                      </div>

                      <RiskBadge
                        level={o.risk_level}
                        score={o.risk_score}
                        factors={o.risk_factors}
                        status={o.status}
                        size="sm"
                        showDetailsPopover={false}
                      />
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-on-surface line-clamp-1">
                        {o.customer_name}
                      </h4>
                      <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                        {o.item_description || `${o.design_complexity} jewellery crafting`}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono pt-2 border-t border-outline-variant/20 text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-secondary" />
                        <span>Occasion: <strong>{o.occasion_date}</strong></span>
                      </span>

                      <div className="flex items-center gap-2">
                        <span className={daysRemaining <= 7 ? 'text-amber-700 font-bold' : ''}>
                          {daysRemaining > 0 ? `${daysRemaining}d left` : 'Event Day'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDisputeTargetOrder(o);
                          }}
                          className="p-1 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-800 transition-colors"
                          title="Raise Dispute on this order"
                        >
                          <AlertOctagon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Selected Order Timeline & CPM View (7 cols) */}
        <div className="lg:col-span-7">
          {selectedOrder ? (
            <OrderTimeline
              order={selectedOrder}
              onOrderUpdated={(updated) => {
                queryClient.setQueryData(['orders', statusFilter], (old: any) => {
                  if (!old?.data) return old;
                  return {
                    ...old,
                    data: old.data.map((item: CustomerOrder) => (item.id === updated.id ? updated : item))
                  };
                });
              }}
            />
          ) : (
            <div className="p-16 text-center text-on-surface-variant bg-surface-container-low rounded-2xl">
              <Calendar className="w-10 h-10 mx-auto text-secondary mb-2" />
              <h4 className="font-bold text-sm text-on-surface">Select an Order to Inspect CPM Timeline</h4>
              <p className="text-xs">
                Pick a customer wedding or festival order on the left to track milestones and reverse-scheduled dates.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE ORDER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
          <div className="max-w-xl w-full bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-500/20" />
                <div>
                  <h3 className="font-headline-sm text-lg font-bold text-on-surface">
                    Register Customer Occasion Order (मांगलिक ऑर्डर)
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    Wedding-Date Protection • Reverse-Scheduled CPM Milestones
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createOrderMutation.mutate();
              }}
              className="space-y-4 text-xs"
            >
              {/* Customer Name */}
              <div>
                <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                  Customer & Occasion Name (ग्राहक व अवसर का नाम) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Radhika & Siddharth Mehta (Royal Vivah Haar)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Occasion Type & Occasion Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                    Occasion Type (अवसर प्रकार)
                  </label>
                  <select
                    value={occasionType}
                    onChange={(e) => setOccasionType(e.target.value as OccasionType)}
                    className="w-full h-10 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none"
                  >
                    <option value="WEDDING">💍 Wedding / Vivah (शुभ विवाह)</option>
                    <option value="FESTIVAL">🪔 Festival / Utsav (दीपावली / त्यौहार)</option>
                    <option value="CEREMONY">🪷 Ceremony / Sanskar (संस्कार)</option>
                    <option value="OTHER">📦 Other Special Order</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                    Occasion Date (शुभ तिथि) *
                  </label>
                  <input
                    type="date"
                    required
                    value={occasionDate}
                    onChange={(e) => setOccasionDate(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Karigar & Complexity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                    Assign Artisan (कारीगर सौंपें) *
                  </label>
                  <select
                    value={selectedKarigarId}
                    onChange={(e) => setSelectedKarigarId(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none"
                  >
                    {karigars.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name} ({k.businessName || 'Artisan'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                    Design Complexity (कारीगरी जटिलता)
                  </label>
                  <select
                    value={designComplexity}
                    onChange={(e) => setDesignComplexity(e.target.value as OrderDesignComplexity)}
                    className="w-full h-10 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none"
                  >
                    <option value="SIMPLE">Simple (सादा ढलाई - 7 Days)</option>
                    <option value="MEDIUM">Medium (नगीना जड़ाई - 12 Days)</option>
                    <option value="COMPLEX">Complex (दुल्हन कुंदन सेट - 20 Days)</option>
                    <option value="INTRICATE">Intricate (अति जटिल मंदिर/नक्काशी - 30 Days)</option>
                  </select>
                </div>
              </div>

              {/* Item Description & Target Weight */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                    Item Description (आभूषण विवरण)
                  </label>
                  <input
                    type="text"
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                    Target Weight (ग्राम)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetWeightGrams}
                    onChange={(e) => setTargetWeightGrams(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Auto CPM Preview Notice */}
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-1 text-xs">
                <span className="font-bold text-primary flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-primary" />
                  <span>Auto-Generated Milestones (Critical Path Method):</span>
                </span>
                <p className="text-[11px] text-on-surface-variant">
                  Design Approval → Melting & Casting → Stone Setting → Polishing → Hallmarking QC → Final Delivery.
                  All milestones will be automatically scheduled backward from the event date to guarantee delivery buffer.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-secondary hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createOrderMutation.isPending || !customerName}
                  className="px-5 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:brightness-105 active:scale-95 transition-all shadow-xs flex items-center gap-1.5"
                >
                  {createOrderMutation.isPending ? 'Generating Schedule...' : 'Create & Schedule Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Raise Dispute Modal */}
      {disputeTargetOrder && (
        <RaiseDisputeModal
          targetType="ORDER"
          targetId={disputeTargetOrder.id}
          targetReference={disputeTargetOrder.order_number}
          onClose={() => setDisputeTargetOrder(null)}
          onSuccess={() => setDisputeTargetOrder(null)}
        />
      )}
    </div>
  );
};

