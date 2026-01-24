# Interview Simulator

A live interview simulator to help coach you and your responses during an interview.

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Edit with your API keys
uvicorn main:app --reload --port 8000 or python -m uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # Edit with your API keys
npm run dev
```

Open http://localhost:3000

## Environment Variables

### Backend (.env)
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `OPENROUTER_MODEL` - Model to use (default: anthropic/claude-3.5-sonnet)

### Frontend (.env.local)
- `NEXT_PUBLIC_ELEVENLABS_API_KEY` - Your ElevenLabs API key
- `NEXT_PUBLIC_ELEVENLABS_VOICE_ID` - Voice ID for TTS
- `NEXT_PUBLIC_API_URL` - Backend URL (default: http://localhost:8000)
