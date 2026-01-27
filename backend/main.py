import os
import uuid
import json
import re
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import httpx

load_dotenv()

app = FastAPI(title="Interview Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://rehearse-nu.vercel.app",
    ],
    allow_origin_regex=r"^https://rehearse-.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
# Cheaper model for interview questions/responses
OPENROUTER_MODEL_FAST = os.getenv("OPENROUTER_MODEL_FAST", "openai/gpt-5-mini")
# Higher quality model for final report analysis
OPENROUTER_MODEL_REPORT = os.getenv("OPENROUTER_MODEL_REPORT", "anthropic/claude-3.5-sonnet")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

sessions: dict = {}


class SessionStartRequest(BaseModel):
    name: str
    roleTitle: str
    roleDesc: str
    intensity: str  # CALM, STRICT, AGGRESSIVE


class SessionStartResponse(BaseModel):
    sessionId: str
    greetingText: str
    firstMainQuestion: str
    roleBucket: str


class TurnItem(BaseModel):
    type: str
    aiText: str
    userTranscript: str


class TurnNextRequest(BaseModel):
    sessionId: str
    phase: str  # GREETING, MAIN, FOLLOWUP
    mainQuestionIndex: int
    followupCount: int  # 0, 1, or 2 - number of follow-ups asked for current main question
    roleTitle: str
    roleDesc: str
    roleBucket: str
    intensity: str
    aiPromptedText: str
    userTranscript: str
    turnsSoFar: list[TurnItem]
    repeatRequestCount: int = 0  # Track how many times user asked to repeat/rephrase


class InternalEval(BaseModel):
    scores: dict
    star: dict
    notes: list[str]


class TurnNextResponse(BaseModel):
    action: str  # ASK_FOLLOWUP, NEXT_MAIN, END, REPEAT_QUESTION
    aiText: str
    mainQuestionIndex: int
    followupCount: int  # 0, 1, or 2 - number of follow-ups asked for current main question
    internalEval: InternalEval


class ReportFinalRequest(BaseModel):
    sessionId: str
    name: str
    roleTitle: str
    roleDesc: str
    roleBucket: str
    intensity: str
    turns: list[TurnItem]
    repeatRequestCount: int = 0  # Track how many times user asked to repeat/rephrase


class ReportFinalResponse(BaseModel):
    overallScore: int
    subscores: dict
    strengths: list[str]
    improvements: list[str]
    patternUnderPressure: str
    idealAnswerRewrite: str
    nextSteps: list[str]


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None


def infer_role_bucket(role_title: str) -> str:
    title_lower = role_title.lower()
    if any(word in title_lower for word in ["intern", "co-op", "junior", "entry"]):
        return "JUNIOR"
    if any(word in title_lower for word in ["manager", "lead", "director", "senior", "principal", "staff"]):
        return "LEADERSHIP"
    return "MID"


async def call_llm(messages: list[dict], model: Optional[str] = None, retry: bool = True) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    # Default to fast model if not specified
    if model is None:
        model = OPENROUTER_MODEL_FAST

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"LLM error: {response.text}")
        data = response.json()
        return data["choices"][0]["message"]["content"]


def extract_json(text: str) -> dict:
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        return json.loads(json_match.group())
    raise ValueError("No JSON found in response")


async def call_llm_json(messages: list[dict], model: Optional[str] = None, retry: bool = True) -> dict:
    text = await call_llm(messages, model=model)
    try:
        return extract_json(text)
    except (json.JSONDecodeError, ValueError):
        if retry:
            messages.append({"role": "assistant", "content": text})
            messages.append({"role": "user", "content": "Please respond with valid JSON only."})
            text = await call_llm(messages, model=model, retry=False)
            return extract_json(text)
        raise HTTPException(status_code=500, detail="Failed to parse LLM JSON response")


def get_intensity_persona(intensity: str) -> str:
    personas = {
        "CALM": "You are a warm, encouraging interviewer who puts candidates at ease. Ask questions in a friendly, conversational tone.",
        "STRICT": "You are a professional, no-nonsense interviewer. Be direct and formal, but fair. Expect concise, well-structured answers.",
        "AGGRESSIVE": "You are a challenging interviewer who tests candidates under pressure. Be direct, occasionally interrupt with probing follow-ups, and maintain high expectations."
    }
    return personas.get(intensity, personas["CALM"])


