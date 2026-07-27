/*
 * disposal-preview.js — drives the component previews of the 邮件处置 html_spec modules.
 *
 * The markup inside `.component-preview` is verbatim DOM extracted from the running demo
 * (http://localhost:3100/email-handling/*). Radix's runtime is absent here, so this file
 * reimplements exactly the state transitions that were observed by clicking through the
 * demo, and nothing more. Every behaviour below was verified in the demo and is recorded
 * in the DOM-comparison tables of the corresponding layer.
 *
 * Reproduced behaviours
 *   [search]   高级筛选 展开/收起；示例提示词点击填入；重置；邮件类型多选 Popover（含已选条件 chips）；
 *              更多筛选条件（27 字段）展开/收起 + 条件组 AND/OR 切换 + 添加/删除条件
 *   [table]    行勾选 / 全选；「已选 N 条」；批量按钮启用规则（放行=选中含隔离中|待审核；删除=选中含可删状态；
 *              召回=选中含投递成功 且 选中数 ≤10；导出/找相似=选中数≥1，找相似≤10）；表头筛选 Popover；
 *              放行/删除/召回确认弹窗（含改判下拉）；确认后行状态徽标与「已纠正」角标更新；找相似样本态
 *   [detail]   收件人矩阵勾选（仅可操作收件人有复选框）+ 批量操作栏 + 批量结果弹窗；邮件原文 纯文本/HTML/源码 切换；
 *              链接/附件 Tab 切换；展开完整信息；更多操作下拉；发信人加黑/加白弹窗
 *   [settings] Tab 切换；分类通知复选框 → 置信度阈值显隐；通知频率=从不 → 通知时间点整块隐藏；
 *              时间点/邮箱 chip 增删；部门树展开-折叠-勾选（选父含子、半选态）；收信人组搜索；
 *              审核时长 不限时长/自定义 → 自定义分钟数显隐；开关 → 「当前状态：已启用/已禁用」联动
 */
