/* ==== admin-users 模块 · 可交互预览行为（自包含，事件委托） ====
   支持：Tab 切换 / 抽屉·弹窗开关 / 复选框(含三态联动) / 单选(含条件显隐) /
   下拉 Select（点开选项、选中回填）/ 状态徽章切换 / 批量操作栏显隐。
   复刻 demo 的前端状态机，不调用真实后端。 */
(function () {
  "use strict";

  function closeSelMenus(except) {
    document.querySelectorAll(".cp-selmenu").forEach(function (m) {
      if (m !== except) m.hidden = true;
    });
  }

  document.addEventListener("click", function (e) {
    // ---- Tab 切换 ----
    var tab = e.target.closest("[data-tab]");
    if (tab) {
      var tg = tab.closest("[data-tabs]");
      tg.querySelectorAll("[data-tab]").forEach(function (b) {
        b.setAttribute("data-state", b === tab ? "active" : "inactive");
      });
      tg.querySelectorAll("[data-panel]").forEach(function (p) {
        p.hidden = p.getAttribute("data-panel") !== tab.getAttribute("data-tab");
      });
      return;
    }
    // ---- 打开抽屉/弹窗 ----
    var op = e.target.closest("[data-open]");
    if (op) {
      var m = document.getElementById(op.getAttribute("data-open"));
      if (m) m.hidden = false;
      return;
    }
    // ---- 关闭抽屉/弹窗 ----
    var cl = e.target.closest("[data-close]");
    if (cl) {
      var mm = cl.closest("[data-modal]");
      if (mm) mm.hidden = true;
      return;
    }
    // 点遮罩空白关闭
    if (e.target.matches("[data-modal]")) { e.target.hidden = true; return; }

    // ---- 复选框（含 module 三态联动 / 批量栏显隐） ----
    var cb = e.target.closest("[data-check]");
    if (cb && !cb.hasAttribute("data-disabled")) {
      var st = cb.getAttribute("data-state");
      cb.setAttribute("data-state", st === "checked" ? "unchecked" : "checked");
      // 一级模块 checkbox：联动其下二级
      var groupKey = cb.getAttribute("data-modgroup");
      if (groupKey) {
        var on = cb.getAttribute("data-state") === "checked";
        document.querySelectorAll('[data-modchild="' + groupKey + '"]').forEach(function (c) {
          c.setAttribute("data-state", on ? "checked" : "unchecked");
        });
      }
      // 二级模块 checkbox：回写一级三态
      var parentKey = cb.getAttribute("data-modchild");
      if (parentKey) {
        var kids = document.querySelectorAll('[data-modchild="' + parentKey + '"]');
        var checked = 0;
        kids.forEach(function (c) { if (c.getAttribute("data-state") === "checked") checked++; });
        var head = document.querySelector('[data-modgroup="' + parentKey + '"]');
        if (head) head.setAttribute("data-state", checked === 0 ? "unchecked" : (checked === kids.length ? "checked" : "indeterminate"));
      }
      // 批量操作栏
      var cg = cb.closest("[data-checkgroup]");
      if (cg) {
        var any = cg.querySelector("[data-rowcheck][data-state=checked]");
        var bar = cg.querySelector("[data-batchbar]");
        if (bar) {
          bar.hidden = !any;
          var cnt = cg.querySelectorAll("[data-rowcheck][data-state=checked]").length;
          var lab = bar.querySelector("[data-selcount]");
          if (lab) lab.textContent = cnt;
        }
      }
      return;
    }

    // ---- 单选（含条件显隐） ----
    var rb = e.target.closest("[data-radio]");
    if (rb && !rb.hasAttribute("data-disabled")) {
      var rgp = rb.closest("[data-radiogroup]");
      rgp.querySelectorAll("[data-radio]").forEach(function (r) {
        r.setAttribute("aria-checked", r === rb ? "true" : "false");
      });
      var showon = rgp.querySelector("[data-showon]");
      if (showon) showon.hidden = rb.getAttribute("data-radio") === "none";
      return;
    }

    // ---- 状态徽章切换（正常 ⇄ 异常）----
    var badge = e.target.closest("[data-toggle-status]");
    if (badge) {
      var ok = badge.classList.contains("ok");
      badge.classList.toggle("ok", !ok);
      badge.classList.toggle("bad", ok);
      badge.textContent = ok ? "异常" : "正常";
      return;
    }

    // ---- 下拉 Select ----
    var opt = e.target.closest("[data-selopt]");
    if (opt) {
      var menu = opt.closest("[data-selmenu]");
      var forKey = menu.getAttribute("data-selmenu");
      var trg = document.querySelector('[data-sel="' + forKey + '"]');
      if (trg) {
        var val = trg.querySelector("[data-selval]");
        if (val) val.textContent = opt.textContent.trim();
      }
      menu.hidden = true;
      return;
    }
    var sel = e.target.closest("[data-sel]");
    if (sel && !sel.hasAttribute("data-disabled")) {
      var mn = document.querySelector('[data-selmenu="' + sel.getAttribute("data-sel") + '"]');
      closeSelMenus(mn);
      if (mn) mn.hidden = !mn.hidden;
      return;
    }
    // 点其他地方关闭下拉
    closeSelMenus(null);
  });
})();
