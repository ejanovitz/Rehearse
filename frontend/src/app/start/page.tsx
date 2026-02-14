"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PressureLogo from "@/components/PressureLogo";

export default function StartPage() {
  const [name, setName] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      // Clear previous session data for a fresh start
      localStorage.removeItem("roleTitle");
      localStorage.removeItem("roleDesc");
      localStorage.removeItem("intensity");
      localStorage.removeItem("sessionData");
      localStorage.removeItem("interviewTurns");
      localStorage.removeItem("repeatRequestCount");
      localStorage.removeItem("practiceAgain");

      localStorage.setItem("userName", name.trim());
      router.push("/setup");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl">
          <PressureLogo className="mb-0" />
          <p className="text-gray-400 text-center mb-6">
            Train for the moments that matter
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-300 mb-4"
              >
                What&apos;s your name?
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
                autoFocus
              />
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!name.trim()}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              Get Started
            </motion.button>
          </form>

          <p className="mt-6 text-xs text-gray-500 text-center">
            Best experienced in Chrome or Edge for speech recognition
          </p>
        </div>
      </motion.div>
    </main>
  );
}
