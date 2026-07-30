import { readdirSync } from 'fs';
import { resolve } from 'path';
import { NextResponse } from 'next/server';

/**
 * GET /api/dev/version-specs
 *
 * Returns the list of incremental change-spec HTML files under
 * doc/html_spec-version/. Used by ProductFormSwitcher to build a
 * dynamic index of all change tickets instead of a hard-coded list.
 *
 * Only intended for development/preview environments — the switcher
 * itself is gated by OSGATEWAY_PRODUCT_FORM_SWITCHER=true.
 */
export async function GET() {
  const dir = resolve(process.cwd(), 'doc', 'html_spec-version');

  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    // Directory missing in production builds — return empty list gracefully.
    return NextResponse.json({ specs: [] });
  }

  const specs = files
    .filter((f) => f.endsWith('.html'))
    .map((f) => {
      const ticket = f.replace(/\.html$/, '');
      return {
        ticket,
        label: ticket,
        url: `/html-spec/version/${f}`,
      };
    })
    .sort((a, b) => a.ticket.localeCompare(b.ticket));

  return NextResponse.json({ specs });
}
