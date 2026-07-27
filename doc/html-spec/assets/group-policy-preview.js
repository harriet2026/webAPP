/*
 * group-policy-preview.js — drives the component previews of the 群组策略 html_spec module
 * (webapp/doc/html-spec/filter-rules-group-policy/*).
 *
 * The markup inside `.component-preview` is verbatim DOM extracted from the running demo
 * (http://localhost:3111/filter-rules/group-policy, 产品形态 = AI 版·单租户). Radix's runtime
 * is absent here, so this file reimplements exactly the state transitions observed by clicking
 * through the demo, and nothing more. Every behaviour below was verified against the demo and is
 * recorded in the DOM-comparison tables of the corresponding layer.
 *
 * Reproduced behaviours
 *   [tabs]        群组管理 5 类 Tab 切换（IP/发信人/收信人/内容/特征，特征多「条件预览」列）；
 *                 附件自定义参数 4 Tab（大小限制/反病毒/OCR/加密）切换。
 *   [switch]      群组策略表格「状态」开关（行 opacity 联动）；子检查「覆盖全局↔继承全局」开关 →
 *                 展开/收起该子检查的配置体（处置动作/观察模式/阈值/模式）。
 *   [select]      处置动作下拉（基础格式 4 档 / 认证协议 5 档 / DMARC 4 档 / 仿冒 4 档）、
 *                 显示名匹配模式（严格/称谓/正则）、群组类型、适用对象、目标群组：合成菜单 + 选中回写值。
 *   [radio]       策略状态四档（继承/强制启用/禁用/自定义）——原生 radio，浏览器原生联动。
 *   [collapsible] 群组策略行「查看完整配置 ▸/▾」展开/收起 RuleConfigDetail。
 *
 * html_spec 不连后端；一切为前端状态复刻，与 demo 点击结果一致。
 */
