import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette derived from Sri Saraswathy Musicals logo
        ink: {
          DEFAULT: "#0A0908",
          50: "#F8F5EE",
          100: "#EBE5D6",
          200: "#C8BEAB",
          300: "#8A7A65",
          400: "#5A4A38",
          500: "#3A2E20",
          600: "#241C13",
          700: "#17110B",
          800: "#0F0B07",
          900: "#0A0908",
          950: "#050403",
        },
        gold: {
          DEFAULT: "#C9A24B",
          50: "#FBF6E8",
          100: "#F5EACA",
          200: "#EAD48F",
          300: "#DFBE58",
          400: "#C9A24B",
          500: "#A98337",
          600: "#87672A",
          700: "#654D1F",
          800: "#4A3814",
          900: "#2E220A",
        },
        ivory: {
          DEFAULT: "#FAF6EC",
          50: "#FFFDF7",
          100: "#FAF6EC",
          200: "#F1E9D2",
          300: "#E4D5B0",
        },
        maroon: {
          DEFAULT: "#5B1E1E",
          400: "#8A2E2E",
          500: "#5B1E1E",
          600: "#3F1414",
        },
        // Semantic
        success: "#4A8B5C",
        warning: "#D4A034",
        danger: "#B84A2C",
        info: "#3D6A8B",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["clamp(2.5rem, 7vw, 5.5rem)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "display-lg": ["clamp(2rem, 5.5vw, 4rem)", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
        "display-md": ["clamp(1.75rem, 4vw, 2.75rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(10,9,8,0.04), 0 4px 12px rgba(10,9,8,0.06)",
        gold: "0 8px 24px -8px rgba(201,162,75,0.35)",
        card: "0 1px 3px rgba(10,9,8,0.06), 0 8px 24px -12px rgba(10,9,8,0.12)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #DFBE58 0%, #C9A24B 40%, #A98337 100%)",
        "gold-shine": "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
        "ink-fade": "linear-gradient(180deg, rgba(10,9,8,0) 0%, rgba(10,9,8,0.9) 100%)",
      },
      animation: {
        "float": "float 6s ease-in-out infinite",
        "shimmer": "shimmer 3s ease-in-out infinite",
        "fade-up": "fade-up 0.7s ease-out",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
