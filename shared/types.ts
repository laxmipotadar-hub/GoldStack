/**
 * Shared TypeScript definitions for Immutable Gold Ledger System (GoldStack)
 * Consolidating all client (src/) and server (server/) domain models, roles,
 * users, ledger blocks, hash payload, and API request/response shapes.
 */

// ==========================================
// 1. Core Domain Enums & Roles
// ==========================================

export type Role = 'JEWELLER' | 'KARIGAR' | 'MEDIATOR';
export type PartyRole = Role;

export type TransactionType = 'ISSUE' | 'RETURN' | 'WASTAGE' | 'ADJUSTMENT';

export type LedgerStatus = 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'DISPUTED' | 'ESCALATED' | 'REVIEW_REQUIRED';

export type WastageAgreementStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
export type DesignComplexity = 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'VERY_COMPLEX';

export type { RiskLevel, RiskFactors, RiskScoreInput, RiskScoreResult } from './riskScoring.js';

// ==========================================
// 2. User & Party Models
// ==========================================

export interface User {
  id: string;
  name: string;
  role: Role;
  phone: string;
  businessName?: string;
  avatarUrl?: string;
}

export type AuthUser = User;
export type Party = User;

// ==========================================
// 3. Metadata & Ledger Entry Models
// ==========================================

export interface WastageVarianceDetails {
  issued_grams: number;
  returned_grams: number;
  actual_wastage_grams: number;
  actual_wastage_pct: number;
  agreed_wastage_pct: number;
  allowed_wastage_grams: number;
  variance_grams: number;
  variance_pct: number;
  tolerance_threshold_pct: number; // agreed + 2%
  exceeds_tolerance: boolean;
  review_required: boolean;
}

export interface LedgerMetadata {
  orderNumber?: string;
  itemDescription?: string;
  wastageGrams?: number;
  wastagePercentage?: number;
  grossReturnGrams?: number;
  scrapGrams?: number;
  finishedItemGrams?: number;
  notes?: string;
  clientNonce?: string;
  offlineCreated?: boolean;
  needsManualReview?: boolean;
  conflictDetails?: string;
  deviceInfo?: string;
  // Smart Wastage Engine fields
  order_ref?: string;
  agreedWastagePct?: number;
  actualWastagePct?: number;
  allowedWastageGrams?: number;
  varianceGrams?: number;
  variancePct?: number;
  exceedsAllowedWastage?: boolean;
  reviewRequired?: boolean;
  wastageVariance?: WastageVarianceDetails;
  // Settlement Adjustment fields
  settlement_id?: string;
  settlement_number?: string;
  net_payable?: number;
  gold_rate?: number;
  gold_equivalent_grams?: number;
  payment_method?: PaymentMethod;
  payment_reference?: string;
  [key: string]: unknown;
}

// ==========================================
// 3b. Smart Wastage Agreement Engine Models
// ==========================================

export interface WastageBenchmark {
  id: string;
  category: string;
  subcategory?: string;
  complexity: DesignComplexity;
  min_pct: number;
  max_pct: number;
  avg_pct: number;
  sample_size: number;
  description?: string;
}

