import { describe, it, expect } from 'vitest';
import {
  calculateSettlement,
  WASTAGE_TOLERANCE_THRESHOLD_PCT
} from '../shared/settlementCalculation.js';

describe('Settlement Calculation Matrix & Pure Functions (shared/settlementCalculation.ts)', () => {
  const goldRate = 7420; // ₹ 7,420/g (from UI header 24K bullion rate)
  const makingCharge = 650; // ₹ 650/g making charges

  // 1. Exact Wastage Match
  it('should compute zero excess deduction and zero shortage when wastage matches agreed percentage exactly', () => {
    // 100g issued, 6.0% agreed wastage (6.0g allowed).
    // Returned: 94.0g. Actual wastage: 6.0g.
    const result = calculateSettlement({
      issuedGrams: 100.0,
      returnedGrams: 94.0,
      agreedWastagePct: 6.0,
      goldRatePerGram24K: goldRate,
      makingChargePerGram: makingCharge,
      advances: 10000
    });

    expect(result.allowed_wastage_grams).toBe(6.0);
    expect(result.actual_wastage_grams).toBe(6.0);
    expect(result.excess_wastage_grams).toBe(0.0);
    expect(result.wastage_adjustment).toBe(0.0); // No excess deduction
    expect(result.shortage_grams).toBe(0.0);
    expect(result.shortage_penalty).toBe(0.0); // No shortage penalty

    // Making charges = 94.0g * 650 = ₹ 61,100
    expect(result.making_charges).toBe(61100);

    // Net payable = 61,100 - 0 (deductions) - 10,000 (advances) = ₹ 51,100
    expect(result.net_payable).toBe(51100);
    expect(result.is_within_tolerance).toBe(true);
    expect(result.variance_pct).toBe(0.0);

    // Validate line items
    expect(result.line_items.length).toBeGreaterThanOrEqual(6);
    const makingItem = result.line_items.find((li) => li.category === 'MAKING_CHARGES')!;
    expect(makingItem.amount).toBe(61100);

    const deductionItem = result.line_items.find((li) => li.category === 'WASTAGE_DEDUCTION')!;
    expect(deductionItem.amount).toBe(0);
  });

  // 2. Excess Wastage Deduction
  it('should compute excess wastage deduction: max(0, actual - allowed) × rate', () => {
    // 100g issued, 6.0% agreed (6.0g allowed).
    // Returned: 92.5g. Actual wastage: 7.5g.
    // Excess = 7.5 - 6.0 = 1.5g excess.
    const result = calculateSettlement({
      issuedGrams: 100.0,
      returnedGrams: 92.5,
      agreedWastagePct: 6.0,
      goldRatePerGram24K: goldRate,
      makingChargePerGram: makingCharge,
      advances: 0
    });

    expect(result.allowed_wastage_grams).toBe(6.0);
    expect(result.actual_wastage_grams).toBe(7.5);
    expect(result.excess_wastage_grams).toBe(1.5);

    // Excess deduction = 1.5g * 7,420 = ₹ 11,130
    expect(result.wastage_adjustment).toBe(11130);
    expect(result.shortage_penalty).toBe(0);

    // Making charges = 92.5 * 650 = ₹ 60,125
    expect(result.making_charges).toBe(60125);

    // Net payable = 60,125 - 11,130 = ₹ 48,995
    expect(result.net_payable).toBe(48995);
  });

  // 3. Shortage Penalty with 110% Surcharge
  it('should compute shortage penalty: max(0, issued - returned - actual) × rate × 1.1', () => {
    // 100g issued, 90g returned, but artisan reported only 6g actual wastage.
    // Missing/unaccounted = 100 - 90 - 6 = 4.0g unaccounted shortage!
    const result = calculateSettlement({
      issuedGrams: 100.0,
      returnedGrams: 90.0,
      actualWastageGrams: 6.0,
      agreedWastagePct: 6.0,
      goldRatePerGram24K: goldRate,
      makingChargePerGram: makingCharge,
      advances: 0
    });

    expect(result.allowed_wastage_grams).toBe(6.0);
    expect(result.actual_wastage_grams).toBe(6.0);
    expect(result.excess_wastage_grams).toBe(0);
    expect(result.shortage_grams).toBe(4.0);

    // Shortage penalty = 4.0g * 7,420 * 1.1 = ₹ 32,648
    const expectedPenalty = Number((4.0 * goldRate * 1.1).toFixed(2));
    expect(result.shortage_penalty).toBe(expectedPenalty);
    expect(result.shortage_penalty).toBe(32648);

    // Making charges = 90 * 650 = ₹ 58,500
    // Net payable = 58,500 - 32,648 = ₹ 25,852
    expect(result.net_payable).toBe(25852);

    const shortageItem = result.line_items.find((li) => li.category === 'SHORTAGE_PENALTY')!;
    expect(shortageItem.amount).toBe(-32648);
    expect(shortageItem.description).toContain('1.1 penalty surcharge');
  });

  // 4. Advances Exceeding Total Payable (Negative Net Payable / Debit Balance)
  it('should compute negative net payable when advances exceed making charges minus deductions', () => {
    // Making charges = 50g * 600 = ₹ 30,000.
    // Advances drawn = ₹ 50,000.
    // Net payable = 30,000 - 50,000 = -₹ 20,000 (Karigar owes Jeweller).
    const result = calculateSettlement({
      issuedGrams: 53.0,
      returnedGrams: 50.0,
      agreedWastagePct: 6.0,
      actualWastageGrams: 3.0,
      goldRatePerGram24K: goldRate,
      makingChargePerGram: 600,
      advances: 50000
    });

    expect(result.making_charges).toBe(30000);
    expect(result.advances).toBe(50000);
    expect(result.net_payable).toBe(-20000);
  });

  // 5. Boundary at the ±2% Wastage Threshold
  describe('Boundary at ±2.0% Threshold', () => {
    it('should be within tolerance at the exact +2.0% boundary', () => {
      // Agreed: 6.0%. Actual: 8.0% (variance = +2.0%).
      const result = calculateSettlement({
        issuedGrams: 100.0,
        returnedGrams: 92.0,
        agreedWastagePct: 6.0,
        actualWastageGrams: 8.0,
        goldRatePerGram24K: goldRate,
        makingChargePerGram: makingCharge
      });

      expect(result.variance_pct).toBe(2.0);
      expect(result.is_within_tolerance).toBe(true);
    });

    it('should flag exceeding tolerance when variance is above +2.0% (e.g. +2.01%)', () => {
      // Agreed: 6.0%. Actual: 8.05% (variance = +2.05%).
      const result = calculateSettlement({
        issuedGrams: 100.0,
        returnedGrams: 91.95,
        agreedWastagePct: 6.0,
        actualWastageGrams: 8.05,
        goldRatePerGram24K: goldRate,
        makingChargePerGram: makingCharge
      });

      expect(result.variance_pct).toBe(2.05);
      expect(result.is_within_tolerance).toBe(false);
    });

    it('should be within tolerance when variance is under +2.0% (e.g. +1.9%)', () => {
      // Agreed: 6.0%. Actual: 7.9% (variance = +1.9%).
      const result = calculateSettlement({
        issuedGrams: 100.0,
        returnedGrams: 92.1,
        agreedWastagePct: 6.0,
        actualWastageGrams: 7.9,
        goldRatePerGram24K: goldRate,
        makingChargePerGram: makingCharge
      });

      expect(result.variance_pct).toBe(1.9);
      expect(result.is_within_tolerance).toBe(true);
    });
  });

  // 6. Comprehensive Combined Scenario (Gold Value + Making Charges - Excess - Shortage - Advances)
  it('should compute net_payable = gold_value + making_charges - deductions - advances with full explainable line items', () => {
    // Issued: 100g, Returned: 90g, Actual wastage: 7.0g (Agreed: 5.0% = 5.0g allowed).
    // Excess wastage: 7.0 - 5.0 = 2.0g.
    // Unaccounted shortage: 100 - 90 - 7 = 3.0g.
    // Gold Value: ₹ 20,000.
    // Advances: ₹ 15,000.
    // 24K Rate: 7,420. Purity: 22K (rate = 7420 * 22 / 24 = 6801.67).
    const purity = 22;
    const rate22k = Number(((goldRate * 22) / 24).toFixed(2)); // 6801.67

    const result = calculateSettlement({
      issuedGrams: 100.0,
      returnedGrams: 90.0,
      actualWastageGrams: 7.0,
      agreedWastagePct: 5.0,
      goldRatePerGram24K: goldRate,
      purityKarat: purity,
      makingChargePerGram: 800,
      goldValueComponent: 20000,
      advances: 15000
    });

    expect(result.effective_gold_rate).toBe(rate22k);

    // Excess wastage deduction = 2.0 * 6801.67 = ₹ 13,603.34
    const expectedWastageAdj = Number((2.0 * rate22k).toFixed(2));
    expect(result.wastage_adjustment).toBe(expectedWastageAdj);

    // Shortage penalty = 3.0 * 6801.67 * 1.1 = ₹ 22,445.51
    const expectedShortagePenalty = Number((3.0 * rate22k * 1.1).toFixed(2));
    expect(result.shortage_penalty).toBe(expectedShortagePenalty);

    // Making charges = 90 * 800 = ₹ 72,000
    expect(result.making_charges).toBe(72000);

    // Total deductions = 13,603.34 + 22,445.51 = 36,048.85
    expect(result.total_deductions).toBe(Number((expectedWastageAdj + expectedShortagePenalty).toFixed(2)));

    // Net payable = 20,000 + 72,000 - 36,048.85 - 15,000 = ₹ 40,951.15
    const expectedNet = Number((20000 + 72000 - result.total_deductions - 15000).toFixed(2));
    expect(result.net_payable).toBe(expectedNet);

    // Verify all line items are present and have bilingual headers
    for (const item of result.line_items) {
      expect(item.titleEn).toBeDefined();
      expect(item.titleHi).toBeDefined();
      expect(item.description).toBeDefined();
      expect(typeof item.amount).toBe('number');
    }
  });
});

