# 🌱 GardenFix

> A local AI plant-care assistant built for the **Touch Grass** open-source AI challenge.  
> Everything runs on your own machine — no paid APIs, no cloud, no authentication.

Upload a photo of your plant, tell GardenFix when you last watered it and how much sunlight it gets, and receive:

- **Visible observations** – what the AI can see in your photo
- **Possible explanations** – likely causes for any issues
- **One practical check** – something concrete to do outside right now

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React 18 + Vite 5 (plain CSS) |
| Backend  | Node.js + Express |
| AI model | [Ollama](https://ollama.com) running `gemma3:4b` locally |
| Database | none |
| Auth     | none |

---

## Prerequisites

### 1. Node.js ≥ 18
```bash
node --version   # should print v18 or higher
```

### 2. Ollama (required for AI responses)

> **⚠️ Important:** The AI analysis feature requires Ollama to be installed and the `gemma3:4b` model pulled locally. Without it the app still loads and the health check will clearly tell you what's missing — but you won't get plant diagnoses.

**Install Ollama:**
- macOS / Linux: https://ollama.com/download  
- Or via Homebrew: `brew install ollama`

**Verify the install:**
```bash
ollama --version
```

**Pull the required model** (~3 GB download — only needs to happen once):
```bash
ollama pull gemma3:4b
```

This is a deliberate step. We do **not** download the model automatically.

**Start the Ollama daemon:**
```bash
ollama serve
```
Leave this running in a separate terminal while you use GardenFix.

---

## Project Layout

```
gardenfix/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   └── vite.config.js   ← proxy: /api → localhost:3001
│
└── server/          # Express backend
    ├── index.js     ← entry point, routes
    └── ollama.js    ← Ollama health check + API helper
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
Server starts at **http://localhost:3001**

### Terminal 2 – Frontend
```bash
cd client
npm install       # first time only
npm run dev
```
Vite starts at **http://localhost:5173** (may use 5174+ if 5173 is taken).

Open the URL printed by Vite in your browser.

---

## Verify Everything Is Working

### Health endpoint (direct)
```bash
curl http://localhost:3001/api/health
```

### Health endpoint through the Vite proxy
```bash
curl http://localhost:5173/api/health
```

Both should return JSON like:
```json
{
  "status": "ok",
  "server": "GardenFix backend v0.1",
  "ollama": {
    "running": true,
    "modelReady": true,
    "requiredModel": "gemma3:4b"
  }
}
```

If `ollama.running` is `false`, start `ollama serve`.  
If `ollama.modelReady` is `false`, run `ollama pull gemma3:4b`.

The **status banner** at the top of the UI shows the same information visually.

---

## What the Status Banner Tells You

| Colour | Meaning |
|--------|---------|
| 🟢 Green | Backend + Ollama + model all ready — full analysis available |
| 🟡 Yellow | Backend reachable but Ollama or model not ready — see error message |
| 🔴 Red | Cannot reach the backend — make sure the Express server is running |

---

## Phase Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| **1** | ✅ Done | Frontend + backend skeleton, health endpoint, Vite proxy |
| **2** | Planned | Wire up `/api/analyze` — send photo + context to Ollama, stream response |
| **3** | Planned | Polish UI, structured response cards, error recovery |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express server port |
| `OLLAMA_URL` | `http://localhost:11434` | Base URL for Ollama API |

Set them before starting the server:
```bash
PORT=4000 OLLAMA_URL=http://192.168.1.10:11434 npm run dev
```

---

## Contributing

This project is part of the Touch Grass open-source AI challenge. PRs welcome.  
Keep dependencies minimal and code beginner-readable.
