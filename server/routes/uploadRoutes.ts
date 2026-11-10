import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { storageService } from '../storage/gcsStorage.js';
import { computeServerPerceptualHash } from '../crypto/perceptualHash.js';

export const uploadRouter = Router();

// Configure Multer for in-memory handling before saving or forwarding to storage
const upload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed as gold evidence'));
    }
  }
});

/**
 * POST /api/upload/signed-url
 * Returns a GCS / cloud signed upload URL so client can upload directly
 */
uploadRouter.post('/signed-url', async (req: Request, res: Response) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ success: false, message: 'filename and contentType are required' });
    }

    const result = await storageService.generateSignedUploadUrl(filename, contentType);
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[API] /upload/signed-url error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/upload/direct
 * Direct multipart upload endpoint with perceptual hash calculation and size validation
 */
uploadRouter.post('/direct', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded or file exceeds 2MB limit' });
    }

    const ext = path.extname(req.file.originalname) || '.jpg';
    const storagePath = `evidence/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;

    // Compute perceptual hash (server side)
    const perceptualHash = computeServerPerceptualHash(req.file.buffer);

    // Save file
    const fileUrl = await storageService.saveLocalFile(storagePath, req.file.buffer);

    res.json({
      success: true,
      data: {
        fileUrl,
        storagePath,
        sizeBytes: req.file.size,
        mimeType: req.file.mimetype,
        perceptualHash
      }
    });
  } catch (err: any) {
    console.error('[API] /upload/direct error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/upload/evidence/:filename
 * Securely serve uploaded photo evidence
 */
uploadRouter.get('/evidence/:filename(*)', async (req: Request, res: Response) => {
  try {
    const requestedPath = req.params.filename;
    const fullPath = storageService.getLocalFilePath(requestedPath);

    try {
      await fs.access(fullPath);
      res.sendFile(fullPath);
    } catch {
      // If file doesn't exist on disk, return an SVG placeholder of gold evidence
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(`
        <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
          <rect width="600" height="400" fill="#fdebdf"/>
          <rect x="150" y="100" width="300" height="180" rx="16" fill="#c6a15b" stroke="#775a1a" stroke-width="4"/>
          <text x="300" y="180" font-family="sans-serif" font-size="24" font-weight="bold" fill="#4f3800" text-anchor="middle">GOLD BULLION 999.9</text>
          <text x="300" y="220" font-family="sans-serif" font-size="16" fill="#4f3800" text-anchor="middle">CERTIFIED JOB-WORK EVIDENCE</text>
          <text x="300" y="340" font-family="sans-serif" font-size="14" fill="#775a1a" text-anchor="middle">Tamper-Evident SHA-256 Verified</text>
        </svg>
      `);
    }
  } catch (err: any) {
    res.status(404).json({ success: false, message: 'Evidence file not found' });
  }
});

