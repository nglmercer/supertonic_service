#!/usr/bin/env python3
"""
Test script that spawns the Supertonic API server temporarily,
synthesizes audio via the REST API, and shuts down the server.

Usage:
    python test_api.py
"""

import os
import sys
import time
import json
import base64
import signal
import subprocess
import requests
from pathlib import Path


# Configuration
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8888
SERVER_URL = f"http://{SERVER_HOST}:{SERVER_PORT}"
OUTPUT_DIR = Path("outputs/test_api")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def wait_for_server(url: str, timeout: int = 30) -> bool:
    """Wait for server to be ready."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            response = requests.get(f"{url}/health", timeout=2)
            if response.status_code == 200:
                data = response.json()
                if data.get("tts_ready"):
                    return True
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.5)
    return False


def test_endpoint(method: str, endpoint: str, **kwargs) -> dict:
    """Make API request and return response."""
    url = f"{SERVER_URL}{endpoint}"
    response = requests.request(method, url, **kwargs)
    response.raise_for_status()
    return response.json()


def save_audio_from_bytes(audio_data: str, filename: str) -> Path:
    """Save base64 audio data to file."""
    audio_bytes = base64.b64decode(audio_data)
    output_path = OUTPUT_DIR / filename
    with open(output_path, 'wb') as f:
        f.write(audio_bytes)
    return output_path


def main():
    """Main test function."""
    server_process = None
    
    try:
        print("=" * 60)
        print("Supertonic API Test Script (v1.1)")
        print("=" * 60)
        
        # Step 1: Start the server
        print("\n🚀 Starting Supertonic API server...")
        cmd = [
            sys.executable, "-m", "uvicorn",
            "src.server:app",
            "--host", SERVER_HOST,
            "--port", str(SERVER_PORT),
            "--log-level", "warning"
        ]
        server_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait for server to be ready
        if not wait_for_server(SERVER_URL, timeout=60):
            print("❌ Server failed to start within timeout")
            return 1
        
        print("✓ Server is ready!")
        
        # Step 2: Check cache info
        print("\n📁 Testing Cache Management...")
        cache = test_endpoint("GET", "/cache")
        print(f"   Cache: {cache['file_count']} files, {cache['total_size_mb']:.2f}MB / {cache['max_size_mb']}MB")
        
        # Step 3: Test endpoints
        print("\n📋 Testing API Endpoints...")
        
        # Test root
        print("  • GET /")
        root = test_endpoint("GET", "/")
        print(f"    → {root['name']} v{root['version']}")
        
        # Test voices
        print("  • GET /voices")
        voices = test_endpoint("GET", "/voices")
        print(f"    → {voices['count']} voices: {', '.join(voices['voices'])}")
        
        # Test languages
        print("  • GET /languages")
        langs = test_endpoint("GET", "/languages")
        print(f"    → {langs['count']} languages: {', '.join(langs['languages'])}")
        
        # Step 4: Synthesize audio (SAVE TO FILE mode)
        print("\n🎵 Testing Synthesis (save_to_file=true)...")
        
        # English example with file output
        print("  • Synthesizing English (M1 voice) - saving to file...")
        en_response = test_endpoint(
            "POST", "/synthesize",
            json={
                "text": "Hello world! This is a test of the Supertonic API with file output.",
                "voice": "M1",
                "language": "en",
                "speed": 1.0,
                "save_to_file": True
            }
        )
        print(f"    → Success: {en_response['success']}")
        print(f"    → Duration: {en_response['duration']:.2f}s")
        print(f"    → File: {en_response['audio_path']}")
        
        # Step 5: Synthesize audio (BYTES mode - base64)
        print("\n🔊 Testing Synthesis (bytes mode - base64)...")
        
        # Spanish example - get base64 data
        print("  • Synthesizing Spanish (F1 voice) - getting base64 data...")
        es_response = test_endpoint(
            "POST", "/synthesize/bytes",
            json={
                "text": "¡Bienvenido a Supertonic! Esta es una síntesis de voz en español.",
                "voice": "F1",
                "language": "es",
                "speed": 1.0
            }
        )
        print(f"    → Success: {es_response['success']}")
        print(f"    → Duration: {es_response['duration']:.2f}s")
        print(f"    → Data size: {len(es_response['audio_data'])} chars (base64)")
        
        # Save the base64 audio to file
        audio_filename = "spanish_base64.wav"
        saved_path = save_audio_from_bytes(es_response['audio_data'], audio_filename)
        print(f"    → Saved to: {saved_path}")
        
        # Korean example - get base64 data
        print("  • Synthesizing Korean (M2 voice) - getting base64 data...")
        ko_response = test_endpoint(
            "POST", "/synthesize/bytes",
            json={
                "text": "안녕하세요! 수퍼토닉에 오신 것을 환영합니다.",
                "voice": "M2",
                "language": "ko",
                "speed": 1.0
            }
        )
        print(f"    → Success: {ko_response['success']}")
        print(f"    → Duration: {ko_response['duration']:.2f}s")
        
        # Save the base64 audio to file
        audio_filename = "korean_base64.wav"
        saved_path = save_audio_from_bytes(ko_response['audio_data'], audio_filename)
        print(f"    → Saved to: {saved_path}")
        
        # Step 6: Custom output path
        print("\n📂 Testing Custom Output Path...")
        custom_response = test_endpoint(
            "POST", "/synthesize",
            json={
                "text": "Custom output path test.",
                "voice": "F1",
                "language": "en",
                "output_path": "my_custom_audio.wav"
            }
        )
        print(f"    → Custom path: {custom_response['audio_path']}")
        
        # Step 7: Validate text
        print("\n✓ Testing text validation...")
        validation = test_endpoint(
            "POST", "/validate",
            json={
                "text": "Test text with 100 characters for chunking demonstration purposes.",
                "voice": "M1",
                "language": "en"
            }
        )
        print(f"    → Valid: {validation['valid']}")
        print(f"    → Chunks: {validation['chunk_count']}")
        
        # Step 8: Manual cache cleanup
        print("\n🧹 Testing Cache Cleanup...")
        cleanup = test_endpoint("POST", "/cache/cleanup")
        print(f"    → Cleanup: {cleanup['file_count']} files remain")
        
        # Summary
        print("\n" + "=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)
        
        # List output files
        print("\n📁 Generated audio files:")
        for f in sorted(OUTPUT_DIR.glob("*.wav")):
            size_kb = f.stat().st_size / 1024
            print(f"   • {f.name} ({size_kb:.1f} KB)")
        
        # Show cache files
        print("\n📁 Cache files:")
        cache_files = list(Path("outputs/synthesize").glob("*.wav"))
        for f in sorted(cache_files)[-5:]:  # Show last 5
            size_kb = f.stat().st_size / 1024
            print(f"   • {f.name} ({size_kb:.1f} KB)")
        if len(cache_files) > 5:
            print(f"   ... and {len(cache_files) - 5} more")
        
        return 0
        
    except requests.exceptions.RequestException as e:
        print(f"\n❌ API Error: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    finally:
        # Shutdown server
        if server_process:
            print("\n👋 Shutting down server...")
            server_process.terminate()
            try:
                server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server_process.kill()
            print("✓ Server stopped")


if __name__ == "__main__":
    sys.exit(main())
