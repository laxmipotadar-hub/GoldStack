import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { SignedUploadUrlResult, SignedReadUrlResult } from '../../shared/types.js';

export type { SignedUploadUrlResult, SignedReadUrlResult };

class StorageService {
  private gcsStorage: Storage | null = null;
  private bucketName: string;
  private isConfigured = false;
  private localUploadDir: string;

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME || 'goldstack-photo-evidence';
    this.localUploadDir = path.resolve(process.cwd(), 'uploads');

    if (process.env.GCP_PROJECT_ID && (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_KEY_JSON)) {
      try {
        this.gcsStorage = new Storage({
          projectId: process.env.GCP_PROJECT_ID,
          keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
        });
        this.isConfigured = true;
        console.log('[Storage] Google Cloud Storage configured with bucket:', this.bucketName);
      } catch (err) {
        console.warn('[Storage] Failed to initialize GCS client, falling back to local storage adapter:', err);
      }
    } else {
      console.log('[Storage] GCS credentials not set. Running in local mock storage mode (safe for dev & offline demo).');
    }

    // Ensure local directory exists
    fs.mkdir(this.localUploadDir, { recursive: true }).catch((err) => {
      console.error('[Storage] Error creating local upload dir:', err);
    });
  }

  /**
   * Generate signed URL for direct client upload
   */
  async generateSignedUploadUrl(
    filename: string,
    contentType: string,
    expiryMinutes = 15
  ): Promise<SignedUploadUrlResult> {
    const ext = path.extname(filename) || '.jpg';
    const uniqueKey = `evidence/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    if (this.isConfigured && this.gcsStorage) {
      try {
        const bucket = this.gcsStorage.bucket(this.bucketName);
        const file = bucket.file(uniqueKey);

        const [uploadUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + expiryMinutes * 60 * 1000,
          contentType
        });

        const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${uniqueKey}`;

        return {
          uploadUrl,
          fileUrl,
          storagePath: uniqueKey,
          expiresAt,
          provider: 'gcs'
        };
      } catch (error) {
        console.warn('[Storage] GCS signed URL generation failed, using local mock fallback:', error);
      }
    }

    // Local / Dev Fallback: Simulated signed token
    const token = crypto.createHmac('sha256', 'goldstack-secret').update(uniqueKey + expiresAt).digest('hex');
    const uploadUrl = `/api/upload/direct?path=${encodeURIComponent(uniqueKey)}&token=${token}`;
    const fileUrl = `/api/upload/evidence/${encodeURIComponent(uniqueKey)}?token=${token}`;

    return {
      uploadUrl,
      fileUrl,
      storagePath: uniqueKey,
      expiresAt,
      provider: 'local_mock'
    };
  }

  /**
   * Generate signed URL for reading evidence photos
   */
  async generateSignedReadUrl(storagePath: string, expiryMinutes = 60): Promise<SignedReadUrlResult> {
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    if (this.isConfigured && this.gcsStorage && !storagePath.startsWith('/api/')) {
      try {
        const bucket = this.gcsStorage.bucket(this.bucketName);
        const file = bucket.file(storagePath);
        const [readUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + expiryMinutes * 60 * 1000
        });
        return { readUrl, expiresAt };
      } catch (err) {
        console.warn('[Storage] GCS getSignedUrl error, falling back:', err);
      }
    }

    const token = crypto.createHmac('sha256', 'goldstack-secret').update(storagePath + expiresAt).digest('hex');
    const readUrl = `/api/upload/evidence/${encodeURIComponent(storagePath)}?token=${token}&expires=${encodeURIComponent(expiresAt)}`;
    return { readUrl, expiresAt };
  }

  /**
   * Store file directly (used for direct multipart uploads or offline sync)
   */
  async saveLocalFile(storagePath: string, buffer: Buffer): Promise<string> {
    const targetPath = path.join(this.localUploadDir, storagePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
    return `/api/upload/evidence/${encodeURIComponent(storagePath)}`;
  }

  getLocalFilePath(storagePath: string): string {
    return path.join(this.localUploadDir, storagePath);
  }
}

export const storageService = new StorageService();

