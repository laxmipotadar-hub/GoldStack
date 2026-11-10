/**
 * Pure TypeScript Settlement Calculation Engine
 * 
 * Computes transparent, line-by-line financial settlements for jewellery job-work
 * between Showroom Jewellers and Karigar Artisans.
 * 
 * Formulas:
 * - allowed_wastage = issued_grams * (agreed_wastage_pct / 100)
 * - excess_wastage_deduction = max(0, actual - allowed) * rate
 * - shortage_penalty = max(0, issued - returned - actual) * rate * 1.1 (10% surcharge penalty)
 * - net_payable = gold_value + making_charges - deductions - advances
 * 
 * Every line item is individually explainable in bilingual English & Devanagari Hindi.
 */

import {
  SettlementCalculationInput,
  SettlementCalculationResult,
  SettlementLineItem
} from './types.js';

export type {
  SettlementCalculationInput,
  SettlementCalculationResult,
  SettlementLineItem
};

/**
 * Standard tolerance threshold above agreed wastage percentage (+2.0%)
 */
export const WASTAGE_TOLERANCE_THRESHOLD_PCT = 2.0;

/**
 * Computes exact job-work settlement metrics and transparent line-item breakdown
 */
export function calculateSettlement(input: SettlementCalculationInput): SettlementCalculationResult {
  const {
    issuedGrams,
    returnedGrams,
    agreedWastagePct,
    goldRatePerGram24K,
    purityKarat = 24,
    makingChargePerGram,
    advances = 0,
    goldValueComponent = 0
  } = input;

  if (issuedGrams < 0 || returnedGrams < 0) {
    throw new Error('Issued and returned weights cannot be negative.');
  }

  // 1. Calculate effective gold rate based on karat purity (default: 24K fine bullion)
  const effectiveGoldRate =
    purityKarat === 24
      ? goldRatePerGram24K
      : Number(((goldRatePerGram24K * purityKarat) / 24).toFixed(2));

  // 2. Wastage breakdown
  const allowedWastageGrams = Number(((issuedGrams * agreedWastagePct) / 100).toFixed(4));
  
  // If actualWastageGrams not passed explicitly, derive it from issued - returned
  const actualWastageGrams =
    input.actualWastageGrams !== undefined
      ? Number(input.actualWastageGrams.toFixed(4))
      : Number(Math.max(0, issuedGrams - returnedGrams).toFixed(4));

  const actualWastagePct =
    issuedGrams > 0
      ? Number(((actualWastageGrams / issuedGrams) * 100).toFixed(2))
      : 0;

  const excessWastageGrams = Number(Math.max(0, actualWastageGrams - allowedWastageGrams).toFixed(4));

  // 3. Excess Wastage Deduction: max(0, actual - allowed) * rate
  const wastageAdjustment = Number((excessWastageGrams * effectiveGoldRate).toFixed(2));

  // 4. Shortage Penalty: max(0, issued - returned - actual) * rate * 1.1
  const shortageGrams = Number(Math.max(0, issuedGrams - returnedGrams - actualWastageGrams).toFixed(4));
  const shortagePenalty = Number((shortageGrams * effectiveGoldRate * 1.1).toFixed(2));

  // 5. Base Making Charges
  const makingCharges = Number((returnedGrams * makingChargePerGram).toFixed(2));

  // 6. Gold Value Component
  const goldValue = Number(goldValueComponent.toFixed(2));

  // 7. Total Deductions & Advances
  const totalDeductions = Number((wastageAdjustment + shortagePenalty).toFixed(2));
  const advancesAmount = Number(advances.toFixed(2));

  // 8. Net Payable = gold_value + making_charges - deductions - advances
  const netPayable = Number((goldValue + makingCharges - totalDeductions - advancesAmount).toFixed(2));

  // 9. Tolerance check at boundary (agreed + 2.0%)
  const variancePct = Number((actualWastagePct - agreedWastagePct).toFixed(2));
  const isWithinTolerance = variancePct <= WASTAGE_TOLERANCE_THRESHOLD_PCT;

  // 10. Generate Transparent Explainable Line Items
  const lineItems: SettlementLineItem[] = [];

  // Line Item 1: Base Making Charges
  lineItems.push({
    id: 'li-making-charges',
    category: 'MAKING_CHARGES',
    titleEn: 'Crafting Making Charges (मजदूरी)',
    titleHi: 'कारीगरी मजदूरी',
    description: `${returnedGrams.toFixed(3)}g returned jewellery @ ₹${makingChargePerGram.toLocaleString('en-IN')}/g`,
    quantity: returnedGrams,
    unit: 'g',
    rate: makingChargePerGram,
    amount: makingCharges,
    type: 'CREDIT'
  });

  // Line Item 2: Gold Value Component (if applicable)
  if (goldValue > 0) {
    lineItems.push({
      id: 'li-gold-value',
      category: 'GOLD_VALUE',
      titleEn: 'Gold Value Component (स्वर्ण मूल्य)',
      titleHi: 'स्वर्ण मूल्य घटक',
      description: 'Bullion / fine metal valuation credited to artisan',
      amount: goldValue,
      type: 'CREDIT'
    });
  }

  // Line Item 3: Allowed Wastage Reference (Info)
  lineItems.push({
    id: 'li-allowed-wastage',
    category: 'INFO',
    titleEn: 'Agreed Wastage Allowance (मान्य टूट)',
    titleHi: 'अनुबंधित मान्य छीजन',
    description: `${agreedWastagePct.toFixed(2)}% on ${issuedGrams.toFixed(3)}g issued = ${allowedWastageGrams.toFixed(3)}g allowed`,
    quantity: allowedWastageGrams,
    unit: 'g',
    rate: agreedWastagePct,
    amount: 0,
    type: 'INFO'
  });

  // Line Item 4: Actual Wastage Incurred (Info)
  lineItems.push({
    id: 'li-actual-wastage',
    category: 'INFO',
    titleEn: 'Actual Wastage Incurred (वास्तविक छीजन)',
    titleHi: 'कार्यशाला वास्तविक टूट',
    description: `${actualWastageGrams.toFixed(3)}g (${actualWastagePct.toFixed(2)}%) bench loss recorded`,
    quantity: actualWastageGrams,
    unit: 'g',
    rate: actualWastagePct,
    amount: 0,
    type: 'INFO'
  });

  // Line Item 5: Excess Wastage Deduction
  lineItems.push({
    id: 'li-excess-wastage',
    category: 'WASTAGE_DEDUCTION',
    titleEn: 'Excess Wastage Deduction (अतिरिक्त टूट कटौती)',
    titleHi: 'अतिरिक्त छीजन कटौती',
    description:
      excessWastageGrams > 0
        ? `${excessWastageGrams.toFixed(3)}g excess above agreed limit @ ₹${effectiveGoldRate.toLocaleString('en-IN')}/g`
        : 'Zero excess wastage deduction (loss within agreed tolerance)',
    quantity: excessWastageGrams,
    unit: 'g',
    rate: effectiveGoldRate,
    amount: wastageAdjustment === 0 ? 0 : -wastageAdjustment,
    type: 'DEBIT'
  });

  // Line Item 6: Unaccounted Shortage Penalty (110%)
  lineItems.push({
    id: 'li-shortage-penalty',
    category: 'SHORTAGE_PENALTY',
    titleEn: 'Unaccounted Shortage Penalty 110% (लापता स्वर्ण दंड)',
    titleHi: 'अस्पष्ट स्वर्ण अंतर दंड (110%)',
    description:
      shortageGrams > 0
        ? `${shortageGrams.toFixed(3)}g missing metal @ ₹${effectiveGoldRate.toLocaleString('en-IN')}/g × 1.1 penalty surcharge`
        : 'Zero shortage penalty (all issued gold accounted)',
    quantity: shortageGrams,
    unit: 'g',
    rate: effectiveGoldRate * 1.1,
    amount: shortagePenalty === 0 ? 0 : -shortagePenalty,
    type: 'DEBIT'
  });

  // Line Item 7: Advances Deducted
  if (advancesAmount > 0) {
    lineItems.push({
      id: 'li-advances',
      category: 'ADVANCES',
      titleEn: 'Advances Deducted (अग्रिम राशि कटौती)',
      titleHi: 'पूर्व अग्रिम भुगतान कटौती',
      description: 'Prior cash & bullion advances drawn against job-work order',
      amount: -advancesAmount,
      type: 'DEBIT'
    });
  }

  return {
    gold_value: goldValue,
    making_charges: makingCharges,
    wastage_adjustment: wastageAdjustment,
    shortage_penalty: shortagePenalty,
    advances: advancesAmount,
    total_deductions: totalDeductions,
    net_payable: netPayable,
    allowed_wastage_grams: allowedWastageGrams,
    actual_wastage_grams: actualWastageGrams,
    excess_wastage_grams: excessWastageGrams,
    shortage_grams: shortageGrams,
    actual_wastage_pct: actualWastagePct,
    effective_gold_rate: effectiveGoldRate,
    is_within_tolerance: isWithinTolerance,
    variance_pct: variancePct,
    line_items: lineItems
  };
}
