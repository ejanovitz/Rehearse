"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Lottie, { LottieRefCurrentProps } from "lottie-react";
import avatarAnimation from "../../../public/animations/avatar.json";
import { apiFetch } from "@/lib/api";

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
  const [followupCount, setFollowupCount] = useState(0);  // Track 0, 1, or 2 follow-ups
  const [repeatRequestCount, setRepeatRequestCount] = useState(0);  // Track repeat/rephrase requests
  const [currentAiText, setCurrentAiText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [silenceWarning, setSilenceWarning] = useState(false);
  const [showStopButton, setShowStopButton] = useState(false);
  const [needsRestartListening, setNeedsRestartListening] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [roleTitle, setRoleTitle] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [intensity, setIntensity] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechStartedRef = useRef(false);
  const noSpeechTimerRef = useRef<NodeJS.Timeout | null>(null);
  const repeatQuestionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const transcriptRef = useRef("");
  const isExitingRef = useRef(false);

  // Reset exiting flag on mount (handles React Strict Mode double-mount)
  useEffect(() => {
    isExitingRef.current = false;
  }, []);

  // Cleanup function for stopping all audio and recognition
  const stopAllMedia = useCallback(() => {
    // Stop audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    // Stop recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Clear all timers
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
    if (repeatQuestionTimerRef.current) clearTimeout(repeatQuestionTimerRef.current);

    setIsAudioPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isExitingRef.current = true;
      stopAllMedia();
    };
  }, [stopAllMedia]);

  // Control avatar animation based on actual audio playback
  useEffect(() => {
    if (isAudioPlaying) {
      lottieRef.current?.play();
    } else {
      lottieRef.current?.pause();
    }
  }, [isAudioPlaying]);

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
    if (muted || isExitingRef.current) {
      return;
    }

    try {
      const response = await apiFetch("/tts", {
        method: "POST",
        body: JSON.stringify({ text }),
      });

      if (!response.ok || isExitingRef.current) return;

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (isExitingRef.current) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      return new Promise<void>((resolve) => {
        audio.onplay = () => {
          if (!isExitingRef.current) {
            setIsAudioPlaying(true);
          }
        };
        audio.onended = () => {
          setIsAudioPlaying(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          setIsAudioPlaying(false);
          resolve();
        };

        if (isExitingRef.current) {
          URL.revokeObjectURL(audioUrl);
          resolve();
          return;
        }

        audio.play().catch(() => {
          setIsAudioPlaying(false);
          resolve();
        });
      });
    } catch {
      return;
    }
  }, [muted]);

  const repeatCurrentQuestion = useCallback(async () => {
    if (!currentAiText || state !== "USER_LISTENING" || isExitingRef.current) return;

    // Stop current recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Clear all timers
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
    if (repeatQuestionTimerRef.current) clearTimeout(repeatQuestionTimerRef.current);

    setSilenceWarning(false);
    setState("AI_SPEAKING");

    // Repeat the question
    const repeatText = "Let me repeat the question. " + currentAiText;
    await playAudio(repeatText);

    if (isExitingRef.current) return;

    // Reset and start listening again
    setTranscript("");
    transcriptRef.current = "";
    setState("USER_LISTENING");
    setNeedsRestartListening(true);
  }, [currentAiText, state, playAudio]);

  const startListening = useCallback(() => {
    if (isExitingRef.current) return;

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
    transcriptRef.current = "";
    setSilenceWarning(false);

    // 25 second warning timer
    noSpeechTimerRef.current = setTimeout(() => {
      if (!speechStartedRef.current && !isExitingRef.current) {
        setSilenceWarning(true);
      }
    }, 25000);

    // 30 second repeat question timer
    repeatQuestionTimerRef.current = setTimeout(() => {
      if (!speechStartedRef.current && !isExitingRef.current) {
        repeatCurrentQuestion();
      }
    }, 30000);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (isExitingRef.current) return;

      speechStartedRef.current = true;
      setSilenceWarning(false);

      // Clear the no-speech and repeat timers since user started speaking
      if (noSpeechTimerRef.current) {
        clearTimeout(noSpeechTimerRef.current);
        noSpeechTimerRef.current = null;
      }
      if (repeatQuestionTimerRef.current) {
        clearTimeout(repeatQuestionTimerRef.current);
        repeatQuestionTimerRef.current = null;
      }

      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      // Update both state and ref for immediate access
      const currentTranscript = finalTranscript || interimTranscript;
      if (currentTranscript) {
        setTranscript(currentTranscript);
        transcriptRef.current = currentTranscript;
      }

      // Reset silence timer on any speech activity
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Only trigger end-of-turn after final results and 1.5s silence
      if (finalTranscript) {
        silenceTimerRef.current = setTimeout(() => {
          if (speechStartedRef.current && transcriptRef.current && !isExitingRef.current) {
            recognition.stop();
          }
        }, 1500);
      }
    };

    recognition.onerror = (event) => {
      if (isExitingRef.current) return;

      console.error("Speech recognition error:", event.error);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
      if (repeatQuestionTimerRef.current) clearTimeout(repeatQuestionTimerRef.current);

      // Restart recognition on recoverable errors
      if (event.error === "no-speech" || event.error === "audio-capture") {
        setTimeout(() => {
          if (state === "USER_LISTENING" && !speechStartedRef.current && !isExitingRef.current) {
            recognition.start();
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
      if (repeatQuestionTimerRef.current) clearTimeout(repeatQuestionTimerRef.current);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [repeatCurrentQuestion, state]);

  // Effect to restart listening after question repeat
  useEffect(() => {
    if (needsRestartListening && state === "USER_LISTENING" && !isExitingRef.current) {
      setNeedsRestartListening(false);
      startListening();
    }
  }, [needsRestartListening, state, startListening]);

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
    if (repeatQuestionTimerRef.current) {
      clearTimeout(repeatQuestionTimerRef.current);
    }
  }, []);

  const handleExitInterview = useCallback(() => {
    // Mark as exiting to prevent any new audio/recognition
    isExitingRef.current = true;
    stopAllMedia();

    // Save turns with incomplete flag and repeat request count
    localStorage.setItem("interviewTurns", JSON.stringify(turns));
    localStorage.setItem("interviewIncomplete", "true");
    localStorage.setItem("repeatRequestCount", String(repeatRequestCount));

    // Navigate to report
    router.push("/report");
  }, [turns, router, stopAllMedia, repeatRequestCount]);

  const processNextTurn = useCallback(async (userText: string) => {
    if (!sessionData || isExitingRef.current) return;

    setState("THINKING");

    const newTurn: Turn = {
      type: "user",
      aiText: currentAiText,
      userTranscript: userText,
    };

    const updatedTurns = [...turns, newTurn];
    setTurns(updatedTurns);

    try {
      const response = await apiFetch("/turn/next", {
        method: "POST",
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          phase,
          mainQuestionIndex,
          followupCount,
          roleTitle,
          roleDesc,
          roleBucket: sessionData.roleBucket,
          intensity,
          aiPromptedText: currentAiText,
          userTranscript: userText,
          turnsSoFar: updatedTurns,
          repeatRequestCount,
        }),
      });

      if (!response.ok) throw new Error("Failed to get next turn");
      if (isExitingRef.current) return;

      const data = await response.json();

      // Handle repeat/rephrase request - don't count as a follow-up
      if (data.action === "REPEAT_QUESTION") {
        setRepeatRequestCount(prev => prev + 1);
        setCurrentAiText(data.aiText);
        // Don't add a turn for repeat requests, but update the last AI text

        setState("AI_SPEAKING");
        await playAudio(data.aiText);

        if (isExitingRef.current) return;

        setTranscript("");
        setState("USER_LISTENING");
        startListening();
        return;
      }

      if (data.action === "END") {
        setCurrentAiText(data.aiText);
        setState("AI_SPEAKING");
        await playAudio(data.aiText);

        if (isExitingRef.current) return;

        localStorage.setItem("interviewTurns", JSON.stringify([...updatedTurns, {
          type: "ai",
          aiText: data.aiText,
          userTranscript: "",
        }]));
        localStorage.setItem("repeatRequestCount", String(repeatRequestCount));
        localStorage.removeItem("interviewIncomplete");

        setState("DOOR_CLOSING");
        setTimeout(() => {
          if (!isExitingRef.current) {
            router.push("/report");
          }
        }, 2000);
        return;
      }

      setCurrentAiText(data.aiText);
      setMainQuestionIndex(data.mainQuestionIndex);
      setFollowupCount(data.followupCount);

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

      if (isExitingRef.current) return;

      setTranscript("");
      setState("USER_LISTENING");
      startListening();

    } catch (error) {
      console.error("Error processing turn:", error);
      if (!isExitingRef.current) {
        setState("USER_LISTENING");
        startListening();
      }
    }
  }, [sessionData, currentAiText, turns, phase, mainQuestionIndex, followupCount, repeatRequestCount, roleTitle, roleDesc, intensity, playAudio, router, startListening]);

  useEffect(() => {
    if (state !== "DOOR_OPENING" || !sessionData || isExitingRef.current) return;

    const timer = setTimeout(async () => {
      if (isExitingRef.current) return;

      setCurrentAiText(sessionData.greetingText);
      setState("AI_SPEAKING");
      await playAudio(sessionData.greetingText);

      if (isExitingRef.current) return;

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
      const currentTranscript = transcriptRef.current || transcript;
      if (state === "USER_LISTENING" && currentTranscript && !isExitingRef.current) {
        processNextTurn(currentTranscript);
      }
    };

    recognition.addEventListener("end", handleEnd);
    return () => recognition.removeEventListener("end", handleEnd);
  }, [state, transcript, processNextTurn]);

  const handleStopAnswer = () => {
    stopListening();
    const currentTranscript = transcriptRef.current || transcript;
    if (currentTranscript) {
      processNextTurn(currentTranscript);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <AnimatePresence mode="wait">
        {(state === "DOOR_OPENING" || state === "DOOR_CLOSING") && (
          <motion.div
            key="doors"
            className="fixed inset-0 flex z-50"
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

      {/* Exit Confirmation Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 max-w-md mx-4 shadow-2xl"
            >
              <h3 className="text-xl font-semibold text-white mb-3">Exit Interview?</h3>
              <p className="text-gray-300 mb-6">
                Are you sure you want to exit? Your interview will be marked as incomplete
                and the report will have limited insights based on your responses so far.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Continue Interview
                </button>
                <button
                  onClick={handleExitInterview}
                  className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Exit & View Report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-[75vw]">
        {/* Header with controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">
              Question {Math.min(mainQuestionIndex + 1, 3)} of 3
              {phase === "FOLLOWUP" && followupCount > 0 && ` (Follow-up ${followupCount}/2)`}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCaptions(!showCaptions)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                showCaptions ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title="Toggle Captions"
            >
              CC
            </button>
            <button
              onClick={() => setShowStopButton(!showStopButton)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                showStopButton ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title="Toggle Stop Button"
            >
              STOP
            </button>
            <button
              onClick={() => setMuted(!muted)}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              onClick={() => setShowExitConfirm(true)}
              className="px-3 py-1 text-sm bg-red-700 hover:bg-red-600 rounded-lg transition-colors"
              title="Exit Interview"
            >
              EXIT
            </button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-lg shadow-xl overflow-hidden"
        >
          {/* Avatar Section */}
          <div className="flex flex-col items-center pt-12 pb-8">
            <div className="w-72 h-72 relative">
              <Lottie
                lottieRef={lottieRef}
                animationData={avatarAnimation}
                loop={true}
                autoplay={false}
                style={{ width: "100%", height: "100%" }}
              />
            </div>

            {/* Status Indicator */}
            <div className="mt-4 flex items-center gap-2">
              {state === "AI_SPEAKING" && (
                <>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <span className="text-sm text-blue-400">
                    {isAudioPlaying ? "Interviewer speaking..." : "Preparing response..."}
                  </span>
                </>
              )}
              {state === "USER_LISTENING" && (
                <>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-sm text-green-400">Your turn to speak...</span>
                </>
              )}
              {state === "THINKING" && (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                  <span className="text-sm text-gray-400">Processing...</span>
                </>
              )}
            </div>
          </div>

          {/* Captions / Transcript Area */}
          {showCaptions && (
            <div className="border-t border-gray-700 p-6 bg-gray-900/50">
              {state === "AI_SPEAKING" && (
                <p className="text-center text-gray-200 leading-relaxed text-lg">
                  {currentAiText}
                </p>
              )}
              {state === "USER_LISTENING" && (
                <div className="space-y-3">
                  {silenceWarning && (
                    <div className="p-2 bg-yellow-500/20 border border-yellow-500 rounded text-yellow-400 text-sm text-center">
                      No speech detected. Please start speaking.
                    </div>
                  )}
                  <p className="text-center text-gray-400 italic text-lg">
                    {transcript || "Listening for your response..."}
                  </p>
                </div>
              )}
              {state === "THINKING" && (
                <p className="text-center text-gray-500 italic text-lg">
                  Processing your response...
                </p>
              )}
            </div>
          )}

          {/* User Controls */}
          {state === "USER_LISTENING" && showStopButton && (
            <div className="p-4 border-t border-gray-700">
              <button
                onClick={handleStopAnswer}
                className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Stop Answer
              </button>
            </div>
          )}
        </motion.div>

        {/* Turn History */}
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {turns.slice(-4).map((turn, i) => (
            <div
              key={i}
              className={`text-xs px-2 py-1 rounded max-w-[150px] truncate ${
                turn.type === "ai" ? "bg-blue-900/50 text-blue-300" : "bg-green-900/50 text-green-300"
              }`}
            >
              {turn.type === "ai" ? "AI" : "You"}: {(turn.type === "ai" ? turn.aiText : turn.userTranscript).slice(0, 25)}...
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
