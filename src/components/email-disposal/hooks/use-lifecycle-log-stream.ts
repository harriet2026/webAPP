'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MailLifecycleLog,
  MailLifecycleModuleStatus,
  MailLifecycleModuleResult,
  MailLifecycleNodeProgress,
  MailLifecycleNodeStatus,
} from '@/types/email-disposal-detail';
import {
  streamMailLifecycleLogs,
  type MailLifecycleStreamEvent,
} from '../lib/disposal-detail-api';

export interface LifecycleLogStreamState {
  logs: MailLifecycleLog[];
  nodes: Record<string, MailLifecycleNodeProgress>;
  loaded: boolean;
  loading: boolean;
  error: boolean;
  partial: boolean;
  truncated: boolean;
}

export function initialLifecycleLogStreamState(loading = false): LifecycleLogStreamState {
  return {
    logs: [],
    nodes: {},
    loaded: false,
    loading,
    error: false,
    partial: false,
    truncated: false,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function ensureNode(
  nodes: Record<string, MailLifecycleNodeProgress>,
  node: string,
): MailLifecycleNodeProgress {
  return nodes[node] ?? { node, status: 'querying', modules: {} };
}

function sortAndDeduplicateLogs(logs: MailLifecycleLog[]): MailLifecycleLog[] {
  const byID = new Map<string, MailLifecycleLog>();
  for (const log of logs) byID.set(log.event_uid, log);
  return [...byID.values()].sort((a, b) => {
    const timeOrder = Date.parse(a.event_time) - Date.parse(b.event_time);
    return timeOrder || a.event_uid.localeCompare(b.event_uid);
  });
}

function progressIsPartial(nodes: Record<string, MailLifecycleNodeProgress>): boolean {
  return Object.values(nodes).some((node) =>
    node.status === 'partial'
    || node.status === 'timed_out'
    || node.status === 'failed'
    || Object.values(node.modules).some(
      (module) => module.status === 'timed_out' || module.status === 'failed',
    ));
}

export function applyLifecycleStreamEvent(
  state: LifecycleLogStreamState,
  event: MailLifecycleStreamEvent,
): LifecycleLogStreamState {
  const data = event.data as Record<string, unknown>;
  if (event.event === 'start') {
    const nodes = { ...state.nodes };
    for (const node of Array.isArray(data.nodes) ? data.nodes : []) {
      if (typeof node !== 'string') continue;
      nodes[node] = { ...ensureNode(nodes, node), status: 'querying', error_code: undefined };
    }
    return { ...state, nodes, loading: true, error: false };
  }

  const node = asString(data.node);
  if (event.event === 'node_started' && node) {
    return {
      ...state,
      loading: true,
      nodes: {
        ...state.nodes,
        [node]: { ...ensureNode(state.nodes, node), status: 'querying', error_code: undefined },
      },
    };
  }

  if (event.event === 'node_modules' && node) {
    const names = (Array.isArray(data.modules) ? data.modules : []).filter(
      (value): value is string => typeof value === 'string',
    );
    const current = ensureNode(state.nodes, node);
    const modules = { ...current.modules };
    for (const name of names) {
      modules[name] = { module: name, status: 'querying', count: 0 };
    }
    const retrySet = new Set(names);
    return {
      ...state,
      logs: state.logs.filter((log) => log.node !== node || !retrySet.has(log.component)),
      nodes: { ...state.nodes, [node]: { ...current, status: 'querying', modules } },
    };
  }

  if (
    (event.event === 'module_done' || event.event === 'module_timeout' || event.event === 'module_failed')
    && node
  ) {
    const result = data as unknown as MailLifecycleModuleResult;
    const moduleName = asString(result.module);
    if (!moduleName) return state;
    const current = ensureNode(state.nodes, node);
    const status: MailLifecycleModuleStatus = event.event === 'module_done'
      ? 'completed'
      : event.event === 'module_timeout'
        ? 'timed_out'
        : 'failed';
    const incoming = Array.isArray(result.items) ? result.items : [];
    const withoutOldModule = state.logs.filter(
      (log) => log.node !== node || log.component !== moduleName,
    );
    const nextNodes: Record<string, MailLifecycleNodeProgress> = {
      ...state.nodes,
      [node]: {
        ...current,
        modules: {
          ...current.modules,
          [moduleName]: {
            module: moduleName,
            status,
            count: incoming.length,
            elapsed_ms: asNumber(result.elapsed_ms),
            error_code: asString(result.error_code) || undefined,
          },
        },
      },
    };
    return {
      ...state,
      logs: sortAndDeduplicateLogs([...withoutOldModule, ...incoming]),
      loaded: true,
      partial: progressIsPartial(nextNodes),
      truncated: state.truncated || result.truncated === true,
      nodes: nextNodes,
    };
  }

  if (
    (event.event === 'node_done' || event.event === 'node_timeout' || event.event === 'node_failed')
    && node
  ) {
    const current = ensureNode(state.nodes, node);
    let status: MailLifecycleNodeStatus = event.event === 'node_timeout'
      ? 'timed_out'
      : event.event === 'node_failed'
        ? 'failed'
        : data.status === 'partial'
          ? 'partial'
          : 'completed';
    const modules = { ...current.modules };
    if (status === 'timed_out' || status === 'failed') {
      for (const [name, module] of Object.entries(modules)) {
        if (module.status !== 'querying') continue;
        modules[name] = {
          ...module,
          status: status === 'timed_out' ? 'timed_out' : 'failed',
          error_code: asString(data.error_code) || undefined,
        };
      }
    }
    if (event.event === 'node_done') {
      status = Object.values(modules).some(
        (module) => module.status === 'timed_out' || module.status === 'failed',
      ) ? 'partial' : 'completed';
    }
    const nextNodes: Record<string, MailLifecycleNodeProgress> = {
      ...state.nodes,
      [node]: {
        ...current,
        status,
        elapsed_ms: asNumber(data.elapsed_ms),
        error_code: asString(data.error_code) || undefined,
        modules,
      },
    };
    return {
      ...state,
      loaded: true,
      partial: progressIsPartial(nextNodes),
      nodes: nextNodes,
    };
  }

  if (event.event === 'done') {
    return {
      ...state,
      loaded: true,
      loading: false,
      partial: data.partial === true || progressIsPartial(state.nodes),
      truncated: state.truncated || data.truncated === true,
    };
  }

  if (event.event === 'error') {
    return {
      ...state,
      loaded: state.loaded || state.logs.length > 0,
      loading: false,
      error: state.logs.length === 0,
      partial: state.partial || state.logs.length > 0,
    };
  }
  return state;
}

export function useLifecycleLogStream(mailLogId: number | null, enabled: boolean) {
  const [state, setState] = useState<LifecycleLogStreamState>(() => initialLifecycleLogStreamState());
  const [lastMailLogId, setLastMailLogId] = useState(mailLogId);
  const controllers = useRef(new Set<AbortController>());

  if (lastMailLogId !== mailLogId) {
    setLastMailLogId(mailLogId);
    setState(initialLifecycleLogStreamState());
  }

  const run = useCallback(async (
    options: { node?: string; modules?: string[] } = {},
    reset = false,
  ) => {
    if (mailLogId == null) return;
    const controller = new AbortController();
    controllers.current.add(controller);
    if (reset) setState(initialLifecycleLogStreamState(true));
    try {
      for await (const event of streamMailLifecycleLogs(mailLogId, {
        ...options,
        signal: controller.signal,
      })) {
        setState((current) => applyLifecycleStreamEvent(current, event));
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setState((current) => applyLifecycleStreamEvent(current, {
          event: 'error', data: { error_code: 'stream_failed' },
        }));
      }
    } finally {
      controllers.current.delete(controller);
    }
  }, [mailLogId]);

  useEffect(() => {
    const activeControllers = controllers.current;
    if (!enabled || mailLogId == null) {
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
      return;
    }
    void run({}, true);
    return () => {
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
    };
  }, [enabled, mailLogId, run]);

  const retryModule = useCallback((node: string, module: string) => {
    void run({ node, modules: [module] });
  }, [run]);

  const retryNode = useCallback((node: string) => {
    const progress = state.nodes[node];
    const modules = progress
      ? Object.values(progress.modules)
        .filter((module) => module.status === 'timed_out' || module.status === 'failed')
        .map((module) => module.module)
      : [];
    void run({ node, modules: modules.length ? modules : undefined });
  }, [run, state.nodes]);

  return { ...state, retryModule, retryNode };
}