(function () {
  'use strict';

  var CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5"><path d="M20 6 9 17l-5-5"></path></svg>';
  var MINUS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus size-3.5"><path d="M5 12h14"></path></svg>';
  var X_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x w-3 h-3"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function txt(el) { return (el && el.textContent || '').trim(); }

  /* ---------------- checkbox (radix data-state driven) ---------------- */
  function isChecked(cb) { return cb.getAttribute('data-state') === 'checked'; }
  function setChecked(cb, state) {
    // state: true | false | 'indeterminate'
    var s = state === 'indeterminate' ? 'indeterminate' : (state ? 'checked' : 'unchecked');
    cb.setAttribute('data-state', s);
    cb.setAttribute('aria-checked', state === 'indeterminate' ? 'mixed' : String(!!state));
    var ind = cb.querySelector('[data-slot="checkbox-indicator"]');
    if (s === 'unchecked') { if (ind) ind.remove(); return; }
    if (!ind) {
      ind = document.createElement('span');
      ind.setAttribute('data-slot', 'checkbox-indicator');
      ind.className = 'flex items-center justify-center text-current transition-none';
      cb.appendChild(ind);
    }
    ind.innerHTML = s === 'indeterminate' ? MINUS_SVG : CHECK_SVG;
  }

  /* ---------------- switch ---------------- */
  function bindSwitches(root) {
    $$('[data-slot="switch"]', root).forEach(function (sw) {
      sw.addEventListener('click', function () {
        if (sw.disabled) return;
        var on = sw.getAttribute('data-state') === 'checked';
        sw.setAttribute('data-state', on ? 'unchecked' : 'checked');
        sw.setAttribute('aria-checked', String(!on));
        var thumb = sw.querySelector('[data-slot="switch-thumb"]');
        if (thumb) thumb.setAttribute('data-state', on ? 'unchecked' : 'checked');
        var status = sw.closest('.space-y-3');
        if (status) {
          var p = $$('p', status).filter(function (n) { return /当前状态：/.test(n.textContent); })[0];
          if (p) p.textContent = '当前状态：' + (on ? '已禁用' : '已启用');
        }
        // 用户权限表：关闭开关 → 有效天数输入禁用
        var tr = sw.closest('tr');
        if (tr) {
          var input = tr.querySelector('input[type="number"]');
          if (input) input.disabled = on;
        }
      });
    });
  }

  /* ---------------- generic popover (embedded copy of the demo's PopoverContent) ------- */
  function bindPopover(trigger, content) {
    if (!trigger || !content) return;
    content.classList.add('spec-popover');
    content.hidden = true;
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !content.hidden;
      $$('.spec-popover', trigger.closest('.component-preview')).forEach(function (p) { p.hidden = true; });
      content.hidden = open;
      if (!open) {
        var tr = trigger.getBoundingClientRect();
        var pr = trigger.closest('.component-preview').getBoundingClientRect();
        content.style.top = (tr.bottom - pr.top + 4) + 'px';
        content.style.left = Math.min(tr.left - pr.left, pr.width - 240) + 'px';
      }
    });
    document.addEventListener('click', function (e) {
      if (!content.contains(e.target) && e.target !== trigger) content.hidden = true;
    });
  }

  /* ---------------- in-preview dialog ---------------- */
  function openDialog(preview, tplId) {
    var tpl = $('#' + tplId, preview);
    if (!tpl) return null;
    closeDialog(preview);
    var wrap = document.createElement('div');
    wrap.className = 'spec-dialog-overlay';
    wrap.innerHTML = tpl.innerHTML;
    preview.appendChild(wrap);
    // the hidden template may have been walked by an earlier bindSelects() pass; the copy
    // inherits its "already bound" marker, which would make the live dialog's Select inert.
    $$('[data-spec-bound]', wrap).forEach(function (el) { el.removeAttribute('data-spec-bound'); });
    $$('button', wrap).forEach(function (b) {
      var t = txt(b);
      if (t === '取消' || b.getAttribute('data-slot') === 'dialog-close') {
        b.addEventListener('click', function () { closeDialog(preview); });
      }
    });
    bindSelects(wrap);
    return wrap;
  }
  function closeDialog(preview) {
    var d = $('.spec-dialog-overlay', preview);
    if (d) d.remove();
  }

  /* ---------------- select (radix Select is portaled in the demo; rebuilt here) -------- */
  function bindSelects(root) {
    $$('[data-slot="select-trigger"]', root).forEach(function (trg) {
      if (trg.dataset.specBound) return;
      trg.dataset.specBound = '1';
      var optSrc = trg.getAttribute('data-spec-options');
      trg.addEventListener('click', function (e) {
        e.stopPropagation();
        $$('.spec-select-menu').forEach(function (m) { m.remove(); });
        var opts = [];
        if (optSrc) {
          var holder = document.getElementById(optSrc);
          if (holder) {
            opts = $$('[role="option"], [data-slot="select-item"]', holder).map(function (o) {
              return { label: txt(o), disabled: o.getAttribute('data-disabled') != null || o.getAttribute('aria-disabled') === 'true' };
            });
          }
        }
        if (!opts.length) return;
        var menu = document.createElement('div');
        menu.className = 'spec-select-menu';
        opts.forEach(function (o) {
          var b = document.createElement('button');
          b.textContent = o.label;
          if (o.disabled) { b.disabled = true; b.style.opacity = '.5'; b.style.fontWeight = '600'; }
          b.addEventListener('click', function () {
            var val = trg.querySelector('[data-slot="select-value"]');
            if (val) val.textContent = o.label;
            menu.remove();
            trg.dispatchEvent(new CustomEvent('spec:change', { bubbles: true, detail: { label: o.label } }));
          });
          menu.appendChild(b);
        });
        // when the trigger lives inside an in-preview dialog, the menu must be mounted on the
        // dialog layer — the overlay (z-index 60) would otherwise swallow the clicks.
        var host = trg.closest('.spec-dialog-overlay') || trg.closest('.component-preview') || document.body;
        var tr = trg.getBoundingClientRect();
        var pr = host.getBoundingClientRect();
        menu.style.top = (tr.bottom - pr.top + 4) + 'px';
        menu.style.left = (tr.left - pr.left) + 'px';
        menu.style.minWidth = tr.width + 'px';
        menu.style.zIndex = '80';
        host.appendChild(menu);
        setTimeout(function () {
          document.addEventListener('click', function h() { menu.remove(); document.removeEventListener('click', h); });
        }, 0);
      });
    });
  }

  /* =====================================================================================
   *  搜索与筛选区（CompactSearchFilters）
   * ===================================================================================*/
  function initSearch(preview) {
    var input = $('input[placeholder^="描述邮件特征"]', preview);
    var advPanel = $('.mt-4.pt-4.border-t', preview);      // 高级筛选面板
    var advBtn = $$('button', preview).filter(function (b) { return /收起|高级筛选/.test(txt(b)); })[0];
    var moreBtn = $$('button', preview).filter(function (b) { return /更多筛选条件/.test(txt(b)); })[0];
    var moreBox = moreBtn && moreBtn.closest('.mt-4.pt-4') ? $('.mt-4.space-y-4', moreBtn.closest('.mt-4.pt-4')) : null;
    var chipsBar = null;

    // 示例提示词
    $$('button.text-gray-500', preview).forEach(function (b) {
      if (!input) return;
      var t = txt(b);
      if (!t || t.length < 4) return;
      b.addEventListener('click', function () { input.value = t; input.classList.add('border-blue-500'); });
    });

    // 高级筛选 展开/收起
    if (advBtn && advPanel) {
      advBtn.addEventListener('click', function () {
        var hidden = advPanel.hidden = !advPanel.hidden;
        advBtn.childNodes.forEach(function (n) {
          if (n.nodeType === 3 && n.textContent.trim()) n.textContent = hidden ? '高级筛选' : '收起';
        });
      });
    }

    // 更多筛选条件（默认收起）
    if (moreBtn && moreBox) {
      moreBox.hidden = true;
      moreBtn.addEventListener('click', function () { moreBox.hidden = !moreBox.hidden; });
      // 条件组 AND/OR 切换
      $$('button', moreBox).forEach(function (b) {
        if (/^(AND|OR)$/.test(txt(b))) {
          b.addEventListener('click', function () { b.textContent = txt(b) === 'AND' ? 'OR' : 'AND'; });
        }
      });
    }

    // 已选条件 chips
    function renderChips() {
      var conds = [];
      var typeTrigger = $('[data-spec-mailtype-trigger]', preview);
      if (typeTrigger) {
        var checked = $$('[data-spec-mailtype] [data-slot="checkbox"][data-state="checked"]', preview);
        var names = checked.map(function (cb) { return txt(cb.parentNode); });
        if (names.length) conds.push({ id: 'mailType', label: '邮件类型: ' + names.join(', ') });
        var span = typeTrigger.querySelector('span');
        if (span) span.textContent = names.length ? names.join(', ') : '全部';
      }
      ['发信人', '收信人', '主题', 'IP归属地'].forEach(function (lab) {
        var wrap = $$('label', preview).filter(function (l) { return txt(l) === lab; })[0];
        var inp = wrap && wrap.parentNode.querySelector('input');
        if (inp && inp.value.trim()) conds.push({ id: lab, label: lab + ': ' + inp.value.trim() });
      });
      if (!chipsBar) {
        chipsBar = document.createElement('div');
        chipsBar.className = 'flex items-center gap-2 mt-2 flex-wrap spec-chips';
        var host = $('.bg-white.rounded-lg.border', preview) || preview;
        host.appendChild(chipsBar);
      }
      chipsBar.innerHTML = '';
      if (!conds.length) { chipsBar.hidden = true; return; }
      chipsBar.hidden = false;
      var lbl = document.createElement('span');
      lbl.className = 'text-xs text-gray-500';
      lbl.textContent = '已选条件:';
      chipsBar.appendChild(lbl);
      conds.forEach(function (c) {
        var b = document.createElement('span');
        b.className = 'h-6 px-2 text-xs gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md inline-flex items-center';
        b.innerHTML = c.label + ' <button class="hover:text-blue-900 ml-0.5">' + X_SVG + '</button>';
        b.querySelector('button').addEventListener('click', function () {
          if (c.id === 'mailType') {
            $$('[data-spec-mailtype] [data-slot="checkbox"]', preview).forEach(function (cb) { setChecked(cb, false); });
          } else {
            var wrap = $$('label', preview).filter(function (l) { return txt(l) === c.id; })[0];
            var inp = wrap && wrap.parentNode.querySelector('input');
            if (inp) inp.value = '';
          }
          renderChips();
        });
        chipsBar.appendChild(b);
      });
      var clear = document.createElement('button');
      clear.className = 'text-xs text-gray-500 hover:text-red-600';
      clear.textContent = '清空';
      clear.addEventListener('click', resetAll);
      chipsBar.appendChild(clear);
    }

    // 邮件类型多选 Popover
    var mtTrigger = $('[data-spec-mailtype-trigger]', preview);
    var mtContent = $('[data-spec-mailtype]', preview);
    if (mtTrigger && mtContent) {
      bindPopover(mtTrigger, mtContent);
      $$('[data-slot="checkbox"]', mtContent).forEach(function (cb) {
        var row = cb.parentNode;
        row.addEventListener('click', function (e) {
          e.stopPropagation();
          setChecked(cb, !isChecked(cb));
          renderChips();
        });
      });
      var allBtn = $$('button', mtContent).filter(function (b) { return txt(b) === '全部'; })[0];
      if (allBtn) allBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        $$('[data-slot="checkbox"]', mtContent).forEach(function (cb) { setChecked(cb, false); });
        renderChips();
      });
    }

    $$('input', preview).forEach(function (i) { i.addEventListener('input', renderChips); });

    function resetAll() {
      $$('input', preview).forEach(function (i) { if (i.type !== 'radio') i.value = ''; });
      if (mtContent) $$('[data-slot="checkbox"]', mtContent).forEach(function (cb) { setChecked(cb, false); });
      $$('[data-slot="select-value"]', preview).forEach(function (v) { if (!/选择值|选择字段/.test(txt(v))) v.textContent = '全部'; });
      renderChips();
    }
    var resetBtn = $$('button', preview).filter(function (b) { return txt(b) === '重置'; })[0];
    if (resetBtn) resetBtn.addEventListener('click', resetAll);

    bindSelects(preview);
  }

  /* =====================================================================================
   *  日志表格（InvestigationLogsTable）
   * ===================================================================================*/
  var RELEASABLE = ['隔离中', '待审核'];
  var DELETABLE = ['隔离中', '待审核', '投递成功', '投递失败', '召回失败'];
  var RECALLABLE = ['投递成功'];

  function initTable(preview) {
    var table = $('table', preview);
    if (!table) return;
    var rows = $$('tbody tr', table);
    var headCb = $('thead [data-slot="checkbox"]', table);
    var toolbar = $('.flex.items-center.justify-between', preview);
    var btn = {};
    $$('button', toolbar).forEach(function (b) {
      var t = txt(b);
      if (/查找相似/.test(t)) btn.similar = b;
      else if (t === '放行') btn.release = b;
      else if (t === '删除') btn.del = b;
      else if (t === '召回') btn.recall = b;
      else if (t === '导出') btn.export = b;
    });
    var countBox = toolbar ? $('.flex.items-center.gap-2.pl-4', toolbar) : null;
    var selectedLabel = document.createElement('span');
    selectedLabel.className = 'text-sm text-gray-600 spec-selected-count';
    if (countBox) countBox.insertBefore(selectedLabel, countBox.firstChild);

    function statusOf(tr) {
      var cells = $$('td', tr);
      var cell = cells[cells.length - 2];
      return txt(cell);
    }
    function selectedRows() { return rows.filter(function (tr) { return isChecked($('[data-slot="checkbox"]', tr)); }); }

    function setBtn(b, enabled, cls) {
      if (!b) return;
      b.disabled = !enabled;
      if (!cls) return;
      var apply = function (list, on) {
        (list || '').split(/\s+/).filter(Boolean).forEach(function (c) { b.classList.toggle(c, on); });
      };
      apply(cls.on, enabled);
      apply(cls.off, !enabled);
    }

    function refresh() {
      var sel = selectedRows();
      var st = sel.map(statusOf);
      selectedLabel.textContent = sel.length ? '已选 ' + sel.length + ' 条' : '';
      setBtn(btn.similar, sel.length > 0 && sel.length <= 10, { on: 'text-blue-600 border-blue-300', off: '' });
      setBtn(btn.release, st.some(function (s) { return RELEASABLE.indexOf(s) >= 0; }),
        { on: 'bg-green-500 text-white', off: 'bg-gray-200 text-gray-400' });
      setBtn(btn.del, st.some(function (s) { return DELETABLE.indexOf(s) >= 0; }),
        { on: 'bg-red-500 text-white', off: 'bg-gray-200 text-gray-400' });
      setBtn(btn.recall, sel.length > 0 && sel.length <= 10 && st.some(function (s) { return RECALLABLE.indexOf(s) >= 0; }),
        { on: 'bg-orange-500 text-white', off: 'bg-gray-200 text-gray-400' });
      setBtn(btn.export, sel.length > 0, { on: 'text-gray-600 border-gray-300', off: '' });
      if (headCb) setChecked(headCb, sel.length === 0 ? false : (sel.length === rows.length ? true : 'indeterminate'));
    }

    rows.forEach(function (tr) {
      var cb = $('[data-slot="checkbox"]', tr);
      if (cb) cb.addEventListener('click', function () { setChecked(cb, !isChecked(cb)); refresh(); });
    });
    if (headCb) headCb.addEventListener('click', function () {
      var all = selectedRows().length === rows.length;
      rows.forEach(function (tr) { setChecked($('[data-slot="checkbox"]', tr), !all); });
      refresh();
    });

    // 表头筛选 Popover（邮件状态 / 收发类型 / 邮件类型）
    var hf = $('[data-spec-headerfilter]', preview);
    var hfTrigger = $$('thead button', table).filter(function (b) { return /邮件状态/.test(txt(b)); })[0];
    if (hf && hfTrigger) {
      bindPopover(hfTrigger, hf);
      $$('[data-slot="checkbox"]', hf).forEach(function (cb) {
        cb.addEventListener('click', function () { setChecked(cb, !isChecked(cb)); });
      });
    }

    // 处置弹窗
    function bindDialog(button, tplId, onConfirm) {
      if (!button) return;
      button.addEventListener('click', function () {
        if (button.disabled) return;
        var dlg = openDialog(preview, tplId);
        if (!dlg) return;
        var confirm = $$('button', dlg).filter(function (b) { return /^确认/.test(txt(b)); })[0];
        if (confirm) confirm.addEventListener('click', function () {
          var finalType = txt($('[data-slot="select-value"]', dlg) || {});
          onConfirm(selectedRows(), finalType);
          closeDialog(preview);
          rows.forEach(function (tr) { setChecked($('[data-slot="checkbox"]', tr), false); });
          refresh();
        });
      });
    }
    function setStatus(tr, label, cls) {
      var cells = $$('td', tr);
      var span = cells[cells.length - 2].querySelector('span');
      if (span) { span.textContent = label; span.className = 'px-2 py-0.5 rounded text-xs font-medium ' + cls; }
    }
    function markCorrected(tr, finalType) {
      if (!finalType || /暂不改判/.test(finalType)) return;
      var cells = $$('td', tr);
      var typeCell = cells[cells.length - 3];
      typeCell.innerHTML = '<span class="inline-flex items-center gap-1"><span>' + finalType + '</span>' +
        '<span class="h-4 px-1 gap-0.5 text-[10px] font-normal border border-green-300 text-green-700 bg-green-50 rounded inline-flex items-center" title="人工改判后类型">已纠正</span></span>';
    }
    bindDialog(btn.release, 'dlg-release', function (sel, ft) {
      sel.forEach(function (tr) {
        if (RELEASABLE.indexOf(statusOf(tr)) < 0) return;
        setStatus(tr, '投递成功', 'bg-green-100 text-green-800');
        markCorrected(tr, ft);
      });
    });
    bindDialog(btn.del, 'dlg-delete', function (sel) {
      sel.forEach(function (tr) {
        if (DELETABLE.indexOf(statusOf(tr)) < 0) return;
        setStatus(tr, '已删除', 'bg-red-100 text-red-800');
      });
    });
    bindDialog(btn.recall, 'dlg-recall', function (sel, ft) {
      sel.forEach(function (tr) {
        if (RECALLABLE.indexOf(statusOf(tr)) < 0) return;
        setStatus(tr, '召回成功', 'bg-green-100 text-green-800');
        markCorrected(tr, ft);
      });
    });

    // 找相似（样本态）：切换到 demo 中「显示相似度列 + 检索摘要」的实际 DOM
    var sampleTpl = $('#tpl-similar-table', preview);
    if (sampleTpl) {
      $$('tbody button', table).filter(function (b) { return txt(b) === '找相似'; }).forEach(function (b) {
        b.addEventListener('click', function () {
          var host = table.closest('.space-y-3') || preview;
          var restore = host.innerHTML;
          host.innerHTML = sampleTpl.innerHTML;
          var clear = $$('button', host).filter(function (x) { return /清除样本|清除筛选/.test(txt(x)); })[0];
          var back = document.createElement('button');
          back.className = 'mt-2 text-xs text-blue-600 underline';
          back.textContent = '← 清除样本（回到层级 0）';
          back.addEventListener('click', function () { host.innerHTML = restore; initTable(preview); });
          host.appendChild(back);
        });
      });
    }

    refresh();
    bindSelects(preview);
  }

  /* =====================================================================================
   *  详情抽屉（概览与处置 / 收件人矩阵 / 邮件原文 / 实体）
   * ===================================================================================*/
  function initDetail(preview) {
    // 邮件原文 纯文本 / HTML / 源码
    var views = { '纯文本': 'text', 'HTML': 'html', '源码': 'raw' };
    var contentBox = $('[data-spec-content-box]', preview);
    Object.keys(views).forEach(function (label) {
      var b = $$('button', preview).filter(function (x) { return txt(x) === label; })[0];
      if (!b || !contentBox) return;
      b.addEventListener('click', function () {
        $$('[data-spec-content]', contentBox).forEach(function (n) { n.hidden = n.getAttribute('data-spec-content') !== views[label]; });
        Object.keys(views).forEach(function (l2) {
          var b2 = $$('button', preview).filter(function (x) { return txt(x) === l2; })[0];
          if (b2) b2.classList.toggle('bg-secondary', l2 === label);
        });
      });
    });

    // 链接 / 附件 Tab
    var linkBtn = $$('button', preview).filter(function (b) { return /^链接 \(/.test(txt(b)); })[0];
    var attBtn = $$('button', preview).filter(function (b) { return /^附件 \(/.test(txt(b)); })[0];
    var linkPane = $('[data-spec-entity="links"]', preview);
    var attPane = $('[data-spec-entity="attachments"]', preview);
    if (linkBtn && attBtn && linkPane && attPane) {
      attPane.hidden = true;
      linkBtn.addEventListener('click', function () { linkPane.hidden = false; attPane.hidden = true; });
      attBtn.addEventListener('click', function () { linkPane.hidden = true; attPane.hidden = false; });
    }

    // 展开完整信息
    var expandBtn = $$('button', preview).filter(function (b) { return /展开完整信息|收起/.test(txt(b)); })[0];
    var fullBox = $('[data-spec-fullcontext]', preview);
    if (expandBtn && fullBox) {
      fullBox.hidden = true;
      expandBtn.addEventListener('click', function () {
        fullBox.hidden = !fullBox.hidden;
        expandBtn.childNodes.forEach(function (n) {
          if (n.nodeType === 3 && n.textContent.trim()) n.textContent = fullBox.hidden ? '展开完整信息' : '收起';
        });
      });
    }

    // 更多操作下拉
    var moreBtn = $$('button', preview).filter(function (b) { return /^更多/.test(txt(b)); })[0];
    var moreMenu = $('[data-spec-moremenu]', preview);
    if (moreBtn && moreMenu) bindPopover(moreBtn, moreMenu);

    // 发信人加黑 / 加白 / 投递确认
    [['发信人加黑', 'dlg-blacklist'], ['发信人加白', 'dlg-whitelist'], ['投递', 'dlg-deliver'], ['丢弃', 'dlg-discard']].forEach(function (pair) {
      var b = $$('button', preview).filter(function (x) { return txt(x) === pair[0]; })[0];
      if (b && $('#' + pair[1], preview)) b.addEventListener('click', function () { openDialog(preview, pair[1]); });
    });

    // 收件人矩阵：勾选 → 批量操作栏
    var matrix = $('[data-spec-matrix]', preview);
    if (matrix) {
      var bar = $('[data-spec-batchbar]', preview);
      if (bar) bar.hidden = true;
      var boxes = $$('[data-slot="checkbox"]', matrix);
      function refreshBar() {
        var n = boxes.filter(isChecked).length;
        if (!bar) return;
        bar.hidden = n === 0;
        var lab = bar.querySelector('span');
        if (lab) lab.textContent = '已选中 ' + n + ' 个收件人';
      }
      boxes.forEach(function (cb) {
        cb.addEventListener('click', function () { setChecked(cb, !isChecked(cb)); refreshBar(); });
      });
      if (bar) {
        $$('button', bar).forEach(function (b) {
          var t = txt(b);
          b.addEventListener('click', function () {
            if (t === '取消') { boxes.forEach(function (cb) { setChecked(cb, false); }); refreshBar(); return; }
            if (/批量/.test(t)) openDialog(preview, 'dlg-batch-result');
          });
        });
      }
      refreshBar();
    }
    bindSelects(preview);
  }

  /* =====================================================================================
   *  处置设置（Tabs / 分类通知 / 通知范围 / 审核 / 召回）
   * ===================================================================================*/
  function initSettings(preview) {
    // Tabs
    var tabs = $$('[role="tab"]', preview);
    var panels = $$('[role="tabpanel"]', preview);
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x, j) {
          x.setAttribute('data-state', i === j ? 'active' : 'inactive');
          x.setAttribute('aria-selected', String(i === j));
        });
        panels.forEach(function (p, j) {
          p.setAttribute('data-state', i === j ? 'active' : 'inactive');
          p.hidden = i !== j;
        });
      });
    });
    panels.forEach(function (p, i) { p.hidden = i !== 0; });

    // 分类通知：复选框 → 置信度阈值显隐
    var scoreTpl = $('#tpl-score-inputs', preview);
    $$('[data-spec-typerow]', preview).forEach(function (row) {
      var cb = $('[data-slot="checkbox"]', row);
      var label = $$('span', row).filter(function (s) { return /^(通知|不通知)$/.test(txt(s)); })[0];
      if (!cb) return;
      cb.addEventListener('click', function () {
        var on = !isChecked(cb);
        setChecked(cb, on);
        if (label) label.textContent = on ? '通知' : '不通知';
        var box = $('[data-spec-score]', row);
        if (on && !box && scoreTpl) {
          var d = document.createElement('div');
          d.innerHTML = scoreTpl.innerHTML;
          var node = d.firstElementChild;
          node.setAttribute('data-spec-score', '');
          row.appendChild(node);
        } else if (box) {
          box.hidden = !on;
        }
      });
    });

    // 通知频率 = 从不 → 隐藏通知时间点
    var freqTrigger = $('[data-spec-freq]', preview);
    var timeBox = $('[data-spec-timepoints]', preview);
    if (freqTrigger && timeBox) {
      freqTrigger.addEventListener('spec:change', function (e) {
        timeBox.hidden = e.detail.label === '从不';
      });
    }

    // 通知时间点 chip 增删
    var addTimeBtn = timeBox ? $$('button', timeBox)[0] : null;
    var timeInput = timeBox ? $('input[type="time"]', timeBox) : null;
    var chipHost = timeBox ? $('.flex.flex-wrap.gap-2', timeBox) : null;
    if (addTimeBtn && timeInput && chipHost) {
      addTimeBtn.addEventListener('click', function () {
        var v = timeInput.value;
        if (!v) return;
        var exists = $$('span', chipHost).some(function (s) { return txt(s) === v; });
        if (exists) return;
        var chip = document.createElement('div');
        chip.className = 'flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md text-sm';
        chip.innerHTML = '<span>' + v + '</span><button class="hover:text-blue-900" type="button">' + X_SVG + '</button>';
        chip.querySelector('button').addEventListener('click', function () { chip.remove(); });
        chipHost.appendChild(chip);
        timeInput.value = '';
      });
    }
    $$('[data-spec-timepoints] .flex.flex-wrap.gap-2 button, [data-spec-emails] button.hover\\:text-blue-900', preview).forEach(function (b) {
      b.addEventListener('click', function () { var c = b.parentNode; if (c) c.remove(); });
    });

    // 管理员邮箱 chip 添加
    var emailBox = $('[data-spec-emails]', preview);
    if (emailBox) {
      var emailInput = $('input[type="email"]', emailBox.parentNode) || $('input[type="email"]', preview);
      var addBtn = $$('button', emailBox.parentNode).filter(function (b) { return txt(b) === '添加'; })[0];
      if (emailInput && addBtn) {
        addBtn.addEventListener('click', function () {
          var v = (emailInput.value || '').trim();
          if (!v || !/@/.test(v)) return;
          var dup = $$('span', emailBox).some(function (s) { return txt(s) === v; });
          if (dup) return;
          var chip = document.createElement('div');
          chip.className = 'flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md text-sm';
          chip.innerHTML = '<span>' + v + '</span><button class="ml-1 hover:text-blue-900" type="button">' + X_SVG + '</button>';
          chip.querySelector('button').addEventListener('click', function () { chip.remove(); });
          emailBox.appendChild(chip);
          emailInput.value = '';
        });
      }
    }

    // 审核时长：不限时长 → 隐藏自定义分钟数
    var customBox = $('[data-spec-custom-minutes]', preview);
    var radioUnlimited = $('#review-unlimited', preview);
    var radioCustom = $('#review-custom', preview);
    function setRadio(group, active) {
      group.forEach(function (r) {
        r.setAttribute('data-state', r === active ? 'checked' : 'unchecked');
        r.setAttribute('aria-checked', String(r === active));
        var ind = r.querySelector('[data-slot="radio-group-indicator"]');
        if (ind) ind.style.visibility = r === active ? 'visible' : 'hidden';
      });
    }
    if (radioUnlimited && radioCustom && customBox) {
      [radioUnlimited, radioCustom].forEach(function (r) {
        r.addEventListener('click', function () {
          setRadio([radioUnlimited, radioCustom], r);
          customBox.hidden = r === radioUnlimited;
        });
      });
    }
    // 其他 RadioGroup（召回策略）
    $$('[data-slot="radio-group"]', preview).forEach(function (g) {
      var items = $$('[data-slot="radio-group-item"]', g);
      items.forEach(function (r) {
        r.addEventListener('click', function () { setRadio(items, r); });
      });
    });

    // 部门树：展开/折叠 + 勾选（选父含子、半选）
    var tree = $('[data-spec-depttree]', preview);
    if (tree) {
      $$('button.p-0\\.5', tree).forEach(function (b) {
        b.addEventListener('click', function () {
          var node = b.closest('div').parentNode;
          var children = node.querySelector(':scope > div:nth-child(2)');
          var svg = b.querySelector('svg');
          if (children) {
            children.hidden = !children.hidden;
            if (svg) svg.classList.toggle('rotate-90', !children.hidden);
          }
        });
      });
      $$('[data-slot="checkbox"]', tree).forEach(function (cb) {
        cb.addEventListener('click', function () {
          var on = !isChecked(cb);
          setChecked(cb, on);
          var node = cb.closest('div').parentNode;
          $$('[data-slot="checkbox"]', node).forEach(function (c) { setChecked(c, on); });
        });
      });
    }

    // 收信人组搜索
    var groupSearch = $('input[placeholder="搜索收信人组"]', preview);
    if (groupSearch) {
      groupSearch.addEventListener('input', function () {
        var q = groupSearch.value.trim();
        var list = groupSearch.closest('.rounded-lg');
        $$('label', list).forEach(function (l) {
          l.hidden = q !== '' && txt(l).indexOf(q) < 0;
        });
      });
    }
    $$('[data-slot="checkbox"]', preview).forEach(function (cb) {
      if (cb.dataset.specBound) return;
      if (cb.closest('[data-spec-typerow]') || cb.closest('[data-spec-depttree]')) return;
      cb.dataset.specBound = '1';
      cb.addEventListener('click', function () { setChecked(cb, !isChecked(cb)); });
    });

    bindSwitches(preview);
    bindSelects(preview);
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    $$('.component-preview').forEach(function (p) {
      var kind = p.getAttribute('data-preview');
      try {
        if (kind === 'search') initSearch(p);
        else if (kind === 'table') initTable(p);
        else if (kind === 'detail') initDetail(p);
        else if (kind === 'settings') initSettings(p);
        else { bindSwitches(p); bindSelects(p); }
      } catch (e) {
        console.error('[spec-preview] ' + kind + ':', e);
      }
    });
  });
})();
