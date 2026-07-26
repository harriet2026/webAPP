'use client'

import { useEffect, useState } from 'react'
import { useApiRequest } from '@/lib/api/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface MapKeyItem {
  id?: number | string
  name?: string
  label?: string
  [key: string]: any
}

interface Props {
  mapSource: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function MapKeySelect({ mapSource, value, onChange, placeholder = 'Select...', className }: Props) {
  const { apiRequest } = useApiRequest()
  const [items, setItems] = useState<MapKeyItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!mapSource || mapSource === 'dynamic') return
    setLoading(true)
    // Strip /api/v1 prefix since apiRequest prepends it
    const path = mapSource.replace(/^\/api\/v1/, '')
    apiRequest<any>(path)
      .then((resp) => {
        // Handle various response shapes: array, {items}, {rules}, {profiles}
        let list: MapKeyItem[] = []
        if (Array.isArray(resp)) {
          list = resp
        } else if (Array.isArray(resp?.items)) {
          list = resp.items
        } else if (Array.isArray(resp?.rules)) {
          list = resp.rules
        } else if (Array.isArray(resp?.profiles)) {
          list = resp.profiles
        }
        setItems(list)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [mapSource, apiRequest])

  if (!mapSource || mapSource === 'dynamic' || (!loading && items.length === 0)) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Enter key...'}
        className={className ?? 'h-7 text-xs'}
      />
    )
  }

  return (
    <Select value={value} onValueChange={(v) => { if (v != null) onChange(v); }} disabled={loading}>
      <SelectTrigger className={className ?? 'h-7 text-xs'}>
        <SelectValue placeholder={loading ? 'Loading...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => {
          const id = String(item.id ?? item.name ?? '')
          const label = item.name ?? item.label ?? id
          return (
            <SelectItem key={id} value={id}>
              {label}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