(function () {
  'use strict';

  // ── 处置动作 / 模式选项集（取自 group-policy-page.tsx 单一可信源）──
  var DOT = { red: 'bg-red-500', black: 'bg-black', yellow: 'bg-yellow-500', blue: 'bg-blue-500', gray: 'bg-gray-300' };
  var SETS = {
    format: [
      { v: 'pass', label: '放行（进行下一步检查）', dot: DOT.gray },
      { v: 'quarantine', label: '隔离审查', dot: DOT.yellow },
      { v: 'reject', label: '拒绝并退信', dot: DOT.red },
      { v: 'drop', label: '静默丢弃', dot: DOT.black },
    ],
    auth: [
      { v: 'block', label: '阻断（返回5xx）', dot: DOT.red },
      { v: 'drop', label: '丢弃（静默删除）', dot: DOT.black },
      { v: 'quarantine', label: '隔离（进垃圾箱）', dot: DOT.yellow },
      { v: 'tag', label: '标记（加头投递）', dot: DOT.blue },
      { v: 'next', label: '进行下一步检测', dot: DOT.gray },
    ],
    authNoNext: [
      { v: 'block', label: '阻断（返回5xx）', dot: DOT.red },
      { v: 'drop', label: '丢弃（静默删除）', dot: DOT.black },
      { v: 'quarantine', label: '隔离（进垃圾箱）', dot: DOT.yellow },
      { v: 'tag', label: '标记（加头投递）', dot: DOT.blue },
    ],
    mode: [
      { v: 'strict', label: '严格匹配' },
      { v: 'title', label: '称谓识别' },
      { v: 'regex', label: '正则匹配' },
    ],
    grouptype: [
      { v: 'ip', label: 'IP组' }, { v: 'sender', label: '发信人组' },
      { v: 'recipient', label: '收信人组' }, { v: 'content', label: '内容组' },
      { v: 'feature', label: '特征组' },
    ],
    sender: [{ v: '研发部门', label: '研发部门' }, { v: '合作伙伴域名', label: '合作伙伴域名' }],
    ip: [{ v: '可信IP', label: '可信IP' }],
    recipient: [{ v: '高管邮箱', label: '高管邮箱' }],
    content: [{ v: '敏感关键词', label: '敏感关键词' }],
    pathgroup: [
      { v: '高管邮箱', label: '高管邮箱' }, { v: '可信IP', label: '可信IP' },
      { v: '研发部门', label: '研发部门' }, { v: 'IP群组1', label: 'IP群组1' },
    ],
  };

  function labelToSet(text) {
    text = (text || '').trim();
    for (var k in SETS) {
      for (var i = 0; i < SETS[k].length; i++) {
        if (SETS[k][i].label === text) return SETS[k];
      }
    }
    return null;
  }

  function closeMenus() {
    var m = document.querySelectorAll('.gp-select-menu');
    for (var i = 0; i < m.length; i++) m[i].remove();
  }
  document.addEventListener('click', closeMenus);

  var CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50"><path d="m6 9 6 6 6-6"></path></svg>';

  // ── Radix Select 合成 ──
  function wireSelect(trig) {
    trig.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = document.querySelector('.gp-select-menu');
      closeMenus();
      if (open && open.dataset.owner === (trig.__id || '')) return;
      var valSpan = trig.querySelector('[data-slot="select-value"]');
      var cur = valSpan ? valSpan.textContent : '';
      var set = trig.__set || labelToSet(cur);
      // placeholder-only selects: infer from data-gp-set injected by builder
      if (!set && trig.dataset.gpSet) set = SETS[trig.dataset.gpSet];
      if (!set) return;
      trig.__id = trig.__id || 'sel' + Math.floor(performance.now());
      var r = trig.getBoundingClientRect();
      var menu = document.createElement('div');
      menu.className = 'gp-select-menu';
      menu.dataset.owner = trig.__id;
      menu.style.cssText = 'position:fixed;z-index:60;min-width:' + Math.max(r.width, 150) + 'px;left:' + r.left + 'px;top:' + (r.bottom + 4) + 'px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;max-height:280px;overflow:auto;';
      set.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'gp-opt';
        b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 10px;font-size:12px;border-radius:6px;background:none;border:none;cursor:pointer;';
        b.onmouseover = function () { b.style.background = '#f1f5f9'; };
        b.onmouseout = function () { b.style.background = 'none'; };
        b.innerHTML = (o.dot ? '<span class="w-2 h-2 rounded-full ' + o.dot + '" style="width:8px;height:8px;border-radius:9999px;display:inline-block;"></span>' : '') + '<span>' + o.label + '</span>';
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (valSpan) valSpan.textContent = o.label;
          trig.__set = set;
          closeMenus();
        });
        menu.appendChild(b);
      });
      document.body.appendChild(menu);
    });
  }

  // ── Switch ──
  function setSwitch(sw, on) {
    sw.setAttribute('data-state', on ? 'checked' : 'unchecked');
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    var thumb = sw.querySelector('[data-slot="switch-thumb"]');
    if (thumb) thumb.setAttribute('data-state', on ? 'checked' : 'unchecked');
  }
  function wireSwitch(sw) {
    sw.addEventListener('click', function (e) {
      e.stopPropagation();
      var on = sw.getAttribute('data-state') !== 'checked';
      setSwitch(sw, on);
      // 覆盖全局开关：切换所在子检查卡片的配置体
      var card = sw.closest('.border.rounded-lg.overflow-hidden');
      if (card) {
        var label = sw.parentElement && sw.parentElement.querySelector('span');
        if (label && /覆盖全局|继承全局/.test(label.textContent)) label.textContent = on ? '覆盖全局' : '继承全局';
        // 配置体 = header 之后的兄弟节点
        var header = sw.closest('.flex.items-center.justify-between');
        var body = header && header.nextElementSibling;
        if (body && body.classList.contains('bg-white')) {
          body.hidden = !on;
        } else if (on && header) {
          // 未捕获配置体：注入占位，标注 demo 会展开处置动作/观察模式
          if (!header.nextElementSibling || !header.nextElementSibling.classList.contains('gp-synth-body')) {
            var ph = document.createElement('div');
            ph.className = 'gp-synth-body p-3 bg-white';
            ph.style.cssText = 'padding:12px;background:#fff;font-size:12px;color:#6b7280;';
            ph.textContent = '（覆盖全局后展开：命中后处置动作下拉 + 观察模式开关，行为见元素表；此子检查在捕获时为继承态，故 demo 未渲染配置体）';
            header.parentNode.insertBefore(ph, header.nextSibling);
          }
        }
      }
      // 群组策略表格状态开关：行 opacity 联动
      var row = sw.closest('[data-slot="table-row"]');
      if (row && row.querySelector('[data-slot="table-cell"]')) {
        // 找到含策略配置徽标的主行（非 detail 行）
        row.style.opacity = on ? '1' : '0.5';
      }
    });
  }

  // ── Radix Tabs ──
  function wireTabs(root) {
    var triggers = root.querySelectorAll(':scope > [data-slot="tabs-list"] [data-slot="tabs-trigger"], :scope [data-slot="tabs-list"] [data-slot="tabs-trigger"]');
    Array.prototype.forEach.call(triggers, function (t) {
      t.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = t.getAttribute('data-gp-value') || t.textContent.trim();
        Array.prototype.forEach.call(triggers, function (x) {
          var xv = x.getAttribute('data-gp-value') || x.textContent.trim();
          var active = xv === val;
          x.setAttribute('data-state', active ? 'active' : 'inactive');
          x.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        var multi = root.getAttribute('data-gp-multi') === '1';
        var contents = root.querySelectorAll('[data-slot="tabs-content"]');
        Array.prototype.forEach.call(contents, function (c) {
          var cv = c.getAttribute('data-gp-value') || '';
          if (multi) {
            var show = cv === val;
            c.hidden = !show;
            c.setAttribute('data-state', show ? 'active' : 'inactive');
          }
        });
      });
    });
  }

  // ── Collapsible（策略配置详情行）──
  function wireCollapseButtons() {
    var btns = document.querySelectorAll('[data-gp-collapse]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var tgt = document.querySelector(b.getAttribute('data-gp-collapse'));
        if (!tgt) return;
        var open = tgt.hidden === false && tgt.style.display !== 'none';
        tgt.hidden = open;
        b.innerHTML = open
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right h-4 w-4"><path d="m9 18 6-6-6-6"></path></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down h-4 w-4"><path d="m6 9 6 6 6-6"></path></svg>';
      });
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.component-preview [data-slot="select-trigger"]'), wireSelect);
    Array.prototype.forEach.call(document.querySelectorAll('.component-preview [data-slot="switch"]'), wireSwitch);
    Array.prototype.forEach.call(document.querySelectorAll('.component-preview [data-slot="tabs"]'), wireTabs);
    wireCollapseButtons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
