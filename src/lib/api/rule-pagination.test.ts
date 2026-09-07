import { describe, expect, it, vi } from 'vitest';
import { listBehaviorControlGroups, listBehaviorControlRules } from './behavior-control';
import type { ApiRequestFn } from './client';
import { listAllIPFilterRules } from './ip-filter';
import { listAllIPFrequencyRules } from './ip-frequency';
import { listMailMarkingRules } from './mail-marking';
import { fetchAllPages } from './pagination';
import { listAllRBLFilterRules } from './rbl-filter';
import { listSenderFilterRules } from './sender-filter';

type TrackedRequest = ApiRequestFn & { paths: string[] };

function cappedPaginationRequest(items: unknown[], serverCap = 100): TrackedRequest {
  const paths: string[] = [];
  const requestFn = vi.fn(async <T>(path: string) => {
    paths.push(path);
    const url = new URL(path, 'http://test.local');
    const page = Number(url.searchParams.get('page') || '1');
    const requestedPageSize = Number(url.searchParams.get('page_size') || '20');
    if (requestedPageSize !== 100) {
      throw new Error(`expected contract page_size=100, got ${requestedPageSize}`);
    }
    const pageSize = Math.min(requestedPageSize, serverCap);
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      page_size: pageSize,
    } as T;
  }) as unknown as TrackedRequest;
  requestFn.paths = paths;
  return requestFn;
}

describe('GT-13342 规则列表不能把超大 page_size 当成全量', () => {
  it('发信人黑白名单读取服务端声明的全部 201 条规则', async () => {
    const rules = Array.from({ length: 201 }, (_, index) => ({ id: index + 1 }));
    const requestFn = cappedPaginationRequest(rules);

    const result = await listSenderFilterRules(requestFn);

    expect(result.items).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(3);
  });

  it('发信行为管控读取服务端声明的全部 201 条规则', async () => {
    const rules = Array.from({ length: 201 }, (_, index) => ({ id: index + 1 }));
    const requestFn = cappedPaginationRequest(rules);

    const result = await listBehaviorControlRules(requestFn);

    expect(result.items).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(3);
  });

  it('邮件标记先取回全部分页，再按方向过滤', async () => {
    const rules = Array.from({ length: 201 }, (_, index) => ({
      id: index + 1,
      name: `mail-marking-${index + 1}`,
      priority: 201 - index,
      is_active: true,
      metadata: { feature: 'mail_marking', direction: 'receive' },
      condition_tree: {
        type: 'condition',
        field: 'is_outbound',
        operator: 'eq',
        value: 'false',
      },
    }));
    const requestFn = cappedPaginationRequest(rules);

    const result = await listMailMarkingRules('receive', requestFn);

    expect(result).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(3);
  });

  it('IP 频率本地搜索读取全部规则，并保留服务端筛选参数', async () => {
    const requestFn = cappedPaginationRequest(Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })));

    const result = await listAllIPFrequencyRules({ scope_type: 'global', is_active: false }, requestFn);

    expect(result.items).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(3);
    expect(requestFn.paths[0]).toContain('scope_type=global');
    expect(requestFn.paths[0]).toContain('is_active=false');
  });

  it('IP 黑白名单导入查重读取全部既有规则', async () => {
    const requestFn = cappedPaginationRequest(Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })));

    const result = await listAllIPFilterRules({ list_type: 'blacklist' }, requestFn);

    expect(result.items).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(3);
    expect(requestFn.paths[0]).toContain('list_type=blacklist');
  });

  it('行为管控群组使用 rule_page 命名空间，并把 page 留给数值分页', async () => {
    const requestFn = cappedPaginationRequest(Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })));

    const result = await listBehaviorControlGroups(requestFn);

    expect(result).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(3);
    expect(requestFn.paths[0]).toContain('rule_page=groups');
    const firstQuery = new URL(requestFn.paths[0], 'http://test.local').searchParams;
    expect(firstQuery.get('page')).toBe('1');
    expect(firstQuery.get('rule_page')).toBe('groups');
  });

  it('RBL 唯一配置规则查找不会遗漏第 101 条之后的数据', async () => {
    const requestFn = cappedPaginationRequest(Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })));

    const result = await listAllRBLFilterRules({ match_mode: 'any' }, requestFn);

    expect(result.items).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(3);
    expect(requestFn.paths[0]).toContain('match_mode=any');
  });

  it('无 total 的兼容响应只请求一页', async () => {
    const requestFn = vi.fn(async <T>() => ({ items: [{ id: 1 }] }) as T) as ApiRequestFn;

    const result = await fetchAllPages<{ id: number }>('/unified-rules?rule_page=sender_filter', requestFn);

    expect(result).toEqual([{ id: 1 }]);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('按服务端回传的实际 page_size 继续读取，不假设所有端点都恰好返回 100 条', async () => {
    const requestFn = cappedPaginationRequest(Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })), 50);

    const result = await fetchAllPages<{ id: number }>('/unified-rules?rule_page=sender_filter', requestFn);

    expect(result).toHaveLength(201);
    expect(requestFn).toHaveBeenCalledTimes(5);
  });

  it('拒绝把旧的非数值 page 命名空间与分页混用', async () => {
    const requestFn = vi.fn() as ApiRequestFn;

    await expect(fetchAllPages('/unified-rules?page=groups', requestFn)).rejects.toThrow(
      'non-numeric page namespaces must use rule_page before pagination',
    );
    expect(requestFn).not.toHaveBeenCalled();
  });
});
