/*
 * forwarding-preview.js — 驱动「邮件路由」html_spec 的可交互组件预览。
 *
 * 预览区标记均为从运行中的 demo（http://localhost:3100/admin/forwarding）逐状态提取的
 * 真实 DOM（Radix 输出）。本引擎只复刻在 demo 里逐项点击验证过的状态迁移：
 *
 *   - Tab 栏：点击切换激活态并滚动到对应组件章节
 *   - 各列表：搜索过滤 + 计数刷新 + 空态、重置、行内按钮跳转对应层级子文件
 *   - 收信域行内探测：1s「探测中…」→ 随机 正常/部分异常/异常 + 时间刷新 + toast「探测完成」
 *   - 代理行内探测：即时随机结果 + toast「探测完成：TCP 连通 + SMTP HELO 握手」（demo 无 loading 态）
 *   - 收信域抽屉：域名/端口/TagInput 实时校验（文案与 demo 逐字一致）、测试连通性三态
 *   - 转发规则抽屉：SPF 联动 hint/必填、匹配方式与垃圾过滤 Select、规则模拟器（demo matchRule 同款逻辑）
 *   - 代理抽屉：IPv4/名称/HELO 校验、rDNS 不一致警告实时重算（mock PTR=ptr-isp.example.com）
 *   - 通道抽屉：勾选代理 ↔ 已选排序表实时增删、↑↓ 排序、HELO 一致性警告重算
 *   - 路由规则抽屉：兜底规则警告、回环地址拦截、明文公网警告、通道切换 ↔ 代理预览表、模拟链路 pre 树
 *   - 发信认证抽屉：协议/TLS 三档 ↔ 端口自动填充、证书校验禁用与明文/中间人警告、
 *     域名多选弹层（All 互斥）、场景勾选 + 同域名同场景冲突校验（对 mock 配置实时判定）
 *   - 删除确认 AlertDialog：取消关闭；确认 → toast（文案与 demo 一致）
 *   - 抽屉/弹窗关闭后显示「重新打开」恢复条，便于审查者反复操作
 */
