"use client";

import { motion } from "framer-motion";

interface PressureLogoProps {
  className?: string;
}

export default function PressureLogo({ className = "" }: PressureLogoProps) {
  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 400 160"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Curved path for the text - slight U curve, positioned lower */}
          <path
            id="textCurve"
            d="M 30 115 Q 200 150 370 115"
            fill="none"
          />

          {/* Gradient for the text */}
          <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#e5e5e5" />
            <stop offset="100%" stopColor="#d4d4d4" />
          </linearGradient>

          {/* Filter for slight glow effect */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* White circle with P logo at the top center */}
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* Outer glow ring */}
          <circle
            cx="200"
            cy="45"
            r="38"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
          />

          {/* Main white circle */}
          <circle
            cx="200"
            cy="45"
            r="35"
            fill="white"
            filter="url(#glow)"
          />

          {/* Stylized P - using a custom path for a modern look */}
          <g transform="translate(200, 45)">
            {/* Main stem of P */}
            <path
              d="M -8 -18 L -8 18"
              stroke="black"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Bowl of P - stylized with slight break */}
            <path
              d="M -8 -18 Q 12 -18 12 -5 Q 12 6 -8 6"
              stroke="black"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Small accent/pressure crack in P */}
            <path
              d="M 2 -12 L 5 -8"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.6"
            />
          </g>
        </motion.g>

        {/* PRESSURE text on curved path */}
        <motion.text
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          fill="url(#textGradient)"
          fontSize="42"
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="12"
        >
          <textPath href="#textCurve" startOffset="50%" textAnchor="middle">
            PRESSURE
          </textPath>
        </motion.text>

        {/* Crack lines overlay - these create the pressure crack effect */}
        <motion.g
          initial={{ opacity: 0, pathLength: 0 }}
          animate={{ opacity: 1, pathLength: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          stroke="rgba(100, 100, 100, 0.7)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        >
          {/* Crack on P */}
          <path d="M 55 110 L 60 120 L 55 127" />
          <path d="M 58 115 L 65 117" />

          {/* Crack on R */}
          <path d="M 95 113 L 100 123 L 95 130" />
          <path d="M 98 120 L 105 122" />

          {/* Crack on first E */}
          <path d="M 135 115 L 138 125 L 142 123" />

          {/* Crack on first S */}
          <path d="M 175 120 L 180 130 L 175 135" />
          <path d="M 178 127 L 185 129" />

          {/* Crack on second S */}
          <path d="M 215 123 L 218 133 L 222 130" />

          {/* Crack on U */}
          <path d="M 255 120 L 260 130 L 255 137" />
          <path d="M 258 127 L 265 128" />

          {/* Crack on R */}
          <path d="M 295 115 L 300 125 L 295 133" />
          <path d="M 298 123 L 305 125" />

          {/* Crack on final E */}
          <path d="M 335 113 L 340 123 L 337 130" />
          <path d="M 338 120 L 345 121" />
        </motion.g>

        {/* Additional fine crack details */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 1.2, delay: 1 }}
          stroke="rgba(80, 80, 80, 0.5)"
          strokeWidth="0.8"
          fill="none"
        >
          {/* Micro cracks */}
          <path d="M 70 117 L 73 121" />
          <path d="M 150 123 L 153 127" />
          <path d="M 190 125 L 193 129" />
          <path d="M 230 127 L 233 131" />
          <path d="M 270 123 L 273 127" />
          <path d="M 310 120 L 313 124" />
          <path d="M 350 118 L 353 122" />
        </motion.g>
      </svg>
    </div>
  );
}
