"use client";

import * as React from "react";
import { CHECK_IN_CODE_LENGTH, normaliseCode } from "@/lib/domain/checkIn";
import { cn } from "@/lib/utils";

const BROWN = "#3E2F23";
const FOREST = "#2F5D3A";

/**
 * Six large boxes for the check-in code.
 *
 * Built for somebody standing in a doorway holding a phone in one hand, so the
 * details matter more than they look:
 *
 * - `inputMode="numeric"` opens the keypad rather than the full keyboard.
 * - The caret moves on by itself, and Backspace steps back into the previous box
 *   when the current one is already empty.
 * - Pasting "482731", "482 731" or "482-731" fills every box at once. People
 *   paste from a WhatsApp message far more often than they type.
 * - It submits itself on the sixth digit, so there is no button to find.
 *
 * One hidden detail: every box renders the whole value's digit at its own index
 * rather than holding separate state, so a paste, a delete and a retype all stay
 * consistent with what was actually entered.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus = true,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);

  /*
   * Auto-submit fires once per completed code. Without the guard a re-render
   * after the sixth digit would submit again, and the second attempt would count
   * against the rate limit for no reason.
   */
  const submitted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (value.length === CHECK_IN_CODE_LENGTH && submitted.current !== value) {
      submitted.current = value;
      onComplete(value);
    }
    if (value.length < CHECK_IN_CODE_LENGTH) submitted.current = null;
  }, [value, onComplete]);

  const focusBox = (i: number) => refs.current[Math.max(0, Math.min(CHECK_IN_CODE_LENGTH - 1, i))]?.focus();

  const handleInput = (index: number, raw: string) => {
    const digits = normaliseCode(raw);

    // A paste lands in one box but belongs to all of them.
    if (digits.length > 1) {
      const next = normaliseCode(value.slice(0, index) + digits);
      onChange(next);
      focusBox(next.length);
      return;
    }

    const chars = value.padEnd(CHECK_IN_CODE_LENGTH, " ").split("");
    chars[index] = digits || " ";
    const next = normaliseCode(chars.join("").replace(/ /g, ""));
    onChange(next);
    if (digits) focusBox(index + 1);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      e.preventDefault();
      onChange(value.slice(0, index - 1));
      focusBox(index - 1);
      return;
    }
    if (e.key === "ArrowLeft") focusBox(index - 1);
    if (e.key === "ArrowRight") focusBox(index + 1);
  };

  return (
    <div
      /*
       * The row shrinks to the screen rather than the screen stretching to the row.
       *
       * Six fixed 46px boxes plus gaps plus the card's padding came to 366px, so on a
       * 320px phone the check-in card hung off the side of the page — on the one screen
       * every participant uses, standing at the door.
       */
      className="flex w-full justify-center gap-1.5 sm:gap-2.5"
      role="group"
      aria-label={`Check-in code, ${CHECK_IN_CODE_LENGTH} digits`}
    >
      {Array.from({ length: CHECK_IN_CODE_LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          // A number input adds spinners and lets "e" and "-" through.
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={`Digit ${i + 1}`}
          maxLength={CHECK_IN_CODE_LENGTH}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ""}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            /*
             * Flexible width with a floor, not a fixed width. `min-w-0` lets a box give
             * ground on a narrow screen; `max-w` stops them stretching absurdly wide on
             * a tablet. 2.25rem keeps a digit at 26px comfortably readable.
             */
            "num h-[58px] min-w-0 flex-1 basis-0 rounded-2xl border-2 bg-white text-center text-[26px] font-extrabold",
            "min-w-[2.25rem] max-w-[52px] outline-none transition-colors sm:h-[64px] sm:text-[28px]",
            "disabled:opacity-50",
            invalid ? "border-critical" : "border-[#3E2F2333] focus:border-[#2F5D3A]",
          )}
          style={{ color: invalid ? undefined : BROWN, caretColor: FOREST }}
        />
      ))}
    </div>
  );
}
