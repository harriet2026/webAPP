'use client'
import DOMPurify from 'isomorphic-dompurify'
import type { DisclaimerBlock } from './types'

export function DisclaimerPreview({ block }: { block: DisclaimerBlock }) {
  const sanitized = DOMPurify.sanitize(block.content || '<em>—</em>')
  return (
    <div
      className="text-sm text-gray-600 border-t pt-2"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
