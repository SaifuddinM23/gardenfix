/**
 * GardenFix – Express backend
 *
 * Endpoints:
 *   GET  /api/health   → confirms the server is running, checks Ollama
 *   POST /api/analyze  → validates image, calls Ollama, returns structured JSON
 */

import express  from 'express';
import cors     from 'cors';
import multer   from 'multer';

import { checkOllama, callOllama } from './ollama.js';
import { processImage }            from './imageProcessor.js';
import { buildPrompt }             from './prompt.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Allowed input values (whitelist) ─────────────────────────────────────────
// These must exactly match (case-insensitive) the option values sent by the UI.
const VALID_LAST_WATERED = new Set([
  'today', '1–3 days ago', '4–7 days ago', 'more than a week', 'not sure',
]);
const VALID_SUNLIGHT = new Set([
  'direct sun', 'indirect light', 'mostly shade', 'not sure',
]);

// ── Multer – memory storage, strict limits ────────────────────────────────────
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

const upload = multer({
  storage: multer.memoryStorage(), // buffer in RAM; nothing written to disk
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    // Check MIME type as a first gate; magic bytes are checked later in processImage()
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(
          new Error(`Unsupported file type "${file.mimetype}". Upload a JPEG, PNG, or WebP.`),
          { code: 'UNSUPPORTED_FILE_TYPE', status: 415 }
        )
      );
    }
  },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const ollama = await checkOllama();
  res.json({
    status:    'ok',
    server:    'GardenFix backend v0.2',
    ollama,
    timestamp: new Date().toISOString(),
  });
});

// ── POST /api/analyze ─────────────────────────────────────────────────────────
app.post(
  '/api/analyze',
  // multer middleware – parses multipart, puts file in req.file
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) return next(err); // multer errors (size, file count, bad MIME)
      next();
    });
  },
  async (req, res, next) => {
    try {
      // ── 1. Validate text fields ───────────────────────────────────────────
      const { lastWatered, sunlight } = req.body;

      if (!lastWatered || !VALID_LAST_WATERED.has(lastWatered.toLowerCase().trim())) {
        return res.status(400).json({
          error: 'lastWatered is missing or not one of the accepted values.',
          accepted: [...VALID_LAST_WATERED],
        });
      }
      if (!sunlight || !VALID_SUNLIGHT.has(sunlight.toLowerCase().trim())) {
        return res.status(400).json({
          error: 'sunlight is missing or not one of the accepted values.',
          accepted: [...VALID_SUNLIGHT],
        });
      }

      // ── 2. Validate the upload ────────────────────────────────────────────
      if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded. Include an "image" field.' });
      }

      // ── 3. Validate image contents + resize ──────────────────────────────
      // processImage() checks magic bytes and decodes the image with sharp.
      // It throws if the bytes don't match a known format or the file is corrupt.
      const imageBuffer = await processImage(req.file.buffer);

      // Clear the raw upload buffer immediately – we hold only the processed copy
      req.file.buffer = null;

      // ── 4. Build the prompt ──────────────────────────────────────────────
      const prompt = buildPrompt({ lastWatered, sunlight });

      // ── 5. Call Ollama ───────────────────────────────────────────────────
      const result = await callOllama({ prompt, imageBuffer });

      // ── 6. Return the validated structured result ────────────────────────
      res.json(result);

    } catch (err) {
      next(err);
    }
  }
);

// ── Centralised error handler ─────────────────────────────────────────────────
// Maps known error codes to HTTP responses. Never surfaces stack traces.
app.use((err, _req, res, _next) => {
  // Multer's file-too-large error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `Image exceeds the 8 MB limit. Please compress or resize before uploading.`,
    });
  }

  // Errors from imageProcessor / ollama with attached .status / .code
  const httpStatus = err.status ?? 500;
  const message    = err.message ?? 'Unexpected server error.';

  // Log the error code for debugging, but NOT the image or user data
  console.error(`[${new Date().toISOString()}] Error ${err.code ?? 'UNKNOWN'}: ${message}`);

  res.status(httpStatus).json({ error: message, code: err.code ?? 'SERVER_ERROR' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`GardenFix server listening on http://localhost:${PORT}`);
  console.log(`Health: GET http://localhost:${PORT}/api/health`);
  console.log(`Analyze: POST http://localhost:${PORT}/api/analyze  (multipart: image, lastWatered, sunlight)`);
});
