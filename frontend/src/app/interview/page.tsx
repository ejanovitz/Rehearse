"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

type InterviewState = "DOOR_OPENING" | "AI_SPEAKING" | "USER_LISTENING" | "THINKING" | "DOOR_CLOSING";
type Phase = "GREETING" | "MAIN" | "FOLLOWUP";

interface Turn {
  type: "ai" | "user";
  aiText: string;
  userTranscript: string;
}

interface SessionData {
  sessionId: string;
  greetingText: string;
  firstMainQuestion: string;
  roleBucket: string;
}

export default function InterviewPage() {
  const router = useRouter();
  const [state, setState] = useState<InterviewState>("DOOR_OPENING");
  const [phase, setPhase] = useState<Phase>("GREETING");
  const [mainQuestionIndex, setMainQuestionIndex] = useState(0);
  const [followupAsked, setFollowupAsked] = useState(false);
  const [currentAiText, setCurrentAiText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
  const [silenceWarning, setSilenceWarning] = useState(false);

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [roleTitle, setRoleTitle] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [intensity, setIntensity] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechStartedRef = useRef(false);
  const noSpeechTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const storedSession = localStorage.getItem("sessionData");
    const storedRoleTitle = localStorage.getItem("roleTitle");
    const storedRoleDesc = localStorage.getItem("roleDesc");
    const storedIntensity = localStorage.getItem("intensity");

    if (!storedSession || !storedRoleTitle) {
      router.push("/setup");
      return;
    }

    setSessionData(JSON.parse(storedSession));
    setRoleTitle(storedRoleTitle);
    setRoleDesc(storedRoleDesc || "");
    setIntensity(storedIntensity || "CALM");
  }, [router]);

  const playAudio = useCallback(async (text: string) => {
    if (muted || !ELEVENLABS_API_KEY) {
      return;
    }

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
            },
          }),
        }
      );

      if (!response.ok) return;

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      return new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch {
      return;
    }
  }, [muted]);

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      console.error("Speech recognition not supported");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    speechStartedRef.current = false;
    setSilenceWarning(false);

    noSpeechTimerRef.current = setTimeout(() => {
      if (!speechStartedRef.current) {
        setSilenceWarning(true);
      }
    }, 30000);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      speechStartedRef.current = true;
      setSilenceWarning(false);

      if (noSpeechTimerRef.current) {
        clearTimeout(noSpeechTimerRef.current);
      }

      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
      }

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      silenceTimerRef.current = setTimeout(() => {
        if (speechStartedRef.current) {
          recognition.stop();
        }
      }, 1500);
    };

    recognition.onerror = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
    }
  }, []);

  const processNextTurn = useCallback(async (userText: string) => {
    if (!sessionData) return;

    setState("THINKING");

    const newTurn: Turn = {
      type: "user",
      aiText: currentAiText,
      userTranscript: userText,
    };

    const updatedTurns = [...turns, newTurn];
    setTurns(updatedTurns);

    try {
      const response = await fetch(`${API_URL}/turn/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          phase,
          mainQuestionIndex,
          followupAsked,
          roleTitle,
          roleDesc,
          roleBucket: sessionData.roleBucket,
          intensity,
          aiPromptedText: currentAiText,
          userTranscript: userText,
          turnsSoFar: updatedTurns,
        }),
      });

      if (!response.ok) throw new Error("Failed to get next turn");

      const data = await response.json();

      if (data.action === "END") {
        setCurrentAiText(data.aiText);
        setState("AI_SPEAKING");
        await playAudio(data.aiText);

        localStorage.setItem("interviewTurns", JSON.stringify([...updatedTurns, {
          type: "ai",
          aiText: data.aiText,
          userTranscript: "",
        }]));

        setState("DOOR_CLOSING");
        setTimeout(() => {
          router.push("/report");
        }, 2000);
        return;
      }

      setCurrentAiText(data.aiText);
      setMainQuestionIndex(data.mainQuestionIndex);
      setFollowupAsked(data.followupAsked);

      if (data.action === "ASK_FOLLOWUP") {
        setPhase("FOLLOWUP");
      } else {
        setPhase("MAIN");
      }

      const aiTurn: Turn = {
        type: "ai",
        aiText: data.aiText,
        userTranscript: "",
      };
      setTurns([...updatedTurns, aiTurn]);

      setState("AI_SPEAKING");
      await playAudio(data.aiText);

      setTranscript("");
      setState("USER_LISTENING");
      startListening();

    } catch (error) {
      console.error("Error processing turn:", error);
      setState("USER_LISTENING");
      startListening();
    }
  }, [sessionData, currentAiText, turns, phase, mainQuestionIndex, followupAsked, roleTitle, roleDesc, intensity, playAudio, router, startListening]);

  useEffect(() => {
    if (state !== "DOOR_OPENING" || !sessionData) return;

    const timer = setTimeout(async () => {
      setCurrentAiText(sessionData.greetingText);
      setState("AI_SPEAKING");
      await playAudio(sessionData.greetingText);

      const aiTurn: Turn = {
        type: "ai",
        aiText: sessionData.greetingText,
        userTranscript: "",
      };
      setTurns([aiTurn]);

      setTranscript("");
      setState("USER_LISTENING");
      startListening();
    }, 2000);

    return () => clearTimeout(timer);
  }, [state, sessionData, playAudio, startListening]);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    const handleEnd = () => {
      if (state === "USER_LISTENING" && transcript) {
        processNextTurn(transcript);
      }
    };

    recognition.addEventListener("end", handleEnd);
    return () => recognition.removeEventListener("end", handleEnd);
  }, [state, transcript, processNextTurn]);

  const handleStopAnswer = () => {
    stopListening();
    if (transcript) {
      processNextTurn(transcript);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <AnimatePresence mode="wait">
        {(state === "DOOR_OPENING" || state === "DOOR_CLOSING") && (
          <motion.div
            key="doors"
            className="fixed inset-0 flex"
            initial={state === "DOOR_OPENING" ? { opacity: 1 } : { opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-1/2 h-full bg-gray-800 flex items-center justify-end pr-8"
              initial={state === "DOOR_OPENING" ? { x: 0 } : { x: "-100%" }}
              animate={state === "DOOR_OPENING" ? { x: "-100%" } : { x: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            >
              <div className="text-4xl font-bold text-gray-600">INTERVIEW</div>
            </motion.div>
            <motion.div
              className="w-1/2 h-full bg-gray-800 flex items-center justify-start pl-8"
              initial={state === "DOOR_OPENING" ? { x: 0 } : { x: "100%" }}
              animate={state === "DOOR_OPENING" ? { x: "100%" } : { x: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            >
              <div className="text-4xl font-bold text-gray-600">ROOM</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-2xl">
        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-gray-400">
            Question {Math.min(mainQuestionIndex + 1, 3)} of 3
            {followupAsked && " (Follow-up)"}
          </div>
          <button
            onClick={() => setMuted(!muted)}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            {muted ? "🔇 Unmute AI" : "🔊 Mute AI"}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-lg p-6 shadow-xl min-h-[300px]"
        >
          {state === "AI_SPEAKING" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-400">
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Interviewer is speaking...</span>
              </div>
              <p className="text-lg leading-relaxed">{currentAiText}</p>
            </div>
          )}

          {state === "USER_LISTENING" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-400">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Your turn to speak...</span>
              </div>

              {silenceWarning && (
                <div className="p-3 bg-yellow-500/20 border border-yellow-500 rounded-lg text-yellow-400 text-sm">
                  No speech detected. Please start speaking or click &quot;Stop Answer&quot; to skip.
                </div>
              )}

              <div className="p-4 bg-gray-700 rounded-lg min-h-[100px]">
                <p className="text-gray-300">
                  {transcript || "Listening for your response..."}
                </p>
              </div>

              <button
                onClick={handleStopAnswer}
                className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Stop Answer
              </button>
            </div>
          )}

          {state === "THINKING" && (
            <div className="flex flex-col items-center justify-center h-[200px] gap-4">
              <div className="w-8 h-8 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-gray-400">Processing your response...</span>
            </div>
          )}
        </motion.div>

        <div className="mt-6 flex flex-wrap gap-2">
          {turns.slice(-4).map((turn, i) => (
            <div
              key={i}
              className={`text-xs px-2 py-1 rounded ${
                turn.type === "ai" ? "bg-blue-900/50 text-blue-300" : "bg-green-900/50 text-green-300"
              }`}
            >
              {turn.type === "ai" ? "AI" : "You"}: {(turn.type === "ai" ? turn.aiText : turn.userTranscript).slice(0, 30)}...
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
