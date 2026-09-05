import Link from "next/link";

interface Props {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * The Sri Saraswathy Musicals logotype — a rendering of the paper mark:
 * treble-clef "S" grown into an ornamented violin body, with the wordmark.
 * Uses currentColor so it can theme dark/light.
 */
export function Logo({ variant = "dark", size = "md", className = "" }: Props) {
  const heights = { sm: 32, md: 44, lg: 60 };
  const h = heights[size];
  const fg = variant === "light" ? "#FAF6EC" : "#0A0908";
  const accent = "#C9A24B";

  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 260 60" height={h} className="shrink-0" xmlns="http://www.w3.org/2000/svg">
        {/* Treble-clef "S" ligature */}
        <g transform="translate(4,2)">
          <path d="M 22,6 C 16,6 12,10 12,16 C 12,22 16,26 24,28 C 30,30 34,34 34,40 C 34,46 30,50 24,50 C 20,50 16,48 14,44"
                fill="none" stroke={fg} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M 24,28 C 32,26 40,20 40,12 C 40,7 36,3 30,3 C 24,3 20,7 20,12 C 20,18 26,24 34,28 C 42,32 46,38 46,44 C 46,50 42,54 36,54"
                fill="none" stroke={fg} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="24" cy="50" r="3.5" fill={fg} />
        </g>
        {/* Wordmark */}
        <text x="52" y="30" fontFamily="var(--font-display), Fraunces, Georgia, serif" fontSize="22" fontWeight="500" fill={fg} letterSpacing="0.5">
          <tspan fontSize="12" fill={fg} opacity="0.7">Sri</tspan>
          <tspan dx="3" fontStyle="italic">Saraswathy</tspan>
        </text>
        <text x="52" y="49" fontFamily="var(--font-display), Fraunces, Georgia, serif" fontSize="14" fontWeight="400" fill={fg}>
          Musicals
        </text>
        {/* Ornamental violin body underline */}
        <path d="M 52,52 C 100,50 140,56 220,50 C 240,48 254,52 258,54"
              fill="none" stroke={accent} strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
        <circle cx="220" cy="52" r="2" fill={accent} />
      </svg>
    </Link>
  );
}
