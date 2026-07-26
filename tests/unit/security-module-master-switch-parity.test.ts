import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Review P3 parity guard: most security modules use ModuleMasterSwitch.
// `attachment_security` intentionally keeps a dedicated deferred-save switch
// surface, while `advanced_rules` and the standalone URL/intent/recipient
// pages keep their own wrappers.
// Playwright only samples four pages, so a future page could accidentally lose
// `<ModuleMasterSwitch>` and the suite would still pass.
//
// This static test scans every page component under src/components/security/
// for a `ModuleMasterSwitch page="<page>"` mount and asserts:
//   1. every generic page (the 12 below) mounts the switch, and
//   2. advanced_rules does NOT mount the generic switch.
//
// If you add a 14th module to the backend registry AND want it on the generic
// switch surface, add its page constant to GENERIC_PAGES here so the parity
// guard stays aligned with the backend registry.

const SECURITY_SRC = path.resolve(__dirname, '../../src/components/security');

const GENERIC_PAGES = [
  'ip_filter',
  'ip_frequency',
  'rbl_filter',
  'sender_filter',
  'user_list',
  'auth_spoofing',
  'content_rules',
  'behavior_control',
  'mail_marking',
  'overseas_mail',
  'similar_detection',
] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function findMountedPages(): Map<string, string[]> {
  const mounted = new Map<string, string[]>();
  for (const file of walk(SECURITY_SRC)) {
    if (path.basename(file) === 'ModuleMasterSwitch.tsx') continue;
    const src = readFileSync(file, 'utf8');
    const re = /<ModuleMasterSwitch\s+[^>]*page=["']([a-z_]+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const page = m[1];
      const list = mounted.get(page) ?? [];
      list.push(file);
      mounted.set(page, list);
    }
  }
  return mounted;
}

describe('security module master switch frontend parity', () => {
  it('every generic page mounts ModuleMasterSwitch', () => {
    const mounted = findMountedPages();
    for (const page of GENERIC_PAGES) {
      const sites = mounted.get(page);
      if (!sites || sites.length === 0) {
        expect.fail(
          `page "${page}" is registered for the generic master switch but no component under src/components/security/ mounts <ModuleMasterSwitch page="${page}">`,
        );
      }
    }
  });

  it('advanced_rules does NOT mount the generic ModuleMasterSwitch', () => {
    const mounted = findMountedPages();
    const sites = mounted.get('advanced_rules');
    if (sites && sites.length > 0) {
      expect.fail(
        `advanced_rules must keep its dedicated switch surface; found <ModuleMasterSwitch page="advanced_rules"> in:\n${sites.join('\n')}`,
      );
    }
  });

  it('attachment_security keeps its dedicated deferred master switch', () => {
    const src = readFileSync(path.join(SECURITY_SRC, 'AttachmentSecurityPage.tsx'), 'utf8');
    expect(src).toContain("setSecurityModuleEnabled('attachment_security'");
    expect(src).toContain('rootTestId="module-master-switch-attachment_security"');
  });

  it('no component mounts a ModuleMasterSwitch for an unknown page', () => {
    const mounted = findMountedPages();
    const known = new Set<string>([...GENERIC_PAGES, 'advanced_rules', 'attachment_security']);
    for (const [page, sites] of mounted) {
      if (!known.has(page)) {
        expect.fail(
          `unknown page "${page}" mounted in:\n${sites.join('\n')}\nIf this is a new module, add it to GENERIC_PAGES in this test.`,
        );
      }
    }
  });
});
