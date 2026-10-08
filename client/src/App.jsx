/**
 * App.jsx – GardenFix single-page UI
 *
 * State machine:
 *   idle → loading → result (status=plant) | feedback (unclear/not_plant) | idle (error preserved)
 *
 * The component talks to POST /api/analyze via the Vite proxy (/api → localhost:3001).
 */

import { useState, useEffect, useRef } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const LAST_WATERED_OPTIONS = [
  { value: '',                label: 'Choose one…' },
  { value: 'Today',          label: 'Today' },
  { value: '1–3 days ago',   label: '1–3 days ago' },
  { value: '4–7 days ago',   label: '4–7 days ago' },
  { value: 'More than a week', label: 'More than a week' },
  { value: 'Not sure',       label: 'Not sure' },
];

const SUNLIGHT_OPTIONS = [
  { value: '',               label: 'Choose one…' },
  { value: 'Direct sun',     label: 'Direct sun' },
  { value: 'Indirect light', label: 'Indirect light' },
  { value: 'Mostly shade',   label: 'Mostly shade' },
  { value: 'Not sure',       label: 'Not sure' },
];

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, or WebP images are accepted.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'Photo must be under 8 MB. Please compress or crop it first.';
  }
  return null; // OK
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * SystemBanner
 * Shows a warning if Ollama/model is not ready. Fetches once on mount.
 * Hidden once the user gets a result (they clearly have a working setup).
 */
function SystemBanner({ hide }) {
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d.ollama?.running) {
          setMsg('Ollama is not running. Start it with: ollama serve');
        } else if (!d.ollama?.modelReady) {
          setMsg('Model gemma3:4b is not available. Run: ollama pull gemma3:4b');
        }
      })
      .catch(() => {
        if (alive) setMsg('Cannot reach the GardenFix server. Is it running on port 3001?');
      });
    return () => { alive = false; };
  }, []);

  if (hide || !msg) return null;
  return (
    <div className="status-bar warning" role="alert" aria-live="polite">
      <span className="status-bar__icon">⚠️</span>
      <span>{msg}</span>
    </div>
  );
}

/**
 * UploadZone
 * Handles click-to-upload and drag-and-drop. Shows preview + controls after selection.
 */
