/**
 * ollama.js
 *
 * Two exported functions:
 *   checkOllama()   – confirms Ollama is reachable and gemma3:4b is available.
 *   callOllama()    – sends image + prompt to the model and returns validated JSON.
 *
 * Uses the built-in fetch (Node 18+) – no extra HTTP client needed.
 */

import { SYSTEM_PROMPT } from './prompt.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const REQUIRED_MODEL  = 'gemma3:4b';

// How long to wait for the model to finish (ms).
// Inference on a 4B model with a 1024-px image typically takes 15–60 s.
const INFERENCE_TIMEOUT_MS = 120_000; // 2 minutes

// ── JSON schema for structured output (Ollama format parameter) ─────────────
// This tells Ollama to force the model output into our schema.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['plant', 'unclear', 'not_plant'],
    },
    condition: {
      type: 'string',
    },
    observations: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 3,
    },
    possibleCauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cause:  { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['cause', 'reason'],
      },
      maxItems: 2,
    },
    nextCheck:   { type: 'string' },
    limitation:  { type: 'string' },
  },
  required: ['status', 'condition', 'observations', 'possibleCauses', 'nextCheck', 'limitation'],
};

// ── checkOllama ─────────────────────────────────────────────────────────────

/**
 * Confirms Ollama is reachable and that gemma3:4b is available locally.
 * Returns:
 *   { running, modelReady, availableModels?, requiredModel, error? }
 */
export async function checkOllama() {
  let tags;
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    tags = await res.json();
  } catch {
    return {
      running: false,
      modelReady: false,
      error: `Cannot reach Ollama at ${OLLAMA_BASE_URL}. Is it running? (ollama serve)`,
    };
  }

  const models = tags?.models ?? [];
  const modelReady = models.some(
    (m) => m.name === REQUIRED_MODEL || m.name.startsWith(REQUIRED_MODEL + ':')
  );

  return {
    running: true,
    modelReady,
    availableModels: models.map((m) => m.name),
    requiredModel: REQUIRED_MODEL,
    ...(modelReady
      ? {}
      : {
          error: `Model "${REQUIRED_MODEL}" not found locally. Run: ollama pull ${REQUIRED_MODEL}`,
        }),
  };
}

// ── validateAnalysisResult ──────────────────────────────────────────────────

/**
 * Validates the parsed JSON object from the model.
 * Throws with .code = 'INVALID_MODEL_OUTPUT' if anything is wrong.
 * Returns a sanitised copy of the object.
 */
function validateAnalysisResult(obj) {
  if (typeof obj !== 'object' || obj === null) {
    throw mkOutputError('Response is not a JSON object.');
  }

  const { status, condition, observations, possibleCauses, nextCheck, limitation } = obj;

  if (!['plant', 'unclear', 'not_plant'].includes(status)) {
    throw mkOutputError(`Invalid status value: "${status}".`);
  }
  if (!Array.isArray(observations) || observations.length === 0 || observations.length > 3) {
    throw mkOutputError('observations must be an array of 1–3 strings.');
  }
  if (observations.some((o) => typeof o !== 'string' || o.trim() === '')) {
    throw mkOutputError('Every observation must be a non-empty string.');
  }
  if (!Array.isArray(possibleCauses) || possibleCauses.length > 2) {
    throw mkOutputError('possibleCauses must be an array of 0–2 items.');
  }
  for (const item of possibleCauses) {
    if (typeof item.cause !== 'string' || typeof item.reason !== 'string') {
      throw mkOutputError('Each possibleCause must have cause and reason strings.');
    }
  }
  if (typeof nextCheck !== 'string' || nextCheck.trim() === '') {
    throw mkOutputError('nextCheck must be a non-empty string.');
  }
  if (typeof limitation !== 'string' || limitation.trim() === '') {
    throw mkOutputError('limitation must be a non-empty string.');
  }

  const plantCondition = typeof condition === 'string' && condition.trim() ? condition.trim() : 'Observed';

  // Return a clean object (no extra fields from the model)
  return {
    status,
    condition: plantCondition,
    observations: observations.map((o) => o.trim()),
    possibleCauses: possibleCauses.map((c) => ({
      cause:  c.cause.trim(),
      reason: c.reason.trim(),
    })),
    nextCheck:   nextCheck.trim(),
    limitation:  limitation.trim(),
  };
}

function mkOutputError(detail) {
  return Object.assign(
    new Error(`Model returned invalid output: ${detail}`),
    { code: 'INVALID_MODEL_OUTPUT', status: 502 }
  );
}

// ── callOllama ──────────────────────────────────────────────────────────────

/**
 * callOllama({ prompt, imageBuffer })
 *
 * @param {string} prompt        – user-turn text from buildPrompt()
 * @param {Buffer} imageBuffer   – processed JPEG buffer from processImage()
 * @returns {Promise<object>}    – validated analysis result object
 *
 * Throws structured errors for all failure cases:
 *   { message, code, status }
 *   code values: OLLAMA_UNAVAILABLE | MODEL_NOT_FOUND | INFERENCE_TIMEOUT |
 *                OLLAMA_ERROR | INVALID_MODEL_OUTPUT
 */
export async function callOllama({ prompt, imageBuffer }) {
  const imageBase64 = imageBuffer.toString('base64');

  const body = {
    model:  REQUIRED_MODEL,
    system: SYSTEM_PROMPT,
    prompt,
    images: [imageBase64],  // gemma3:4b is multimodal; images array accepts base64
    stream: false,
    format: RESPONSE_SCHEMA, // structured output – Ollama enforces the schema
    options: {
      temperature: 0.6,  // balanced temperature for varied, plant-specific phrasing
      num_predict: 512,  // plenty for our JSON; prevents runaway generation
    },
  };

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw Object.assign(
        new Error(
          `Ollama did not respond within ${INFERENCE_TIMEOUT_MS / 1000} s. ` +
          'Is the model still loading? Try again in a moment.'
        ),
        { code: 'INFERENCE_TIMEOUT', status: 504 }
      );
    }
    throw Object.assign(
      new Error(
        `Cannot reach Ollama at ${OLLAMA_BASE_URL}. ` +
        'Make sure "ollama serve" is running.'
      ),
      { code: 'OLLAMA_UNAVAILABLE', status: 503 }
    );
  }

  if (res.status === 404) {
    throw Object.assign(
      new Error(
        `Model "${REQUIRED_MODEL}" is not available. ` +
        `Run: ollama pull ${REQUIRED_MODEL}`
      ),
      { code: 'MODEL_NOT_FOUND', status: 503 }
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(
      new Error(`Ollama returned HTTP ${res.status}: ${body.slice(0, 200)}`),
      { code: 'OLLAMA_ERROR', status: 502 }
    );
  }

  // ── Parse the response ────────────────────────────────────────────────────
  let data;
  try {
    data = await res.json();
  } catch {
    throw Object.assign(
      new Error('Ollama returned a non-JSON body unexpectedly.'),
      { code: 'OLLAMA_ERROR', status: 502 }
    );
  }

  // data.response is the model's raw text (schema-constrained JSON string)
  const rawText = (data.response ?? '').trim();

  if (!rawText) {
    throw Object.assign(
      new Error('Ollama returned an empty response.'),
      { code: 'INVALID_MODEL_OUTPUT', status: 502 }
    );
  }

  // Parse the JSON the model produced
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // The format parameter should prevent this, but be safe.
    throw mkOutputError(`Response is not valid JSON. Raw: ${rawText.slice(0, 300)}`);
  }

  // Validate structure and sanitise
  return validateAnalysisResult(parsed);
}
