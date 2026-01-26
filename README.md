# PRESSURE

**PRESSURE** is an applied AI system that makes realistic interview preparation accessible to anyone regardless of background, location, or access to industry professionals.

It runs live, voice-based interviews, adapts questions in real time, evaluates responses like a human interviewer, and produces structured, scored feedback which helps level the interview prep playing field.

---

## 🌍 Why This Matters (Applied AI for Everyone)

Interview preparation is deeply unequal.

Many candidates lack access to:
- Industry professionals
- Mock interview panels
- Paid coaching platforms
- Career networks

As a result, interview success often depends more on **who you know** than **what you know**.

PRESSURE applies AI to remove that barrier by giving anyone with an internet connection access to realistic interview practice and actionable feedback.

---

## 💡 What PRESSURE Does

PRESSURE simulates a real interview, not a scripted practice session.

- The interviewer initiates the conversation  
- Responses happen live, without pause or retries  
- Follow-up questions adapt to what the candidate actually says  
- The interview flow adjusts based on clarity, confidence, and structure  
- A post-interview analysis evaluates performance under pressure  

This mirrors how real interviews behave, especially for candidates who have never experienced one before.

---

## 🎙️ How It Works

1. The user selects a role and interview intensity  
2. PRESSURE conducts a live, voice-based interview  
3. The system actively listens and adapts follow-up questions in real time  
4. The interview can be ended at any point  
5. PRESSURE generates structured feedback based on the interview so far  

The system is intentionally robust to partial interviews which reflects real-world interruptions and time constraints.

---

## 📊 Applied AI Evaluation

After the interview, PRESSURE generates an evaluation that includes:
- Overall performance score  
- Communication, relevance, and structure breakdown  
- Behavioral patterns under pressure  
- Strengths and weaknesses tied directly to responses  
- Actionable guidance for improvement  

This transforms interview prep from repetition into personalized coaching powered by applied AI.

---

## 🚀 What Makes PRESSURE Different

Unlike traditional mock interview tools or generic chatbots, PRESSURE:
- Does not rely on static question lists  
- Does not wait for the user to be “ready”  
- Actively listens and adapts in real time  
- Simulates the pacing and pressure of real interviews  

This makes PRESSURE especially valuable for candidates without prior interview exposure.

---

## 🏆 Who This Helps

- Students preparing for internships or entry-level roles  
- Career switchers without professional networks  
- Candidates from underrepresented or underserved backgrounds  
- Anyone seeking realistic interview practice without paid coaching  

PRESSURE is designed to be **accessible, scalable, and fair**.

# How to use:
### Backend

```bash
cd backend
pip install -r requirements.txt
# Create a .env.local file in the backend directory and add the required environment variables
uvicorn main:app --reload --port 8000 or python -m uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
# Create a .env.local file in the frontend directory and add the required environment variables
npm run dev
```

Open http://localhost:3000

## Environment Variables

### Backend (.env)
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `OPENROUTER_MODEL_FAST` - Model to use for interview questions (default: openai/gpt-5-mini)
- `OPENROUTER_MODEL_REPORT` - Model to use for final report (default: anthropic/claude-3.5-sonnet)
- `ELEVENLABS_API_KEY` - Your ElevenLabs API key
- `ELEVENLABS_VOICE_ID` - Voice ID for TTS (default: 21m00Tcm4TlvDq8ikWAM)

### Frontend (.env.local)
- `NEXT_PUBLIC_API_URL` - Backend URL (default: http://localhost:8000)
