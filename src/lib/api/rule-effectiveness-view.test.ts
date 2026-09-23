import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuleEffectiveness, buildEmailDisposalCenterQuery } from './rule-effectiveness-view';
import { setMockEnabled } from '../mock/storage';
import type { ApiRequestFn } from './client';

const row = { id: 'period-2', tenant_id: 3, policy_module: 'auth_spoofing', sub_strategy_id: 'format_check.envelope_header_mismatch', version_no: 2, history_count: 1, observed_since: '2026-09-22', observed_days: 0, hits: 6, close_reason: '', change_summary: 'configuration_changed', snapshot_available: true, action_difference_rate: 2/3, risk_direction: 'configured_block', risk_unavailable_reason: '', configured_action: 'reject', observation_period_id: 'period-2', time_zone: 'Asia/Shanghai' };
const response = {rows: [row], rows_total: 2, kpi:{observing_count:2,total_hits:8}, degraded_modules: []};
afterEach(()=>{localStorage.clear();vi.restoreAllMocks()});

describe('product page backend adapter',()=>{
 it('loads all pages, ordered row history, and the current version change fields',async()=>{
  const request=vi.fn(async(path:string)=>{
   const url=new URL(path,'http://test');
   if(url.pathname.endsWith('/versions/period-2')) return {changed_fields:[{field:'envelope_header_mismatch.action',before:'quarantine',after:'reject'}]};
   if(url.pathname.endsWith('/versions')) return {items:[{version_no:1,hits:2,effective_at:'2026-09-01',superseded_at:'2026-09-22',change_summary:'first_observation'}],total:1};
   return url.searchParams.get('page')==='1' ? response : {...response,rows:[{...row,id:'other',history_count:0,risk_direction:'configured_accept',configured_action:'accept',action_difference_rate:0.25}]};
  });
  const result=await getRuleEffectiveness({modules:['auth_spoofing']},request as ApiRequestFn,key=>'translated '+key);
  expect(result.rows).toHaveLength(2);
  expect(result.rows[0]).toMatchObject({sub_strategy_id:'format_check_envelope_header_mismatch',false_positive_rate:2/3,false_negative_rate:null,version_history:[{version_no:1,hits:2,change_summary:'translated first_observation'}],current_version_changes:[{field:'envelope_header_mismatch.action',before:'quarantine',after:'reject'}]});
  expect(result.rows[1]).toMatchObject({false_positive_rate:null,false_negative_rate:0.25,risk_direction:'configured_accept'});
  expect(result.kpi).toEqual(response.kpi);
  expect(request).toHaveBeenCalledTimes(4);
  const historyURL=new URL(request.mock.calls.find(([url])=>url.includes('/versions'))![0],'http://test');
  expect(historyURL.searchParams.get('tenant_id')).toBe('3');
  expect(request).toHaveBeenCalledWith('/statistics/rule-effectiveness/versions/period-2?tenant_id=3');
  const query=new URLSearchParams(buildEmailDisposalCenterQuery(result.rows[0],'2026-09-20','2026-09-22'));
  expect(query.get('observation_period_id')).toBe('period-2');
  expect(query.get('tenant_id')).toBe('3');
  expect(query.get('sub_strategy')).toBe('format_check.envelope_header_mismatch');
  expect(query.get('observe_window_to')).toBe('2026-09-22');
 });
 it('uses the copied product mock with versions and filters, without network access',async()=>{
  setMockEnabled(true);const request=vi.fn();
  const result=await getRuleEffectiveness({modules:['phishing_detection']},request as ApiRequestFn);
  expect(request).not.toHaveBeenCalled();
  expect(result.rows.length).toBeGreaterThan(0);
  expect(result.rows.every(r=>r.policy_module==='phishing_detection')).toBe(true);
  expect(result.rows.some(r=>r.version_no>1 && r.version_history.length>0)).toBe(true);
 });
});
