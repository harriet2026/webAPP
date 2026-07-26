'use client'
import type { MarkBlock } from './types'

export function MarkPreview({ block }: { block: MarkBlock }) {
  const style = computeStyle(block)
  return <span style={style}>{block.text || '—'}</span>
}

function computeStyle(b: MarkBlock): React.CSSProperties {
  if (b.style === 'plain_text') return { padding: '2px 6px' }
  if (b.style === 'custom' && b.custom_colors) {
    return {
      background: b.custom_colors.bg,
      color: b.custom_colors.text,
      border: `1px solid ${b.custom_colors.border}`,
      borderRadius: `${b.custom_colors.radius}px`,
      padding: '2px 8px',
    }
  }
  const presets: Record<string, React.CSSProperties> = {
    blue_tag:       { background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #93C5FD', borderRadius: '4px', padding: '2px 8px' },
    orange_warning: { background: '#FFEDD5', color: '#C2410C', border: '1px solid #FDBA74', borderRadius: '4px', padding: '2px 8px' },
  }
  return presets[b.style] ?? {}
}