def is_repeat_request(user_transcript: str) -> bool:
    """Check if the user is asking to repeat or rephrase the question."""
    transcript_lower = user_transcript.lower().strip()

    repeat_phrases = [
        "repeat", "say that again", "again please", "one more time",
        "rephrase", "can you rephrase", "could you rephrase",
        "didn't catch", "didn't hear", "didn't understand",
        "what was the question", "what's the question", "what is the question",
        "sorry what", "pardon", "excuse me",
        "can you repeat", "could you repeat", "please repeat",
        "say again", "come again", "i'm sorry",
        "didn't get that", "missed that", "what did you say",
        "can you clarify", "could you clarify"
    ]

    # Check if the response is short (likely just a request to repeat)
    # and contains repeat-related phrases
    is_short = len(transcript_lower.split()) <= 15
    contains_repeat_phrase = any(phrase in transcript_lower for phrase in repeat_phrases)

    return is_short and contains_repeat_phrase


@app.post("/session/start", response_model=SessionStartResponse)
async def session_start(req: SessionStartRequest):
    session_id = str(uuid.uuid4())
    role_bucket = infer_role_bucket(req.roleTitle)

    persona = get_intensity_persona(req.intensity)

    prompt = f"""You are conducting a behavioral interview for a {req.roleTitle} position.
{persona}

Role description: {req.roleDesc}
Candidate name: {req.name}
Experience level: {role_bucket}

Generate a JSON response with:
1. "greeting" - A brief, natural greeting to start the interview (1-2 sentences welcoming them)
2. "firstQuestion" - The first behavioral interview question appropriate for this role and level

IMPORTANT: Do NOT include any instructions or hints on how to answer the question. Just ask the question directly without telling the candidate to use STAR format, provide specific examples, or any other answering guidance. Let the candidate answer naturally.

Respond ONLY with valid JSON in this format:
{{"greeting": "...", "firstQuestion": "..."}}"""

    messages = [{"role": "user", "content": prompt}]
    # Use Claude for the greeting/intro for better quality first impression
    result = await call_llm_json(messages, model=OPENROUTER_MODEL_REPORT)

    sessions[session_id] = {
        "name": req.name,
        "roleTitle": req.roleTitle,
        "roleDesc": req.roleDesc,
        "intensity": req.intensity,
        "roleBucket": role_bucket,
        "questions": [result.get("firstQuestion", "Tell me about a time you faced a challenge at work.")],
    }

    return SessionStartResponse(
        sessionId=session_id,
        greetingText=result.get("greeting", f"Hello {req.name}, welcome to the interview. Let's get started."),
        firstMainQuestion=result.get("firstQuestion", "Tell me about a time you faced a challenge at work."),
        roleBucket=role_bucket,
    )


@app.post("/turn/next", response_model=TurnNextResponse)
async def turn_next(req: TurnNextRequest):
    persona = get_intensity_persona(req.intensity)

    conversation_history = "\n".join([
        f"{'Interviewer' if t.type == 'ai' else 'Candidate'}: {t.aiText if t.type == 'ai' else t.userTranscript}"
        for t in req.turnsSoFar
    ])

    # NOTE: Per-turn evaluation commented out for performance optimization.
    # The evaluation was not being used - follow-up decisions are made by a separate LLM call,
    # and the final report does its own comprehensive analysis.
    # Uncomment below to re-enable per-turn evaluation if needed in the future.
    #
    # eval_prompt = f"""Evaluate this interview answer:
    #
    # Role: {req.roleTitle}
    # Question asked: {req.aiPromptedText}
    # Candidate's answer: {req.userTranscript}
    #
    # Provide a JSON evaluation:
    # {{
    #   "scores": {{
    #     "relevance": 1-10,
    #     "clarity": 1-10,
    #     "specificity": 1-10,
    #     "structure": 1-10,
    #     "confidenceMarkers": 1-10
    #   }},
    #   "star": {{
    #     "S": "situation identified or empty",
    #     "T": "task identified or empty",
    #     "A": "action identified or empty",
    #     "R": "result identified or empty"
    #   }},
    #   "notes": ["observation 1", "observation 2"]
    # }}
    #
    # Respond ONLY with valid JSON."""
    #
    # eval_messages = [{"role": "user", "content": eval_prompt}]
    # eval_result = await call_llm_json(eval_messages)
    #
    # internal_eval = InternalEval(
    #     scores=eval_result.get("scores", {"relevance": 5, "clarity": 5, "specificity": 5, "structure": 5, "confidenceMarkers": 5}),
    #     star=eval_result.get("star", {"S": "", "T": "", "A": "", "R": ""}),
    #     notes=eval_result.get("notes", [])
    # )

    # Placeholder evaluation (not used but required by response model)
    internal_eval = InternalEval(
        scores={"relevance": 0, "clarity": 0, "specificity": 0, "structure": 0, "confidenceMarkers": 0},
        star={"S": "", "T": "", "A": "", "R": ""},
        notes=[]
    )

    # Check for repeat/rephrase request first (applies to any phase except greeting)
    if req.phase != "GREETING" and is_repeat_request(req.userTranscript):
        # Generate a rephrased version of the question
        rephrase_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

