import { describe, expect, it } from 'vitest';

import type { SmtpConfigPayload } from '@/types/alerts';
import { smtpConfigRequestPayload } from './SmtpConfigDrawer';

const form: SmtpConfigPayload = {
  use_internal_postfix: true,
  server: '',
  port: 25,
  encryption: 'none',
  auth_method: 'none',
  username: '',
  sender_email: 'unified@example.com',
  sender_name: 'OSGateway',
  connect_timeout_seconds: 10,
  send_timeout_seconds: 30,
  password: '',
};

describe('smtpConfigRequestPayload', () => {
  it('omits the read-only unified sender and a blank password', () => {
    expect(smtpConfigRequestPayload(form)).toEqual({
      use_internal_postfix: true,
      server: '',
      port: 25,
      encryption: 'none',
      auth_method: 'none',
      username: '',
      sender_name: 'OSGateway',
      connect_timeout_seconds: 10,
      send_timeout_seconds: 30,
    });
  });
});
