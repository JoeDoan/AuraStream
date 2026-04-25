# 🎵 AuraStream — Royalty-Free Ambient Music for Retail

> **CS 5542 – Quiz Challenge 2: Foundation Models for Speech, Music, and Sound AI**

AuraStream is an AI-powered ambient music streaming platform that generates **infinite, royalty-free background music** tailored to specific business vibes — from a cozy morning café to a high-energy gym — using Meta's **MusicGen-Large** foundation model.

[![Demo Video](https://img.shields.io/badge/Demo-Video-red?style=for-the-badge&logo=youtube)](https://umsystem.hosted.panopto.com/Panopto/Pages/Sessions/List.aspx?folderID=8b3fda17-8a4f-45fa-903a-b43701189bcb)
[![Report](https://img.shields.io/badge/Report-PDF-blue?style=for-the-badge&logo=adobeacrobatreader)](Aurastream.pdf)

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🎵 **6 Curated Vibes** | Morning Cafe, High-End Retail, Zen Spa, Busy Gym, Evening Lounge, Bookstore |
| ✏️ **Custom Vibe Creator** | Describe any atmosphere in natural language → Gemini AI generates an optimized MusicGen prompt |
| 🔄 **Gapless Playback** | Dual-track Howler.js engine with 4-second crossfade eliminates silence between clips |
| 📡 **Smart PA System** | Text-to-speech announcements via Gemini TTS (e.g., "Attention shoppers, the cafe closes in 15 minutes") |
| 💾 **Persistent Cache** | Audio cached in IndexedDB, custom vibes in localStorage — survives page refresh |
| 🎯 **Priority Scheduler** | Active vibe gets priority generation; idle mode fills the least-stocked vibe |

---

## 🏗️ Architecture

```
Frontend (HTML/CSS/JS)  ──REST API──▶  FastAPI Backend (Colab + ngrok)
       │                                        │
       ├── IndexedDB Cache                      ├── MusicGen-Large (3.3B params)
       ├── Howler.js Audio Engine                └── NVIDIA A100 GPU
       └── Web Audio Visualizer
       
Gemini API ──▶ Prompt Rewrite + TTS
```

---

## 🤖 Models Used

| Model | Purpose | Details |
|---|---|---|
| **MusicGen-Large** | Text-to-music generation | 3.3B params, 32kHz mono WAV, ~74s per 30s clip |
| **Gemini 2.5 Flash** | AI Vibe Architect | Rewrites user descriptions into optimized MusicGen prompts |
| **Gemini 2.5 Flash TTS** | Smart PA System | Text-to-speech for store announcements |

---

## 📁 Repository Structure

```
AuraStream/
├── notebooks/
│   └── AuraStream_Colab.ipynb     # Model + Evaluation + API Server
├── backend/
│   ├── app.py                      # FastAPI REST server
│   ├── generator.py                # MusicGen wrapper
│   ├── prompt_engine.py            # Prompt engineering logic
│   └── requirements.txt
├── frontend/
│   ├── index.html                  # Main UI
│   ├── css/style.css               # Design system
│   └── js/
│       ├── app.js                  # Core logic, scheduler, Gemini
│       ├── audioEngine.js          # Howler.js crossfade engine
│       └── visualizer.js           # Web Audio visualizer
├── report_images/                  # Extracted notebook charts
├── Aurastream.pdf                  # Project report (PDF)
└── README.md
```

---

## 🚀 Getting Started

### 1. Start the Backend (Google Colab)

1. Open `notebooks/AuraStream_Colab.ipynb` in Google Colab
2. Set runtime to **GPU** (A100 recommended)
3. Run all cells — the last cell starts the FastAPI server via ngrok
4. Copy the ngrok URL (e.g., `https://xxxx.ngrok-free.dev`)

### 2. Configure the Frontend

1. Open `frontend/js/app.js`
2. Update `BACKEND_URL` with your ngrok URL
3. Update `GEMINI_API_KEY` with your Gemini API key

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5500` in your browser.

---

## 📊 Evaluation Results

We compared **Baseline** (generic) vs **Engineered** (optimized) prompts across 6 vibes:

| Vibe | Centroid Δ | Bandwidth Δ | RMS Δ | Consistency Δ |
|---|---|---|---|---|
| Morning Cafe | −360 Hz ↓ | −510 Hz ↓ | −0.06 ↓ | −0.02 |
| High-End Retail | +1398 Hz ↑ | +1501 Hz ↑ | −0.02 ↓ | +0.03 ↑ |
| Zen Spa | −103 Hz ↓ | −433 Hz ↓ | −0.08 ↓ | +0.03 ↑ |
| Busy Gym | +459 Hz ↑ | −467 Hz ↓ | −0.16 ↓ | +0.06 ↑ |
| Evening Lounge | −866 Hz ↓ | −457 Hz ↓ | −0.10 ↓ | +0.07 ↑ |
| Bookstore | +212 Hz ↑ | +256 Hz ↑ | −0.10 ↓ | +0.01 ↑ |

**Key finding:** Engineered prompts improve RMS consistency across all vibes (+0.01 to +0.07), producing smoother background audio.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS, Howler.js, Web Audio API
- **Backend:** FastAPI, PyTorch, Transformers (Hugging Face)
- **Model:** MusicGen-Large (facebook/musicgen-large) — 3.3B parameters
- **AI Services:** Google Gemini 2.5 Flash (prompt rewriting + TTS)
- **Infrastructure:** Google Colab (A100 GPU), ngrok tunneling
- **Storage:** IndexedDB (audio cache), localStorage (vibe configs)

---

## 📄 Report

The full project report is available as [Aurastream.pdf](Aurastream.pdf), covering:
- Problem description & business value
- Model architecture & prompt engineering
- Evaluation methodology & results (spectrograms, radar charts, latency analysis)
- Technical design details (crossfade engine, scheduler, cache)
- Limitations & future work

---

## 🤝 AI Tools Disclosure

| Tool | Usage |
|---|---|
| Gemini (Antigravity) | Code assistance, debugging, report writing |
| Gemini 2.5 Flash | In-app prompt rewriting (via API) |
| Gemini 2.5 Flash TTS | In-app announcements (via API) |
| Google Colab | GPU runtime for model inference |

> All architecture decisions, prompt engineering design, and evaluation methodology were designed by the student.

---

## 📜 References

- Copet et al., *[Simple and Controllable Music Generation](https://arxiv.org/abs/2306.05284)*, 2023
- [MusicGen-Large on Hugging Face](https://huggingface.co/facebook/musicgen-large)
- [Howler.js](https://howlerjs.com/)

---

**Author:** Du Doan — University of Missouri–Kansas City
