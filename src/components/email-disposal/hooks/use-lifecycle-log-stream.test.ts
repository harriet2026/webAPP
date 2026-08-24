import { describe, expect, it } from 'vitest';
import type { MailLifecycleLog } from '@/types/email-disposal-detail';
import {
  applyLifecycleStreamEvent,
  initialLifecycleLogStreamState,
} from './use-lifecycle-log-stream';

function log(event_uid: string, node: string, component: string): MailLifecycleLog {
  return {
    event_uid,
    message_uuid: '2540e741-0b50-4cf7-bbab-dc241df4e082',
    node,
    component,
    event_time: '2026-08-19T08:00:00Z',
    raw_line: event_uid,
  };
}

describe('lifecycle log stream reducer', () => {
  it('keeps completed sibling logs when another module times out', () => {
    let state = initialLifecycleLogStreamState(true);
    state = applyLifecycleStreamEvent(state, {
      event: 'start', data: { nodes: ['node-a'] },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'node_modules', data: { node: 'node-a', modules: ['antispam', 'postfix'] },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'module_done',
      data: {
        node: 'node-a', module: 'antispam', status: 'completed',
        items: [log('antispam-1', 'node-a', 'antispam')], total: 1,
        truncated: false, elapsed_ms: 100,
      },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'module_timeout',
      data: {
        node: 'node-a', module: 'postfix', status: 'timed_out',
        items: [log('postfix-partial', 'node-a', 'postfix')], total: 1,
        truncated: false, elapsed_ms: 8000, error_code: 'timeout',
      },
    });

    expect(state.logs.map((item) => item.event_uid)).toEqual(['antispam-1', 'postfix-partial']);
    expect(state.nodes['node-a'].modules.antispam.status).toBe('completed');
    expect(state.nodes['node-a'].modules.postfix.status).toBe('timed_out');
    expect(state.partial).toBe(true);
  });

  it('module retry clears only that module and preserves completed siblings', () => {
    let state = initialLifecycleLogStreamState();
    state = {
      ...state,
      loaded: true,
      logs: [log('antispam-1', 'node-a', 'antispam'), log('postfix-old', 'node-a', 'postfix')],
      nodes: {
        'node-a': {
          node: 'node-a', status: 'partial', modules: {
            antispam: { module: 'antispam', status: 'completed', count: 1 },
            postfix: { module: 'postfix', status: 'timed_out', count: 1 },
          },
        },
      },
    };

    state = applyLifecycleStreamEvent(state, {
      event: 'node_modules', data: { node: 'node-a', modules: ['postfix'] },
    });

    expect(state.logs.map((item) => item.event_uid)).toEqual(['antispam-1']);
    expect(state.nodes['node-a'].modules.antispam.status).toBe('completed');
    expect(state.nodes['node-a'].modules.postfix.status).toBe('querying');
  });

  it('node timeout marks only unfinished modules', () => {
    let state = initialLifecycleLogStreamState();
    state = applyLifecycleStreamEvent(state, {
      event: 'node_modules', data: { node: 'node-a', modules: ['antispam', 'postfix'] },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'module_done',
      data: {
        node: 'node-a', module: 'antispam', status: 'completed', items: [],
        total: 0, truncated: false, elapsed_ms: 10,
      },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'node_timeout',
      data: { node: 'node-a', status: 'timed_out', elapsed_ms: 12_000, error_code: 'node_timeout' },
    });

    expect(state.nodes['node-a'].modules.antispam.status).toBe('completed');
    expect(state.nodes['node-a'].modules.postfix.status).toBe('timed_out');
  });

  it('clears partial state after the failed module retry succeeds', () => {
    let state = initialLifecycleLogStreamState();
    state = {
      ...state,
      loaded: true,
      partial: true,
      nodes: {
        'node-a': {
          node: 'node-a', status: 'partial', modules: {
            antispam: { module: 'antispam', status: 'completed', count: 1 },
            postfix: { module: 'postfix', status: 'timed_out', count: 0 },
          },
        },
      },
    };
    state = applyLifecycleStreamEvent(state, {
      event: 'node_modules', data: { node: 'node-a', modules: ['postfix'] },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'module_done',
      data: {
        node: 'node-a', module: 'postfix', status: 'completed', items: [],
        total: 0, truncated: false, elapsed_ms: 20,
      },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'node_done', data: { node: 'node-a', status: 'completed', elapsed_ms: 25 },
    });
    state = applyLifecycleStreamEvent(state, {
      event: 'done', data: { partial: false, truncated: false },
    });

    expect(state.nodes['node-a'].status).toBe('completed');
    expect(state.nodes['node-a'].modules.antispam.status).toBe('completed');
    expect(state.nodes['node-a'].modules.postfix.status).toBe('completed');
    expect(state.partial).toBe(false);
  });
});
