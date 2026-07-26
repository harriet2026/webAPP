'use client';

import { useRef, useState, useEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export function OverflowCell({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setIsOverflowing(el.scrollWidth > el.clientWidth);
    const raf = requestAnimationFrame(() => requestAnimationFrame(check));
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [text]);

  return (
    <Tooltip>
      <TooltipTrigger render={<span ref={ref} className="block truncate cursor-default max-w-[200px]" />}>
        {text}
      </TooltipTrigger>
      {isOverflowing && (
        <TooltipContent className="max-w-md whitespace-pre-wrap break-all text-xs">
          {text}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
