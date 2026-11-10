import { describe, it, expect, beforeEach } from 'vitest';
import { LedgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { verifyLedgerChain } from '../server/crypto/hashChain.js';

describe('LedgerRepository & Dual Confirmation Workflow', () => {
  let repo: LedgerRepository;

  beforeEach(async () => {
    repo = new LedgerRepository();
    await repo.init();
  });

  it('should initialize with seed data and verified genesis hash chain', async () => {
    const entries = await repo.getAllEntriesForVerification();
    expect(entries.length).toBeGreaterThanOrEqual(5);

    const verification = verifyLedgerChain(entries);
    expect(verification.isValid).toBe(true);
    expect(verification.totalBlocks).toBe(entries.length);
  });

  it('should create an ISSUE entry with status PENDING_CONFIRMATION and correct 24K pure weight', async () => {
    const jeweller = SEED_PARTIES[0];
    const karigar = SEED_PARTIES[1];

    const entry = await repo.createIssueEntry({
      jeweller_id: jeweller.id,
      karigar_id: karigar.id,
      order_id: 'ORD-TEST-1',
      weight_grams: 50.0,
      purity_karat: 22,
      signature_jeweller: 'data:image/png;base64,jeweller-sig'
    });

    expect(entry.status).toBe('PENDING_CONFIRMATION');
    expect(entry.transaction_type).toBe('ISSUE');
    expect(entry.weight_grams).toBe(50.0);
    // 50 * 22 / 24 = 45.8333
    expect(entry.pure_weight_grams).toBeCloseTo(45.8333, 3);
    expect(entry.signature_jeweller).toBe('data:image/png;base64,jeweller-sig');
    expect(entry.signature_karigar).toBeNull();

    // Verify hash chain remains valid with this new block appended
    const all = await repo.getAllEntriesForVerification();
    const verification = verifyLedgerChain(all);
    expect(verification.isValid).toBe(true);
  });

  it('should perform dual confirmation by counterparty and lock status to CONFIRMED', async () => {
    const jeweller = SEED_PARTIES[0];
    const karigar = SEED_PARTIES[1];

    const issueEntry = await repo.createIssueEntry({
      jeweller_id: jeweller.id,
      karigar_id: karigar.id,
      order_id: 'ORD-TEST-CONFIRM',
      weight_grams: 30.0,
      purity_karat: 22,
      signature_jeweller: 'data:image/png;base64,jeweller-sig'
    });

    // Karigar confirms receipt with their signature
    const confirmed = await repo.confirmEntry({
      ledger_id: issueEntry.id,
      party: 'KARIGAR',
      signature: 'data:image/png;base64,karigar-sig',
      action: 'CONFIRM'
    });

    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.signature_karigar).toBe('data:image/png;base64,karigar-sig');
    expect(confirmed.confirmed_at).toBeDefined();

    // Verify cannot re-modify confirmed entry
    await expect(
      repo.confirmEntry({
        ledger_id: issueEntry.id,
        party: 'KARIGAR',
        signature: 'new-sig',
        action: 'CONFIRM'
      })
    ).rejects.toThrow('already been confirmed and cannot be modified');
  });

  it('should correctly mark an entry as DISPUTED with reason if counterparty rejects', async () => {
    const jeweller = SEED_PARTIES[0];
    const karigar = SEED_PARTIES[1];

    const issueEntry = await repo.createIssueEntry({
      jeweller_id: jeweller.id,
      karigar_id: karigar.id,
      order_id: 'ORD-DISPUTE-TEST',
      weight_grams: 40.0,
      purity_karat: 22,
      signature_jeweller: 'data:image/png;base64,jeweller-sig'
    });

    const disputed = await repo.confirmEntry({
      ledger_id: issueEntry.id,
      party: 'KARIGAR',
      signature: 'DISPUTED',
      action: 'REJECT',
      dispute_reason: 'Actual weight on workshop digital scale was 39.400g (-0.600g shortfall)'
    });

    expect(disputed.status).toBe('DISPUTED');
    expect(disputed.dispute_reason).toContain('Actual weight on workshop digital scale');
  });

  it('should correctly calculate net balance and 24K pure gold equivalent for Karigar', async () => {
    const karigar = SEED_PARTIES[1]; // Ramesh
    const balance = await repo.getBalance(karigar.id);

    expect(balance.karigar_id).toBe(karigar.id);
    expect(balance.total_issued_grams).toBeGreaterThan(0);
    expect(balance.total_returned_grams).toBeGreaterThan(0);
    expect(balance.net_balance_grams).toBe(
      Number((balance.total_issued_grams - balance.total_returned_grams - balance.total_wastage_grams).toFixed(3))
    );
    expect(balance.breakdown_by_karat[22]).toBeDefined();
  });
});