function UploadZone({ file, preview, onFileChange, disabled }) {
  const inputRef  = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);

  function handleFile(f) {
    if (!f) return;
    const err = validateFile(f);
    if (err) { setUploadErr(err); return; }
    setUploadErr(null);
    onFileChange(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files[0]);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  if (preview) {
    return (
      <div>
        <p className="upload-label" id="photo-label">Your plant photo</p>
        <div className="upload-zone upload-zone--has-image">
          <img
            src={preview}
            alt="Uploaded plant photo preview"
            className="preview-img"
          />
        </div>
        <div className="preview-controls">
          <label
            htmlFor="photo-replace"
            className="btn-ghost"
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Replace photo
            <input
              id="photo-replace"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="btn-ghost danger"
            disabled={disabled}
            onClick={() => { setUploadErr(null); onFileChange(null); }}
            aria-label="Remove photo"
          >
            Remove
          </button>
        </div>
        {uploadErr && (
          <p className="upload-error" role="alert">⚠ {uploadErr}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="upload-label" id="photo-label">Your plant photo</p>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        id="photo-upload-zone"
        className={`upload-zone${dragging ? ' drag-over' : ''}`}
        role="button"
        aria-labelledby="photo-label"
        aria-describedby="upload-hint"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id="photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          disabled={disabled}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <div className="upload-prompt__icon">🌿</div>
        <p className="upload-prompt__main">Tap or drag a photo here</p>
        <p className="upload-prompt__sub" id="upload-hint">JPEG, PNG, or WebP · max 8 MB</p>
      </div>
      {uploadErr && (
        <p className="upload-error" role="alert">⚠ {uploadErr}</p>
      )}
    </div>
  );
}

/**
 * LoadingCard
 * Shown while waiting for Ollama to respond.
 */
function LoadingCard() {
  return (
    <div className="card loading-card" role="status" aria-live="polite">
      <div className="loading-icon">🌱</div>
      <p className="loading-title">Analysing your plant…</p>
      <p className="loading-sub">Running locally on your machine. This usually takes 10–30 seconds.</p>
    </div>
  );
}

/**
 * ResultsCard
 * Renders the structured JSON from the backend into readable sections.
 */
function ResultsCard({ result, onReset }) {
  // Non-plant / unclear → show a friendly prompt to retake the photo
  if (result.status === 'not_plant' || result.status === 'unclear') {
    const isNotPlant = result.status === 'not_plant';
    return (
      <div className="card results-card">
        <div className="photo-feedback">
          <div className="photo-feedback__icon">{isNotPlant ? '🤔' : '🌫️'}</div>
          <h2 className="photo-feedback__title">
            {isNotPlant ? 'No plant detected' : 'Photo unclear'}
          </h2>
          <div className="photo-feedback__body">
            {result.observations.map((o, i) => <p key={i}>{o}</p>)}
            {result.nextCheck && (
              <p style={{ marginTop: '0.75rem', fontWeight: 500 }}>{result.nextCheck}</p>
            )}
          </div>
        </div>
        <button type="button" id="check-another-btn" className="btn-reset" onClick={onReset}>
          Try a different photo
        </button>
      </div>
    );
  }

  // Normal plant result
  return (
    <div className="card results-card" aria-label="Plant analysis results">
      <span className="results-disclaimer">Suggestions, not a confirmed diagnosis</span>

      {/* Plant Condition Badge */}
      {result.condition && result.condition !== 'Not Applicable' && (
        <div className="condition-badge">
          <span className="condition-badge__label">Plant Condition:</span>
          <span className="condition-badge__value">{result.condition}</span>
        </div>
      )}

      {/* Section 1 – What's visible */}
      <div className="result-section">
        <h2 className="result-section__heading">What&rsquo;s visible</h2>
        <ul className="observation-list" aria-label="Visible observations">
          {result.observations.map((obs, i) => (
            <li key={i}>
              <span className="obs-dot" aria-hidden="true" />
              <span>{obs}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Section 2 – What might explain it */}
      {result.possibleCauses.length > 0 && (
        <>
          <div className="divider" />
          <div className="result-section">
            <h2 className="result-section__heading">What might explain it</h2>
            <ul className="cause-list" aria-label="Possible causes">
              {result.possibleCauses.map((c, i) => (
                <li key={i} className="cause-item">
                  <p className="cause-item__name">{c.cause}</p>
                  <p className="cause-item__reason">{c.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Section 3 – Your next outdoor check */}
      <div className="divider" />
      <div className="result-section">
        <h2 className="result-section__heading">Your next outdoor check</h2>
        <div className="next-check" role="note" aria-label="Next action">
          <span className="next-check__icon">👆</span>
          <p className="next-check__text">{result.nextCheck}</p>
        </div>
      </div>

      {/* Limitation note */}
      <p className="limitation">{result.limitation}</p>

      <button type="button" id="check-another-btn" className="btn-reset" onClick={onReset}>
        Check another plant
      </button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  // Form state
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [lastWatered,  setLastWatered]  = useState('');
  const [sunlight,     setSunlight]     = useState('');

  // UI state
  const [phase, setPhase] = useState('idle'); // 'idle' | 'loading' | 'done'
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState(null);

  const isLoading = phase === 'loading';
  const isDone    = phase === 'done';

  // ── File handling ────────────────────────────────────────────────────────
  function handlePhotoChange(file) {
    // Revoke old object URL to avoid memory leaks
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (isLoading) return; // guard against double-submission

    setPhase('loading');
    setResult(null);
    setApiError(null);

    const form = new FormData();
    form.append('image', photoFile);
    form.append('lastWatered', lastWatered);
    form.append('sunlight', sunlight);

    try {
      const res  = await fetch('/api/analyze', { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok) {
        // Backend returned a structured error
        const msg = data.error ?? `Server error (${res.status}).`;
        setApiError(msg);
        setPhase('idle'); // preserve inputs so the user can try again
        return;
      }

      setResult(data);
      setPhase('done');
    } catch (err) {
      setApiError(
        'Could not reach the backend. Check that the GardenFix server is running on port 3001.'
      );
      setPhase('idle');
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  function handleReset() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    setLastWatered('');
    setSunlight('');
    setResult(null);
    setApiError(null);
    setPhase('idle');
  }

  const canSubmit = !!photoFile && !!lastWatered && !!sunlight && !isLoading;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header__wordmark">
          <span aria-hidden="true">🌱</span>
          <span>GardenFix</span>
        </div>
        <h1 className="header__title">
          A small check for a healthier plant.
        </h1>
        <p className="header__subtitle">
          Take a photo. Get one thing to check outside.
        </p>
      </header>

      {/* ── System status (Ollama / model) ─────────────────────────────── */}
      <SystemBanner hide={isDone} />

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {isLoading && <LoadingCard />}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {isDone && result && (
        <ResultsCard result={result} onReset={handleReset} />
      )}

      {/* ── Input form (hidden while loading or showing results) ────────── */}
      {!isLoading && !isDone && (
        <form
          onSubmit={handleSubmit}
          aria-label="Plant analysis form"
          noValidate
        >
          {/* Upload */}
          <div className="card">
            <UploadZone
              file={photoFile}
              preview={photoPreview}
              onFileChange={handlePhotoChange}
              disabled={isLoading}
            />
          </div>

          {/* Context questions */}
          <div className="card">
            <div className="field">
              <label className="field__label" htmlFor="last-watered">
                When did you last water it?
              </label>
              <select
                id="last-watered"
                className="field__select"
                value={lastWatered}
                onChange={(e) => setLastWatered(e.target.value)}
                disabled={isLoading}
                required
              >
                {LAST_WATERED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.value === ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="sunlight">
                How much sunlight does it get?
              </label>
              <select
                id="sunlight"
                className="field__select"
                value={sunlight}
                onChange={(e) => setSunlight(e.target.value)}
                disabled={isLoading}
                required
              >
                {SUNLIGHT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.value === ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* API error (shown below form, inputs preserved) */}
            {apiError && (
              <div className="status-bar error" role="alert" aria-live="assertive">
                <span className="status-bar__icon">⚠️</span>
                <span>{apiError}</span>
              </div>
            )}

            <button
              id="analyze-btn"
              type="submit"
              className="btn-primary"
              disabled={!canSubmit}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <><span className="spinner" aria-hidden="true" /> Analysing…</>
              ) : (
                <>🌿 Check my plant</>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="footer">
        <p>Runs entirely on your machine · no data leaves your device</p>
        <p>Touch Grass open-source AI challenge · GardenFix</p>
      </footer>
    </div>
  );
}
