"use client";
import { useEffect, useRef, useState } from "react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { cn } from "@/lib/utils";

/**
 * Fields that save a little after you stop typing, not on every keystroke.
 *
 * The delivery screens write straight through to the server, so a field wired directly to the
 * store fired one PATCH per character — and clearing a field with select-and-backspace sent an
 * empty value that the server bounced, which then re-read the saved row and wiped what was being
 * typed. These keep the text local while you type and commit once you pause (or leave the field).
 */
function useDraft<T>(value: T, commit: (v: T) => void, delay: number) {
  const [draft, setDraft] = useState<T>(value);
  const timer = useRef<number | null>(null);
  const dirty = useRef(false);
  const latest = useRef(commit);
  // Kept current in an effect, not during render: the timer below only fires after a commit lands.
  useEffect(() => {
    latest.current = commit;
  });

  // Follow the outside value, but never while there is an uncommitted edit in the box.
  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const change = (v: T) => {
    dirty.current = true;
    setDraft(v);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      dirty.current = false;
      latest.current(v);
    }, delay);
  };

  const flush = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    latest.current(draft);
  };

  /** Put a value back in the box without saving it (used to undo an empty required field). */
  const reset = (v: T) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    dirty.current = false;
    setDraft(v);
  };

  return { draft, change, flush, reset };
}

type TextProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
  delay?: number;
  /** Refuse to save an empty value: the box snaps back to what was there and says why. */
  required?: boolean;
  /** Shown instead of the default message when a required box is cleared. */
  requiredMessage?: string;
  className?: string;
};

/**
 * A text box that commits once typing stops (or on blur / Enter).
 *
 * `required` is what stops a name from being lost: select-all-and-backspace leaves the box empty
 * for a moment, and without this the empty value was either saved or bounced by the server, which
 * then re-read the row and wiped the rest of the edit. Here it simply comes back.
 */
export function DebouncedText({
  value,
  onCommit,
  delay = 600,
  required = false,
  requiredMessage = "This can't be left empty.",
  className,
  ...rest
}: TextProps) {
  const [warn, setWarn] = useState(false);
  const commit = (v: string) => {
    if (required && !v.trim()) {
      setWarn(true);
      return;
    }
    setWarn(false);
    onCommit(v);
  };
  const { draft, change, flush, reset } = useDraft(value, commit, delay);

  const settle = () => {
    flush();
    // Empty and required → put the saved value back, so nothing is silently lost.
    if (required && !draft.trim()) {
      reset(value);
      setWarn(true);
      window.setTimeout(() => setWarn(false), 2600);
    }
  };

  return (
    <span className="relative block">
      <input
        {...rest}
        value={draft}
        aria-invalid={warn || undefined}
        className={cn(className, warn && "border-danger bg-danger/5")}
        onChange={(e) => change(e.target.value)}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
        }}
      />
      {warn && <span className="mt-1 block text-[11px] font-semibold text-danger">{requiredMessage}</span>}
    </span>
  );
}

type MoneyProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** Paise. */
  value: number;
  onCommit: (paise: number) => void;
  delay?: number;
};

/** A rupee field (stores paise) that commits once typing stops. */
export function DebouncedMoney({ value, onCommit, delay = 600, ...rest }: MoneyProps) {
  const { draft, change, flush } = useDraft(value, onCommit, delay);
  return <MoneyInput {...rest} value={draft} onChange={change} onBlur={flush} />;
}

type NumberProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** `null` is allowed and means "no limit" — the open-ended top weight band. */
  value: number | null;
  onCommit: (v: number | null) => void;
  /** Render an empty box as `null` rather than 0. */
  nullable?: boolean;
  delay?: number;
};

/** A whole-number field (grams, days) that commits once typing stops. */
export function DebouncedNumber({ value, onCommit, nullable = false, delay = 600, ...rest }: NumberProps) {
  const { draft, change, flush } = useDraft(value === null ? "" : String(value), (text) => {
    const t = text.trim();
    if (t === "") return onCommit(nullable ? null : 0);
    const n = Math.max(0, Math.round(Number(t)));
    onCommit(Number.isFinite(n) ? n : 0);
  }, delay);
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => {
        if (e.target.value !== "" && !/^\d{0,9}$/.test(e.target.value)) return;
        change(e.target.value);
      }}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
