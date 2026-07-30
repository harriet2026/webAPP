// 出站路由三步向导（Task 5+）步骤一/二共享的行级数据类型（Task 13 接通真实后端：
// proxysvr-endpoints / proxysvr-groups，取代旧 mail-routing-mockonly.ts 虚拟 endpoint）。
// 字段与 src/types/proxysvr.ts::ProxysvrEndpoint/ProxysvrGroup（真实后端 wire 形状，
// snake_case）逐字段对应，仅 id 从后端的 number 转为 string——组件层统一用字符串 id，与本页
// 其余 mail-routing 行类型的既有约定一致。wire ⇄ Row 的换算见 proxy-mapping.ts / channel-mapping.ts。

import type { EnableStatus, ProbeStatus } from '../mr-types';

/** 展示用 TLS 最低版本标签，与后端 "1.0"/"1.1"/"1.2"/"1.3" 一一对应。 */
export type TlsMinVersion = '1.0' | '1.1' | '1.2' | '1.3';
export type CipherProfile = 'default' | 'high' | 'compatible';

export interface OutboundProxyRow {
  id: string;
  name: string;
  proxyIp: string;
  proxyPort: number;
  /** 私有协议 presend code（demo 默认 347）。 */
  presendCode: number;
  /** 交换点分配的账户标识（真实后端必填）。 */
  lid: string;
  /** license 是否已配置；明文/密文永不下发，编辑态留空=保持原值不变。 */
  licensePresent: boolean;
  /** 表单提交用：非空才会更新既有 license（真实后端语义）。 */
  license: string;
  useTls: boolean;
  egressIp: string;
  heloHostname: string;
  tlsMinVersion: TlsMinVersion;
  cipherProfile: CipherProfile;
  status: EnableStatus;
  probeStatus: ProbeStatus;
  lastProbeTime: string | null;
}

export interface OutboundChannelRow {
  id: string;
  channelName: string;
  status: EnableStatus;
  proxyIds: string[];
}
