"""
AuraStream — Prompt Engineering Engine
Translates user-friendly vibe names into optimized MusicGen prompts.
Supports weather-aware modifier injection.
"""

# ======================== VIBE PROMPTS ========================
# Baseline = simple, generic prompts (for evaluation comparison)
# Engineered = detailed, optimized prompts with BPM, instruments, mood

VIBE_PROMPTS = {
    "morning-cafe": {
        "baseline": "cafe background music",
        "engineered": "lo-fi hip hop, chill beats, rhodes electric piano, 80bpm, no vocals, "
                      "relaxing background music, warm, cozy, vinyl crackle, soft drums, continuous"
    },
    "high-end-retail": {
        "baseline": "retail store music",
        "engineered": "upbeat deep house, lounge, 115bpm, fashion runway vibe, crisp bass, "
                      "no vocals, modern, polished, subtle synth pads, sophisticated"
    },
    "zen-spa": {
        "baseline": "spa relaxation music",
        "engineered": "ambient drone, singing bowls, soft synthesizer, gentle water sounds, "
                      "60bpm, extremely relaxing, meditation, no drums, ethereal pads"
    },
    "busy-gym": {
        "baseline": "workout music",
        "engineered": "electronic dance music, high energy, driving bass, 128bpm, motivational, "
                      "powerful drops, no vocals, aggressive synths, stadium energy"
    },
    "evening-lounge": {
        "baseline": "lounge jazz music",
        "engineered": "smooth jazz, soft piano, muted trumpet, 90bpm, cocktail bar, "
                      "sophisticated, warm lighting, no vocals, upright bass, brushed drums"
    },
    "bookstore": {
        "baseline": "quiet background music",
        "engineered": "classical piano, ambient, gentle strings, 70bpm, intellectual, calm, "
                      "scholarly atmosphere, no vocals, soft reverb, minimalist"
    },
}

# ======================== WEATHER MODIFIERS ========================

WEATHER_MODIFIERS = {
    "Rain":         "melancholy, cozy, rain ambiance, muted tones",
    "Drizzle":      "melancholy, cozy, rain ambiance, soft patter",
    "Thunderstorm": "dramatic, intense, stormy energy, deep rumble",
    "Snow":         "gentle, crystalline, winter warmth, soft bells",
    "Clear":        "bright, uplifting, warm energy, open atmosphere",
    "Sunny":        "bright, uplifting, warm energy, radiant",
    "Clouds":       "introspective, muted tones, soft, contemplative",
    "Cloudy":       "introspective, muted tones, soft, contemplative",
    "Mist":         "ethereal, mysterious, dreamy, hazy reverb",
    "Fog":          "ethereal, mysterious, dreamy, distant echoes",
}


def get_prompt(vibe_id: str, use_baseline: bool = False, weather: str = None,
               custom_prompt: str = None) -> str:
    """
    Build a complete MusicGen prompt.

    Args:
        vibe_id: Identifier for the vibe preset (e.g. 'morning-cafe')
        use_baseline: If True, return the simple baseline prompt (for evaluation)
        weather: Weather condition string (e.g. 'Rain', 'Sunny')
        custom_prompt: Optional custom prompt (overrides vibe preset)

    Returns:
        Complete prompt string for MusicGen
    """
    # Start with the base prompt
    if custom_prompt:
        prompt = custom_prompt
    elif vibe_id in VIBE_PROMPTS:
        key = "baseline" if use_baseline else "engineered"
        prompt = VIBE_PROMPTS[vibe_id][key]
    else:
        prompt = "ambient background music, no vocals, relaxing, high quality"

    # Append weather modifier
    if weather and weather in WEATHER_MODIFIERS:
        prompt += ", " + WEATHER_MODIFIERS[weather]

    return prompt


def list_vibes():
    """Return all available vibe presets."""
    return [
        {
            "id": vibe_id,
            "name": vibe_id.replace("-", " ").title(),
            "baseline_prompt": data["baseline"],
            "engineered_prompt": data["engineered"],
        }
        for vibe_id, data in VIBE_PROMPTS.items()
    ]


if __name__ == "__main__":
    # Quick test
    print("=== Engineered Prompts ===")
    for vibe_id in VIBE_PROMPTS:
        print(f"\n{vibe_id}:")
        print(f"  Baseline:   {get_prompt(vibe_id, use_baseline=True)}")
        print(f"  Engineered: {get_prompt(vibe_id, use_baseline=False)}")
        print(f"  + Rainy:    {get_prompt(vibe_id, weather='Rain')}")