The candidate asked you to repeat or rephrase the question. The original question was:
"{req.aiPromptedText}"

Rephrase the question in a slightly different way to help the candidate understand. Keep the same intent but use different wording.

IMPORTANT: Do NOT include any instructions or hints on how to answer the question.

Respond ONLY with valid JSON:
{{"aiText": "your rephrased question"}}"""

        messages = [{"role": "user", "content": rephrase_prompt}]
        result = await call_llm_json(messages)

        return TurnNextResponse(
            action="REPEAT_QUESTION",
            aiText=result.get("aiText", f"Of course. {req.aiPromptedText}"),
            mainQuestionIndex=req.mainQuestionIndex,
            followupCount=req.followupCount,  # Don't change followup count
            internalEval=internal_eval
        )

    if req.phase == "GREETING":
        next_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

The candidate just responded to your greeting. Now ask the first main behavioral question.
Previous conversation:
{conversation_history}

IMPORTANT: Do NOT include any instructions or hints on how to answer the question. Just ask the question directly without telling the candidate to use STAR format, provide specific examples, or any other answering guidance.

Generate a JSON response:
{{"aiText": "your response transitioning to the first question", "action": "NEXT_MAIN"}}

Stay in character. Do NOT give feedback on their greeting. Just naturally transition to asking the first behavioral question.
Respond ONLY with valid JSON."""

        messages = [{"role": "user", "content": next_prompt}]
        result = await call_llm_json(messages)

        return TurnNextResponse(
            action="NEXT_MAIN",
            aiText=result.get("aiText", "Great, let's begin. " + req.turnsSoFar[0].aiText if req.turnsSoFar else "Let's begin with the first question."),
            mainQuestionIndex=0,
            followupCount=0,
            internalEval=internal_eval
        )

    # End interview after 3rd main question has been answered (with any follow-ups)
    # We end when: mainQuestionIndex >= 2 AND (we've asked 2 follow-ups OR coming from followup phase)
    if req.mainQuestionIndex >= 2 and (req.followupCount >= 2 or req.phase == "FOLLOWUP"):
        closing_prompt = f"""You are concluding a behavioral interview for {req.roleTitle}.
{persona}

Conversation so far:
{conversation_history}

Generate a brief, professional closing statement thanking the candidate. Do NOT give feedback or scores.

Respond ONLY with valid JSON:
{{"aiText": "your closing statement", "action": "END"}}"""

        messages = [{"role": "user", "content": closing_prompt}]
        result = await call_llm_json(messages)

        return TurnNextResponse(
            action="END",
            aiText=result.get("aiText", "Thank you for your time today. We'll be in touch soon."),
            mainQuestionIndex=req.mainQuestionIndex,
            followupCount=req.followupCount,
            internalEval=internal_eval
        )

    # Allow up to 2 follow-ups per main question
    if req.phase == "MAIN" and req.followupCount < 2:
        followup_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

Conversation so far:
{conversation_history}

The candidate just answered: {req.userTranscript}

Decide: should you ask a follow-up to dig deeper, or move to the next main question?
- If the answer was vague, incomplete, or you want more specific details/examples, ask a follow-up
- If the answer was sufficiently complete and detailed, move to the next main behavioral question
- You can ask up to 2 follow-ups per main question if needed to get a complete picture

IMPORTANT: Do NOT include any instructions or hints on how to answer the question. Just ask the question directly without telling the candidate to use STAR format, provide specific examples, or any other answering guidance.

Respond ONLY with valid JSON:
{{"action": "ASK_FOLLOWUP" or "NEXT_MAIN", "aiText": "your follow-up question OR your transition + next main question"}}

Stay in character. Do NOT give feedback. Just ask questions naturally."""

        messages = [{"role": "user", "content": followup_prompt}]
        result = await call_llm_json(messages)

        action = result.get("action", "NEXT_MAIN")
        next_index = req.mainQuestionIndex if action == "ASK_FOLLOWUP" else req.mainQuestionIndex + 1
        new_followup_count = req.followupCount + 1 if action == "ASK_FOLLOWUP" else 0

        return TurnNextResponse(
            action=action,
            aiText=result.get("aiText", "Tell me more about that."),
            mainQuestionIndex=next_index,
            followupCount=new_followup_count,
            internalEval=internal_eval
        )

    # After follow-ups are exhausted or coming from FOLLOWUP phase, check if we can ask another follow-up
    # or need to move to the next main question
    if req.phase == "FOLLOWUP" and req.followupCount < 2:
        # We're in follow-up phase but haven't exhausted follow-ups yet
        followup_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

Conversation so far:
{conversation_history}

The candidate just answered your follow-up question: {req.userTranscript}

Decide: do you need one more follow-up to get complete information, or is the answer now sufficient to move on?
- If you still need more detail or clarity, ask ONE more follow-up
- If the answer is now complete enough, move to the next main question

IMPORTANT: Do NOT include any instructions or hints on how to answer the question.

Respond ONLY with valid JSON:
{{"action": "ASK_FOLLOWUP" or "NEXT_MAIN", "aiText": "your follow-up question OR transition + next main question"}}

Stay in character. Do NOT give feedback."""

        messages = [{"role": "user", "content": followup_prompt}]
        result = await call_llm_json(messages)

        action = result.get("action", "NEXT_MAIN")
        if action == "ASK_FOLLOWUP":
            return TurnNextResponse(
                action=action,
                aiText=result.get("aiText", "Tell me more about that."),
                mainQuestionIndex=req.mainQuestionIndex,
                followupCount=req.followupCount + 1,
                internalEval=internal_eval
            )
        # Fall through to next main question if NEXT_MAIN

    next_q_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

