"""
AuraStream — MusicGen Audio Generator
Wraps Meta's MusicGen model for text-to-music generation.
Supports audio continuation for seamless transitions.
"""

import os
import time
import uuid
import numpy as np
import torch
import scipy.io.wavfile as wav
from transformers import AutoProcessor, MusicgenForConditionalGeneration

# ======================== CONFIG ========================
MODEL_NAME = "facebook/musicgen-large"  # 3.3B params, best quality (requires A100/similar)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "generated_audio")
SAMPLE_RATE = 32000  # MusicGen outputs at 32kHz


class MusicGenerator:
    """Wrapper around MusicGen for generating ambient music clips."""

    def __init__(self, model_name: str = MODEL_NAME, device: str = None):
        """
        Initialize the MusicGen model.

        Args:
            model_name: HuggingFace model ID
            device: 'cuda', 'cpu', or None (auto-detect)
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model_name = model_name
        self.model = None
        self.processor = None

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        print(f"[AuraStream] Generator initialized (device: {self.device})")

    def load_model(self):
        """Load the MusicGen model and processor. Call once at startup."""
        if self.model is not None:
            return

        print(f"[AuraStream] Loading model: {self.model_name} ...")
        start = time.time()

        self.processor = AutoProcessor.from_pretrained(self.model_name)
        self.model = MusicgenForConditionalGeneration.from_pretrained(self.model_name)
        self.model.to(self.device)

        elapsed = time.time() - start
        print(f"[AuraStream] Model loaded in {elapsed:.1f}s")

    def generate(
        self,
        prompt: str,
        duration: float = 10.0,
        continuation_audio: np.ndarray = None,
        temperature: float = 1.0,
        guidance_scale: float = 3.0,
    ) -> dict:
        """
        Generate a music clip from a text prompt.

        Args:
            prompt: Text description of the desired music
            duration: Length in seconds (5-30 recommended)
            continuation_audio: Optional numpy array of previous clip's tail
                                for seamless audio continuation
            temperature: Sampling temperature (higher = more creative)
            guidance_scale: Classifier-free guidance scale

        Returns:
            dict with keys: 'filepath', 'filename', 'duration', 'sample_rate',
                           'generation_time', 'prompt'
        """
        self.load_model()

        # Calculate max_new_tokens from duration
        # MusicGen generates ~50 tokens/second of audio
        tokens_per_second = 50
        max_new_tokens = int(duration * tokens_per_second)

        start_time = time.time()

        # Process inputs
        inputs = self.processor(
            text=[prompt],
            padding=True,
            return_tensors="pt",
        ).to(self.device)

        # Set generation parameters
        gen_kwargs = {
            "max_new_tokens": max_new_tokens,
            "do_sample": True,
            "temperature": temperature,
            "guidance_scale": guidance_scale,
        }

        # Audio continuation: feed the tail of the previous clip
        if continuation_audio is not None:
            # Process the audio for continuation
            audio_inputs = self.processor(
                audio=continuation_audio,
                sampling_rate=SAMPLE_RATE,
                return_tensors="pt",
            ).to(self.device)
            # Merge text and audio inputs
            inputs["audio_codes"] = audio_inputs.get("audio_codes")
            inputs["decoder_input_ids"] = audio_inputs.get("decoder_input_ids")

        # Generate
        with torch.no_grad():
            audio_values = self.model.generate(**inputs, **gen_kwargs)

        # Post-process
        audio_data = audio_values[0, 0].cpu().numpy()  # shape: (samples,)

        # Normalize to int16 for WAV
        audio_int16 = np.int16(audio_data / np.max(np.abs(audio_data)) * 32767)

        # Save to file
        filename = f"aura_{uuid.uuid4().hex[:8]}.wav"
        filepath = os.path.join(OUTPUT_DIR, filename)
        wav.write(filepath, SAMPLE_RATE, audio_int16)

        generation_time = time.time() - start_time

        result = {
            "filepath": filepath,
            "filename": filename,
            "duration": len(audio_int16) / SAMPLE_RATE,
            "sample_rate": SAMPLE_RATE,
            "generation_time": round(generation_time, 2),
            "prompt": prompt,
        }

        print(f"[AuraStream] Generated {result['duration']:.1f}s clip in "
              f"{generation_time:.1f}s → {filename}")

        return result

    def generate_batch(self, prompt: str, count: int = 3,
                       duration: float = 10.0) -> list:
        """
        Generate multiple clips for a vibe (useful for pre-generating a library).

        Args:
            prompt: Text description
            count: Number of clips to generate
            duration: Length per clip in seconds

        Returns:
            List of result dicts
        """
        results = []
        for i in range(count):
            print(f"[AuraStream] Generating clip {i+1}/{count}...")
            result = self.generate(prompt, duration=duration)
            results.append(result)
        return results

    def get_tail(self, filepath: str, tail_seconds: float = 3.0) -> np.ndarray:
        """
        Extract the last N seconds of an audio file for continuation.

        Args:
            filepath: Path to WAV file
            tail_seconds: How many seconds from the end to extract

        Returns:
            Numpy array of the tail audio
        """
        sr, audio = wav.read(filepath)
        tail_samples = int(tail_seconds * sr)
        return audio[-tail_samples:].astype(np.float32) / 32767.0


# ======================== CLI USAGE ========================
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AuraStream Music Generator")
    parser.add_argument("--prompt", type=str, required=True,
                        help="Text prompt for music generation")
    parser.add_argument("--duration", type=float, default=10.0,
                        help="Duration in seconds (default: 10)")
    parser.add_argument("--count", type=int, default=1,
                        help="Number of clips to generate (default: 1)")
    args = parser.parse_args()

    gen = MusicGenerator()
    gen.load_model()

    if args.count > 1:
        results = gen.generate_batch(args.prompt, count=args.count,
                                     duration=args.duration)
        for r in results:
            print(f"  → {r['filepath']} ({r['duration']:.1f}s)")
    else:
        result = gen.generate(args.prompt, duration=args.duration)
        print(f"  → {result['filepath']} ({result['duration']:.1f}s)")
