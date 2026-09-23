import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/../messages/en.json';
import { ScreenshotCapture } from './screenshot-capture';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', async (load) => ({
  ...await load<typeof import('@/lib/api/client')>(),
  useApiRequest: () => ({ apiRequest: request, effectiveTenantId: 23 }),
}));
import { ApiError } from '@/lib/api/client';

const capture = { task_id: 'task', attempt_id: 'attempt', fetch_id: 'fetch', url: 'https://page.example/', final_url: 'https://page.example/landing', captured_at: '2026-09-10T08:00:00Z', screenshot_ref: { key: 'blob/shots/task/engine/fetch.png', storage_node: 'node-a' } };
function show(value = capture) {
  return render(<NextIntlClientProvider locale="en" timeZone="UTC" messages={en}><ScreenshotCapture capture={value} /></NextIntlClientProvider>);
}

describe('ScreenshotCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:verified-capture');
    URL.revokeObjectURL = vi.fn();
  });
  it('loads through the authenticated API, displays the image and releases it on close', async () => {
    request.mockResolvedValue(new Blob(['PNG'], { type: 'image/png' }));
    const view = show();
    expect(screen.getByText('Loading screenshot…')).toBeInTheDocument();
    const image = await screen.findByRole('img');
    expect(image).toHaveAttribute('src', 'blob:verified-capture');
    expect(request).toHaveBeenCalledWith('/phishing-agent/screenshot?key=blob%2Fshots%2Ftask%2Fengine%2Ffetch.png', expect.objectContaining({ responseType: 'blob' }));
    fireEvent.load(image);
    await waitFor(() => expect(screen.queryByText('Loading screenshot…')).not.toBeInTheDocument());
    expect(screen.getByText(/page.example\/landing/)).toBeInTheDocument();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:verified-capture');
  });
  it.each([[404, 'Screenshot unavailable'], [502, 'Storage temporarily unavailable'], [0, 'Storage temporarily unavailable']])('distinguishes response %s', async (status, message) => {
    request.mockRejectedValue(new ApiError(status as number, 'failed'));
    show();
    expect(await screen.findByText(message as string)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
