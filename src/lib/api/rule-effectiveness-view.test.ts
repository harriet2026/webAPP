import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuleEffectiveness, buildEmailDisposalCenterQuery, presentationStrategy } from './rule-effectiveness-view';
import { setMockEnabled } from '../mock/storage';
import { ApiError, type ApiRequestFn } from './client';

const row = { id: 'period-2', tenant_id: 3, policy_module: 'auth_spoofing', sub_strategy_id: 'format_check.envelope_header_mismatch', version_no: 2, history_count: 1, observed_since: '2026-09-22', observed_days: 0, hits: 6, close_reason: '', change_summary: 'configuration_changed', snapshot_available: true, action_difference_rate: 2/3, risk_direction: 'configured_block', risk_unavailable_reason: '', configured_action: 'reject', observation_period_id: 'period-2', time_zone: 'Asia/Shanghai' };
const response = {rows: [row], rows_total: 2, kpi:{observing_count:2,total_hits:8}, degraded_modules: []};
afterEach(()=>{localStorage.clear();vi.restoreAllMocks()});

describe('product page backend adapter',()=>{
 it('loads all pages, ordered row history, and the current version change fields',async()=>{
 const request=vi.fn(async(path:string)=>{
   const url=new URL(path,'http://test');
   if(url.pathname.endsWith('/versions/period-2')) return {changed_fields:[{field:'envelope_header_mismatch.action',before:'quarantine',after:'reject'}]};
   if(url.pathname.endsWith('/versions/period-1')) return {changed_fields:[]};
   if(url.pathname.endsWith('/versions')) return {items:[{...row,id:'period-1',version_no:1,hits:2,effective_at:'2026-09-01',superseded_at:'2026-09-22',change_summary:'first_observation'}],total:1};
   return url.searchParams.get('page')==='1' ? response : {...response,rows:[{...row,id:'other',history_count:0,risk_direction:'configured_accept',configured_action:'accept',action_difference_rate:0.25}]};
  });
  const result=await getRuleEffectiveness({modules:['auth_spoofing']},request as ApiRequestFn,key=>'translated '+key);
  expect(result.rows).toHaveLength(2);
  expect(result.rows[0]).toMatchObject({sub_strategy_id:'format_check_envelope_header_mismatch',false_positive_rate:2/3,false_negative_rate:null,version_history:[{version_no:1,hits:2,change_summary:'translated first_observation',changed_fields:[]}],current_version_changes:[{field:'envelope_header_mismatch.action',before:'quarantine',after:'reject'}]});
  expect(result.rows[1]).toMatchObject({false_positive_rate:null,false_negative_rate:0.25,risk_direction:'configured_accept'});
  expect(result.kpi).toEqual(response.kpi);
  expect(request).toHaveBeenCalledTimes(5);
  const historyURL=new URL(request.mock.calls.find(([url])=>url.includes('/versions'))![0],'http://test');
  expect(historyURL.searchParams.get('tenant_id')).toBe('3');
  expect(request).toHaveBeenCalledWith('/statistics/rule-effectiveness/versions/period-2?tenant_id=3');
  expect(request).toHaveBeenCalledWith('/statistics/rule-effectiveness/versions/period-1?tenant_id=3');
  const query=new URLSearchParams(buildEmailDisposalCenterQuery(result.rows[0],'2026-09-20','2026-09-22'));
  expect(query.get('observation_period_id')).toBe('period-2');
  expect(query.get('tenant_id')).toBe('3');
  expect(query.get('sub_strategy')).toBe('format_check.envelope_header_mismatch');
  expect(query.get('observe_window_to')).toBe('2026-09-22');
 });
 it('loads every historical diff and preserves a specific reason when details are unavailable',async()=>{
  const historyRows=[
   {...row,id:'period-1',version_no:1,hits:1,effective_at:'2026-09-01',superseded_at:'2026-09-08',change_summary:'first_observation'},
   {...row,id:'period-broken',version_no:2,hits:2,effective_at:'2026-09-08',superseded_at:'2026-09-15',change_summary:'difference_unavailable',snapshot_available:false},
   {...row,id:'period-denied',version_no:3,hits:3,effective_at:'2026-09-15',superseded_at:'2026-09-22',change_summary:'configuration_changed'},
  ];
  const versionedRow={...row,version_no:4,history_count:3};
  const request=vi.fn(async(path:string)=>{
   const url=new URL(path,'http://test');
   if(url.pathname.endsWith('/versions/period-1')) return {changed_fields:[]};
   if(url.pathname.endsWith('/versions/period-denied')) throw new ApiError(403,'forbidden');
   if(url.pathname.endsWith('/versions/period-2')) return {changed_fields:[
    {field:'aggregate.configuration.detection.parameters.window_minutes',before:30,after:27},
    {field:'aggregate.configuration.detection.parameters.min_count',before:10,after:12},
   ]};
   if(url.pathname.endsWith('/versions')) return {items:historyRows,total:3};
   return {...response,rows:[versionedRow],rows_total:1};
  });

  const result=await getRuleEffectiveness({modules:['auth_spoofing']},request as ApiRequestFn,key=>'translated '+key);

  expect(result.rows[0].current_version_changes).toHaveLength(2);
  expect(result.rows[0].version_history).toMatchObject([
   {version_no:1,changed_fields:[]},
   {version_no:2,changed_fields:[],change_details_unavailable_reason:'difference_unavailable'},
   {version_no:3,changed_fields:[],change_details_unavailable_reason:'access_denied'},
  ]);
  expect(request.mock.calls.some(([path])=>path.includes('period-broken'))).toBe(false);
 });
 // GT-14322：统计表与命中详情提示条共用同一个展示映射；相似检测的类型与方向从对象键推导。
 it('derives presentation keys and similar detection type/scope from backend object keys',()=>{
  expect(presentationStrategy('auth_spoofing','format_check.mailfrom_empty')).toEqual({sub_strategy_id:'format_check_mailfrom_empty'});
  expect(presentationStrategy('auth_spoofing','display_name_spoof.outbound')).toEqual({sub_strategy_id:'display_name_spoofing_outbound'});
  expect(presentationStrategy('auth_spoofing','similar_domain.main')).toEqual({sub_strategy_id:'similar_domain'});
  expect(presentationStrategy('auth_spoofing','dkim_fail')).toEqual({sub_strategy_id:'dkim_fail'});
  expect(presentationStrategy('similar_detection','same_subject.send')).toEqual({sub_strategy_id:'same_subject.send',similar_detection_type:'same_subject',similar_detection_scope:'send'});
  expect(presentationStrategy('similar_detection','similar_email.aggregate')).toEqual({sub_strategy_id:'similar_email.aggregate',similar_detection_type:'similar_email',similar_detection_scope:'aggregate'});
  expect(presentationStrategy('similar_detection','same_subject:internal')).toEqual({sub_strategy_id:'same_subject:internal',similar_detection_type:'same_subject',similar_detection_scope:'internal'});
  expect(presentationStrategy('similar_detection','unknown.key')).toEqual({sub_strategy_id:'unknown.key'});
  expect(presentationStrategy('phishing_detection','runtime_policy')).toEqual({sub_strategy_id:'runtime_policy'});
 });
 it('fills similar detection type/scope on report rows while drill-down keeps the object key',async()=>{
  const similar={...row,id:'period-sim',policy_module:'similar_detection',sub_strategy_id:'same_subject.send',history_count:0};
  const request=vi.fn(async(path:string)=>{
   const url=new URL(path,'http://test');
   if(url.pathname.includes('/versions')) return {items:[],total:0,changed_fields:[]};
   return {...response,rows:[similar],rows_total:1};
  });
  const result=await getRuleEffectiveness({modules:['similar_detection']},request as ApiRequestFn);
  expect(result.rows[0]).toMatchObject({sub_strategy_id:'same_subject.send',similar_detection_type:'same_subject',similar_detection_scope:'send'});
  const query=new URLSearchParams(buildEmailDisposalCenterQuery(result.rows[0],'2026-09-20','2026-09-22'));
  expect(query.get('sub_strategy')).toBe('same_subject.send');
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
