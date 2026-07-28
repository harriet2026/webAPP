/*
 * contacts-preview.js — 驱动「组织通讯录」html_spec 的可交互组件预览。
 *
 * 预览区内的标记是从运行中的 demo（http://localhost:3111/admin/contacts）逐状态提取的
 * 真实 DOM（Radix 输出）。Radix 自身的 JS 不在这里，本引擎只复刻在 demo 里逐项点击验证过的
 * 状态迁移，行为与各层 DOM 比对表一一对应：
 *
 *   - 搜索框：按行文本过滤表格 + 更新「共 N 条」计数 + 无结果空态（demo: filter+includes）
 *   - 重置按钮：清空搜索与筛选
 *   - 筛选弹层：两个 Select 打开选项菜单，选中后过滤表格并更新筛选徽标数
 *   - 自动同步徽章：点击切换 开启/关闭（demo: toggleAuto，绿点/灰点）
 *   - 行内同步：按钮置灰「同步中」+ 状态列蓝色「同步中」徽章 → 1.5s 后出结果 + toast
 *     （demo 结果随机 normal/partial/abnormal；预览固定重放捕获到的结果，见比对表）
 *   - 新增/编辑抽屉：同步方式 Select 切换 4 套连接参数表单（按捕获快照整面板切换）、
 *     名称/地址/端口实时校验（文案与 demo 逐字一致）、自动同步 Switch、
 *     测试连接 idle→loading(1.2s)→连通正常/连接失败：超时（demo 随机 70/30，预览交替出结果）、
 *     确定：有校验错误→toast「请修正表单中的校验错误」；测试未通过→toast「请先完成连接测试并通过」；
 *     通过→toast「数据源已新增/已更新」并关闭
 *   - 删除/批量标记 AlertDialog：取消关闭；确认→toast（文案与 demo 一致）
 *   - 通讯录复选框：单选/全选本页 → 浮出批量操作栏（已选 N 条实时更新）→ 批量标记确认 →
 *     行内标记徽章更新 + toast「成功标记 N 条记录」+ 清空选择
 *   - 行内「标记」下拉：打开捕获的菜单 → 选项点击 → 徽章更新 + toast
 *   - 导出：toast「已生成导出任务，共 N 条记录」（demo 前端仅出 toast，无真实下载）
 *   - 抽屉/弹窗关闭后显示「重新打开」恢复条，便于审查者反复操作
 */
