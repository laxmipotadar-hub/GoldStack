import { OfflineQueuedTransaction } from '../../shared/types.js';

const STORAGE_KEY = 'goldstack_offline_queue_v1';

export class OfflineQueueManager {
  private listeners: Array<() => void> = [];
  private simulatedOffline: boolean | null = null;
  private memoryStore: Record<string, string> = {};

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.simulatedOffline) {
          this.triggerSync();
        }
      });
      window.addEventListener('offline', () => {
        this.notifyListeners();
      });
    }
  }

  isSimulatedOffline(): boolean {
    return this.simulatedOffline === true;
  }

  setSimulatedOffline(offline: boolean | null): void {
    this.simulatedOffline = offline;
    this.notifyListeners();
    if (offline === false) {
      this.triggerSync();
    }
  }

  toggleSimulatedOffline(): boolean {
    const nextState = !this.isSimulatedOffline();
    this.setSimulatedOffline(nextState);
    return nextState;
  }

  isOnline(): boolean {
    if (this.simulatedOffline !== null) {
      return !this.simulatedOffline;
    }
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  getQueue(): OfflineQueuedTransaction[] {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : this.memoryStore[STORAGE_KEY];
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('[OfflineQueue] Failed to parse offline queue:', err);
      return [];
    }
  }

  private saveQueue(queue: OfflineQueuedTransaction[]): void {
    try {
      const serialized = JSON.stringify(queue);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, serialized);
      } else {
        this.memoryStore[STORAGE_KEY] = serialized;
      }
      this.notifyListeners();
    } catch (err) {
      console.error('[OfflineQueue] Failed to save offline queue:', err);
    }
  }

  enqueue(
    endpoint: OfflineQueuedTransaction['endpoint'],
    payload: OfflineQueuedTransaction['payload']
  ): OfflineQueuedTransaction {
    const queue = this.getQueue();
    const item: OfflineQueuedTransaction = {
      id: 'offline-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
      client_nonce: 'nonce-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
      endpoint,
      payload: {
        ...payload,
        metadata: {
          ...((payload as any).metadata || {}),
          offlineCreated: true,
          offlineQueuedAt: new Date().toISOString()
        }
      },
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'PENDING'
    };

    queue.push(item);
    this.saveQueue(queue);
    console.log('[OfflineQueue] Enqueued transaction:', item.id, item.endpoint);

    // If online, attempt immediate sync
    if (this.isOnline()) {
      this.triggerSync();
    }

    return item;
  }

  dequeue(id: string): void {
    const queue = this.getQueue().filter((item) => item.id !== id);
    this.saveQueue(queue);
  }

  updateItem(id: string, updates: Partial<OfflineQueuedTransaction>): void {
    const queue = this.getQueue();
    const item = queue.find((i) => i.id === id);
    if (item) {
      Object.assign(item, updates);
      this.saveQueue(queue);
    }
  }

  clearQueue(): void {
    this.saveQueue([]);
  }

  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Background sync worker: Replays queued offline entries with Last-Write-Wins and Conflict Resolution
   */
  async triggerSync(onSuccess?: (item: OfflineQueuedTransaction) => void): Promise<{
    processed: number;
    failed: number;
    conflicts: number;
  }> {
    if (!this.isOnline()) {
      return { processed: 0, failed: 0, conflicts: 0 };
    }

    const queue = this.getQueue();
    if (queue.length === 0) {
      return { processed: 0, failed: 0, conflicts: 0 };
    }

    let processed = 0;
    let failed = 0;
    let conflicts = 0;

    for (const item of queue) {
      if (item.status === 'SYNCING') continue;

      this.updateItem(item.id, { status: 'SYNCING', attempts: item.attempts + 1 });

      try {
        const res = await fetch(item.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
          processed++;
          this.dequeue(item.id);
          if (onSuccess) onSuccess(item);
        } else {
          // Check for conflict condition (e.g., already confirmed, rejected, or hash state race)
          const isConflict =
            res.status === 409 ||
            (data.message && data.message.toLowerCase().includes('already')) ||
            (data.message && data.message.toLowerCase().includes('conflict'));

          if (isConflict) {
            conflicts++;
            // Last-Write-Wins with Manual Review Flag
            this.updateItem(item.id, {
              status: 'RESOLVED_CONFLICT',
              needsManualReview: true,
              lastError: `LWW Conflict: ${data.message || 'Server state diverged while offline. Marked for manual jeweller review.'}`
            });
          } else {
            failed++;
            this.updateItem(item.id, {
              status: 'FAILED',
              lastError: data.message || `HTTP ${res.status}`
            });
          }
        }
      } catch (err: any) {
        failed++;
        this.updateItem(item.id, {
          status: 'FAILED',
          lastError: err.message || 'Network fetch failed'
        });
      }
    }

    this.notifyListeners();
    return { processed, failed, conflicts };
  }
}

export const offlineQueue = new OfflineQueueManager();

