'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent, type ChangeEvent } from 'react';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /**
   * aria-label for each box. Defaults to a generic "character N". The login
   * page passes a translated label.
   */
  boxLabel?: (index: number) => string;
  /** Accessible name of the whole box group. Callers pass a translated string. */
  groupLabel?: string;
}

/**
 * OtpInput — a lightweight 6-box numeric code input.
 *
 * No new dependency: built on plain controlled <input>s. Behaviors:
 *   - one digit per box, numeric only (strips non-digits on change + paste)
 *   - typing a digit auto-advances focus to the next box
 *   - Backspace on an empty box moves focus back and clears the previous digit
 *   - pasting a 6-digit string fills the boxes left-to-right
 *
 * The parent owns the aggregated value string; this component is fully
 * controlled. Internally we re-derive per-box chars from `value` so external
 * mutations (e.g. paste handler on the parent) are reflected.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  disabled = false,
  boxLabel,
  groupLabel,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // Pad / truncate to length so each box always has a defined char.
  const chars: string[] = [];
  for (let i = 0; i < length; i++) chars.push(value.charAt(i) ?? '');
  // value may contain stray chars if the parent passed a longer string; we
  // always re-emit a cleaned, length-capped string on user actions, so the
  // rendered state stays consistent.

  function focusBox(i: number) {
    const clamped = Math.max(0, Math.min(length - 1, i));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  }

  function emit(next: string[]) {
    const cleaned = next.join('').replace(/\D/g, '').slice(0, length);
    onChange(cleaned);
  }

  function handleChange(i: number, e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // If the user pasted/typed multiple chars into a single box (some IMEs
    // deliver the whole string in one change), take the last digit and let
    // the paste-style overflow fill subsequent boxes.
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      // user cleared the box
      const next = [...chars];
      next[i] = '';
      emit(next);
      return;
    }
    const next = [...chars];
    // starting at box i, fill digits left-to-right
    let di = 0;
    for (let b = i; b < length && di < digits.length; b++) {
      next[b] = digits.charAt(di);
      di++;
    }
    emit(next);
    // focus the box after the last filled one (or last box)
    const lastFilled = Math.min(i + digits.length, length - 1);
    focusBox(lastFilled);
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (chars[i]) {
        // current box has a digit: clear it, stay
        const next = [...chars];
        next[i] = '';
        emit(next);
        e.preventDefault();
      } else {
        // empty box: move back + clear previous
        const prev = i - 1;
        if (prev >= 0) {
          const next = [...chars];
          next[prev] = '';
          emit(next);
          focusBox(prev);
          e.preventDefault();
        }
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      focusBox(i - 1);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight') {
      focusBox(i + 1);
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      // let the form submit naturally
      return;
    }
    // Block any non-digit printable char at the input level so the box never
    // shows a letter. Navigation keys (Tab, etc.) are left alone.
    if (e.key.length === 1 && /\D/.test(e.key)) {
      e.preventDefault();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const digits = text.replace(/\D/g, '').slice(0, length);
    if (!digits) return;
    const next: string[] = [];
    for (let i = 0; i < length; i++) next.push(digits.charAt(i) ?? '');
    emit(next);
    focusBox(Math.min(digits.length, length - 1));
  }

  return (
    <div className="flex gap-1.5 sm:gap-2" role="group" aria-label={groupLabel ?? 'one-time code'}>
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={c}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={boxLabel ? boxLabel(i + 1) : `character ${i + 1}`}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-12 w-9 sm:h-14 sm:w-12 rounded-lg border border-input bg-background text-center text-lg font-semibold uppercase tracking-widest text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xl"
        />
      ))}
    </div>
  );
}