export interface WastageAgreement {
  id: string;
  order_ref: string;
  jeweller_id: string;
  karigar_id: string;
  agreed_pct: number;
  design_complexity: DesignComplexity;
  category?: string;
  status: WastageAgreementStatus;
  signature_jeweller: string | null;
  signature_karigar: string | null;
  proposed_at: string;
  responded_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface KarigarReturnVariancePoint {
  id: string;
  orderRef: string;
  timestamp: string;
  category: string;
  complexity: DesignComplexity;
  issuedGrams: number;
  returnedGrams: number;
  actualWastageGrams: number;
  actualWastagePct: number;
  agreedWastagePct: number;
  allowedWastageGrams: number;
  varianceGrams: number;
  variancePct: number;
  rollingWmaPct: number;
  status: LedgerStatus;
  reviewRequired: boolean;
}

export interface CategoryBenchmarkComparison {
  category: string;
  categoryLabel: string;
  sampleCount: number;
  karigarAvgPct: number;
  karigarWmaPct: number;
  benchmarkMinPct: number;
  benchmarkMaxPct: number;
  benchmarkAvgPct: number;
  performanceRating: 'EXCELLENT' | 'STANDARD' | 'HIGH_WASTAGE';
  deltaVsBenchmarkAvg: number;
}

export interface KarigarWastageAnalytics {
  karigarId: string;
  karigarName: string;
  businessName?: string;
  phone?: string;
  totalReturnsCount: number;
  analyzedReturnsCount: number;
  rollingAverageWastagePct: number;
  simpleAverageWastagePct: number;
  averageAgreedPct: number;
  netVarianceGrams: number;
  averageVariancePct: number;
  varianceTrendDirection: 'IMPROVING' | 'STABLE' | 'WORSENING';
  varianceTrend: KarigarReturnVariancePoint[];
  categoryComparisons: CategoryBenchmarkComparison[];
  bestReturn?: KarigarReturnVariancePoint;
  worstReturn?: KarigarReturnVariancePoint;
}

export type KarigarWastageAnalyticsResponse = ApiResponse<KarigarWastageAnalytics>;

// ==========================================
// 3c. Customer Occasions, Orders & Milestones (CPM Engine)
// ==========================================

export type OccasionType = 'WEDDING' | 'FESTIVAL' | 'CEREMONY' | 'OTHER';
export type OrderDesignComplexity = 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'INTRICATE';
export type OrderStatus =
  | 'ACTIVE'
  | 'ON_TRACK'
  | 'IN_PROGRESS'
  | 'READY'
  | 'DELIVERED'
  | 'DELAYED'
  | 'CANCELLED'
  | 'AT_RISK'
  | 'ESCALATED';
export type EscalationState = 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'ESCALATED';
export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED';

export interface Milestone {
  id: string;
  order_id: string;
  name: string;
  name_hi?: string;
  sequence: number;
  duration_days: number;
  dependencies: string[];
  status: MilestoneStatus;
  planned_start_date: string;
  planned_date: string; // planned finish date
  actual_date: string | null;
  earliest_start?: number;
  earliest_finish?: number;
  latest_start?: number;
  latest_finish?: number;
  slack?: number;
  is_critical?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  from_status: string;
  to_status: string;
  trigger_reason: string;
  risk_score?: number;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  actor_id?: string;
  actor_role?: Role | 'SYSTEM';
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface InAppNotification {
  id: string;
  user_id: string;
  user_role: Role | string;
  order_id?: string;
  order_number?: string;
  title: string;
  message: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  is_read: boolean;
  created_at: string;
}

export interface CustomerOrder {
  id: string;
  order_number: string;
  jeweller_id: string;
  karigar_id: string;
  jeweller_name?: string;
  karigar_name?: string;
  customer_name: string; // Decrypted name for authorized parties
  customer_name_encrypted: string;
  occasion_type: OccasionType;
  occasion_date: string; // YYYY-MM-DD
  design_complexity: OrderDesignComplexity;
  status: OrderStatus;
  item_description?: string;
  target_weight_grams?: number;
  milestones: Milestone[];
  critical_path?: string[];
  days_to_occasion: number;
  is_at_risk: boolean;
  buffer_days_remaining?: number;
  risk_score?: number;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_factors?: {
    urgencyScore: number;
    completionScore: number;
    delayScore: number;
    historicalScore: number;
  };
  risk_summary?: string;
  risk_recommendation?: string;
  events?: OrderEvent[];
  created_at: string;
  updated_at: string;
}

export interface AcknowledgeEscalationRequest {
  notes?: string;
}

export type NotificationListResponse = ApiResponse<InAppNotification[]>;

export interface CreateOrderRequest {
  order_number?: string;
  karigar_id: string;
  customer_name: string;
  occasion_type: OccasionType;
  occasion_date: string;
  design_complexity: OrderDesignComplexity;
  item_description?: string;
  target_weight_grams?: number;
  delivery_buffer_days?: number;
}

export interface CompleteMilestoneRequest {
  actual_date?: string;
  notes?: string;
}

export interface DelayMilestoneRequest {
  delay_days: number;
  reason?: string;
}

export type OrderListResponse = ApiResponse<CustomerOrder[]>;
export type OrderDetailResponse = ApiResponse<CustomerOrder>;

// ==========================================
// 3d. Order & Karigar Job-Work Settlements
// ==========================================

export type SettlementStatus =
  | 'PENDING'
  | 'AWAITING_KARIGAR'
  | 'AWAITING_JEWELLER'
  | 'DISPUTED'
  | 'PAID';

export interface SettlementLineItem {
  id: string;
  category: 'MAKING_CHARGES' | 'GOLD_VALUE' | 'WASTAGE_DEDUCTION' | 'SHORTAGE_PENALTY' | 'ADVANCES' | 'INFO';
  titleEn: string;
  titleHi: string;
  description: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount: number;
  type: 'CREDIT' | 'DEBIT' | 'INFO';
}

export interface SettlementCalculationInput {
  issuedGrams: number;
  returnedGrams: number;
  agreedWastagePct: number;
  actualWastageGrams?: number;
  goldRatePerGram24K: number;
  purityKarat?: number; // default: 22
  makingChargePerGram: number;
  advances?: number;
  goldValueComponent?: number;
}

export interface SettlementCalculationResult {
  gold_value: number;
  making_charges: number;
  wastage_adjustment: number; // excess wastage deduction
  shortage_penalty: number;
  advances: number;
  total_deductions: number;
  net_payable: number;
  allowed_wastage_grams: number;
  actual_wastage_grams: number;
  excess_wastage_grams: number;
  shortage_grams: number;
  actual_wastage_pct: number;
  effective_gold_rate: number;
  is_within_tolerance: boolean;
  variance_pct: number;
  line_items: SettlementLineItem[];
}

export type PaymentMethod = 'UPI' | 'BANK' | 'CASH';

export interface Settlement {
  id: string;
  settlement_number: string;
  order_id?: string | null;
  order_number?: string | null;
  jeweller_id: string;
  karigar_id: string;
  jeweller_name?: string;
  karigar_name?: string;
  gold_value: number;
  making_charges: number;
  wastage_adjustment: number;
  shortage_penalty: number;
  advances: number;
  net_payable: number;
  status: SettlementStatus;
  line_items: SettlementLineItem[];
  gold_rate?: number; // Snapshot of 24K bullion rate at generation time
  payment_method?: PaymentMethod | null;
  payment_reference?: string | null;
  jeweller_approved_at?: string | null;
  karigar_approved_at?: string | null;
  paid_at?: string | null;
  dispute_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoldRate {
  id: string;
  rate_per_gram_24k: number;
  currency: string;
  effective_date: string;
  created_at: string;
}

export interface UpdateGoldRateRequest {
  rate_per_gram_24k: number;
  currency?: string;
  effective_date?: string;
}

export interface MarkSettlementPaidRequest {
  payment_method: PaymentMethod;
  payment_reference?: string;
  notes?: string;
}

export interface SettlementAgingItem {
  id: string;
  settlement_number: string;
  order_id?: string | null;
  order_number?: string | null;
  jeweller_id: string;
  karigar_id: string;
  jeweller_name?: string;
  karigar_name?: string;
  net_payable: number;
  status: SettlementStatus;
  created_at: string;
  age_days: number;
}

export interface SettlementAgingBucket {
  bucket: '0-7' | '8-15' | '16-30' | '>30';
  label: string;
  label_hi: string;
  count: number;
  total_amount: number;
  settlements: SettlementAgingItem[];
}

export interface SettlementAgingReport {
  as_of: string;
  total_outstanding_count: number;
  total_outstanding_amount: number;
  buckets: {
    '0-7': SettlementAgingBucket;
    '8-15': SettlementAgingBucket;
    '16-30': SettlementAgingBucket;
    '>30': SettlementAgingBucket;
  };
}

export type SettlementAgingResponse = ApiResponse<SettlementAgingReport>;
export type UpdateGoldRateResponse = ApiResponse<GoldRate>;
export type MarkSettlementPaidResponse = ApiResponse<{ settlement: Settlement; ledger_entry: LedgerEntry }>;

// ==========================================
// 3f. Karigar Trust Scoring & Artisan Passport Models
// ==========================================

export interface TrustFactorBreakdown {
  raw_score: number;
  bayesian_score: number;
  weight: number;
  weighted_score: number;
  sample_size: number;
  benchmark: number;
}

export interface KarigarTrustFactors {
  on_time_delivery: TrustFactorBreakdown;
  wastage_adherence: TrustFactorBreakdown;
  quality_acceptance: TrustFactorBreakdown;
  dispute_frequency: TrustFactorBreakdown;
  communication_responsiveness: TrustFactorBreakdown;
}

export interface KarigarRawMetrics {
  totalOrders: number;
  onTimeOrders: number;
  delayedOrders: number;
  totalReturns: number;
  withinToleranceReturns: number;
  avgExcessWastagePct: number;
  totalQcReviews: number;
  passedQcReviews: number;
  totalTransactions: number;
  disputedTransactions: number;
  totalConfirmations: number;
  avgResponseHours: number;
}

export interface KarigarTrustScoreCalculation {
  composite_score: number;
  total_orders: number;
  factors: KarigarTrustFactors;
  calculation_version: string;
  is_cold_start: boolean;
}

export interface KarigarTrustScore extends KarigarTrustScoreCalculation {
  id: string;
  karigar_id: string;
  karigar_name?: string;
  business_name?: string;
  avatar_url?: string;
  is_public: boolean;
  updated_at: string;
  created_at: string;
}

export interface PublicArtisanPassport {
  karigar_id: string;
  karigar_name: string;
  business_name?: string;
  avatar_url?: string;
  composite_score: number;
  total_orders: number;
  factors: KarigarTrustFactors;
  calculation_version: string;
  is_public: boolean;
  qr_code_data_url?: string;
  passport_url: string;
  issued_at: string;
}

export type TrustScoreResponse = ApiResponse<KarigarTrustScore>;
export type TrustScoreListResponse = ApiResponse<KarigarTrustScore[]>;
export type TrustScoreRecalculateResponse = ApiResponse<{
  recalculated_count: number;
  scores: KarigarTrustScore[];
  calculation_version: string;
}>;
export type PublicPassportResponse = ApiResponse<PublicArtisanPassport>;

// ==========================================
// 3g. Dispute System & Trade Mediation Models
// ==========================================

export type DisputeTargetType = 'LEDGER_ENTRY' | 'ORDER' | 'SETTLEMENT';
export type DisputeCategory = 'WEIGHT' | 'QUALITY' | 'TIMING' | 'PAYMENT' | 'OTHER';
export type DisputeStatus =
  | 'OPENED'
  | 'EVIDENCE'
  | 'REVIEW'
  | 'MEDIATION'
  | 'RESOLUTION_PROPOSED'
  | 'RESOLVED'
  | 'CLOSED';

export type AtFaultParty = 'JEWELLER' | 'KARIGAR' | 'SPLIT' | 'NONE';

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  file_url: string;
  file_hash: string;
  perceptual_hash?: string | null;
  uploaded_by: string;
  uploaded_by_name?: string;
  uploaded_by_role?: Role;
  notes?: string;
  uploaded_at: string;
}

export interface DisputeMessage {
  id: string;
  dispute_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: Role | 'SYSTEM';
  message: string;
  created_at: string;
}

export interface Dispute {
  id: string;
  dispute_number: string;
  target_type: DisputeTargetType;
  target_id: string;
  jeweller_id: string;
  karigar_id: string;
  jeweller_name?: string;
  karigar_name?: string;
  raised_by: string;
  raised_by_name?: string;
  raised_by_role?: Role;
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
  evidence_deadline?: string | null; // 72 hours auto-REVIEW timeout
  snapshot_data: Record<string, any>;
  snapshot_hash: string;
  resolution_proposal?: string | null;
  proposed_by?: string | null;
  proposed_by_name?: string | null;
  jeweller_accepted_at?: string | null;
  karigar_accepted_at?: string | null;
  at_fault_party?: AtFaultParty | null;
  penalty_points: number;
  settlement_adjustment_amount: number;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  evidence: DisputeEvidence[];
  messages: DisputeMessage[];
  created_at: string;
  updated_at: string;
}

export interface CreateDisputeRequest {
  target_type: DisputeTargetType;
  target_id: string;
  category: DisputeCategory;
  description: string;
  initial_evidence_url?: string;
  initial_evidence_notes?: string;
}

export interface AddDisputeEvidenceRequest {
  file_url: string;
  file_hash?: string;
  perceptual_hash?: string;
  notes?: string;
}

export interface AddDisputeMessageRequest {
  message: string;
}

export interface ProposeResolutionRequest {
  resolution_proposal: string;
  at_fault_party?: AtFaultParty;
  penalty_points?: number;
  settlement_adjustment_amount?: number;
  resolution_notes?: string;
}

export interface RespondResolutionRequest {
  action: 'ACCEPT' | 'REJECT';
  rejection_reason?: string;
}

export interface TransitionDisputeRequest {
  to_status: DisputeStatus;
  reason?: string;
}

export type DisputeResponse = ApiResponse<Dispute>;
export type DisputeListResponse = ApiResponse<Dispute[]>;
export type DisputeEvidenceResponse = ApiResponse<DisputeEvidence>;
export type DisputeMessageResponse = ApiResponse<DisputeMessage>;

export interface CreateSettlementRequest {
  order_id?: string | null;
  karigar_id: string;
  issued_grams: number;
  returned_grams: number;
  agreed_wastage_pct: number;
  actual_wastage_grams?: number;
  making_charge_per_gram: number;
  advances?: number;
  gold_value?: number;
  purity_karat?: number;
  notes?: string;
}

export interface ApproveSettlementRequest {
  signature?: string;
  notes?: string;
}

export interface DisputeSettlementRequest {
  dispute_reason: string;
}

export type SettlementListResponse = ApiResponse<Settlement[]>;
export type SettlementDetailResponse = ApiResponse<Settlement>;

export interface LedgerEntry {
  id: string;
  transaction_hash: string;
  previous_hash: string;
  sequence_number: number;
  jeweller_id: string;
  karigar_id: string;
  order_id: string | null;
  transaction_type: TransactionType;
  weight_grams: number;
  purity_karat: number;
  pure_weight_grams: number; // Derived: weight_grams * purity_karat / 24
  photo_evidence_url: string | null;
  perceptual_hash: string | null;
  signature_jeweller: string | null;
  signature_karigar: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  timestamp: string; // ISO 8601
  status: LedgerStatus;
  initiated_by: Role;
  confirmation_deadline: string; // timestamp + 24h
  confirmed_at: string | null;
  dispute_reason: string | null;
  metadata: LedgerMetadata;
  created_at: string;
}

export type GoldLedgerEntry = LedgerEntry;

/**
 * Data payload used to generate SHA-256 transaction hash
 */
export interface TransactionHashPayload {
  jeweller_id: string;
  karigar_id: string;
  order_id: string | null;
  transaction_type: TransactionType;
  weight_grams: number;
  purity_karat: number;
  photo_evidence_url: string | null;
  perceptual_hash: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  initiated_by: Role;
  metadata: LedgerMetadata;
}

// ==========================================
// 4. API Request Shapes
// ==========================================

export interface IssueGoldRequest {
  jeweller_id: string;
  karigar_id: string;
  order_id?: string | null;
  weight_grams: number;
  purity_karat: number;
  photo_evidence_url?: string | null;
  perceptual_hash?: string | null;
  signature_jeweller: string; // base64 canvas signature
  gps_lat?: number | null;
  gps_lng?: number | null;
  metadata?: LedgerMetadata;
  client_nonce?: string;
}
export type IssueGoldInput = IssueGoldRequest;

export interface ReturnGoldRequest {
  jeweller_id: string;
  karigar_id: string;
  order_id?: string | null;
  weight_grams: number; // finished goods returned
  wastage_grams?: number; // allowed or claimed wastage
  scrap_grams?: number; // scrap/dust returned
  purity_karat: number;
  photo_evidence_url?: string | null;
  perceptual_hash?: string | null;
  signature_karigar: string; // base64 canvas signature
  gps_lat?: number | null;
  gps_lng?: number | null;
  metadata?: LedgerMetadata;
  client_nonce?: string;
}
export type ReturnGoldInput = ReturnGoldRequest;

export interface ConfirmLedgerRequest {
  ledger_id: string;
  party: Role;
  signature: string; // base64 signature of confirming party
  action: 'CONFIRM' | 'REJECT';
  dispute_reason?: string;
}
export type ConfirmTransactionInput = ConfirmLedgerRequest;
export type ConfirmTransactionRequest = ConfirmLedgerRequest;
export type ConfirmTransactionResponse = ApiResponse<LedgerEntry>;
export type IssueGoldResponse = ApiResponse<LedgerEntry>;
export type ReturnGoldResponse = ApiResponse<LedgerEntry>;

export interface LedgerHistoryFilter {
  karigar_id?: string;
  jeweller_id?: string;
  order_id?: string;
  transaction_type?: TransactionType;
  status?: LedgerStatus;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'timestamp' | 'sequence_number' | 'weight_grams';
  sort_order?: 'ASC' | 'DESC';
}
export type HistoryFilter = LedgerHistoryFilter;

// Auth API requests
export interface SendOtpRequest {
  phone: string;
}

export interface VerifyOtpRequest {
  phone: string;
  otp: string;
  role?: Role;
  name?: string;
}

// Upload API requests
export interface SignedUploadUrlRequest {
  filename: string;
  contentType: string;
}

// Wastage Engine requests
export interface ProposeWastageRequest {
  order_ref: string;
  karigar_id: string;
  jeweller_id?: string;
  agreed_pct: number;
  design_complexity: DesignComplexity;
  category?: string;
  signature_jeweller?: string;
}

export interface RespondWastageRequest {
  agreement_id: string;
  action: 'ACCEPT' | 'REJECT';
  signature_karigar?: string;
  rejection_reason?: string;
}

export interface BenchmarkQuery {
  category?: string;
  complexity?: DesignComplexity;
}

export type ProposeWastageResponse = ApiResponse<WastageAgreement>;
export type RespondWastageResponse = ApiResponse<WastageAgreement>;
export type BenchmarkListResponse = ApiResponse<WastageBenchmark[]>;
export type WastageAgreementResponse = ApiResponse<WastageAgreement>;

// ==========================================
// 5. API Response Shapes & Wrappers
// ==========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: unknown;
}

export interface SendOtpResponse {
  success: boolean;
  message: string;
  demoOtp?: string;
  expiresInMinutes?: number;
  errors?: unknown;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
  errors?: unknown;
}

export interface AuthMeResponse {
  success: boolean;
  authenticated: boolean;
  user?: User;
  message?: string;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
}

export interface LedgerBalanceSummary {
  karigar_id: string;
  karigar_name?: string;
  jeweller_id?: string;
  total_issued_grams: number;
  total_returned_grams: number;
  total_wastage_grams: number;
  net_balance_grams: number;
  net_pure_balance_grams: number; // 24K equivalent
  breakdown_by_karat: {
    [karat: number]: {
      issued: number;
      returned: number;
      wastage: number;
      net: number;
      pureEquivalent: number;
    };
  };
  pending_confirmation_count: number;
  pending_confirmation_grams: number;
  disputed_count: number;
  last_transaction_timestamp: string | null;
}
export type BalanceSummary = LedgerBalanceSummary;
export type BalanceResponse = ApiResponse<LedgerBalanceSummary>;

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  summary: {
    totalWeight: number;
    totalPureWeight: number;
  };
}

