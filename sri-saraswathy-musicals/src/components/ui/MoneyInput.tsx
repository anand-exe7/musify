"use client";
import { useEffect, useState } from "react";
import { rupeeInput, toPaise } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** Current value in integer **paise**. */
  value: number;
  /** Fired with the new value in integer **paise**. */
  onChange: (paise: number) => void;
};

/**
 * A rupee amount field that stores **paise**. The user types rupees with up to
 * two decimals ("1180.50"); the parent always receives an integer paise value.
 *
 * Internally it keeps the raw text so partial entries like "12." or "12.50"
 * don't snap while typing, and it re-syncs when the paise value is set from
 * outside (e.g. filled from the catalog, or a draft loaded for editing).
 */
export function MoneyInput({ value, onChange, ...rest }: Props) {
  const [text, setText] = useState(() => (value ? rupeeInput(value) : ""));

  useEffect(() => {
    // Only overwrite the field when the external value genuinely differs from
    // what's typed, so caret/decimals are preserved during normal editing.
    if (toPaise(text) !== value) setText(value ? rupeeInput(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        // Digits with an optional single dot and at most two decimals.
        if (raw !== "" && !/^\d*\.?\d{0,2}$/.test(raw)) return;
        setText(raw);
        onChange(toPaise(raw));
      }}
    />
  );
}
