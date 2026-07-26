export interface AccountInfo {
  username: string;
  role: string;
  name: string;
  phone: string;
  email: string;
  lastLoginTime: string | null;
  lastLoginIp: string | null;
}

export interface SecurityPolicy {
  minLength: number;
  minCharClasses: number;
  historyLimit: number;
  reloginAfterPwdChange: boolean;
  twoFactorRequired: boolean;
  phoneBound: boolean;
  emailBound: boolean;
  // Whether the deployment has a usable SMS channel (caccloud License present).
  // false → the SMS 2FA option is grayed out.
  smsChannelAvailable: boolean;
}

export type TwoFactorMethod = "sms" | "email";

export interface TwoFactorConfig {
  enabled: boolean;
  method: TwoFactorMethod | "";
  smsPhone: string;
  emailMasked: string;
  required: boolean;
  // Whether the deployment has a usable SMS channel; false → SMS option grayed out.
  smsChannelAvailable: boolean;
}

export interface Session {
  session_id: string;
  device: string;
  browser: string;
  ip: string;
  location: string;
  login_time: string;
  last_seen_at: string;
  current: boolean;
}

export interface DevicesResponse {
  items: Session[];
}

// AdminTrustedDevice mirrors the backend models.AdminTrustedDevice JSON
// shape returned by GET /profile/trusted-devices (Spec §1.5). token_hash and
// revoked_at are json:"-" on the server and never reach the client.
export interface AdminTrustedDevice {
  id: number;
  device: string;
  browser: string;
  ip: string;
  created_at: string;
  last_used_at?: string;
  expires_at: string;
}

export type LoginResult = "success" | "fail";

export interface LoginRecord {
  id: number;
  time: string;
  ip: string;
  client: string;
  location: string;
  result: LoginResult;
  abnormal: boolean;
  abnormal_reason?: string;
}

export interface PaginatedLogins {
  items: LoginRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChangePasswordResult {
  relogin?: boolean;
}

export interface LogoutOthersResult {
  count: number;
}

export type ContactType = "phone" | "email";
export type CodePurpose = "bind_phone" | "bind_email";
export type CodeMethod = "sms" | "email";