(function () {
  'use strict';

  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function txt(el) { return (el.innerText || el.textContent || '').trim(); }
  function findBtn(root, needle) {
    return $$('button', root).filter(function (b) { return txt(b).indexOf(needle) !== -1; })[0] || null;
  }

  /* ---------- mock 数据（与 demo types.ts 完全一致的子集） ---------- */
  var isIPv4 = function (v) { return /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(v.trim()); };
  var isDomain = function (v) { return /^(?=.{1,255}$)([a-zA-Z0-9](-?[a-zA-Z0-9])*\.)+[a-zA-Z]{2,}$/.test(v.trim()); };
  var isHostOrIp = function (v) { return isIPv4(v) || isDomain(v); };
  var SYSTEM_HELO = 'mail.gateway.local';
  var DOMAINS = ['example.cn', 'mail.example.cn', 'corp.example.com', 'legacy.example.net', 'newdomain.cn'];
  var RELAY_RULES = [
    { name: '内网放行', priority: 10, sourceIp: '192.168.0.0/16', useSpf: false, fromDomain: 'example.cn', rcptDomain: 'example.cn', rcptMatchType: 'equals', spamFilter: false, status: 'enabled' },
    { name: '合作伙伴转发', priority: 50, sourceIp: '203.0.113.5,203.0.113.6', useSpf: true, fromDomain: 'partner.com', rcptDomain: 'example.cn', rcptMatchType: 'contains', spamFilter: true, status: 'enabled' },
    { name: '兜底拒绝', priority: 999, sourceIp: 'ALL', useSpf: false, fromDomain: '', rcptDomain: '', rcptMatchType: 'contains', spamFilter: true, status: 'disabled' }
  ];
  var PROXIES = [
    { id: 'p3001', name: '主出口-电信', ip: '1.1.1.1', port: 6620, egress: '132.148.32.1', helo: 'mail.test.com', tls: 'TLSv1.2', probe: 'normal' },
    { id: 'p3002', name: '备出口-联通', ip: '1.1.1.2', port: 6620, egress: '132.148.32.2', helo: '', tls: 'TLSv1.2', probe: 'normal' },
    { id: 'p3003', name: '高安全出口', ip: '1.1.1.3', port: 6620, egress: '132.148.32.3', helo: 'mail.secure.com', tls: 'TLSv1.3', probe: 'abnormal' }
  ];
  var CHANNELS = [
    { id: 'c4001', name: '测试通道', proxyIds: ['p3001', 'p3002'] },
    { id: 'c4002', name: '高安全通道', proxyIds: ['p3003'] }
  ];
  var AUTH_CONFIGS = [
    { protocol: 'LDAP', domains: ['All'], scenes: ['userSpace'] },
    { protocol: 'SMTP', domains: ['example.cn'], scenes: ['smtpSend'] },
    { protocol: 'IMAP', domains: ['mail.example.cn'], scenes: ['mailSync'] }
  ];
  var PORTS = { SMTP: { s: 25, ssl: 465 }, LDAP: { s: 389, ssl: 636 }, POP3: { s: 110, ssl: 995 }, IMAP: { s: 143, ssl: 993 } };
  var SCENE_KEYS = ['userSpace', 'smtpSend', 'mailSync'];
  var TLS_LEVEL_LABEL = { plain: '明文传输', prefer: '优先 TLS', force: '强制 TLS', forceVerify: '强制 TLS + 证书校验' };
  var heloLabel = function (h) { return h || '系统默认'; };

  /* ---------- toast（复刻 demo MailRoutingPage 的固定底部 toast） ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:8px;border-radius:8px;background:#111827;padding:10px 16px;font-size:14px;color:#fff;box-shadow:0 10px 15px -3px rgba(0,0,0,.2);transition:opacity .2s';
      toastEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"></path><path d="m9 11 3 3L22 4"></path></svg><span></span>';
      document.body.appendChild(toastEl);
    }
    toastEl.querySelector('span').textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 2200);
  }

  /* ---------- data-nav 跳转 ---------- */
  document.addEventListener('click', function (e) {
    var nav = e.target.closest && e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); window.location.href = nav.getAttribute('data-nav'); }
  });

  /* ---------- 抽屉/弹窗关闭 → 恢复条 ---------- */
  function dismissable(preview, panel) {
    var bar = document.createElement('div');
    bar.style.cssText = 'display:none;padding:12px;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:13px';
    bar.innerHTML = '已关闭（demo 行为：overlay 卸载，返回列表）。<button style="margin-left:8px;padding:2px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer">重新打开</button>';
    panel.parentNode.insertBefore(bar, panel.nextSibling);
    bar.querySelector('button').addEventListener('click', function () { panel.style.display = ''; bar.style.display = 'none'; });
    return function close() { panel.style.display = 'none'; bar.style.display = 'block'; };
  }
  function wireXClose(panel, close) {
    var sr = panel.querySelector('.sr-only');
    var x = sr ? sr.closest('button') : null;
    if (x) x.addEventListener('click', close);
  }

  /* ---------- 最小 Select 菜单 ---------- */
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('click', function (e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }, true);
  function specSelect(trigger, options, onPick) {
    trigger.addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (openMenu) { closeMenu(); return; }
      var menu = document.createElement('div');
      menu.style.cssText = 'position:absolute;z-index:999;min-width:150px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);padding:4px;font-size:14px';
      (typeof options === 'function' ? options() : options).forEach(function (o) {
        var it = document.createElement('div');
        it.textContent = o.l;
        it.style.cssText = 'padding:6px 10px;border-radius:6px;cursor:pointer';
        it.onmouseenter = function () { it.style.background = '#f3f4f6'; };
        it.onmouseleave = function () { it.style.background = ''; };
        it.addEventListener('click', function (ev) {
          ev.stopPropagation(); closeMenu();
          var span = trigger.querySelector('span');
          if (span) span.textContent = o.l; else trigger.textContent = o.l;
          onPick(o.v, o.l);
        });
        menu.appendChild(it);
      });
      var r = trigger.getBoundingClientRect();
      menu.style.left = (r.left + window.scrollX) + 'px';
      menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
      document.body.appendChild(menu);
      openMenu = menu;
    });
  }

  /* ---------- Radix Switch / Checkbox ---------- */
  function wireSwitches(root) {
    $$('[role=switch]', root).forEach(function (sw) {
      sw.addEventListener('click', function () {
        var on = sw.getAttribute('data-state') === 'checked';
        sw.setAttribute('data-state', on ? 'unchecked' : 'checked');
        sw.setAttribute('aria-checked', String(!on));
        var thumb = sw.querySelector('span');
        if (thumb) thumb.setAttribute('data-state', on ? 'unchecked' : 'checked');
        var label = sw.closest('label');
        if (label) {
          for (var i = 0; i < label.childNodes.length; i++) {
            var n = label.childNodes[i];
            if (n.nodeType === 3 && /已启用|已禁用/.test(n.textContent)) n.textContent = on ? '已禁用' : '已启用';
          }
        }
      });
    });
  }
  var checkTpl = null;
  function checkIndicatorHTML() {
    if (checkTpl === null) {
      var c = $$('[role=checkbox][data-state=checked]').filter(function (x) { return x.innerHTML.trim(); })[0];
      checkTpl = c ? c.innerHTML : '<span data-state="checked" style="pointer-events:none" class="flex items-center justify-center text-current"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5"><path d="M20 6 9 17l-5-5"></path></svg></span>';
    }
    return checkTpl;
  }
  function setCheckbox(cb, on) {
    cb.setAttribute('data-state', on ? 'checked' : 'unchecked');
    cb.setAttribute('aria-checked', String(on));
    cb.innerHTML = on ? checkIndicatorHTML() : '';
  }
  function isChecked(cb) { return cb.getAttribute('data-state') === 'checked'; }

  /* ---------- 字段错误 / 橙色警告 ---------- */
  function fieldWrap(input) { return input.closest('.space-y-1\\.5') || input.parentNode; }
  function fieldErr(input, msg) {
    var wrap = fieldWrap(input);
    var p = $$('p', wrap).filter(function (x) { return x.className.indexOf('text-red-500') !== -1; })[0];
    if (msg) {
      if (!p) { p = document.createElement('p'); p.className = 'text-xs text-red-500'; wrap.appendChild(p); }
      p.textContent = msg;
    } else if (p) p.remove();
    return !!msg;
  }
  var WARN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert w-3.5 h-3.5 flex-shrink-0 mt-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.75-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';
  function ensureWarn(host, key, msg, before) {
    var w = host.querySelector('[data-spec-warn="' + key + '"]');
    if (msg) {
      if (!w) {
        w = document.createElement('div');
        w.setAttribute('data-spec-warn', key);
        w.className = 'flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700';
        if (before) host.insertBefore(w, before); else host.appendChild(w);
      }
      w.innerHTML = WARN_SVG + msg;
    } else if (w) w.remove();
  }

  /* ---------- 表格过滤 ---------- */
  function wireTableFilter(preview) {
    var input = preview.querySelector('input[placeholder^="搜索"]');
    var tbody = preview.querySelector('tbody');
    var countEl = $$('span', preview).filter(function (s) { return /^共 [\d,]+ 条/.test(txt(s)); })[0];
    var reset = preview.querySelector('button[aria-label="重置筛选"]');
    var state = { kw: '', extra: {} };
    function apply() {
      if (!tbody) return;
      var n = 0;
      $$('tr', tbody).forEach(function (tr) {
        var on = true;
        if (state.kw && txt(tr).toLowerCase().indexOf(state.kw) === -1) on = false;
        for (var k in state.extra) { var f = state.extra[k]; if (on && f && !f(tr)) on = false; }
        tr.style.display = on ? '' : 'none';
        if (on) n++;
      });
      if (countEl) countEl.textContent = '共 ' + n + ' 条规则';
    }
    if (input) input.addEventListener('input', function () { state.kw = input.value.trim().toLowerCase(); apply(); });
    if (reset) reset.addEventListener('click', function () {
      state.kw = ''; state.extra = {};
      if (input) input.value = '';
      apply();
    });
    return { state: state, apply: apply };
  }

  /* ---------- 分页器最小交互 ---------- */
  function wirePager(preview) {
    var jump = preview.querySelector('input[aria-label="前往页码"]');
    if (jump) jump.addEventListener('input', function () { jump.value = jump.value.replace(/[^0-9]/g, ''); });
    var sizeCombo = $$('[role=combobox]', preview).filter(function (c) { return /条\/页/.test(txt(c)); })[0];
    if (sizeCombo) specSelect(sizeCombo, [10, 20, 50, 100].map(function (n) { return { v: n, l: n + ' 条/页' }; }), function () { });
  }

  /* ---------- 徽章工厂（ProbeBadge / TestResultTag，class 与 demo 逐字一致） ---------- */
  function probeBadgeHTML(status, an, total) {
    var map = {
      normal: ['border-green-200 bg-green-50 text-green-600', '正常'],
      abnormal: ['border-red-200 bg-red-50 text-red-600', '异常'],
      unchecked: ['border-gray-200 bg-gray-50 text-gray-500', '未检测'],
      partial: ['border-amber-200 bg-amber-50 text-amber-600', total ? '部分异常（' + an + '/' + total + '）' : '部分异常']
    };
    var m = map[status];
    return '<span data-slot="badge" class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs w-fit whitespace-nowrap shrink-0 font-normal ' + m[0] + '">' + m[1] + '</span>';
  }
  var SPIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle w-3.5 h-3.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  function testTagHTML(state) {
    if (state === 'loading') return '<span class="inline-flex items-center gap-1 text-xs text-gray-500">' + SPIN_SVG + '测试中…</span>';
    if (state === 'ok') return '<span class="inline-flex items-center gap-1 text-xs text-green-600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"></path><path d="m9 11 3 3L22 4"></path></svg>连通正常</span>';
    if (state === 'fail') return '<span class="inline-flex items-center gap-1 text-xs text-red-600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>连接失败：超时</span>';
    return '';
  }
  function wireTestButton(panel, btnText, canRun, alt) {
    var btn = findBtn(panel, btnText);
    if (!btn) return null;
    var flip = !!alt;
    function render(state) {
      var row = btn.parentNode;
      var tag = row.querySelector('[data-spec-test-tag]');
      if (!tag) { tag = document.createElement('span'); tag.setAttribute('data-spec-test-tag', ''); row.appendChild(tag); }
      tag.innerHTML = testTagHTML(state);
    }
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true; render('loading');
      setTimeout(function () {
        flip = !flip;
        render(flip ? 'ok' : 'fail');
        btn.disabled = !canRun();
      }, 900);
    });
    return { sync: function () { btn.disabled = !canRun(); }, btn: btn };
  }

  /* ---------- 收信域 行内探测状态机（demo probeRow：1s 随机三态） ---------- */
  function receivingProbe(tr, btn) {
    if (btn.disabled) return;
    var statusCell = tr.cells[3], timeCell = tr.cells[4];
    var hosts = (txt(tr.cells[1]).split('、') || []).length;
    btn.disabled = true;
    statusCell.innerHTML = '<span class="inline-flex items-center gap-1 text-xs text-gray-500">' + SPIN_SVG + '探测中…</span>';
    setTimeout(function () {
      btn.disabled = false;
      var r = Math.random();
      var status = r > 0.6 ? 'normal' : r > 0.3 ? 'partial' : 'abnormal';
      statusCell.innerHTML = probeBadgeHTML(status, Math.max(1, Math.floor(hosts / 2)), hosts);
      var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
      timeCell.textContent = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      toast('探测完成');
    }, 1000);
  }

  /* ---------- 列表通用接线：搜索/重置/行内按钮跳转/分页 ---------- */
  function wireCard(preview, opts) {
    var ft = wireTableFilter(preview);
    wirePager(preview);
    var drawerHref = preview.getAttribute('data-drawer-href');
    var deleteHref = preview.getAttribute('data-delete-href');
    var add = $$('button', preview).filter(function (b) { return txt(b) === '新建' || txt(b) === '立即添加'; });
    add.forEach(function (b) { if (drawerHref && drawerHref !== '#drawer') b.setAttribute('data-nav', drawerHref); });
    $$('tbody tr', preview).forEach(function (tr) {
      $$('button', tr).forEach(function (b) {
        var t = txt(b);
        if ((t === '编辑' || t === '模拟测试') && drawerHref && drawerHref.charAt(0) !== '#') b.setAttribute('data-nav', drawerHref);
        else if (t === '删除' && deleteHref && deleteHref.charAt(0) !== '#') b.setAttribute('data-nav', deleteHref);
        else if (t === '探测' && opts && opts.probe) b.addEventListener('click', function () { opts.probe(tr, b); });
        else if ((t === '编辑' || t === '模拟测试' || t === '删除') && ((t === '删除' ? deleteHref : drawerHref) || '').charAt(0) === '#') {
          b.addEventListener('click', function () {
            var target = document.querySelector(t === '删除' ? deleteHref : drawerHref);
            if (target) target.scrollIntoView({ behavior: 'smooth' });
          });
        }
      });
    });
    // 步骤条跳转
    var steps = { '步骤一': 'data-step1-href', '步骤二': 'data-step2-href', '步骤三': 'data-step3-href' };
    $$('button', preview).forEach(function (b) {
      var t = txt(b);
      Object.keys(steps).forEach(function (k) {
        if (t.indexOf(k) !== -1) {
          var href = preview.getAttribute(steps[k]);
          if (href && !b.disabled) b.setAttribute('data-nav', href);
        }
      });
    });
    // 主文件内无内嵌筛选弹层的卡片：点「筛选」滚动到 §2.2
    var filterBtn = $$('button', preview).filter(function (b) { return txt(b).indexOf('筛选') === 0; })[0];
    if (filterBtn && opts && opts.filterToSection) {
      filterBtn.addEventListener('click', function () {
        var t = document.querySelector('#c-2');
        if (t) { t.scrollIntoView({ behavior: 'smooth' }); toast('筛选弹层实测与字段清单见 §2.2'); }
      });
    }
    return ft;
  }

  /* ================================================================ */
  var INIT = {

    /* ---- 页面框架 Tab 栏 ---- */
    tabs: function (preview) {
      var target = { '收信域管理': '#c-3', '转发设置': '#c-4', '出站路由': '#c-5', '发信认证': '#c-6' };
      $$('[role=tab]', preview).forEach(function (tab) {
        tab.addEventListener('click', function () {
          $$('[role=tab]', preview).forEach(function (t) {
            t.setAttribute('data-state', t === tab ? 'active' : 'inactive');
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
          });
          var sel = target[txt(tab)];
          if (sel && document.querySelector(sel)) document.querySelector(sel).scrollIntoView({ behavior: 'smooth' });
        });
      });
    },

    /* ---- §2.2 工具栏演示：克隆收信域工具栏 + 内嵌筛选弹层 ---- */
    'toolbar-demo': function (preview) {
      var slot = preview.querySelector('[data-toolbar]');
      var pop = preview.querySelector('[data-popover-slot]');
      var src = document.querySelector('[data-preview="receiving-card"] .flex.flex-wrap.items-center.gap-2');
      if (!slot || !src) return;
      var bar = src.cloneNode(true);
      slot.parentNode.replaceChild(bar, slot);
      var filterBtn = $$('button', bar).filter(function (b) { return txt(b).indexOf('筛选') === 0; })[0];
      if (filterBtn && pop) filterBtn.addEventListener('click', function () { pop.hidden = !pop.hidden; });
      var addBtn = $$('button', bar).filter(function (b) { return txt(b) === '新建'; })[0];
      if (addBtn) addBtn.setAttribute('data-nav', './layer-1-receiving-drawer.html');
      // 弹层字段 → 过滤 §2.3 收信域表格
      function recvFT() { return window.__fwdRecvFT; }
      var inputs = pop ? $$('input', pop) : [];
      if (inputs[0]) inputs[0].addEventListener('input', function () {
        var ft = recvFT(); if (!ft) return;
        var v = inputs[0].value.trim();
        ft.state.extra.target = v ? function (tr) { return txt(tr.cells[1]).indexOf(v) !== -1; } : null;
        ft.apply(); toast('已按目的地址过滤 §2.3 预览表格');
      });
      if (inputs[1]) inputs[1].addEventListener('input', function () {
        var ft = recvFT(); if (!ft) return;
        var v = inputs[1].value.trim();
        ft.state.extra.port = v ? function (tr) { return txt(tr.cells[2]) === v; } : null;
        ft.apply();
      });
      var combo = pop ? pop.querySelector('[role=combobox]') : null;
      if (combo) specSelect(combo, [
        { v: null, l: '全部' }, { v: '正常', l: '正常' }, { v: '异常', l: '异常' }, { v: '部分异常', l: '部分异常' }, { v: '未检测', l: '未检测' }
      ], function (v) {
        var ft = recvFT(); if (!ft) return;
        ft.state.extra.status = v ? function (tr) { return txt(tr.cells[3]).indexOf(v) === 0; } : null;
        ft.apply();
      });
      var search = bar.querySelector('input[placeholder^="搜索"]');
      if (search) search.addEventListener('input', function () {
        var ft = recvFT(); if (!ft) return;
        ft.state.kw = search.value.trim().toLowerCase(); ft.apply();
      });
      var reset = bar.querySelector('button[aria-label="重置筛选"]');
      if (reset) reset.addEventListener('click', function () {
        var ft = recvFT(); if (!ft) return;
        ft.state.kw = ''; ft.state.extra = {};
        if (search) search.value = '';
        inputs.forEach(function (i) { i.value = ''; });
        ft.apply();
      });
    },

    /* ---- 收信域 L0 ---- */
    'receiving-card': function (preview) {
      window.__fwdRecvFT = wireCard(preview, { probe: receivingProbe, filterToSection: false });
      var filterBtn = $$('button', preview).filter(function (b) { return txt(b).indexOf('筛选') === 0; })[0];
      if (filterBtn) filterBtn.addEventListener('click', function () {
        var t = document.querySelector('#c-2');
        if (t) { t.scrollIntoView({ behavior: 'smooth' }); toast('筛选弹层可在 §2.2 内直接操作'); }
      });
    },

    /* ---- 转发 L0 ---- */
    'relay-card': function (preview) { wireCard(preview, { filterToSection: true }); },

    /* ---- 出站 步骤一 L0 ---- */
    'outbound-card': function (preview) {
      wireCard(preview, {
        filterToSection: true,
        probe: function (tr, btn) {
          var cell = tr.cells[7];
          var badges = $$('[data-slot=badge]', cell);
          var probeBadge = badges[badges.length - 1];
          var ok = Math.random() > 0.4;
          if (probeBadge) probeBadge.outerHTML = probeBadgeHTML(ok ? 'normal' : 'abnormal');
          toast('探测完成：TCP 连通 + SMTP HELO 握手');
        }
      });
    },

    /* ---- 出站 步骤二 / 步骤三 列表（子文件） ---- */
    'channels-card': function (preview) { wireCard(preview); },
    'rules-card': function (preview) {
      wireCard(preview);
      var topo = findBtn(preview, '查看拓扑');
      if (topo) topo.addEventListener('click', function () { toast('拓扑视图：路由规则 → 投递通道 → 代理 IP（仅查看）'); });
    },

    /* ---- 认证 L0 ---- */
    'auth-card': function (preview) { wireCard(preview, { filterToSection: true }); },

    /* ---- 删除确认 AlertDialog ---- */
    'alert-dialog': function (preview) {
      var panel = preview.querySelector('[role=alertdialog]');
      if (!panel) return;
      var close = dismissable(preview, panel);
      var msg = preview.getAttribute('data-confirm-toast') || '已删除';
      $$('button', panel).forEach(function (b) {
        if (txt(b) === '取消') b.addEventListener('click', close);
        else b.addEventListener('click', function () { close(); toast(msg); });
      });
    },

    /* ---- 共享组件演示 ---- */
    'shared-widgets': function (preview) {
      $$('[data-spec-toast]', preview).forEach(function (b) {
        b.addEventListener('click', function () { toast(b.getAttribute('data-spec-toast')); });
      });
    },

    /* ---- 收信域抽屉 ---- */
    'receiving-drawer': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var close = dismissable(preview, panel);
      wireXClose(panel, close);
      var domainInput = panel.querySelector('input[placeholder="如 example.cn"]');
      var tagInput = panel.querySelector('input[placeholder="如 192.168.1.10"]') ||
        $$('input', panel).filter(function (i) { return !i.placeholder && i.type !== 'number' && i !== domainInput; })[0];
      var tagBox = tagInput ? tagInput.parentNode : null;
      var portInput = panel.querySelector('input[type=number]');
      var tags = $$('span', tagBox || panel).filter(function (s) { return s.className.indexOf('bg-gray-100') !== -1; }).map(txt);

      function tagErr(msg) {
        var host = tagBox ? tagBox.parentNode : panel;
        var p = host.querySelector('[data-spec-tag-err]');
        if (msg) {
          if (!p) {
            p = document.createElement('p');
            p.setAttribute('data-spec-tag-err', '');
            p.className = 'text-xs text-red-500 flex items-center gap-1';
            tagBox.parentNode.insertBefore(p, tagBox.nextSibling);
          }
          p.innerHTML = WARN_SVG + msg;
        } else if (p) p.remove();
      }
      function renderTags() {
        if (!tagBox) return;
        $$('[data-spec-chip]', tagBox).forEach(function (c) { c.remove(); });
        tags.slice().reverse().forEach(function (t) {
          var chip = document.createElement('span');
          chip.setAttribute('data-spec-chip', '');
          chip.className = 'inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs max-w-[160px]';
          chip.innerHTML = '<span class="truncate">' + t + '</span><button type="button" aria-label="移除 ' + t + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>';
          chip.querySelector('button').addEventListener('click', function () {
            tags = tags.filter(function (x) { return x !== t; });
            renderTags(); validate();
          });
          tagBox.insertBefore(chip, tagBox.firstChild);
        });
        if (tagInput) tagInput.placeholder = tags.length ? '' : '如 192.168.1.10';
      }
      function commitTag() {
        if (!tagInput) return;
        var v = tagInput.value.trim().replace(/,$/, '');
        if (!v) return;
        if (!isHostOrIp(v)) { tagErr('需为合法 IP 或域名'); return; }
        if (tags.indexOf(v) === -1) tags.push(v);
        tagInput.value = ''; tagErr('');
        renderTags(); validate();
      }
      function validate() {
        var bad = false;
        if (domainInput) {
          var v = domainInput.value.trim();
          var msg = !v ? '请输入收信域名' : !isDomain(v) ? '域名格式不正确' :
            DOMAINS.indexOf(v.toLowerCase()) !== -1 ? '收信域名已存在，不可重复添加' : '';
          bad = fieldErr(domainInput, msg) || bad;
        }
        if (tagBox) {
          var wrap = fieldWrap(tagBox);
          var p = $$('p', wrap).filter(function (x) { return x.className.indexOf('text-red-500') !== -1 && !x.hasAttribute('data-spec-tag-err'); })[0];
          if (tags.length === 0) {
            if (!p) { p = document.createElement('p'); p.className = 'text-xs text-red-500'; wrap.appendChild(p); }
            p.textContent = '请至少添加一个目的地址';
            bad = true;
          } else if (p) p.remove();
        }
        if (portInput) {
          var pv = Number(portInput.value);
          bad = fieldErr(portInput, (pv < 1 || pv > 65535) ? '端口范围 1-65535' : '') || bad;
        }
        if (test) test.sync();
        return !bad;
      }
      var test = wireTestButton(panel, '测试连通性', function () { return tags.length > 0; });
      if (domainInput) domainInput.addEventListener('input', validate);
      if (portInput) portInput.addEventListener('input', validate);
      if (tagInput) {
        tagInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTag(); }
          else if (e.key === 'Backspace' && !tagInput.value && tags.length) { tags.pop(); renderTags(); validate(); }
        });
        tagInput.addEventListener('blur', commitTag);
        tagInput.addEventListener('input', function () { tagErr(''); });
      }
      var save = findBtn(panel, '保存'), cancel = findBtn(panel, '取消');
      if (cancel) cancel.addEventListener('click', close);
      if (save) save.addEventListener('click', function () {
        if (!validate()) { toast('请修正表单中的校验错误'); return; }
        close(); toast('收信域已添加');
      });
      validate();
    },

    /* ---- 转发规则抽屉 ---- */
    'relay-drawer': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var close = dismissable(preview, panel);
      wireXClose(panel, close);
      wireSwitches(panel);
      var inputs = $$('input', panel);
      var nameInput = inputs[0];
      var prioInput = panel.querySelector('input[type=number]');
      var srcInput = panel.querySelector('input[placeholder^="IP / CIDR"]');
      var fromInput = panel.querySelector('input[placeholder="请输入发信域名"]');
      var heloInput = panel.querySelector('input[placeholder="客户端声明的主机名"]');
      var rcptInput = panel.querySelector('input[placeholder^="如 "]');
      var spf = panel.querySelector('[role=checkbox]');
      var state = { useSpf: spf ? isChecked(spf) : false, rcptMatch: 'contains', spamFilter: false };

      function spfHint() {
        if (!srcInput) return;
        var wrap = fieldWrap(srcInput);
        var p = wrap.querySelector('[data-spec-spf-hint]');
        if (state.useSpf) {
          if (!p) { p = document.createElement('p'); p.setAttribute('data-spec-spf-hint', ''); p.className = 'text-xs text-gray-400'; wrap.appendChild(p); }
          p.textContent = '已启用 SPF：来源 IP 与 SPF 记录为 OR 关系，任一命中即通过';
        } else if (p) p.remove();
      }
      function validate() {
        var bad = false;
        if (nameInput) bad = fieldErr(nameInput, nameInput.value.trim() ? '' : '请输入规则名称') || bad;
        if (prioInput) bad = fieldErr(prioInput, Number(prioInput.value) < 1 ? '优先级需为正整数' : '') || bad;
        if (fromInput) bad = fieldErr(fromInput, state.useSpf && !fromInput.value.trim() ? '启用 SPF 认证时发信域名必填' : '') || bad;
        return !bad;
      }
      if (spf) spf.addEventListener('click', function () {
        state.useSpf = !isChecked(spf);
        setCheckbox(spf, state.useSpf);
        spfHint(); validate();
      });
      [nameInput, prioInput, fromInput].forEach(function (i) { if (i) i.addEventListener('input', validate); });
      var combos = $$('[role=combobox]', panel);
      if (combos[0]) specSelect(combos[0], [{ v: 'contains', l: '包含' }, { v: 'equals', l: '等于' }, { v: 'regex', l: '正则匹配' }], function (v) { state.rcptMatch = v; });
      if (combos[1]) specSelect(combos[1], [{ v: false, l: '不过滤' }, { v: true, l: '过滤' }], function (v) { state.spamFilter = v; });

      // 规则模拟器（demo matchRule 同款逻辑）
      var simSrc = panel.querySelector('input[placeholder="来源 IP"]');
      var simFrom = panel.querySelector('input[placeholder="发信域名"]');
      var simRcpt = panel.querySelector('input[placeholder="收信域名"]');
      var simBtn = findBtn(panel, '模拟匹配');
      function ipMatches(rule, ip) {
        if (!rule.sourceIp || rule.sourceIp === 'ALL') return true;
        if (!ip) return true;
        var ips = rule.sourceIp.split(',').map(function (s) { return s.trim(); });
        if (ips.indexOf(ip) !== -1) return true;
        return ips.some(function (r) { return ip.indexOf(r.split('/')[0].split('.').slice(0, 2).join('.')) === 0; });
      }
      function matchRule(rule, input) {
        if (rule.status !== 'enabled') return false;
        var spfPass = rule.useSpf && !!rule.fromDomain && !!input.fromDomain && input.fromDomain.indexOf(rule.fromDomain) !== -1;
        if (!ipMatches(rule, input.sourceIp) && !spfPass) return false;
        if (rule.fromDomain && input.fromDomain && input.fromDomain.indexOf(rule.fromDomain) === -1) return false;
        if (rule.rcptDomain && input.rcptDomain) {
          if (rule.rcptMatchType === 'equals' && input.rcptDomain !== rule.rcptDomain) return false;
          if (rule.rcptMatchType === 'contains' && input.rcptDomain.indexOf(rule.rcptDomain) === -1) return false;
          if (rule.rcptMatchType === 'regex') { try { if (!new RegExp(rule.rcptDomain).test(input.rcptDomain)) return false; } catch (e) { return false; } }
        }
        return true;
      }
      if (simBtn) simBtn.addEventListener('click', function () {
        var input = { sourceIp: simSrc ? simSrc.value.trim() : '', fromDomain: simFrom ? simFrom.value.trim() : '', rcptDomain: simRcpt ? simRcpt.value.trim() : '' };
        var hit = RELAY_RULES.slice().sort(function (a, b) { return a.priority - b.priority; }).filter(function (r) { return matchRule(r, input); })[0];
        var msg = hit ? '命中规则《' + hit.name + '》，动作：允许通过（垃圾邮件过滤：' + (hit.spamFilter ? '是' : '否') + '）'
          : '未命中任何规则，执行默认策略：按系统全局配置（拒绝/允许）';
        var card = simBtn.closest('.rounded-lg') || panel;
        var box = card.querySelector('[data-spec-sim]');
        if (!box) {
          box = card.querySelector('div.rounded-md.border');
          if (box && box.className.indexOf('bg-gray-50') === -1) box = null;
          if (!box) {
            box = document.createElement('div');
            box.className = 'rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-300';
            card.appendChild(box);
          }
          box.setAttribute('data-spec-sim', '');
        }
        box.textContent = msg;
      });
      var save = findBtn(panel, '保存'), cancel = findBtn(panel, '取消');
      if (cancel) cancel.addEventListener('click', close);
      if (save) save.addEventListener('click', function () {
        if (!validate()) { toast('请修正表单中的校验错误'); return; }
        close(); toast('转发规则已添加');
      });
    },

    /* ---- 代理 IP 抽屉 ---- */
    'proxy-drawer': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var close = dismissable(preview, panel);
      wireXClose(panel, close);
      wireSwitches(panel);
      var nameInput = $$('input', panel)[0];
      var ipInput = panel.querySelector('input[placeholder="如 1.1.1.1"]');
      var portInput = $$('input[type=number]', panel)[0];
      var egressInput = panel.querySelector('input[placeholder="如 132.148.32.1"]');
      var heloInput = panel.querySelector('input[placeholder^="请输入向对端服务器声明"]');
      var NAMES = PROXIES.map(function (p) { return p.name; }).filter(function (n) { return nameInput && n !== nameInput.value.trim(); });
      function rdnsHost() {
        var card = heloInput ? heloInput.closest('.rounded-lg') : null;
        return card || panel;
      }
      function validate() {
        var bad = false;
        if (nameInput) {
          var v = nameInput.value.trim();
          bad = fieldErr(nameInput, !v ? '请输入名称' : (v.length < 2 || v.length > 50) ? '名称需 2-50 字符' : NAMES.indexOf(v) !== -1 ? '名称已存在' : '') || bad;
        }
        if (ipInput) bad = fieldErr(ipInput, !ipInput.value.trim() ? '请输入代理 IP 地址' : !isIPv4(ipInput.value) ? '需为合法 IPv4 地址' : '') || bad;
        if (portInput) { var pv = Number(portInput.value); bad = fieldErr(portInput, (pv < 1 || pv > 65535) ? '端口范围 1-65535' : '') || bad; }
        if (egressInput) bad = fieldErr(egressInput, !egressInput.value.trim() ? '请输入出口 IP 地址' : !isIPv4(egressInput.value) ? '需为合法 IPv4 地址' : '') || bad;
        var heloBad = false;
        if (heloInput) {
          var hv = heloInput.value.trim();
          heloBad = hv && (isIPv4(hv) || !isDomain(hv));
          fieldErr(heloInput, heloBad ? 'HELO 主机名需为合法域名格式，不能为 IP 地址' : '');
          bad = heloBad || bad;
          var warnHost = rdnsHost();
          var existing = $$('div', warnHost).filter(function (d) { return txt(d).indexOf('反向解析') !== -1 && d.className.indexOf('bg-amber-50') !== -1 && !d.hasAttribute('data-spec-warn'); })[0];
          var msg = hv && !heloBad && hv !== 'ptr-isp.example.com'
            ? '出口 IP ' + (egressInput ? egressInput.value.trim() || '(未填写)' : '') + ' 的反向解析为 ptr-isp.example.com，与 HELO 声明 ' + hv + ' 不一致，可能被对端拒收。' : '';
          if (existing) { existing.style.display = msg ? '' : 'none'; if (msg) existing.innerHTML = WARN_SVG + msg; }
          else ensureWarn(warnHost, 'rdns', msg);
        }
        if (test) test.sync();
        return !bad;
      }
      var test = wireTestButton(panel, '测试连通性', function () { return ipInput && !!ipInput.value.trim(); });
      [nameInput, ipInput, portInput, egressInput, heloInput].forEach(function (i) { if (i) i.addEventListener('input', validate); });
      var combos = $$('[role=combobox]', panel);
      if (combos[0]) specSelect(combos[0], ['TLSv1.0', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'].map(function (v) { return { v: v, l: v }; }), function () { });
      if (combos[1]) specSelect(combos[1], [{ v: 'default', l: '系统推荐' }, { v: 'high', l: '高安全（仅强密码）' }, { v: 'compatible', l: '兼容模式' }], function () { });
      var save = findBtn(panel, '保存'), cancel = findBtn(panel, '取消');
      if (cancel) cancel.addEventListener('click', close);
      if (save) save.addEventListener('click', function () {
        if (!validate()) { toast('请修正表单中的校验错误'); return; }
        if (heloInput && heloInput.value.trim() === SYSTEM_HELO) toast('HELO 与系统默认一致，可留空以简化配置');
        else toast('代理 IP 已更新');
        close();
      });
    },

    /* ---- 投递通道抽屉 ---- */
    'channel-drawer': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var close = dismissable(preview, panel);
      wireXClose(panel, close);
      wireSwitches(panel);
      var nameInput = $$('input', panel)[0];
      var listBoxes = $$('[role=checkbox]', panel);
      var selected = [];
      listBoxes.forEach(function (cb, i) { if (isChecked(cb)) selected.push(PROXIES[i].id); });
      var sortedTable = $$('table', panel).pop();
      var sortedBody = sortedTable ? sortedTable.querySelector('tbody') : null;
      var rowTpl = sortedBody ? sortedBody.querySelector('tr').cloneNode(true) : null;
      var warnDiv = $$('div', panel).filter(function (d) { return d.className.indexOf('bg-amber-50') !== -1 && txt(d).indexOf('HELO 声明不一致') !== -1; })[0];

      function proxyById(id) { return PROXIES.filter(function (p) { return p.id === id; })[0]; }
      function render() {
        listBoxes.forEach(function (cb, i) { setCheckbox(cb, selected.indexOf(PROXIES[i].id) !== -1); });
        if (sortedBody && rowTpl) {
          sortedBody.innerHTML = '';
          selected.forEach(function (id, idx) {
            var p = proxyById(id);
            var tr = rowTpl.cloneNode(true);
            tr.cells[0].textContent = p.name;
            tr.cells[1].textContent = p.ip;
            tr.cells[2].textContent = heloLabel(p.helo);
            tr.cells[3].textContent = String(p.port);
            tr.cells[4].textContent = String(idx + 1);
            var btns = $$('button', tr.cells[5]);
            if (btns[0]) { btns[0].disabled = idx === 0; btns[0].addEventListener('click', function () { move(idx, -1); }); }
            if (btns[1]) { btns[1].disabled = idx === selected.length - 1; btns[1].addEventListener('click', function () { move(idx, 1); }); }
            if (btns[2]) btns[2].addEventListener('click', function () { selected.splice(idx, 1); render(); });
            sortedBody.appendChild(tr);
          });
          var card = sortedTable.closest('.rounded-lg');
          if (card) card.style.display = selected.length ? '' : 'none';
        }
        if (warnDiv) {
          var helos = [];
          selected.forEach(function (id) { var h = heloLabel(proxyById(id).helo); if (helos.indexOf(h) === -1) helos.push(h); });
          warnDiv.style.display = helos.length > 1 ? '' : 'none';
          if (helos.length > 1) warnDiv.innerHTML = WARN_SVG + '通道内代理 HELO 声明不一致（' + helos.join(' vs ') + '），可能导致对端信誉评估分散，建议统一。';
        }
      }
      function move(idx, dir) {
        var t = idx + dir;
        if (t < 0 || t >= selected.length) return;
        var tmp = selected[idx]; selected[idx] = selected[t]; selected[t] = tmp;
        render();
      }
      listBoxes.forEach(function (cb, i) {
        cb.addEventListener('click', function () {
          var id = PROXIES[i].id;
          var at = selected.indexOf(id);
          if (at === -1) selected.push(id); else selected.splice(at, 1);
          render();
        });
      });
      function validate() {
        var bad = false;
        if (nameInput) {
          var v = nameInput.value.trim();
          var other = CHANNELS.map(function (c) { return c.name; }).filter(function (n) { return n !== '测试通道'; });
          bad = fieldErr(nameInput, !v ? '请输入通道名称' : other.indexOf(v) !== -1 ? '通道名称已存在' : '') || bad;
        }
        return !bad && selected.length > 0;
      }
      if (nameInput) nameInput.addEventListener('input', validate);
      var save = findBtn(panel, '保存'), cancel = findBtn(panel, '取消');
      if (cancel) cancel.addEventListener('click', close);
      if (save) save.addEventListener('click', function () {
        if (!validate()) { toast('请修正表单中的校验错误'); return; }
        var helos = [];
        selected.forEach(function (id) { var h = heloLabel(proxyById(id).helo); if (helos.indexOf(h) === -1) helos.push(h); });
        if (helos.length > 1) toast('当前通道内代理 IP 的 HELO 声明不一致（' + helos.join(' vs ') + '），建议统一以避免对端信誉评估分散');
        else toast('投递通道已更新');
        close();
      });
      render();
    },

    /* ---- 路由规则抽屉 ---- */
    'rule-drawer': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var close = dismissable(preview, panel);
      wireXClose(panel, close);
      wireSwitches(panel);
      var cards = $$('.rounded-lg.border', panel).filter(function (d) { return d.querySelector('h4'); });
      function cardByTitle(t) {
        return cards.filter(function (c) { var h = c.querySelector('h4'); return h && txt(h) === t; })[0];
      }
      var baseCard = cardByTitle('基础信息'), condCard = cardByTitle('规则条件'), routeCard = cardByTitle('路由设置'), simCard = cardByTitle('模拟测试');
      var nameInput = baseCard ? $$('input', baseCard)[0] : null;
      var condInputs = condCard ? $$('input', condCard) : [];
      var targetInput = routeCard ? $$('input', routeCard)[0] : null;
      var portInput = routeCard ? $$('input[type=number]', routeCard)[0] : null;
      var state = { tlsLevel: 'forceVerify', channel: 'c4002', ruleName: nameInput ? nameInput.value : '金融合作方' };
      var proxyTableWrap = routeCard ? $$('div.rounded-md.border', routeCard).filter(function (d) { return txt(d).indexOf('通道内代理列表') !== -1; })[0] : null;
      var proxyBody = proxyTableWrap ? proxyTableWrap.querySelector('tbody') : null;
      var proxyRowTpl = proxyBody ? proxyBody.querySelector('tr').cloneNode(true) : null;

      function noCondition() {
        return condInputs.every(function (i) { return !i.value.trim(); });
      }
      function renderCondWarn() {
        if (!condCard) return;
        ensureWarn(condCard, 'nocond', noCondition() ? '未设置任何条件，将作为兜底规则（全匹配），请确认优先级设置。' : '', condCard.children[1] || null);
      }
      function renderRouteWarns() {
        if (!routeCard || !targetInput) return;
        var tv = targetInput.value.trim();
        var loop = tv && ['127.0.0.1', 'localhost', SYSTEM_HELO].indexOf(tv) !== -1;
        fieldErr(targetInput, loop ? '目的地址不能与网关本地地址相同' : '');
        var plainWarn = state.tlsLevel === 'plain' && tv && isIPv4(tv) && tv.indexOf('10.') !== 0 && tv.indexOf('192.168.') !== 0
          ? '当前规则对公网地址使用明文传输，存在数据泄露风险，建议使用「优先 TLS」。' : '';
        ensureWarn(routeCard, 'plain', plainWarn);
        var ch = CHANNELS.filter(function (c) { return c.id === state.channel; })[0];
        var conflict = '';
        if (ch && state.tlsLevel === 'forceVerify') {
          var low = ch.proxyIds.map(function (id) { return PROXIES.filter(function (p) { return p.id === id; })[0]; })
            .filter(function (p) { return p && (p.tls === 'TLSv1.0' || p.tls === 'TLSv1.1'); })[0];
          if (low) conflict = '当前代理 IP 允许的 TLS 最低版本为 ' + low.tls + '，与「证书校验」的高安全策略存在差距，建议提升至 TLSv1.2。';
        }
        ensureWarn(routeCard, 'tlsconflict', conflict);
      }
      function renderProxyTable() {
        if (!proxyTableWrap) return;
        var ch = CHANNELS.filter(function (c) { return c.id === state.channel; })[0];
        proxyTableWrap.style.display = ch && ch.proxyIds.length ? '' : 'none';
        if (ch && proxyBody && proxyRowTpl) {
          proxyBody.innerHTML = '';
          ch.proxyIds.forEach(function (id) {
            var p = PROXIES.filter(function (x) { return x.id === id; })[0];
            var tr = proxyRowTpl.cloneNode(true);
            tr.cells[0].textContent = p.name;
            tr.cells[1].textContent = p.ip;
            tr.cells[2].textContent = p.egress;
            tr.cells[3].textContent = heloLabel(p.helo);
            tr.cells[4].innerHTML = probeBadgeHTML(p.probe);
            proxyBody.appendChild(tr);
          });
        }
      }
      condInputs.forEach(function (i) { i.addEventListener('input', renderCondWarn); });
      if (nameInput) nameInput.addEventListener('input', function () {
        state.ruleName = nameInput.value;
        fieldErr(nameInput, nameInput.value.trim() ? '' : '请输入规则名称');
      });
      if (targetInput) targetInput.addEventListener('input', renderRouteWarns);
      if (portInput) portInput.addEventListener('input', function () {
        var pv = Number(portInput.value);
        fieldErr(portInput, (pv < 1 || pv > 65535) ? '端口范围 1-65535' : '');
      });
      var combos = $$('[role=combobox]', condCard || panel).concat(routeCard ? $$('[role=combobox]', routeCard) : []);
      // condCard 内 2 个（收信域匹配 / 收信人匹配），routeCard 内 2 个（TLS 等级 / 投递通道）
      var condCombos = condCard ? $$('[role=combobox]', condCard) : [];
      if (condCombos[0]) specSelect(condCombos[0], [{ v: 'contains', l: '包含' }, { v: 'equals', l: '等于' }, { v: 'regex', l: '正则匹配' }], function () { });
      if (condCombos[1]) specSelect(condCombos[1], [{ v: 'to', l: '收件人' }, { v: 'cc', l: '抄送' }, { v: 'bcc', l: '密送' }], function () { });
      var routeCombos = routeCard ? $$('[role=combobox]', routeCard) : [];
      if (routeCombos[0]) specSelect(routeCombos[0], Object.keys(TLS_LEVEL_LABEL).map(function (k) { return { v: k, l: TLS_LEVEL_LABEL[k] }; }), function (v) {
        state.tlsLevel = v; renderRouteWarns();
      });
      if (routeCombos[1]) specSelect(routeCombos[1], [{ v: 'default', l: '默认通道' }].concat(CHANNELS.map(function (c) {
        var helo = c.proxyIds[0] ? heloLabel(PROXIES.filter(function (p) { return p.id === c.proxyIds[0]; })[0].helo) : '系统默认';
        return { v: c.id, l: c.name + '（' + c.proxyIds.length + '代理，HELO: ' + helo + '）' };
      })), function (v) { state.channel = v; renderProxyTable(); renderRouteWarns(); });

      var simBtn = simCard ? findBtn(simCard, '模拟测试') : null;
      if (simBtn) simBtn.addEventListener('click', function () {
        var ch = CHANNELS.filter(function (c) { return c.id === state.channel; })[0];
        var proxy = ch && ch.proxyIds[0] ? PROXIES.filter(function (p) { return p.id === ch.proxyIds[0]; })[0] : null;
        var lines = [
          '命中规则《' + (state.ruleName || '未命名') + '》',
          '├── 投递通道：' + (state.channel === 'default' ? '默认通道' : ch ? ch.name : '通道不可用'),
          '├── 代理 IP：' + (proxy ? proxy.ip + '（出口：' + proxy.egress + '）' : '系统默认'),
          '├── HELO 声明：' + (proxy ? heloLabel(proxy.helo) : '系统默认'),
          '├── TLS 策略：' + TLS_LEVEL_LABEL[state.tlsLevel],
          '└── 预计对端响应：250 2.0.0 Ok'
        ];
        var pre = simCard.querySelector('pre');
        if (!pre) {
          pre = document.createElement('pre');
          pre.className = 'rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono';
          simCard.appendChild(pre);
        }
        pre.textContent = lines.join('\n');
      });
      var save = findBtn(panel, '保存'), cancel = findBtn(panel, '取消');
      if (cancel) cancel.addEventListener('click', close);
      if (save) save.addEventListener('click', function () {
        if (nameInput && !nameInput.value.trim()) { toast('请修正表单中的校验错误'); return; }
        if (noCondition()) toast('当前规则未设置条件，将作为兜底规则，请确认优先级设置');
        else toast('路由规则已更新');
        close();
      });
      renderCondWarn(); renderRouteWarns();
    },

    /* ---- 发信认证抽屉 ---- */
    'auth-drawer': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var close = dismissable(preview, panel);
      wireXClose(panel, close);
      var state = { protocol: 'LDAP', tlsMode: 'prefer', verifyCert: true, domains: [], scenes: [] };
      var cards = $$('.rounded-lg.border', panel).filter(function (d) { return d.querySelector('h4'); });
      function cardByTitle(t) { return cards.filter(function (c) { var h = c.querySelector('h4'); return h && txt(h) === t; })[0]; }
      var baseCard = cardByTitle('基础配置'), srvCard = cardByTitle('认证服务器'), sceneCard = cardByTitle('生效场景');
      var domainTrigger = baseCard ? baseCard.querySelector('[role=combobox]') : null;
      var hostInput = srvCard ? srvCard.querySelector('input[placeholder^="如 "]') : null;
      var numInputs = srvCard ? $$('input[type=number]', srvCard) : [];
      var portInput = numInputs[0], timeoutInput = numInputs[1];
      var certBox = srvCard ? $$('[role=checkbox]', srvCard)[0] : null;
      var sceneBoxes = sceneCard ? $$('[role=checkbox]', sceneCard) : [];

      /* 域名多选弹层（克隆 8b 捕获的弹层片段） */
      var pickerHost = null;
      function togglePicker() {
        if (pickerHost) { pickerHost.remove(); pickerHost = null; domainTrigger.setAttribute('aria-expanded', 'false'); return; }
        var src = document.querySelector('[data-preview="domain-picker"] [role=dialog]');
        if (!src) return;
        pickerHost = src.cloneNode(true);
        pickerHost.style.cssText = 'margin-top:4px';
        domainTrigger.parentNode.insertBefore(pickerHost, domainTrigger.nextSibling);
        domainTrigger.setAttribute('aria-expanded', 'true');
        wirePickerBoxes(pickerHost);
      }
      function wirePickerBoxes(root) {
        var boxes = $$('[role=checkbox]', root);
        boxes.forEach(function (cb, i) {
          var name = i === 0 ? 'All' : DOMAINS[i - 1];
          setCheckbox(cb, state.domains.indexOf(name) !== -1);
          if (i > 0) cb.disabled = state.domains.indexOf('All') !== -1;
          cb.addEventListener('click', function () {
            if (name === 'All') state.domains = state.domains.indexOf('All') !== -1 ? [] : ['All'];
            else {
              var base = state.domains.filter(function (x) { return x !== 'All'; });
              var at = base.indexOf(name);
              if (at === -1) base.push(name); else base.splice(at, 1);
              state.domains = base;
            }
            wirePickerBoxes(root);
            renderDomains(); validate();
          });
        });
      }
      function renderDomains() {
        if (!domainTrigger) return;
        var span = domainTrigger.querySelector('span');
        if (span) {
          span.className = state.domains.length === 0 ? 'text-gray-400' : '';
          span.textContent = state.domains.length === 0 ? '请选择适用域名' :
            state.domains.indexOf('All') !== -1 ? '全部域名（All）' : '已选 ' + state.domains.length + ' 个域名';
        }
        var wrap = fieldWrap(domainTrigger);
        var badges = wrap.querySelector('[data-spec-domain-badges]');
        if (state.domains.length) {
          if (!badges) {
            badges = document.createElement('div');
            badges.setAttribute('data-spec-domain-badges', '');
            badges.className = 'mt-2 flex flex-wrap gap-1.5';
            wrap.appendChild(badges);
          }
          badges.innerHTML = '';
          state.domains.forEach(function (d) {
            var b = document.createElement('span');
            b.setAttribute('data-slot', 'badge');
            b.className = 'inline-flex items-center justify-center rounded-md border border-transparent bg-secondary text-secondary-foreground px-2 py-0.5 text-xs w-fit whitespace-nowrap gap-1 pr-1 font-normal';
            b.innerHTML = (d === 'All' ? '全部域名' : d) + '<button type="button" aria-label="移除域名 ' + (d === 'All' ? '全部域名' : d) + '" class="rounded-sm p-0.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>';
            b.querySelector('button').addEventListener('click', function () {
              state.domains = state.domains.filter(function (x) { return x !== d; });
              renderDomains(); validate();
              if (pickerHost) wirePickerBoxes(pickerHost);
            });
            badges.appendChild(b);
          });
        } else if (badges) badges.remove();
      }
      if (domainTrigger) domainTrigger.addEventListener('click', function (e) { e.preventDefault(); togglePicker(); });

      /* 协议 / TLS 联动 */
      var srvCombos = srvCard ? $$('[role=combobox]', srvCard) : [];
      function fillPort() { if (portInput) portInput.value = state.tlsMode === 'off' ? PORTS[state.protocol].s : PORTS[state.protocol].ssl; }
      function renderCert() {
        if (!certBox) return;
        var off = state.tlsMode === 'off';
        certBox.disabled = off;
        if (off) { state.verifyCert = false; }
        setCheckbox(certBox, state.verifyCert);
        var label = certBox.closest('label');
        if (label) label.className = 'flex items-center gap-2 text-sm ' + (off ? 'cursor-not-allowed opacity-50' : 'cursor-pointer');
        var host = srvCard;
        function warnP(key, msg) {
          var p = host.querySelector('[data-spec-authwarn="' + key + '"]');
          if (msg) {
            if (!p) {
              p = document.createElement('p');
              p.setAttribute('data-spec-authwarn', key);
              p.className = 'text-xs text-amber-600';
              label.parentNode.insertBefore(p, label.nextSibling);
            }
            p.textContent = msg;
          } else if (p) p.remove();
        }
        // 清理快照自带的静态警告（编辑 off 态快照），统一走动态渲染
        $$('p.text-xs.text-amber-600', host).forEach(function (p) { if (!p.hasAttribute('data-spec-authwarn')) p.remove(); });
        warnP('off', off ? '未启用传输加密：认证凭据将以明文传输，建议仅在受信任的内网环境使用。' : '');
        warnP('nocert', !off && !state.verifyCert ? '已关闭证书校验：将不验证服务器证书合法性，存在中间人攻击风险，仅建议用于内部自签名证书服务器。' : '');
      }
      if (srvCombos[0]) specSelect(srvCombos[0], ['SMTP', 'LDAP', 'POP3', 'IMAP'].map(function (v) { return { v: v, l: v }; }), function (v) {
        state.protocol = v; fillPort();
      });
      if (srvCombos[1]) specSelect(srvCombos[1], [{ v: 'off', l: '关闭' }, { v: 'prefer', l: '优先 TLS' }, { v: 'force', l: '强制 TLS' }], function (v) {
        state.tlsMode = v;
        if (v !== 'off' && certBox && certBox.disabled) state.verifyCert = true;
        fillPort(); renderCert();
      });
      if (certBox) certBox.addEventListener('click', function () {
        if (certBox.disabled) return;
        state.verifyCert = !state.verifyCert;
        renderCert();
      });

      /* 场景 + 冲突校验 */
      function domainsOverlap(a, b) {
        if (a.indexOf('All') !== -1 || b.indexOf('All') !== -1) return a.length && b.length;
        return a.some(function (d) { return b.indexOf(d) !== -1; });
      }
      function validate() {
        var bad = false;
        if (domainTrigger) {
          var wrap = fieldWrap(domainTrigger);
          var p = $$('p', wrap).filter(function (x) { return x.className.indexOf('text-red-500') !== -1; })[0];
          if (state.domains.length === 0) {
            if (!p) { p = document.createElement('p'); p.className = 'text-xs text-red-500'; wrap.appendChild(p); }
            p.textContent = '请选择适用域名'; bad = true;
          } else if (p) p.remove();
        }
        if (hostInput) bad = fieldErr(hostInput, hostInput.value.trim() ? '' : '请输入认证服务器地址') || bad;
        if (portInput) { var pv = Number(portInput.value); bad = fieldErr(portInput, (pv < 1 || pv > 65535) ? '端口范围 1-65535' : '') || bad; }
        if (timeoutInput) { var tv = Number(timeoutInput.value); bad = fieldErr(timeoutInput, (tv < 1 || tv > 300) ? '超时范围 1-300 秒' : '') || bad; }
        if (sceneCard) {
          function scenePs() { return $$('p', sceneCard).filter(function (x) { return x.className.indexOf('text-red-500') !== -1; }); }
          scenePs().forEach(function (p) { p.remove(); });
          var msgs = [];
          if (state.scenes.length === 0) msgs.push('请至少选择一个生效场景');
          var conflict = AUTH_CONFIGS.filter(function (c) {
            return c.scenes.some(function (s) { return state.scenes.indexOf(s) !== -1; }) && domainsOverlap(c.domains, state.domains);
          })[0];
          if (conflict) msgs.push('与已有配置（' + conflict.protocol + '）在相同域名+场景下冲突，同一场景仅允许一条生效配置。');
          msgs.forEach(function (m) {
            var p = document.createElement('p');
            p.className = 'text-xs text-red-500'; p.textContent = m;
            sceneCard.appendChild(p);
          });
          bad = bad || msgs.length > 0;
        }
        if (test) test.sync();
        return !bad;
      }
      sceneBoxes.forEach(function (cb, i) {
        cb.addEventListener('click', function () {
          var k = SCENE_KEYS[i];
          var at = state.scenes.indexOf(k);
          if (at === -1) state.scenes.push(k); else state.scenes.splice(at, 1);
          setCheckbox(cb, at === -1);
          validate();
        });
      });
      var test = wireTestButton(panel, '测试连接', function () { return hostInput && !!hostInput.value.trim(); });
      [hostInput, portInput, timeoutInput].forEach(function (i) { if (i) i.addEventListener('input', validate); });
      var save = findBtn(panel, '保存'), cancel = findBtn(panel, '取消');
      if (cancel) cancel.addEventListener('click', close);
      if (save) save.addEventListener('click', function () {
        if (!validate()) { toast('请修正表单中的校验错误'); return; }
        close(); toast('认证配置已添加');
      });
      renderCert(); validate();
    },

    /* ---- 域名多选弹层（8b 独立演示：All 互斥） ---- */
    'domain-picker': function (preview) {
      var boxes = $$('[role=checkbox]', preview);
      var picked = [];
      boxes.forEach(function (cb, i) {
        var name = i === 0 ? 'All' : DOMAINS[i - 1];
        cb.addEventListener('click', function () {
          if (name === 'All') picked = picked.indexOf('All') !== -1 ? [] : ['All'];
          else if (picked.indexOf('All') === -1) {
            var at = picked.indexOf(name);
            if (at === -1) picked.push(name); else picked.splice(at, 1);
          }
          boxes.forEach(function (b, j) {
            var n = j === 0 ? 'All' : DOMAINS[j - 1];
            setCheckbox(b, picked.indexOf(n) !== -1);
            if (j > 0) b.disabled = picked.indexOf('All') !== -1;
          });
        });
      });
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    $$('.component-preview[data-preview]').forEach(function (preview) {
      var kind = preview.getAttribute('data-preview');
      if (INIT[kind]) try { INIT[kind](preview); } catch (e) { console.error('preview init failed:', kind, e); }
    });
  });
})();
