"""
AuraStream — FastAPI Backend Server
Serves the MusicGen generation pipeline as a REST API.
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional

from generator import MusicGenerator, OUTPUT_DIR
from prompt_engine import get_prompt, list_vibes, WEATHER_MODIFIERS

# ======================== APP SETUP ========================
app = FastAPI(
    title="AuraStream API",
    description="Royalty-free ambient music generation powered by MusicGen",
    version="1.0.0",
)

# CORS — allow frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize generator (model loads lazily on first request)
generator = MusicGenerator()


# ======================== REQUEST / RESPONSE MODELS ========================
class GenerateRequest(BaseModel):
    """Request body for music generation."""
    prompt: Optional[str] = Field(None, description="Custom text prompt (overrides vibe)")
    vibe_name: Optional[str] = Field(None, description="Vibe preset ID (e.g. 'morning-cafe')")
    duration: float = Field(10.0, ge=3.0, le=180.0, description="Duration in seconds")
    weather: Optional[str] = Field(None, description="Weather condition for context-aware generation")
    use_baseline: bool = Field(False, description="Use baseline prompt (for evaluation)")
    continuation_file: Optional[str] = Field(None, description="Filename of previous clip for audio continuation")


class GenerateResponse(BaseModel):
    """Response from music generation."""
    audio_url: str
    filename: str
    duration: float
    generation_time: float
    prompt_used: str


class BatchRequest(BaseModel):
    """Request for generating multiple clips."""
    vibe_name: str
    count: int = Field(3, ge=1, le=10)
    duration: float = Field(10.0, ge=3.0, le=180.0)
    weather: Optional[str] = None
    use_baseline: bool = False


# ======================== ENDPOINTS ========================

@app.get("/")
async def root():
    """Health check."""
    return {
        "service": "AuraStream API",
        "status": "running",
        "model": generator.model_name,
        "device": generator.device,
    }


@app.get("/vibes")
async def get_vibes():
    """List all available vibe presets with their prompts."""
    return {"vibes": list_vibes()}


@app.get("/weather-modifiers")
async def get_weather_modifiers():
    """List all weather modifiers."""
    return {"modifiers": WEATHER_MODIFIERS}


@app.post("/generate", response_model=GenerateResponse)
async def generate_audio(req: GenerateRequest):
    """
    Generate a music clip.

    Send a vibe name OR a custom prompt. Optionally include weather
    for context-aware generation, or a continuation file for seamless transitions.
    """
    try:
        # Build the prompt
        vibe_id = req.vibe_name.lower().replace(" ", "-") if req.vibe_name else None
        prompt = get_prompt(
            vibe_id=vibe_id,
            use_baseline=req.use_baseline,
            weather=req.weather,
            custom_prompt=req.prompt,
        )

        # Handle audio continuation
        continuation_audio = None
        if req.continuation_file:
            cont_path = os.path.join(OUTPUT_DIR, req.continuation_file)
            if os.path.exists(cont_path):
                continuation_audio = generator.get_tail(cont_path)

        # Generate
        result = generator.generate(
            prompt=prompt,
            duration=req.duration,
            continuation_audio=continuation_audio,
        )

        return GenerateResponse(
            audio_url=f"/audio/{result['filename']}",
            filename=result["filename"],
            duration=result["duration"],
            generation_time=result["generation_time"],
            prompt_used=prompt,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-batch")
async def generate_batch(req: BatchRequest):
    """Generate multiple clips for a vibe (pre-populate library)."""
    try:
        vibe_id = req.vibe_name.lower().replace(" ", "-")
        prompt = get_prompt(
            vibe_id=vibe_id,
            use_baseline=req.use_baseline,
            weather=req.weather,
        )

        results = generator.generate_batch(
            prompt=prompt,
            count=req.count,
            duration=req.duration,
        )

        return {
            "vibe": req.vibe_name,
            "prompt_used": prompt,
            "clips": [
                {
                    "audio_url": f"/audio/{r['filename']}",
                    "filename": r["filename"],
                    "duration": r["duration"],
                    "generation_time": r["generation_time"],
                }
                for r in results
            ],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/audio/{filename}")
async def serve_audio(filename: str):
    """Serve a generated audio file."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(filepath, media_type="audio/wav")


@app.get("/audio-list")
async def list_audio():
    """List all generated audio files."""
    if not os.path.exists(OUTPUT_DIR):
        return {"files": []}
    files = [
        f for f in os.listdir(OUTPUT_DIR)
        if f.endswith(".wav")
    ]
    return {"files": sorted(files)}


# ======================== RUN ========================
if __name__ == "__main__":
    import uvicorn
    print("[AuraStream] Starting API server...")
    print("[AuraStream] Docs at: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
