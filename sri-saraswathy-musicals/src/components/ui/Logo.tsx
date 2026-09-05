import Link from "next/link";
import Image from "next/image";

interface Props {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Use the compact square LOGO2.png instead of the wide Logo.png. Defaults to false. */
  compact?: boolean;
}

/**
 * The Sri Saraswathy Musicals logotype — original PNG mark from /public.
 * variant=light applies a whitening filter so the mark stays visible over dark hero.
 */
export function Logo({ variant = "dark", size = "md", className = "", compact = false }: Props) {
  // Logo.png is ~2.03:1 (1920×948); LOGO2.png is 1:1 (600×600).
  const heights = { sm: 44, md: 60, lg: 88 };
  const h = heights[size];
  const src = compact ? "/LOGO2.png" : "/Logo.png";
  const aspect = compact ? 1 : 1920 / 948;
  const w = Math.round(h * aspect);

  return (
    <Link
      href="/"
      aria-label="Sri Saraswathy Musicals"
      className={`inline-flex items-center ${className}`}
    >
      <Image
        src={src}
        alt="Sri Saraswathy Musicals"
        width={w}
        height={h}
        priority
        className="object-contain"
        style={{
          height: `${h}px`,
          width: `${w}px`,
          filter: variant === "light" ? "brightness(0) invert(1)" : "none",
        }}
      />
    </Link>
  );
}
