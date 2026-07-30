// 出站路由步骤二：投递通道（Task 13 接通真实后端）—— ProxysvrGroup ⇄ OutboundChannelRow 映射。
// 对齐 doc/mail-routing.md §4、internal/models/proxysvr.go。

import type { ProxysvrGroup, ProxysvrGroupRequest } from '@/types/proxysvr';
import type { OutboundChannelRow } from './outbound-types';

export function proxysvrGroupToRow(g: ProxysvrGroup): OutboundChannelRow {
  return {
    id: String(g.id),
    channelName: g.name,
    status: g.is_active ? 'enabled' : 'disabled',
    // members 已按 (ord, endpoint_id) 升序排列（后端保证），直接投影 endpoint id 顺序。
    proxyIds: g.members.map((m) => String(m.endpoint_id)),
  };
}

export function channelRowToRequest(row: OutboundChannelRow): ProxysvrGroupRequest {
  return {
    name: row.channelName,
    is_active: row.status === 'enabled',
    members: row.proxyIds.map((id, idx) => ({ endpoint_id: Number(id), ord: idx })),
  };
}
