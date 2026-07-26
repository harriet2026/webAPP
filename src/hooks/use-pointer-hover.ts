'use client';

import { useCallback, useState, type PointerEventHandler } from 'react';

interface UsePointerHoverOptions<T extends HTMLElement> {
  disabled?: boolean;
  onPointerEnter?: PointerEventHandler<T>;
  onPointerLeave?: PointerEventHandler<T>;
}

/**
 * Pointer-driven hover state for affordances that must keep working when a
 * hybrid input device reports `hover: none`.
 *
 * Touch input is intentionally ignored so tapping never leaves a sticky hover
 * state behind. Consumers style the returned `data-hovered` attribute.
 */
export function usePointerHover<T extends HTMLElement = HTMLElement>({
  disabled = false,
  onPointerEnter,
  onPointerLeave,
}: UsePointerHoverOptions<T> = {}) {
  const [pointerHovered, setPointerHovered] = useState(false);
  const isHovered = !disabled && pointerHovered;

  const handlePointerEnter = useCallback<PointerEventHandler<T>>(
    (event) => {
      onPointerEnter?.(event);
      if (
        !disabled &&
        !event.defaultPrevented &&
        (event.pointerType === 'mouse' || event.pointerType === 'pen')
      ) {
        setPointerHovered(true);
      }
    },
    [disabled, onPointerEnter],
  );

  const handlePointerLeave = useCallback<PointerEventHandler<T>>(
    (event) => {
      onPointerLeave?.(event);
      setPointerHovered(false);
    },
    [onPointerLeave],
  );

  return {
    isHovered,
    pointerHoverProps: {
      'data-hovered': isHovered ? 'true' : undefined,
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
    },
  };
}
