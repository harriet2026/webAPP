'use client';

import { useEffect, useState } from 'react';

const initialColors = {
  primary: '#2563eb',
  foreground: '#121212',
  muted: '#828282',
  border: '#e4e4e4',
  background: '#ffffff',
};

const tokens: Record<keyof typeof initialColors, string> = {
  primary: '--primary',
  foreground: '--foreground',
  muted: '--muted-foreground',
  border: '--border',
  background: '--popover',
};

// ECharts renders outside the CSS cascade. Resolve the actual theme tokens and
// convert OKLCH to sRGB for its color parser (including emphasis/area colors).
export function useChartTheme() {
  const [colors, setColors] = useState(initialColors);
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      const styles = getComputedStyle(root);
      if (!styles.getPropertyValue('--primary').trim()) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      const next = { ...initialColors };
      for (const key of Object.keys(tokens) as (keyof typeof tokens)[]) {
        const value = styles.getPropertyValue(tokens[key]).trim();
        if (!value) continue;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        next[key] = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      }
      setColors(previous => Object.keys(tokens).every(key => previous[key as keyof typeof tokens] === next[key as keyof typeof tokens]) ? previous : next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme-color', 'style'] });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return colors;
}
