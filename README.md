# 🌱 GardenFix

> A local AI plant-care assistant built for the **Touch Grass** open-source AI challenge.  
> Everything runs entirely on your own machine — no paid APIs, no cloud dependencies, no authentication, and 100% private.

Upload a photo of your plant, tell GardenFix when you last watered it and how much sunlight it gets, and receive:

- **Plant Condition** – assessment of overall visual health (Healthy & Thriving, Mild Stress, Severe Distress / Dying)
- **Visible Observations** – factual, non-hallucinated findings seen directly in the photo
- **Possible Explanations** – tentative causes tailored to your watering history and sunlight
- **One Practical Outdoor Check** – a physical check with conditional follow-up actions based on what you find
- **Limitations Notice** – clear transparency about what cannot be determined from a photo alone

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React 18 + Vite 5 (system fonts, Vanilla CSS) |
| Backend  | Node.js + Express + Multer (in-memory processing) + Sharp |
| AI Model | [Ollama](https://ollama.com) running `gemma3:4b` locally |
| Database | None |
| Auth / Cloud | None (100% offline-ready) |

---

## Prerequisites

### 1. Node.js ≥ 18
```bash
node --version   # should print v18 or higher
```

### 2. Ollama & Gemma 3 Model

> **⚠️ Important:** The AI analysis feature requires Ollama to be installed and the `gemma3:4b` model pulled locally. The app includes health checks and graceful fallbacks if Ollama is not running.

**Install Ollama:**
- macOS / Linux / Windows: [https://ollama.com/download](https://ollama.com/download)
- Or on macOS via Homebrew: `brew install ollama`

**Verify the install:**
```bash
ollama --version
```

**Pull the required model** (~3.3 GB download — only needs to happen once):
```bash
ollama pull gemma3:4b
```

**Start the Ollama daemon:**
```bash
ollama serve
```

---

## Project Layout

```
gardenfix/
├── .env.example     # Environment template
├── .gitignore       # Excludes dependencies, builds, logs, secrets
├── LICENSE          # MIT Application License
├── README.md
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx      # UI state machine & components
│   │   ├── index.css    # Design tokens & responsive styles
│   │   └── main.jsx
│   ├── index.html       # Zero external CDN links
│   └── vite.config.js   # Proxy (/api → localhost:3001)
│
└── server/          # Express backend
    ├── index.js         # API routes & validation
    ├── imageProcessor.js# Magic-byte validation & Sharp resizing
    ├── ollama.js        # Ollama integration & schema validation
    ├── prompt.js        # System prompt & condition guidelines
    └── test_runner.js   # Automated test suite
```

---

## Setup & Startup

Open **two terminals** from the `gardenfix/` directory.

### Terminal 1 – Backend
```bash
cd server
npm install       # first time only
npm run dev       # uses node --watch for auto-reload
```
Backend starts at **http://localhost:3001**

### Terminal 2 – Frontend
```bash
cd client
npm install       # first time only
npm run dev
```
Frontend starts at **http://localhost:5173** (or http://localhost:5179)

Open the URL printed by Vite in your browser.

---

## API Endpoints

### 1. `GET /api/health`
Checks that the server is active and verifies Ollama daemon and `gemma3:4b` availability.
```bash
curl http://localhost:3001/api/health
```

### 2. `POST /api/analyze`
Accepts `multipart/form-data`:
- `image`: JPEG, PNG, or WebP file (≤ 8 MB). Processed strictly in RAM.
- `lastWatered`: Context string (e.g. `Today`, `1–3 days ago`, `4–7 days ago`, `More than a week`, `Not sure`).
- `sunlight`: Context string (e.g. `Direct sun`, `Indirect light`, `Mostly shade`, `Not sure`).

Returns structured JSON matching the strict validation schema.

---

## Development & Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| **1. Skeleton** | ✅ Done | Initial Express backend, React Vite frontend, health check, proxy |
| **2. Analysis Backend** | ✅ Done | Multer in-memory upload, Sharp image pipeline, Ollama `gemma3:4b` integration |
| **3. Interface & UX** | ✅ Done | Responsive card UI, condition badges, drag-and-drop upload, double-click protection |
| **4. Quality & Offline** | ✅ Done | Zero external CDN/font calls, automated test runner, edge-case validation |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express server port |
| `OLLAMA_URL` | `http://localhost:11434` | Base URL for the local Ollama instance |

---

## License

The code in this repository is licensed under the [MIT License](LICENSE).

---

## Gemma Attribution & Model Terms

This application uses **Gemma 3** (`gemma3:4b`), an open-weights multimodal vision-language model developed by **Google DeepMind**.

- **Model Attribution**: Gemma is developed and provided by Google.
- **Model License**: Gemma models are made available under the [Gemma Terms of Use](https://ai.google.dev/gemma/terms) and the [Gemma Open Model License](https://ai.google.dev/gemma/terms).
- **Prohibited Uses**: Use of Gemma must comply with Google's Prohibited Use Policy. GardenFix does not modify model weights and connects solely to your locally installed Ollama instance.