(function () {
  'use strict';

  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function txt(el) { return (el.innerText || el.textContent || '').trim(); }
  function findBtn(root, needle) {
    return $$('button', root).filter(function (b) { return txt(b).indexOf(needle) !== -1; })[0] || null;
  }

  /* ---------- toast（复刻 demo ContactsPage 的固定底部 toast） ---------- */
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
  window.__specToast = toast;

  /* ---------- data-nav：跳到对应交互层级子文件 ---------- */
  document.addEventListener('click', function (e) {
    var nav = e.target.closest && e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); window.location.href = nav.getAttribute('data-nav'); }
  });

  /* ---------- 关闭 → 恢复条 ---------- */
  function wireDismiss(preview, panel, closers, onClose) {
    var bar = document.createElement('div');
    bar.style.cssText = 'display:none;padding:12px;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:13px';
    bar.innerHTML = '已关闭（demo 行为：overlay 卸载）。<button style="margin-left:8px;padding:2px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer">重新打开</button>';
    panel.parentNode.insertBefore(bar, panel.nextSibling);
    bar.querySelector('button').addEventListener('click', function () { panel.style.display = ''; bar.style.display = 'none'; });
    closers.forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        panel.style.display = 'none'; bar.style.display = 'block';
        if (onClose) onClose(btn);
      });
    });
  }

  /* ---------- 最小 Select 菜单（demo 的 SelectContent 选项列表按源码逐字复刻） ---------- */
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('click', function (e) {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  }, true);
  function specSelect(trigger, options, onPick) {
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openMenu) { closeMenu(); return; }
      var menu = document.createElement('div');
      menu.style.cssText = 'position:absolute;z-index:999;min-width:140px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);padding:4px;font-size:14px';
      options.forEach(function (o) {
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

  /* ---------- 表格过滤 ---------- */
  function wireTableFilter(preview, opts) {
    var input = preview.querySelector('input[placeholder^="搜索"]');
    var tbody = preview.querySelector('tbody');
    var countEl = $$('span', preview).filter(function (s) { return /^共 [\d,]+ 条/.test(txt(s)); })[0];
    var countUnit = countEl ? txt(countEl).replace(/^共 [\d,]+ /, '') : '条记录';
    var reset = preview.querySelector('button[aria-label="重置筛选"]');
    var state = { kw: '', extra: {} };

    function rowVisible(tr) {
      if (state.kw && txt(tr).toLowerCase().indexOf(state.kw) === -1) return false;
      for (var k in state.extra) {
        var f = state.extra[k];
        if (f && !f(tr)) return false;
      }
      return true;
    }
    function apply() {
      if (!tbody) return;
      var n = 0;
      $$('tr', tbody).forEach(function (tr) {
        if (tr.hasAttribute('data-spec-template')) return;
        var on = rowVisible(tr);
        tr.style.display = on ? '' : 'none';
        if (on) n++;
      });
      if (countEl) countEl.textContent = '共 ' + n + ' ' + countUnit;
      var empty = preview.querySelector('[data-spec-empty]');
      if (empty) empty.style.display = n === 0 ? '' : 'none';
      var table = preview.querySelector('table');
      if (table) table.style.display = n === 0 ? 'none' : '';
    }
    if (input) input.addEventListener('input', function () { state.kw = input.value.trim().toLowerCase(); apply(); });
    if (reset) reset.addEventListener('click', function () {
      state.kw = ''; state.extra = {};
      if (input) input.value = '';
      if (opts && opts.onReset) opts.onReset();
      apply();
    });
    return { state: state, apply: apply };
  }

  /* ---------- 徽章工厂：从预览已有 DOM 克隆（保证 class 与 demo 完全一致） ---------- */
  function cloneBadgeFrom(root, text) {
    var b = $$('[data-slot="badge"]', root).filter(function (x) { return txt(x) === text; })[0];
    return b ? b.cloneNode(true) : null;
  }
  function makeTagCell(preview, tag) {
    if (tag === 'none') { var s = document.createElement('span'); s.className = 'text-gray-400'; s.textContent = '-'; return s; }
    var label = tag === 'exec' ? '高管' : '关键岗位';
    var c = cloneBadgeFrom(preview, label);
    if (c) return c;
    var span = document.createElement('span');
    span.setAttribute('data-slot', 'badge');
    span.className = 'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs w-fit whitespace-nowrap font-normal ' +
      (tag === 'exec' ? 'border-red-200 bg-red-50 text-red-600' : 'border-orange-200 bg-orange-50 text-orange-600');
    span.textContent = label;
    return span;
  }

  /* ================================================================
   * 各 preview 初始化
   * ================================================================ */
  var INIT = {

    /* ---- 页面框架 Tab 栏：点击切换激活态并滚动到对应组件 ---- */
    tabs: function (preview) {
      $$('[role=tab]', preview).forEach(function (tab) {
        tab.addEventListener('click', function () {
          $$('[role=tab]', preview).forEach(function (t) {
            t.setAttribute('data-state', t === tab ? 'active' : 'inactive');
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
          });
          var target = { '数据源管理': '#c-2', '通讯录查询': '#c-3', '同步日志': '#c-4' }[txt(tab)];
          if (target && document.querySelector(target)) document.querySelector(target).scrollIntoView({ behavior: 'smooth' });
        });
      });
    },

    /* ---- 数据源管理 L0 ---- */
    'source-table': function (preview) {
      var ft = wireTableFilter(preview);
      var filterBtn = findBtn(preview, '筛选');
      if (filterBtn) filterBtn.setAttribute('data-nav', './layer-1-source-filter.html');
      var addBtn = findBtn(preview, '新增数据源');
      if (addBtn) addBtn.setAttribute('data-nav', './layer-2-source-drawer.html');

      $$('tbody tr', preview).forEach(function (tr) {
        var edit = findBtn(tr, '编辑'), del = findBtn(tr, '删除'), sync = findBtn(tr, '同步');
        if (edit) edit.setAttribute('data-nav', './layer-4-source-edit.html');
        if (del) del.setAttribute('data-nav', './layer-5-source-delete.html');
        // 自动同步徽章切换（demo: toggleAuto）
        var autoBtn = tr.querySelector('button[aria-label="切换自动同步"]');
        if (autoBtn) autoBtn.addEventListener('click', function () {
          var dot = autoBtn.querySelector('span span:first-child');
          var label = autoBtn.querySelector('span span:last-child');
          var on = txt(label) === '开启';
          dot.className = 'h-1.5 w-1.5 rounded-full ' + (on ? 'bg-gray-300' : 'bg-green-500');
          label.className = on ? 'text-gray-400' : 'text-green-600';
          label.textContent = on ? '关闭' : '开启';
        });
        // 行内同步状态机
        if (sync) sync.addEventListener('click', function () { runSyncMachine(preview, tr, sync); });
      });
      wirePager(preview);
    },

    /* ---- 行内同步（层级 6 子文件同用） ---- */
    'sync-row': function (preview) {
      $$('tbody tr', preview).forEach(function (tr) {
        var sync = findBtn(tr, '同步');
        if (sync && txt(sync) === '同步') sync.addEventListener('click', function () { runSyncMachine(preview, tr, sync); });
      });
    },

    /* ---- 筛选弹层（层级 1） ---- */
    'filter-popover': function (preview) {
      var ft = wireTableFilter(preview);
      var combos = $$('[role=combobox]', preview);
      var filterBtn = findBtn(preview, '筛选');
      var TYPE = { '全部': null, 'LDAP': 'LDAP', 'Coremail API': 'Coremail', '网易企邮 API': '网易 API', 'CSV 导入': 'CSV 导入' };
      var STATUS = { '全部': null, '正常': '正常', '部分异常': '部分异常', '异常': '异常', '未同步': '未同步' };
      var picked = { type: null, status: null };
      function updateBadge() {
        var n = (picked.type ? 1 : 0) + (picked.status ? 1 : 0);
        var badge = filterBtn && filterBtn.querySelector('[data-spec-filter-count]');
        if (filterBtn && !badge) {
          badge = document.createElement('span');
          badge.setAttribute('data-spec-filter-count', '');
          badge.className = 'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] leading-none text-white';
          filterBtn.appendChild(badge);
        }
        if (badge) { badge.textContent = n; badge.style.display = n ? '' : 'none'; }
      }
      if (combos[0]) specSelect(combos[0], Object.keys(TYPE).map(function (k) { return { v: TYPE[k], l: k }; }), function (v) {
        picked.type = v;
        ft.state.extra.type = v ? function (tr) { return txt(tr.cells[2]) === v; } : null;
        ft.apply(); updateBadge();
      });
      if (combos[1]) specSelect(combos[1], Object.keys(STATUS).map(function (k) { return { v: STATUS[k], l: k }; }), function (v) {
        picked.status = v;
        ft.state.extra.status = v ? function (tr) { return txt(tr.cells[4]).indexOf(v) === 0; } : null;
        ft.apply(); updateBadge();
      });
    },

    /* ---- 新增/编辑数据源抽屉（层级 2/3/4） ---- */
    drawer: function (preview) {
      var panels = $$('[data-swap-panel]', preview);
      var MOCK_NAMES = ['总部 AD', '邮件系统', '网易企邮', '研发 CSV', '分支机构 LDAP'];
      var editing = preview.getAttribute('data-drawer-mode') === 'edit';
      var TYPES = [{ v: 'ldap', l: 'LDAP' }, { v: 'coremail', l: 'Coremail API' }, { v: 'netease', l: '网易企邮 API' }, { v: 'csv', l: 'CSV 导入' }];

      function showPanel(key) {
        panels.forEach(function (p) { p.hidden = p.getAttribute('data-swap-panel') !== key; });
      }

      panels.forEach(function (panel) {
        var type = panel.getAttribute('data-swap-panel');
        var test = { state: 'idle', flip: false };
        var combo = panel.querySelector('[role=combobox]');
        if (combo && panels.length > 1) specSelect(combo, TYPES, function (v) { showPanel(v); });

        var inputs = $$('input', panel);
        var nameInput = inputs[0];
        function fieldErr(input, msg) {
          var wrap = input.closest('.space-y-1\\.5') || input.parentNode;
          var p = wrap.querySelector('p.text-red-500, p.text-xs.text-red-500');
          if (msg) {
            if (!p) { p = document.createElement('p'); p.className = 'text-xs text-red-500'; wrap.appendChild(p); }
            p.textContent = msg;
          } else if (p) p.remove();
          return !!msg;
        }
        function validate() {
          var bad = false;
          if (nameInput) {
            var v = nameInput.value.trim();
            var msg = !v ? '数据源名称不能为空' : v.length > 64 ? '不能超过 64 个字符' :
              (!editing && MOCK_NAMES.indexOf(v) !== -1) ? '数据源名称已存在' : '';
            bad = fieldErr(nameInput, msg) || bad;
          }
          if (type !== 'csv') {
            var urlInput = inputs[2];
            if (urlInput) {
              var uv = urlInput.value.trim();
              var umsg = !uv ? '服务器地址不能为空' :
                (type !== 'ldap' && !/^https?:\/\/.+/.test(uv)) ? '请输入正确的 URL 地址' : '';
              bad = fieldErr(urlInput, umsg) || bad;
            }
          }
          if (type === 'ldap') {
            var portInput = inputs[3];
            if (portInput) {
              var pv = Number(portInput.value);
              bad = fieldErr(portInput, (pv < 1 || pv > 65535) ? '端口必须为 1-65535 之间的数字' : '') || bad;
            }
          }
          var testBtn = findBtn(panel, '测试连接');
          if (testBtn) testBtn.disabled = bad || test.state === 'loading';
          return !bad;
        }
        inputs.forEach(function (i) { i.addEventListener('input', function () { test.state = 'idle'; renderTest(); validate(); }); });

        // Switch（demo: Radix Switch data-state）
        $$('[role=switch]', panel).forEach(function (sw) {
          sw.addEventListener('click', function () {
            var on = sw.getAttribute('data-state') === 'checked';
            sw.setAttribute('data-state', on ? 'unchecked' : 'checked');
            sw.setAttribute('aria-checked', String(!on));
            var thumb = sw.querySelector('span');
            if (thumb) thumb.setAttribute('data-state', on ? 'unchecked' : 'checked');
          });
        });

        // 测试连接状态机（demo: 1.2s 随机 70% 成功；预览交替出结果，见比对表）
        var testBtn = findBtn(panel, '测试连接');
        function renderTest() {
          if (!testBtn) return;
          var row = testBtn.parentNode;
          var tag = row.querySelector('[data-spec-test-tag]');
          if (!tag) { tag = document.createElement('span'); tag.setAttribute('data-spec-test-tag', ''); row.appendChild(tag); }
          testBtn.textContent = test.state === 'loading' ? '测试中…' : '测试连接';
          if (test.state === 'ok') tag.innerHTML = '<span class="inline-flex items-center gap-1 text-xs text-green-600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"></path><path d="m9 11 3 3L22 4"></path></svg>连通正常</span>';
          else if (test.state === 'fail') tag.innerHTML = '<span class="inline-flex items-center gap-1 text-xs text-red-600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>连接失败：超时</span>';
          else if (test.state === 'loading') tag.innerHTML = '<span class="inline-flex items-center gap-1 text-xs text-gray-500">测试中…</span>';
          else tag.innerHTML = '';
        }
        if (testBtn) testBtn.addEventListener('click', function () {
          if (testBtn.disabled) return;
          test.state = 'loading'; renderTest(); validate();
          setTimeout(function () {
            test.state = test.flip ? 'fail' : 'ok'; test.flip = !test.flip;
            renderTest(); validate();
          }, 1200);
        });

        // 确定（demo: save()）
        var okBtn = $$('button', panel).filter(function (b) { return txt(b) === '确定'; })[0];
        if (okBtn) okBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!validate()) { toast('请修正表单中的校验错误'); return; }
          if (type !== 'csv' && test.state !== 'ok') { toast('请先完成连接测试并通过'); return; }
          toast(editing ? '数据源已更新' : '数据源已新增');
          var closer = $$('button', panel).filter(function (b) { return txt(b) === '取消'; })[0];
          if (closer) closer.click();
        });

        var cancel = $$('button', panel).filter(function (b) { return txt(b) === '取消'; })[0];
        var x = panel.querySelector('button .sr-only') ? panel.querySelector('button .sr-only').closest('button') : null;
        wireDismiss(preview, panel, [cancel, x]);
        validate();
      });
      if (panels.length > 1) showPanel(panels[0].getAttribute('data-swap-panel'));
    },

    /* ---- 删除确认（层级 5） ---- */
    'delete-confirm': function (preview) {
      var panel = preview.querySelector('[role=alertdialog]') || preview.firstElementChild;
      var cancel = $$('button', panel).filter(function (b) { return txt(b) === '取消'; })[0];
      var ok = findBtn(panel, '确认删除');
      wireDismiss(preview, panel, [cancel, ok], function (btn) {
        if (btn === ok) toast('数据源已删除');
      });
    },

    /* ---- 通讯录查询 L0 ---- */
    'book-table': function (preview) {
      var ft = wireTableFilter(preview);
      var filterBtn = findBtn(preview, '筛选');
      if (filterBtn) filterBtn.setAttribute('data-nav', './layer-1-source-filter.html');
      var exportBtn = findBtn(preview, '导出');
      var batchBar = preview.querySelector('[data-spec-batchbar]');
      var selected = new Set();

      function visibleCount() {
        return $$('tbody tr', preview).filter(function (tr) { return tr.style.display !== 'none'; }).length;
      }
      if (exportBtn) exportBtn.addEventListener('click', function () {
        toast('已生成导出任务，共 ' + visibleCount() + ' 条记录');
      });

      function setBox(box, on) {
        box.setAttribute('data-state', on ? 'checked' : 'unchecked');
        box.setAttribute('aria-checked', String(on));
        var ind = box.querySelector('[data-slot="checkbox-indicator"], span');
        if (on) {
          if (ind) { ind.style.display = ''; ind.setAttribute('data-state', 'checked'); }
          else {
            ind = document.createElement('span');
            ind.setAttribute('data-slot', 'checkbox-indicator');
            ind.className = 'flex items-center justify-center text-current transition-none';
            ind.setAttribute('data-state', 'checked');
            ind.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5"><path d="M20 6 9 17l-5-5"></path></svg>';
            box.appendChild(ind);
          }
        } else if (ind) ind.style.display = 'none';
      }
      function refreshBar() {
        if (!batchBar) return;
        batchBar.style.display = selected.size ? '' : 'none';
        var label = $$('span', batchBar).filter(function (s) { return /^已选 /.test(txt(s)); })[0];
        if (label) label.textContent = '已选 ' + selected.size + ' 条';
        var head = preview.querySelector('thead [role=checkbox]');
        if (head) {
          var rows = $$('tbody tr', preview);
          setBox(head, rows.length > 0 && rows.every(function (tr) { return selected.has(rowId(tr)); }));
        }
      }
      function rowId(tr) { return txt(tr.cells[3]); }

      $$('tbody tr', preview).forEach(function (tr) {
        var box = tr.querySelector('[role=checkbox]');
        if (box) box.addEventListener('click', function () {
          var id = rowId(tr), on = !selected.has(id);
          on ? selected.add(id) : selected.delete(id);
          setBox(box, on); refreshBar();
        });
        var user = $$('button', tr).filter(function (b) { return tr.cells[3].contains(b); })[0];
        if (user) user.setAttribute('data-nav', './layer-9-book-detail.html');
        var mark = findBtn(tr, '标记');
        if (mark && tr.cells[7] && tr.cells[7].contains(mark)) wireMarkMenu(preview, tr, mark);
      });
      var headBox = preview.querySelector('thead [role=checkbox]');
      if (headBox) headBox.addEventListener('click', function () {
        var rows = $$('tbody tr', preview);
        var all = rows.every(function (tr) { return selected.has(rowId(tr)); });
        rows.forEach(function (tr) {
          var id = rowId(tr), box = tr.querySelector('[role=checkbox]');
          all ? selected.delete(id) : selected.add(id);
          if (box) setBox(box, !all);
        });
        refreshBar();
      });

      // 批量操作栏按钮
      if (batchBar) {
        var confirmBox = preview.querySelector('[data-spec-batch-confirm]');
        var pendingTag = null;
        function openConfirm(tag) {
          pendingTag = tag;
          if (!confirmBox) return;
          confirmBox.style.display = '';
          var title = confirmBox.querySelector('h2, [data-slot="alert-dialog-title"]');
          if (title) title.textContent = tag === 'none'
            ? '取消选中的 ' + selected.size + ' 条记录的标记？'
            : '确定将选中的 ' + selected.size + ' 条记录标记为' + (tag === 'exec' ? '高管' : '关键岗位') + '吗？';
        }
        [['批量标记为高管', 'exec'], ['批量标记为关键岗位', 'key'], ['取消标记', 'none']].forEach(function (pair) {
          var b = findBtn(batchBar, pair[0]);
          if (b) b.addEventListener('click', function () { openConfirm(pair[1]); });
        });
        var exp2 = findBtn(batchBar, '导出选中');
        if (exp2) exp2.addEventListener('click', function () { toast('已生成导出任务，共 ' + selected.size + ' 条记录'); });
        var clear = findBtn(batchBar, '清空选择');
        if (clear) clear.addEventListener('click', function () {
          selected.clear();
          $$('tbody [role=checkbox]', preview).forEach(function (b) { setBox(b, false); });
          refreshBar();
        });
        if (confirmBox) {
          var cc = $$('button', confirmBox).filter(function (b) { return txt(b) === '取消'; })[0];
          var ok = $$('button', confirmBox).filter(function (b) { return txt(b) === '确定'; })[0];
          if (cc) cc.addEventListener('click', function () { confirmBox.style.display = 'none'; });
          if (ok) ok.addEventListener('click', function () {
            confirmBox.style.display = 'none';
            var n = selected.size;
            $$('tbody tr', preview).forEach(function (tr) {
              if (!selected.has(rowId(tr))) return;
              tr.cells[6].innerHTML = '';
              tr.cells[6].appendChild(makeTagCell(preview, pendingTag));
            });
            toast(pendingTag === 'none' ? '已取消 ' + n + ' 条记录的标记' : '成功标记 ' + n + ' 条记录');
            selected.clear();
            $$('tbody [role=checkbox]', preview).forEach(function (b) { setBox(b, false); });
            refreshBar();
          });
        }
      }
      wirePager(preview);
    },

    /* ---- 标记下拉（层级 7：菜单静置展示 + 可点） ---- */
    'mark-menu': function (preview) {
      var menu = preview.querySelector('[role=menu]');
      var row = preview.querySelector('tbody tr');
      if (!menu || !row) return;
      $$('[role=menuitem]', menu).forEach(function (item) {
        item.addEventListener('click', function () {
          var label = txt(item);
          var tag = label === '标记为高管' ? 'exec' : label === '标记为关键岗位' ? 'key' : 'none';
          row.cells[6].innerHTML = '';
          row.cells[6].appendChild(makeTagCell(preview, tag));
          toast(tag === 'none' ? '已取消标记' : '已标记为' + (tag === 'exec' ? '高管' : '关键岗位'));
        });
      });
    },

    /* ---- 批量确认（层级 8 子文件里的静置弹窗） ---- */
    'batch-confirm': function (preview) {
      var panel = preview.querySelector('[role=alertdialog]');
      if (!panel) return;
      var cancel = $$('button', panel).filter(function (b) { return txt(b) === '取消'; })[0];
      var ok = $$('button', panel).filter(function (b) { return txt(b) === '确定'; })[0];
      wireDismiss(preview, panel, [cancel, ok], function (btn) {
        if (btn === ok) toast('成功标记 3 条记录');
      });
    },

    /* ---- 人员详情抽屉（层级 9） ---- */
    'person-detail': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var x = panel.querySelector('.sr-only') ? panel.querySelector('.sr-only').closest('button') : null;
      wireDismiss(preview, panel, [x]);
    },

    /* ---- 同步日志详情抽屉（层级 10） ---- */
    'log-detail': function (preview) {
      var panel = preview.querySelector('[role=dialog]');
      if (!panel) return;
      var exp = findBtn(panel, '导出失败明细');
      if (exp) exp.addEventListener('click', function () { toast('已导出失败明细 CSV'); });
      var close = $$('button', panel).filter(function (b) { return txt(b) === '关闭'; })[0];
      var x = panel.querySelector('.sr-only') ? panel.querySelector('.sr-only').closest('button') : null;
      wireDismiss(preview, panel, [close, x]);
    },

    /* ---- 同步日志 L0 ---- */
    'log-table': function (preview) {
      wireTableFilter(preview);
      $$('tbody tr', preview).forEach(function (tr) {
        var d = findBtn(tr, '详情');
        if (d) d.setAttribute('data-nav', './layer-10-log-detail.html');
      });
      wirePager(preview);
    }
  };

  /* ---------- 行内同步状态机（demo syncRow 的确定性重放） ---------- */
  function runSyncMachine(preview, tr, syncBtn) {
    if (syncBtn.disabled) return;
    var statusCell = tr.cells[4];
    var prevStatus = statusCell.innerHTML;
    var prevBtn = syncBtn.innerHTML;
    var isMailSys = txt(tr.cells[1]) === '邮件系统'; // 捕获到的行：结果为 部分异常（2）
    syncBtn.disabled = true;
    syncBtn.classList.add('text-gray-400');
    syncBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide h-3.5 w-3.5 animate-spin"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>同步中';
    syncBtn.title = '该数据源正在同步中，请等待完成';
    var syncingBadge = cloneBadgeFrom(document, '正常');
    statusCell.innerHTML = '<span data-slot="badge" class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs w-fit whitespace-nowrap font-normal border-blue-200 bg-blue-50 text-blue-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide mr-1 h-3 w-3 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>同步中</span>';
    setTimeout(function () {
      syncBtn.disabled = false;
      syncBtn.classList.remove('text-gray-400');
      syncBtn.innerHTML = prevBtn;
      syncBtn.removeAttribute('title');
      if (isMailSys) {
        statusCell.innerHTML = '<span data-slot="badge" class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs w-fit whitespace-nowrap font-normal border-amber-200 bg-amber-50 text-amber-600">部分异常（2）</span>';
        toast('同步完成，存在 2 条失败记录');
      } else {
        statusCell.innerHTML = '<span data-slot="badge" class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs w-fit whitespace-nowrap font-normal border-green-200 bg-green-50 text-green-600">正常</span>';
        toast('同步成功');
      }
      var timeCell = tr.cells[6];
      if (timeCell) {
        var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
        timeCell.textContent = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      }
    }, 1500);
  }

  /* ---------- 分页器最小交互 ---------- */
  function wirePager(preview) {
    var jump = preview.querySelector('input[aria-label="前往页码"]');
    if (jump) {
      jump.addEventListener('input', function () { jump.value = jump.value.replace(/[^0-9]/g, ''); });
      jump.addEventListener('keydown', function (e) { if (e.key === 'Enter') { jump.value = ''; } });
    }
    var sizeCombo = $$('[role=combobox]', preview).filter(function (c) { return /条\/页/.test(txt(c)); })[0];
    if (sizeCombo) specSelect(sizeCombo, [10, 20, 50, 100].map(function (n) { return { v: n, l: n + ' 条/页' }; }), function () { });
  }

  /* ---------- 行内标记下拉（主文件 book-table 用；菜单模板取自捕获 DOM） ---------- */
  function wireMarkMenu(preview, tr, btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openMenu) { closeMenu(); return; }
      var tpl = document.querySelector('[data-spec-markmenu-template]');
      var menu = document.createElement('div');
      menu.style.cssText = 'position:absolute;z-index:999;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);padding:4px;font-size:14px;min-width:140px';
      ['标记为高管', '标记为关键岗位', '取消标记'].forEach(function (label) {
        var it = document.createElement('div');
        it.textContent = label;
        it.style.cssText = 'padding:6px 10px;border-radius:6px;cursor:pointer';
        it.onmouseenter = function () { it.style.background = '#f3f4f6'; };
        it.onmouseleave = function () { it.style.background = ''; };
        it.addEventListener('click', function (ev) {
          ev.stopPropagation(); closeMenu();
          var tag = label === '标记为高管' ? 'exec' : label === '标记为关键岗位' ? 'key' : 'none';
          tr.cells[6].innerHTML = '';
          tr.cells[6].appendChild(makeTagCell(preview, tag));
          toast(tag === 'none' ? '已取消标记' : '已标记为' + (tag === 'exec' ? '高管' : '关键岗位'));
        });
        menu.appendChild(it);
      });
      var r = btn.getBoundingClientRect();
      menu.style.left = (r.right + window.scrollX - 150) + 'px';
      menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
      document.body.appendChild(menu);
      openMenu = menu;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $$('.component-preview[data-preview]').forEach(function (preview) {
      var kind = preview.getAttribute('data-preview');
      if (INIT[kind]) try { INIT[kind](preview); } catch (e) { console.error('preview init failed:', kind, e); }
    });
  });
})();
