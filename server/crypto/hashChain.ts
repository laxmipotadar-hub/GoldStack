import crypto from 'node:crypto';
import {
  LedgerEntry,
  GoldLedgerEntry,
  TransactionHashPayload,
  ChainVerificationResult
} from '../../shared/types.js';

export const GENESIS_PREVIOUS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Deterministically serialize any object by sorting keys alphabetically
 * and formatting values canonically so SHA-256 hashes are 100% reproducible.
 */
export function canonicalStringify(val: unknown): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'number') {
    // Standardize floating point representation
    return Number.isFinite(val) ? val.toString() : 'null';
  }
  if (typeof val === 'boolean' || typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const parts = keys
      .filter((k) => (val as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalStringify((val as Record<string, unknown>)[k])}`);
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(val);
}

/**
 * Extract canonical hash payload from a ledger entry or request
 */
export function extractHashPayload(entry: Partial<GoldLedgerEntry> & {
  jeweller_id: string;
  karigar_id: string;
  transaction_type: GoldLedgerEntry['transaction_type'];
  weight_grams: number;
  purity_karat: number;
  initiated_by: GoldLedgerEntry['initiated_by'];
}): TransactionHashPayload {
  return {
    jeweller_id: entry.jeweller_id,
    karigar_id: entry.karigar_id,
    order_id: entry.order_id || null,
    transaction_type: entry.transaction_type,
    weight_grams: Number(Number(entry.weight_grams).toFixed(2)),
    purity_karat: Number(entry.purity_karat),
    photo_evidence_url: entry.photo_evidence_url || null,
    perceptual_hash: entry.perceptual_hash || null,
    gps_lat: entry.gps_lat !== undefined && entry.gps_lat !== null ? Number(Number(entry.gps_lat).toFixed(7)) : null,
    gps_lng: entry.gps_lng !== undefined && entry.gps_lng !== null ? Number(Number(entry.gps_lng).toFixed(7)) : null,
    initiated_by: entry.initiated_by,
    metadata: entry.metadata || {}
  };
}

/**
 * Calculate SHA-256 hash for a ledger block
 * Formula: SHA256(previous_hash + canonicalStringify(transaction_data) + timestamp)
 */
export function calculateTransactionHash(
  previousHash: string,
  transactionData: TransactionHashPayload,
  timestamp: string
): string {
  const serializedPayload = canonicalStringify(transactionData);
  const rawDataToHash = `${previousHash}${serializedPayload}${timestamp}`;
  return crypto.createHash('sha256').update(rawDataToHash, 'utf8').digest('hex');
}

/**
 * Validates the entire ledger blockchain.
 * Walks through each block in chronological order:
 * 1. Checks that genesis block links to GENESIS_PREVIOUS_HASH
 * 2. Checks that each block's previous_hash equals preceding block's transaction_hash
 * 3. Re-computes SHA-256 hash from block's core payload and compares with transaction_hash
 */
export function verifyLedgerChain(entries: GoldLedgerEntry[]): ChainVerificationResult {
  const verifiedAt = new Date().toISOString();

  if (!entries || entries.length === 0) {
    return {
      isValid: true,
      totalBlocks: 0,
      verifiedAt,
      genesisHash: GENESIS_PREVIOUS_HASH,
      latestHash: GENESIS_PREVIOUS_HASH
    };
  }

  // Sort ascending by sequence_number
  const sorted = [...entries].sort((a, b) => a.sequence_number - b.sequence_number);

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];

    // Check link to previous block
    if (i === 0) {
      if (current.previous_hash !== GENESIS_PREVIOUS_HASH) {
        return {
          isValid: false,
          totalBlocks: sorted.length,
          verifiedAt,
          genesisHash: current.previous_hash,
          latestHash: sorted[sorted.length - 1].transaction_hash,
          tamperedBlock: {
            sequence_number: current.sequence_number,
            id: current.id,
            expectedHash: GENESIS_PREVIOUS_HASH,
            actualHash: current.previous_hash,
            reason: `Genesis block previous_hash must match genesis constant. Got ${current.previous_hash}`
          }
        };
      }
    } else {
      const prev = sorted[i - 1];
      if (current.previous_hash !== prev.transaction_hash) {
        return {
          isValid: false,
          totalBlocks: sorted.length,
          verifiedAt,
          genesisHash: sorted[0].transaction_hash,
          latestHash: sorted[sorted.length - 1].transaction_hash,
          tamperedBlock: {
            sequence_number: current.sequence_number,
            id: current.id,
            expectedHash: prev.transaction_hash,
            actualHash: current.previous_hash,
            reason: `Broken chain link at block #${current.sequence_number}. previous_hash does not match block #${prev.sequence_number}'s transaction_hash.`
          }
        };
      }
    }

    // Recompute current block hash
    const payload = extractHashPayload(current);
    const expectedHash = calculateTransactionHash(current.previous_hash, payload, current.timestamp);

    if (expectedHash !== current.transaction_hash) {
      return {
        isValid: false,
        totalBlocks: sorted.length,
        verifiedAt,
        genesisHash: sorted[0].transaction_hash,
        latestHash: sorted[sorted.length - 1].transaction_hash,
        tamperedBlock: {
          sequence_number: current.sequence_number,
          id: current.id,
          expectedHash,
          actualHash: current.transaction_hash,
          reason: `Cryptographic tamper detected at block #${current.sequence_number}! Block payload or timestamp has been altered.`
        }
      };
    }
  }

  return {
    isValid: true,
    totalBlocks: sorted.length,
    verifiedAt,
    genesisHash: sorted[0].transaction_hash,
    latestHash: sorted[sorted.length - 1].transaction_hash
  };
}

