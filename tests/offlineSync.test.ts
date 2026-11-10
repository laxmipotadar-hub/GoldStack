import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineQueueManager } from '../src/offline/offlineQueue.js';

describe('Offline Queue & Synchronization Engine', () => {
  let queueManager: OfflineQueueManager;
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    // Mock localStorage for node environment
    globalThis.localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
      length: 0,
      key: () => null
    } as any;

    queueManager = new OfflineQueueManager();
    queueManager.clearQueue();
  });

  it('should enqueue offline transactions with unique nonce and status PENDING', () => {
    const item = queueManager.enqueue('/api/ledger/issue', {
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      weight_grams: 50.0,
      purity_karat: 22,
      signature_jeweller: 'data:image/png;base64,sample'
    });

    expect(item.id).toMatch(/^offline-/);
    expect(item.client_nonce).toMatch(/^nonce-/);
    expect(item.status).toBe('PENDING');

    const queue = queueManager.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe(item.id);
  });

  it('should dequeue successfully processed transactions', () => {
    const item = queueManager.enqueue('/api/ledger/return', {
      jeweller_id: 'jeweller-1',
      karigar_id: 'karigar-1',
      weight_grams: 48.5,
      purity_karat: 22,
      signature_karigar: 'data:image/png;base64,sample'
    });

    expect(queueManager.getQueue().length).toBe(1);
    queueManager.dequeue(item.id);
    expect(queueManager.getQueue().length).toBe(0);
  });

  it('should flag conflict items with needsManualReview during conflict resolution', () => {
    const item = queueManager.enqueue('/api/ledger/confirm', {
      ledger_id: 'entry-99',
      party: 'KARIGAR',
      signature: 'data:image/png;base64,sample',
      action: 'CONFIRM'
    });

    // Simulate conflict resolution: update with conflict flag
    queueManager.updateItem(item.id, {
      status: 'RESOLVED_CONFLICT',
      needsManualReview: true,
      lastError: 'LWW Conflict: Entry already disputed by counterparty.'
    });

    const updated = queueManager.getQueue()[0];
    expect(updated.status).toBe('RESOLVED_CONFLICT');
    expect(updated.needsManualReview).toBe(true);
    expect(updated.lastError).toContain('LWW Conflict');
  });
});

