/*
 * stats-preview.js — 驱动「统计报表」四个页面 html_spec 的可交互预览。
 *
 * 这四个页面是图表密集型（recharts）。图表在预览里是从 demo 运行态提取的真实 SVG —— 它不能在
 * 无数据的静态页里重算。因此交互采用「真实状态快照切换」：每个 UI 状态（方向=外发、视角=威胁等级、
 * 维度=发信认证、行展开…）都在 demo 里点开后单独抓了一份完整 DOM，预览把它们全部嵌入并按需切换。
 * 点击预览里的任意按钮，看到的就是 demo 在该状态下的真实渲染（含真实 SVG 图表），不是模拟。
 * 这一点在每层的 DOM 比对表里都如实标注为「多状态合并」。
 *
 * 用法：
 *   <div class="component-preview" data-preview="swap" data-swap-map='{"外发":"outbound"}'>
 *     <div data-swap-panel="all">…demo 在「全部」状态下的真实 DOM…</div>
 *     <div data-swap-panel="outbound" hidden>…demo 在「外发」状态下的真实 DOM…</div>
 *   </div>
 * 引擎把所有面板里、文案命中 map 的按钮都绑上切换；面板自带的按钮因此能互相跳转。
 */
(function () {
  'use strict';

  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function txt(el) { return (el.innerText || el.textContent || '').trim(); }

  function initSwap(preview) {
    var map;
    try { map = JSON.parse(preview.getAttribute('data-swap-map') || '{}'); } catch (e) { map = {}; }
    var panels = $$('[data-swap-panel]', preview);
    if (!panels.length) return;

    function show(key) {
      var found = false;
      panels.forEach(function (p) {
        var on = p.getAttribute('data-swap-panel') === key;
        p.hidden = !on;
        if (on) found = true;
      });
      if (!found) return;
      // 同步激活态：命中当前 key 的按钮加 active 标记（demo 用 data-state / 背景色表达，
      // 这里的快照本身已经带着正确的激活态，所以只需要显示对应面板即可）
      preview.setAttribute('data-swap-current', key);
    }

    panels.forEach(function (p, i) { p.hidden = i !== 0; });
    preview.setAttribute('data-swap-current', panels[0].getAttribute('data-swap-panel'));

    // 状态切换条（规格文档自己的控件，不是 demo DOM）：
    // demo 里有些触发器只存在于某一个状态内（如「返回全球」只在下钻态、图例只在图表卡内），
    // 光靠面板自带的按钮会进不去/回不来。这条控件保证任意状态都能直达。
    var bar = document.createElement('div');
    bar.className = 'spec-swap-bar';
    bar.innerHTML = '<span>状态：</span>';
    panels.forEach(function (p) {
      var key = p.getAttribute('data-swap-panel');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.getAttribute('data-swap-label') || key;
      b.setAttribute('data-swap-to', key);
      b.addEventListener('click', function () {
        show(key);
        bar.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
      if (key === panels[0].getAttribute('data-swap-panel')) b.classList.add('active');
      bar.appendChild(b);
    });
    preview.insertBefore(bar, preview.firstChild);

    Object.keys(map).forEach(function (label) {
      $$('button, [role="tab"], tr[data-swap-trigger]', preview).forEach(function (b) {
        var t = txt(b);
        if (t === label || (label.length > 1 && t.indexOf(label) === 0)) {
          b.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            show(map[label]);
          });
        }
      });
    });

    // 行展开：表格首行点击 → 展开态面板（若 map 里声明了 __row）
    if (map.__row) {
      $$('tbody tr', preview).forEach(function (tr, i) {
        if (i > 0) return;
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function () { show(map.__row); });
      });
    }
  }

  // 图例点击：demo 的图例是 button，点了会隐藏对应序列。预览里我们有「隐藏后」的真实快照，
  // 用 data-swap-map 声明即可；这里只处理没有快照的情况——给出视觉反馈（半透明），并标注说明。
  function initLegendHint(preview) {
    $$('[data-legend-hint] button', preview).forEach(function (b) {
      b.addEventListener('click', function () {
        b.style.opacity = b.style.opacity === '0.4' ? '1' : '0.4';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $$('.component-preview').forEach(function (p) {
      try {
        if (p.getAttribute('data-preview') === 'swap') initSwap(p);
        initLegendHint(p);
      } catch (e) {
        console.error('[stats-preview]', e);
      }
    });
  });
})();
