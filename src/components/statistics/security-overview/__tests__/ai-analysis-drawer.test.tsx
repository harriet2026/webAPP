import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiAnalysisDrawer } from '../AiAnalysisDrawer';

// GT-11984: 后端原本发 `event: message`，而 drawer 解析的是 `event: token`。
// 这组测试把「协议对得上」钉死 —— 只断言「抽屉打开了」是不够的，那在协议
// 不匹配时也会通过（屏幕空白但组件已挂载）。
vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) =>
    ({
      'ai.drawerTitle': 'AI 分析结果',
      'ai.loading': '正在分析...',
      'ai.aiFailed': 'AI 分析失败，请稍后重试',
      'ai.empty': 'AI 未返回任何分析内容，请稍后重试',
      'ai.retry': '重试',
      'ai.truncated': '分析被中断，以下为已生成的部分内容，并非完整分析',
    })[k] ?? k,
}));

function sseStream(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const props = {
  open: true,
  onOpenChange: vi.fn(),
  filters: { direction: 'all' as const, start_date: '2026-07-01', end_date: '2026-07-11' },
  snapshot: { kpi: { blocked: 12 } },
};

describe('security-overview AiAnalysisDrawer (GT-11984)', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('renders markdown streamed as `token` events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sseStream([
        'event: start\ndata: null\n\n',
        'event: token\ndata: "## 建议"\n\n',
        'event: token\ndata: "\\n\\n阻断率偏低"\n\n',
        'event: done\ndata: null\n\n',
      ]),
    ) as unknown as typeof fetch;

    render(<AiAnalysisDrawer {...props} />);

    await waitFor(() => expect(screen.getByText('建议')).toBeInTheDocument());
    expect(screen.getByText('阻断率偏低')).toBeInTheDocument();
  });

  it('shows the failure message on an `error` event', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        sseStream(['event: start\ndata: null\n\n', 'event: error\ndata: "boom"\n\n']),
      ) as unknown as typeof fetch;

    render(<AiAnalysisDrawer {...props} />);
    await waitFor(() =>
      expect(screen.getByText('AI 分析失败，请稍后重试')).toBeInTheDocument(),
    );
  });

  it('shows the failure message on a non-2xx response (e.g. 503 llm_unavailable)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":{"code":"llm_unavailable"}}', { status: 503 }),
      ) as unknown as typeof fetch;

    render(<AiAnalysisDrawer {...props} />);
    await waitFor(() =>
      expect(screen.getByText('AI 分析失败，请稍后重试')).toBeInTheDocument(),
    );
  });

  // Review finding: a stream that completes with zero tokens used to leave a
  // blank sheet — no error, no spinner, nothing. Indistinguishable from a broken
  // page, which is the very impression GT-11984 exists to remove.
  it('shows an empty-state message when the stream yields zero tokens', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        sseStream(['event: start\ndata: null\n\n', 'event: done\ndata: null\n\n']),
      ) as unknown as typeof fetch;

    render(<AiAnalysisDrawer {...props} />);
    await waitFor(() =>
      expect(screen.getByText('AI 未返回任何分析内容，请稍后重试')).toBeInTheDocument(),
    );
  });

  // Review finding: the effect only aborted in its `!open` branch, so unmounting
  // mid-stream leaked the fetch AND the server-side loginterpret concurrency
  // permit it holds (max_concurrent defaults to 10 → later AI calls 429).
  it('aborts the in-flight stream on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedSignal = (init as RequestInit).signal ?? undefined;
      return new Promise(() => {}); // never settles: the stream is "in flight"
    }) as unknown as typeof fetch;

    const { unmount } = render(<AiAnalysisDrawer {...props} />);
    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal!.aborted).toBe(false);

    unmount();
    expect(capturedSignal!.aborted).toBe(true);
  });

  // Review finding: on `error` the drawer used to throw away everything it had
  // already streamed and show a generic failure — the admin lost the analysis
  // that HAD been computed, and could not tell "the LLM never came up" from
  // "it was cut off at the deadline".
  it('keeps the partial text and flags it as truncated when the stream is cut off', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sseStream([
        'event: start\ndata: null\n\n',
        'event: token\ndata: "## 建议\\n\\n1. 收紧境外来信策略"\n\n',
        'event: error\ndata: "analysis stream truncated: context deadline exceeded"\n\n',
      ]),
    ) as unknown as typeof fetch;

    render(<AiAnalysisDrawer {...props} />);

    // the partial analysis survives... (ReactMarkdown renders "1. x" as an <li>,
    // so the rendered text is the item body without the "1. " marker)
    await waitFor(() => expect(screen.getByText('建议')).toBeInTheDocument());
    expect(screen.getByText('收紧境外来信策略')).toBeInTheDocument();
    // ...but must be explicitly marked incomplete, never presented as a finished answer
    expect(
      screen.getByText('分析被中断，以下为已生成的部分内容，并非完整分析'),
    ).toBeInTheDocument();
    // and it is NOT the "nothing came back at all" copy
    expect(screen.queryByText('AI 分析失败，请稍后重试')).not.toBeInTheDocument();
  });

  it('offers a retry that re-runs the stream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 })) // first attempt fails
      .mockResolvedValueOnce(
        sseStream([
          'event: start\ndata: null\n\n',
          'event: token\ndata: "## 恢复了"\n\n',
          'event: done\ndata: null\n\n',
        ]),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<AiAnalysisDrawer {...props} />);
    await waitFor(() =>
      expect(screen.getByText('AI 分析失败，请稍后重试')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(screen.getByText('恢复了')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch while closed', () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    render(<AiAnalysisDrawer {...props} open={false} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
