"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Intensity = "CALM" | "STRICT" | "AGGRESSIVE";

const intensityDescriptions: Record<Intensity, string> = {
  CALM: "Friendly and encouraging interviewer",
  STRICT: "Professional and formal interviewer",
  AGGRESSIVE: "Challenging and pressure-testing interviewer",
};

export default function SetupPage() {
  const [roleTitle, setRoleTitle] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("CALM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const name = localStorage.getItem("userName");
    if (!name) {
      router.push("/");
      return;
    }

    // Only auto-fill if user clicked "Practice Again"
    const practiceAgain = localStorage.getItem("practiceAgain");
    if (practiceAgain === "true") {
      const storedRoleTitle = localStorage.getItem("roleTitle");
      const storedRoleDesc = localStorage.getItem("roleDesc");
      const storedIntensity = localStorage.getItem("intensity") as Intensity | null;

      if (storedRoleTitle) {
        setRoleTitle(storedRoleTitle);
      }
      if (storedRoleDesc) {
        setRoleDesc(storedRoleDesc);
      }
      if (storedIntensity && ["CALM", "STRICT", "AGGRESSIVE"].includes(storedIntensity)) {
        setIntensity(storedIntensity);
      }

      // Clear the flag after using it
      localStorage.removeItem("practiceAgain");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleTitle.trim()) return;

    setLoading(true);
    setError("");

    try {
      const name = localStorage.getItem("userName") || "Candidate";
      const response = await fetch(`${API_URL}/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          roleTitle: roleTitle.trim(),
          roleDesc: roleDesc.trim(),
          intensity,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start session");
      }

      const data = await response.json();
      localStorage.setItem("sessionData", JSON.stringify(data));
      localStorage.setItem("roleTitle", roleTitle.trim());
      localStorage.setItem("roleDesc", roleDesc.trim());
      localStorage.setItem("intensity", intensity);
      router.push("/interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-center mb-6">
            Interview Setup
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="roleTitle"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Role Title *
              </label>
              <input
                type="text"
                id="roleTitle"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g., Software Engineer, Product Manager"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
              />
            </div>

            <div>
              <label
                htmlFor="roleDesc"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Role Description
              </label>
              <textarea
                id="roleDesc"
                value={roleDesc}
                onChange={(e) => setRoleDesc(e.target.value)}
                placeholder="Describe key responsibilities, team, or specific focus areas"
                rows={3}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Interview Intensity
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(["CALM", "STRICT", "AGGRESSIVE"] as Intensity[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setIntensity(level)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      intensity === level
                        ? "border-blue-500 bg-blue-500/20"
                        : "border-gray-600 hover:border-gray-500"
                    }`}
                  >
                    <div className="font-medium text-sm">{level}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-gray-400">
                {intensityDescriptions[intensity]}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!roleTitle.trim() || loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting Interview...
                </>
              ) : (
                "Start Interview"
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
