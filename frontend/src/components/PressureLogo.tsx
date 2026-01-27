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

        {/* White circle with R logo at the top center */}
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

          {/* Stylized R - using a custom path for a modern look */}
          <g transform="translate(200, 45)">
            {/* Main stem of R */}
            <path
              d="M -8 -18 L -8 18"
              stroke="black"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Bowl of R */}
            <path
              d="M -8 -18 Q 12 -18 12 -5 Q 12 6 -8 6"
              stroke="black"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Leg of R */}
            <path
              d="M -2 6 L 12 18"
              stroke="black"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </motion.g>

        {/* REHEARSE text on curved path */}
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
            REHEARSE
          </textPath>
        </motion.text>
      </svg>
    </div>
  );
}