export type HistoryResponse = ApiResponse<LedgerEntry[]> & {
  pagination?: PaginatedResult<LedgerEntry>['pagination'];
  summary?: PaginatedResult<LedgerEntry>['summary'];
};

export interface ChainVerificationResult {
  isValid: boolean;
  totalBlocks: number;
  verifiedAt: string;
  genesisHash: string;
  latestHash: string;
  tamperedBlock?: {
    sequence_number: number;
    id: string;
    expectedHash: string;
    actualHash: string;
    reason: string;
  };
}
export type VerifyChainResponse = ApiResponse<ChainVerificationResult>;

export interface SignedUploadUrlResult {
  uploadUrl: string;
  fileUrl: string;
  storagePath: string;
  expiresAt: string;
  provider: 'gcs' | 'local_mock';
}
export type SignedUploadUrlResponse = ApiResponse<SignedUploadUrlResult>;

export interface SignedReadUrlResult {
  readUrl: string;
  expiresAt: string;
}
export type SignedReadUrlResponse = ApiResponse<SignedReadUrlResult>;

export interface DirectUploadResult {
  photoUrl: string;
  perceptualHash: string;
  originalName: string;
  size: number;
}
export type DirectUploadResponse = ApiResponse<DirectUploadResult>;

// ==========================================
// 6. Utility & Hardware Integration Shapes
// ==========================================

export interface ScaleReading {
  weightGrams: number;
  isStable: boolean;
  unit: 'g' | 'tola' | string;
  scaleModel?: string;
  timestamp: string | number;
}

export interface CompressionResult {
  file: File;
  blob?: Blob;
  dataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width?: number;
  height?: number;
  compressionRatio: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

// ==========================================
// 7. Offline Queue Models
// ==========================================

export interface OfflineQueuedTransaction {
  id: string; // client temporary id
  client_nonce: string;
  endpoint: '/api/ledger/issue' | '/api/ledger/return' | '/api/ledger/confirm';
  payload: IssueGoldRequest | ReturnGoldRequest | ConfirmLedgerRequest;
  createdAt: string;
  attempts: number;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'RESOLVED_CONFLICT';
  lastError?: string;
  needsManualReview?: boolean;
}
