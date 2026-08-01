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
          const key = mapKeyForItem(mapSource, item)
          const label = item.name ?? item.label ?? key
          return (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

// GT-12685：不同 mapSource 的键形态不同，不能一律取 item.id。
//
// - /unified-rules/_meta/groups 与 _meta/feature-groups：后端刻意把 id 设成
//   tag（grp:<名>），引擎也按该 tag 建键，直接用 id 即可。
// - /detection-profiles：id 是**数据库主键**，而引擎历来按档案名建键 ——
//   两边对不上会让规则保存成功却恒不命中（rule_eval 取不到值就落 isNull
//   分支），且列表健康度看不出异常。引擎现同时写 profid:<id> 别名
//   （precompute.go markProfileIDKey），这里就存这个无歧义形态。
function mapKeyForItem(mapSource: string, item: MapKeyItem): string {
  const rawID = item.id == null ? '' : String(item.id)
  if (mapSource.includes('/detection-profiles') && rawID !== '') {
    return `profid:${rawID}`
  }
  return rawID || String(item.name ?? '')
}
