import { PlatformSecurityPage } from '@/components/security/platform-security/PlatformSecurityPage';

// GT-11874: 平台安全策略（仅 system_admin 可见，由 PermissionGate + sidebar 权限门控）
export default function Page() {
  return <PlatformSecurityPage />;
}