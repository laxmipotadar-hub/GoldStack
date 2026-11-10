import { describe, it, expect } from 'vitest';
import {
  GENESIS_PREVIOUS_HASH,
  canonicalStringify,
  calculateTransactionHash,
  extractHashPayload,
  verifyLedgerChain
} from '../server/crypto/hashChain.js';
import { LedgerEntry, GoldLedgerEntry } from '../shared/types.js';

describe('Immutable Gold Ledger Hash Chain', () => {
  it('should deterministically stringify JSON regardless of key ordering', () => {
    const objA = { weight_grams: 50.0, purity_karat: 22, notes: 'Jewellery' };
    const objB = { notes: 'Jewellery', purity_karat: 22, weight_grams: 50.0 };

    expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
    expect(canonicalStringify(objA)).toBe('{"notes":"Jewellery","purity_karat":22,"weight_grams":50}');
  });

  it('should generate consistent SHA-256 hash for identical data and timestamp', () => {
    const payload = extractHashPayload({
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      order_id: 'ORD-101',
      transaction_type: 'ISSUE',
      weight_grams: 100.0,
      purity_karat: 22,
      initiated_by: 'JEWELLER'
    });

    const timestamp = '2026-11-08T12:00:00.000Z';
    const hash1 = calculateTransactionHash(GENESIS_PREVIOUS_HASH, payload, timestamp);
    const hash2 = calculateTransactionHash(GENESIS_PREVIOUS_HASH, payload, timestamp);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should successfully verify a genuine sequential blockchain of transactions', () => {
    const timestamp1 = '2026-11-08T10:00:00.000Z';
    const payload1 = extractHashPayload({
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      transaction_type: 'ISSUE',
      weight_grams: 100.0,
      purity_karat: 22,
      initiated_by: 'JEWELLER'
    });
    const hash1 = calculateTransactionHash(GENESIS_PREVIOUS_HASH, payload1, timestamp1);

    const block1: GoldLedgerEntry = {
      id: 'block-1',
      transaction_hash: hash1,
      previous_hash: GENESIS_PREVIOUS_HASH,
      sequence_number: 1,
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      order_id: null,
      transaction_type: 'ISSUE',
      weight_grams: 100.0,
      purity_karat: 22,
      pure_weight_grams: 91.6667,
      photo_evidence_url: null,
      perceptual_hash: null,
      signature_jeweller: 'sig-j1',
      signature_karigar: 'sig-k1',
      gps_lat: null,
      gps_lng: null,
      timestamp: timestamp1,
      status: 'CONFIRMED',
      initiated_by: 'JEWELLER',
      confirmation_deadline: '2026-11-09T10:00:00.000Z',
      confirmed_at: '2026-11-08T10:15:00.000Z',
      dispute_reason: null,
      metadata: {},
      created_at: timestamp1
    };

    const timestamp2 = '2026-11-08T14:00:00.000Z';
    const payload2 = extractHashPayload({
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      transaction_type: 'RETURN',
      weight_grams: 98.5,
      purity_karat: 22,
      initiated_by: 'KARIGAR'
    });
    const hash2 = calculateTransactionHash(hash1, payload2, timestamp2);

    const block2: GoldLedgerEntry = {
      id: 'block-2',
      transaction_hash: hash2,
      previous_hash: hash1,
      sequence_number: 2,
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      order_id: null,
      transaction_type: 'RETURN',
      weight_grams: 98.5,
      purity_karat: 22,
      pure_weight_grams: 90.2917,
      photo_evidence_url: null,
      perceptual_hash: null,
      signature_jeweller: 'sig-j2',
      signature_karigar: 'sig-k2',
      gps_lat: null,
      gps_lng: null,
      timestamp: timestamp2,
      status: 'CONFIRMED',
      initiated_by: 'KARIGAR',
      confirmation_deadline: '2026-11-09T14:00:00.000Z',
      confirmed_at: '2026-11-08T14:10:00.000Z',
      dispute_reason: null,
      metadata: {},
      created_at: timestamp2
    };

    const result = verifyLedgerChain([block1, block2]);
    expect(result.isValid).toBe(true);
    expect(result.totalBlocks).toBe(2);
    expect(result.tamperedBlock).toBeUndefined();
  });

  it('should immediately detect tampering if transaction weight is altered', () => {
    const timestamp1 = '2026-11-08T10:00:00.000Z';
    const payload1 = extractHashPayload({
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      transaction_type: 'ISSUE',
      weight_grams: 100.0,
      purity_karat: 22,
      initiated_by: 'JEWELLER'
    });
    const hash1 = calculateTransactionHash(GENESIS_PREVIOUS_HASH, payload1, timestamp1);

    const block1: GoldLedgerEntry = {
      id: 'block-1',
      transaction_hash: hash1,
      previous_hash: GENESIS_PREVIOUS_HASH,
      sequence_number: 1,
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      order_id: null,
      transaction_type: 'ISSUE',
      weight_grams: 100.0, // Original 100g
      purity_karat: 22,
      pure_weight_grams: 91.6667,
      photo_evidence_url: null,
      perceptual_hash: null,
      signature_jeweller: 'sig-j1',
      signature_karigar: null,
      gps_lat: null,
      gps_lng: null,
      timestamp: timestamp1,
      status: 'CONFIRMED',
      initiated_by: 'JEWELLER',
      confirmation_deadline: '2026-11-09T10:00:00.000Z',
      confirmed_at: null,
      dispute_reason: null,
      metadata: {},
      created_at: timestamp1
    };

    // Maliciously modify weight in database without updating hash
    const tamperedBlock1: GoldLedgerEntry = {
      ...block1,
      weight_grams: 105.0 // Tampered!
    };

    const result = verifyLedgerChain([tamperedBlock1]);
    expect(result.isValid).toBe(false);
    expect(result.tamperedBlock).toBeDefined();
    expect(result.tamperedBlock?.sequence_number).toBe(1);
    expect(result.tamperedBlock?.reason).toContain('Cryptographic tamper detected');
  });

  it('should detect broken link if previous_hash pointer is broken', () => {
    const timestamp1 = '2026-11-08T10:00:00.000Z';
    const payload1 = extractHashPayload({
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      transaction_type: 'ISSUE',
      weight_grams: 50.0,
      purity_karat: 22,
      initiated_by: 'JEWELLER'
    });
    const hash1 = calculateTransactionHash(GENESIS_PREVIOUS_HASH, payload1, timestamp1);

    const block1: GoldLedgerEntry = {
      id: 'block-1',
      transaction_hash: hash1,
      previous_hash: GENESIS_PREVIOUS_HASH,
      sequence_number: 1,
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      order_id: null,
      transaction_type: 'ISSUE',
      weight_grams: 50.0,
      purity_karat: 22,
      pure_weight_grams: 45.8333,
      photo_evidence_url: null,
      perceptual_hash: null,
      signature_jeweller: 'sig',
      signature_karigar: null,
      gps_lat: null,
      gps_lng: null,
      timestamp: timestamp1,
      status: 'CONFIRMED',
      initiated_by: 'JEWELLER',
      confirmation_deadline: '2026-11-09T10:00:00.000Z',
      confirmed_at: null,
      dispute_reason: null,
      metadata: {},
      created_at: timestamp1
    };

    const timestamp2 = '2026-11-08T11:00:00.000Z';
    const fakePrevHash = '1111111111111111111111111111111111111111111111111111111111111111';
    const payload2 = extractHashPayload({
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      transaction_type: 'RETURN',
      weight_grams: 50.0,
      purity_karat: 22,
      initiated_by: 'KARIGAR'
    });
    const hash2 = calculateTransactionHash(fakePrevHash, payload2, timestamp2);

    const block2: GoldLedgerEntry = {
      id: 'block-2',
      transaction_hash: hash2,
      previous_hash: fakePrevHash, // Does not link to hash1!
      sequence_number: 2,
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      order_id: null,
      transaction_type: 'RETURN',
      weight_grams: 50.0,
      purity_karat: 22,
      pure_weight_grams: 45.8333,
      photo_evidence_url: null,
      perceptual_hash: null,
      signature_jeweller: null,
      signature_karigar: 'sig',
      gps_lat: null,
      gps_lng: null,
      timestamp: timestamp2,
      status: 'CONFIRMED',
      initiated_by: 'KARIGAR',
      confirmation_deadline: '2026-11-09T11:00:00.000Z',
      confirmed_at: null,
      dispute_reason: null,
      metadata: {},
      created_at: timestamp2
    };

    const result = verifyLedgerChain([block1, block2]);
    expect(result.isValid).toBe(false);
    expect(result.tamperedBlock?.reason).toContain('Broken chain link at block #2');
  });
});

