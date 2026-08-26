'use client';

import { useEffect } from 'react';
import { SandboxRulesTab } from '@/components/security/attachment-security/SandboxRulesTab';

// TEMP QA-ONLY PREVIEW PAGE — created solely to take a visual verification
// screenshot of the SandboxRulesTab table layout against a design reference.
// Delete this file/folder before finishing the task; it is not part of any
// shipped feature or route.
export default function QaSandboxPreviewPage() {
  useEffect(() => {
    localStorage.setItem('osgateway_mock_enabled', '1');
  }, []);

  return (
    <div className="max-w-4xl p-6">
      <SandboxRulesTab />
    </div>
  );
}
