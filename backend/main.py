import os
import uuid
import json
import re
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

load_dotenv()

app = FastAPI(title="Interview Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

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
    followupAsked: bool
    roleTitle: str
    roleDesc: str
    roleBucket: str
    intensity: str
    aiPromptedText: str
    userTranscript: str
    turnsSoFar: list[TurnItem]


class InternalEval(BaseModel):
    scores: dict
    star: dict
    notes: list[str]


class TurnNextResponse(BaseModel):
    action: str  # ASK_FOLLOWUP, NEXT_MAIN, END
    aiText: str
    mainQuestionIndex: int
    followupAsked: bool
    internalEval: InternalEval


class ReportFinalRequest(BaseModel):
    sessionId: str
    name: str
    roleTitle: str
    roleDesc: str
    roleBucket: str
    intensity: str
    turns: list[TurnItem]


class ReportFinalResponse(BaseModel):
    overallScore: int
    subscores: dict
    strengths: list[str]
    improvements: list[str]
    patternUnderPressure: str
    idealAnswerRewrite: str
    nextSteps: list[str]


def infer_role_bucket(role_title: str) -> str:
    title_lower = role_title.lower()
    if any(word in title_lower for word in ["intern", "co-op", "junior", "entry"]):
        return "JUNIOR"
    if any(word in title_lower for word in ["manager", "lead", "director", "senior", "principal", "staff"]):
        return "LEADERSHIP"
    return "MID"


async def call_llm(messages: list[dict], retry: bool = True) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": OPENROUTER_MODEL,
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


async def call_llm_json(messages: list[dict], retry: bool = True) -> dict:
    text = await call_llm(messages)
    try:
        return extract_json(text)
    except (json.JSONDecodeError, ValueError):
        if retry:
            messages.append({"role": "assistant", "content": text})
            messages.append({"role": "user", "content": "Please respond with valid JSON only."})
            text = await call_llm(messages, retry=False)
            return extract_json(text)
        raise HTTPException(status_code=500, detail="Failed to parse LLM JSON response")


def get_intensity_persona(intensity: str) -> str:
    personas = {
        "CALM": "You are a warm, encouraging interviewer who puts candidates at ease. Ask questions in a friendly, conversational tone.",
        "STRICT": "You are a professional, no-nonsense interviewer. Be direct and formal, but fair. Expect concise, well-structured answers.",
        "AGGRESSIVE": "You are a challenging interviewer who tests candidates under pressure. Be direct, occasionally interrupt with probing follow-ups, and maintain high expectations."
    }
    return personas.get(intensity, personas["CALM"])


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

Respond ONLY with valid JSON in this format:
{{"greeting": "...", "firstQuestion": "..."}}"""

    messages = [{"role": "user", "content": prompt}]
    result = await call_llm_json(messages)

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

    if req.phase == "GREETING":
        next_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

The candidate just responded to your greeting. Now ask the first main behavioral question.
Previous conversation:
{conversation_history}

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
            followupAsked=False,
            internalEval=internal_eval
        )

    if req.mainQuestionIndex >= 2 and (req.followupAsked or req.phase == "FOLLOWUP"):
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
            followupAsked=req.followupAsked,
            internalEval=internal_eval
        )

    if req.phase == "MAIN" and not req.followupAsked:
        followup_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

Conversation so far:
{conversation_history}

The candidate just answered: {req.userTranscript}

Decide: should you ask a follow-up to dig deeper, or move to the next main question?
- If the answer was vague or you want more detail, ask ONE follow-up
- If the answer was complete, move to the next main behavioral question

Respond ONLY with valid JSON:
{{"action": "ASK_FOLLOWUP" or "NEXT_MAIN", "aiText": "your follow-up question OR your transition + next main question"}}

Stay in character. Do NOT give feedback. Just ask questions naturally."""

        messages = [{"role": "user", "content": followup_prompt}]
        result = await call_llm_json(messages)

        action = result.get("action", "NEXT_MAIN")
        next_index = req.mainQuestionIndex if action == "ASK_FOLLOWUP" else req.mainQuestionIndex + 1

        return TurnNextResponse(
            action=action,
            aiText=result.get("aiText", "Tell me more about that."),
            mainQuestionIndex=next_index,
            followupAsked=action == "ASK_FOLLOWUP",
            internalEval=internal_eval
        )

    next_q_prompt = f"""You are interviewing for {req.roleTitle}.
{persona}

Conversation so far:
{conversation_history}

Generate the next main behavioral question (question #{req.mainQuestionIndex + 2} of 3).
Make it relevant to the role and different from previous questions.

Respond ONLY with valid JSON:
{{"action": "NEXT_MAIN", "aiText": "natural transition + your next behavioral question"}}

Stay in character. Do NOT give feedback."""

    messages = [{"role": "user", "content": next_q_prompt}]
    result = await call_llm_json(messages)

    return TurnNextResponse(
        action="NEXT_MAIN",
        aiText=result.get("aiText", "Moving on, tell me about a time you worked on a team."),
        mainQuestionIndex=req.mainQuestionIndex + 1,
        followupAsked=False,
        internalEval=internal_eval
    )


@app.post("/report/final", response_model=ReportFinalResponse)
async def report_final(req: ReportFinalRequest):
    conversation = "\n".join([
        f"{'Interviewer' if t.type == 'ai' else 'Candidate'}: {t.aiText if t.type == 'ai' else t.userTranscript}"
        for t in req.turns
    ])

    prompt = f"""Analyze this complete behavioral interview and generate a detailed report.

Candidate: {req.name}
Role: {req.roleTitle}
Role Description: {req.roleDesc}
Experience Level: {req.roleBucket}
Interview Intensity: {req.intensity}

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
    result = await call_llm_json(messages)

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


@app.get("/health")
async def health():
    return {"status": "ok"}