Conversation so far:
{conversation_history}

Generate the next main behavioral question (question #{req.mainQuestionIndex + 2} of 3).
Make it relevant to the role and different from previous questions.

IMPORTANT: Do NOT include any instructions or hints on how to answer the question. Just ask the question directly without telling the candidate to use STAR format, provide specific examples, or any other answering guidance.

Respond ONLY with valid JSON:
{{"action": "NEXT_MAIN", "aiText": "natural transition + your next behavioral question"}}

Stay in character. Do NOT give feedback."""

    messages = [{"role": "user", "content": next_q_prompt}]
    result = await call_llm_json(messages)

    return TurnNextResponse(
        action="NEXT_MAIN",
        aiText=result.get("aiText", "Moving on, tell me about a time you worked on a team."),
        mainQuestionIndex=req.mainQuestionIndex + 1,
        followupCount=0,  # Reset follow-up count for new main question
        internalEval=internal_eval
    )


@app.post("/report/final", response_model=ReportFinalResponse)
async def report_final(req: ReportFinalRequest):
    conversation = "\n".join([
        f"{'Interviewer' if t.type == 'ai' else 'Candidate'}: {t.aiText if t.type == 'ai' else t.userTranscript}"
        for t in req.turns
    ])

    repeat_info = ""
    if req.repeatRequestCount > 0:
        repeat_info = f"\nNote: The candidate asked for questions to be repeated or rephrased {req.repeatRequestCount} time(s) during the interview. Consider this in your assessment of their listening skills and ability to process questions under pressure."

    prompt = f"""Analyze this complete behavioral interview and generate a detailed report.

Candidate: {req.name}
Role: {req.roleTitle}
Role Description: {req.roleDesc}
Experience Level: {req.roleBucket}
Interview Intensity: {req.intensity}{repeat_info}

Full Interview Transcript:
{conversation}

Generate a comprehensive JSON report:
{{
  "overallScore": 1-100,
  "subscores": {{
    "communication": 1-100,
    "relevance": 1-100,
    "structure": 1-100,
    "specificity": 1-100,
    "confidence": 1-100
  }},
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["area 1", "area 2", "area 3"],
  "patternUnderPressure": "A paragraph describing how the candidate performed under pressure, their tendencies, and behavioral patterns observed",
  "idealAnswerRewrite": "Take the weakest answer and rewrite it as an ideal STAR-formatted response",
  "nextSteps": ["specific action item 1", "specific action item 2", "specific action item 3"]
}}

Be specific and constructive. Reference actual content from their answers.
Respond ONLY with valid JSON."""

    messages = [{"role": "user", "content": prompt}]
    # Use higher quality model for final report analysis
    result = await call_llm_json(messages, model=OPENROUTER_MODEL_REPORT)

    return ReportFinalResponse(
        overallScore=result.get("overallScore", 70),
        subscores=result.get("subscores", {
            "communication": 70,
            "relevance": 70,
            "structure": 70,
            "specificity": 70,
            "confidence": 70
        }),
        strengths=result.get("strengths", ["Showed enthusiasm", "Provided examples", "Good communication"]),
        improvements=result.get("improvements", ["Add more specific metrics", "Use STAR format consistently", "Provide more context"]),
        patternUnderPressure=result.get("patternUnderPressure", "The candidate maintained composure throughout the interview."),
        idealAnswerRewrite=result.get("idealAnswerRewrite", "Consider structuring your answer using the STAR method..."),
        nextSteps=result.get("nextSteps", ["Practice STAR format", "Prepare specific examples", "Research the company"])
    )


@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    voice_id = req.voice_id or ELEVENLABS_VOICE_ID

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "text": req.text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.5,
                },
            },
        )

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="TTS generation failed")

        return Response(content=response.content, media_type="audio/mpeg")


@app.get("/health")
async def health():
    return {"status": "ok"}
