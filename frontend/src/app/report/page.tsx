"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";

interface Report {
  overallScore: number;
  subscores: {
    communication: number;
    relevance: number;
    structure: number;
    specificity: number;
    confidence: number;
  };
  strengths: string[];
  improvements: string[];
  patternUnderPressure: string;
  idealAnswerRewrite: string;
  nextSteps: string[];
  timestamp?: number;
  roleTitle?: string;
}

interface Turn {
  type: "ai" | "user";
  aiText: string;
  userTranscript: string;
}

export default function ReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isIncomplete, setIsIncomplete] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      const storedSession = localStorage.getItem("sessionData");
      const storedTurns = localStorage.getItem("interviewTurns");
      const storedRoleTitle = localStorage.getItem("roleTitle");
      const storedRoleDesc = localStorage.getItem("roleDesc");
      const storedIntensity = localStorage.getItem("intensity");
      const userName = localStorage.getItem("userName");
      const incomplete = localStorage.getItem("interviewIncomplete");

      if (incomplete === "true") {
        setIsIncomplete(true);
        localStorage.removeItem("interviewIncomplete");
      }

      if (!storedSession || !storedTurns) {
        router.push("/start");
        return;
      }

      const sessionData = JSON.parse(storedSession);
      const turns: Turn[] = JSON.parse(storedTurns);
      const storedRepeatCount = localStorage.getItem("repeatRequestCount");
      const repeatRequestCount = storedRepeatCount ? parseInt(storedRepeatCount, 10) : 0;

      try {
        const response = await apiFetch("/report/final", {
          method: "POST",
          body: JSON.stringify({
            sessionId: sessionData.sessionId,
            name: userName || "Candidate",
            roleTitle: storedRoleTitle || "",
            roleDesc: storedRoleDesc || "",
            roleBucket: sessionData.roleBucket,
            intensity: storedIntensity || "CALM",
            turns,
            repeatRequestCount,
          }),
        });

        if (!response.ok) throw new Error("Failed to generate report");

        const data: Report = await response.json();
        data.timestamp = Date.now();
        data.roleTitle = storedRoleTitle || "";
        setReport(data);

        const storedReports = localStorage.getItem("recentReports");
        const recentReports: Report[] = storedReports ? JSON.parse(storedReports) : [];
        recentReports.unshift(data);
        if (recentReports.length > 3) recentReports.pop();
        localStorage.setItem("recentReports", JSON.stringify(recentReports));

      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [router]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-gray-400">Generating your report...</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md">
          <h1 className="text-xl font-bold text-red-400 mb-4">Error</h1>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => router.push("/start")}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
          >
            Start Over
          </button>
        </div>
      </main>
    );
  }

  if (!report) return null;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Report Content */}
          <div className="space-y-6 bg-gray-900 p-4 rounded-lg">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Interview Report</h1>
              {report.roleTitle && (
                <p className="text-gray-400">{report.roleTitle}</p>
              )}
              <p className="text-gray-500 text-sm mt-2">
                Generated on {new Date().toLocaleDateString()}
              </p>
            </div>

            {isIncomplete && (
              <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-yellow-400 text-xl">⚠️</span>
                  <div>
                    <h3 className="text-yellow-400 font-semibold mb-1">Incomplete Interview</h3>
                    <p className="text-yellow-200/80 text-sm">
                      This interview was ended early. The report is based on limited responses
                      and may not fully reflect your interview capabilities. For a comprehensive
                      assessment, we recommend completing a full interview session.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Overall Score</h2>
                <span className={`text-4xl font-bold ${getScoreColor(report.overallScore)}`}>
                  {report.overallScore}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${getScoreBarColor(report.overallScore)}`}
                  style={{ width: `${report.overallScore}%` }}
                />
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Subscores</h2>
              <div className="space-y-4">
                {Object.entries(report.subscores).map(([key, value]) => (
                  <div key={key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize text-gray-300">{key}</span>
                      <span className={getScoreColor(value)}>{value}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getScoreBarColor(value)}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4 text-green-400">Strengths</h2>
                <ul className="space-y-2">
                  {report.strengths.map((strength, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-400 mt-1">✓</span>
                      <span className="text-gray-300">{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4 text-yellow-400">Areas for Improvement</h2>
                <ul className="space-y-2">
                  {report.improvements.map((improvement, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-yellow-400 mt-1">→</span>
                      <span className="text-gray-300">{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Pattern Under Pressure</h2>
              <p className="text-gray-300 leading-relaxed">{report.patternUnderPressure}</p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Ideal Answer Example</h2>
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-gray-300 leading-relaxed italic">{report.idealAnswerRewrite}</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Next Steps</h2>
              <ol className="space-y-2">
                {report.nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                      {i + 1}
                    </span>
                    <span className="text-gray-300">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                // Set flag to indicate user wants to practice again with same role
                localStorage.setItem("practiceAgain", "true");
                router.push("/setup");
              }}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Practice Again
            </button>
            <button
              onClick={() => {
                // Clear all session data for a fresh start
                localStorage.removeItem("roleTitle");
                localStorage.removeItem("roleDesc");
                localStorage.removeItem("intensity");
                localStorage.removeItem("sessionData");
                localStorage.removeItem("interviewTurns");
                localStorage.removeItem("repeatRequestCount");
                localStorage.removeItem("practiceAgain");
                router.push("/start");
              }}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              New Session
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
