/*
 * spec-preview.js — drives the component previews extracted from the running demo.
 *
 * The markup inside `.component-preview` is verbatim demo DOM (Radix output). Radix's own
 * JS is absent here, so this engine reimplements exactly the state transitions that were
 * observed in the demo at http://localhost:3111/filter-rules/identity, and nothing more.
 *
 * Behaviours reproduced (verified against the demo, see the DOM-comparison tables):
 *   - Collapsible open/close
 *   - Switch checked/unchecked, plus the disabled coupling (enable=off -> observe forced off)
 *   - Observe mode: caches the action, swaps the Select for the read-only "允许（仅记录）" chip,
 *     shows the pulsing "观察中" tag, hides the high-risk warning
 *   - Action Select: opens a menu, honours `disabled`, re-renders the value with its colour dot
 *   - High-risk warning: shown iff !observe && action in (reject|drop)
 *   - Policy template: click a non-active template -> confirm Dialog; confirming switches the
 *     template (and forces observe mode on for `strict`) but DOES NOT rewrite the per-protocol
 *     actions — this matches the demo, see §9 diff #2
 *   - Protocol Selects are disabled unless the template is `custom`
 *   - Tabs + flow-diagram nodes both drive the active protocol panel
 *   - Flow node label/colour tracks its protocol's primary action
 *   - Config-health panel visible iff (spf.fail==drop || spf.softfail==drop || !observeMode)
 */
(function () {
  'use strict'

  var ICON_WARN = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>'
  var ICON_INFO = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>'

  var DOT = { block: 'bg-red-500', drop: 'bg-black', quarantine: 'bg-yellow-500', tag: 'bg-blue-500', next: 'bg-gray-300' }

  // Option sets exactly as rendered by the demo's <SelectContent> blocks.
  var OPTIONS = {
    base: [
      { v: 'pass', l: '允许（进行下一步检测）' },
      { v: 'quarantine', l: '隔离/审核' },
      { v: 'reject', l: '阻断并退信' },
      { v: 'drop', l: '静默丢弃' },
    ],
    spf: [
      { v: 'block', l: '阻断（返回5xx）' }, { v: 'drop', l: '丢弃（静默删除）' },
      { v: 'quarantine', l: '隔离（进垃圾箱）' }, { v: 'tag', l: '标记（加头投递）' },
      { v: 'next', l: '进行下一步检测' },
    ],
    dkim: [
      { v: 'block', l: '阻断（返回5xx）' }, { v: 'drop', l: '丢弃（静默删除）' },
      { v: 'quarantine', l: '隔离（进垃圾箱）' }, { v: 'tag', l: '标记（加头投递）' },
      { v: 'next', l: '进行下一步检测' },
    ],
    // DMARC has no "next" option in the demo.
    dmarc: [
      { v: 'block', l: '阻断（返回5xx）' }, { v: 'drop', l: '丢弃（静默删除）' },
      { v: 'quarantine', l: '隔离（进垃圾箱）' }, { v: 'tag', l: '标记（加头投递）' },
    ],
    ptr: [
      { v: 'block', l: '阻断（返回5xx）' }, { v: 'drop', l: '丢弃（静默删除）' },
      { v: 'quarantine', l: '隔离（进垃圾箱）' }, { v: 'tag', l: '标记（加头投递）' },
      { v: 'next', l: '执行下一步检测' },
    ],
  }

  var CARD_WARNING = {
    empty: '注意：拒绝空信封将导致无法接收退信通知（Bounce），可能导致退信风暴和邮件队列堆积。建议仅在严格内网环境使用。',
    format: '高风险动作：建议先开启观察模式测试影响范围',
    envelope: '代发服务注意：如使用代发服务或企业有邮件列表转发，建议选择"隔离"或"允许"，避免误判合法代发邮件。',
  }

  var TEMPLATE_LABEL = { loose: '宽松', standard: '标准', strict: '严格', custom: '自定义' }
  var TEMPLATE_BADGE = { loose: '宽松模式', standard: '标准模式', strict: '严格模式', custom: '自定义模式' }
  var TEMPLATE_BADGE_CLS = {
    loose: 'bg-green-100 text-green-700', standard: 'bg-blue-100 text-blue-700',
    strict: 'bg-orange-100 text-orange-700', custom: 'bg-gray-100 text-gray-700',
  }
  var TEMPLATE_BTN_CLS = {
    loose: 'text-green-600 bg-green-50', standard: 'text-blue-600 bg-blue-50',
    strict: 'text-orange-600 bg-orange-50', custom: 'text-gray-600 bg-gray-50',
  }
  var TEMPLATE_DESC = {
    loose: '宽松模式：仅拦截明确伪造，兼容老旧系统，丢弃动作使用极少',
    standard: '标准模式：平衡安全与业务，明确伪造使用阻断/丢弃，疑似伪造使用隔离',
    strict: '严格模式：零信任策略，大量使用丢弃动作，适用于金融/政务等高安全场景',
    custom: '自定义模式：完全手动控制，脱离模板保护，需自行评估风险',
  }

  // Row index -> logical key, per protocol panel.
  var ROW_KEYS = {
    spf: ['fail', 'softfail', 'none', 'temperror'],
    dkim: ['fail', 'neutral', 'partial', 'none'],
    dmarc: ['reject', 'quarantine', 'none'],
    ptr: ['norecord', 'temperror', 'ehlomismatch', 'amismatch'],
  }

  // ---------------- generic widgets ----------------

  function setSwitch(el, on) {
    el.setAttribute('aria-checked', on ? 'true' : 'false')
    el.setAttribute('data-state', on ? 'checked' : 'unchecked')
    var thumb = el.querySelector('[data-slot="switch-thumb"]')
    if (thumb) thumb.setAttribute('data-state', on ? 'checked' : 'unchecked')
  }
  var isOn = function (el) { return el.getAttribute('data-state') === 'checked' }

  function setDisabled(el, off) {
    if (off) { el.setAttribute('disabled', ''); el.setAttribute('data-disabled', '') }
    else { el.removeAttribute('disabled'); el.removeAttribute('data-disabled') }
  }

  function renderValue(trig, v) {
    var opts = OPTIONS[trig.dataset.opts] || []
    var opt = opts.filter(function (o) { return o.v === v })[0]
    if (!opt) return
    var span = trig.querySelector('[data-slot="select-value"]')
    span.innerHTML = trig.dataset.opts === 'base'
      ? opt.l
      : '<span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ' + DOT[opt.v] + '"></span>' + opt.l + '</span>'
    trig.dataset.value = v
  }

  function closeMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.spec-select-menu'), function (m) { m.remove() })
  }
  document.addEventListener('click', closeMenus)

  function wireSelect(trig, onChange) {
    trig.addEventListener('click', function (e) {
      e.stopPropagation()
      if (trig.hasAttribute('disabled')) return
      var wasOpen = trig.__menu && document.body.contains(trig.__menu)
      closeMenus()
      if (wasOpen) return
      var menu = document.createElement('div')
      menu.className = 'spec-select-menu'
      OPTIONS[trig.dataset.opts].forEach(function (o) {
        var b = document.createElement('button')
        b.type = 'button'
        b.innerHTML = (trig.dataset.opts === 'base' ? '' : '<span class="dot ' + DOT[o.v] + '" style="background:' + dotColor(o.v) + '"></span>') + '<span>' + o.l + '</span>'
        b.addEventListener('click', function (ev) {
          ev.stopPropagation()
          renderValue(trig, o.v)
          closeMenus()
          if (onChange) onChange(o.v)
        })
        menu.appendChild(b)
      })
      var host = trig.closest('.component-preview')
      var hr = host.getBoundingClientRect(), tr = trig.getBoundingClientRect()
      menu.style.left = (tr.left - hr.left + host.scrollLeft) + 'px'
      menu.style.top = (tr.bottom - hr.top + host.scrollTop + 4) + 'px'
      host.appendChild(menu)
      trig.__menu = menu
    })
  }
  function dotColor(v) {
    return { block: '#ef4444', drop: '#000', quarantine: '#eab308', tag: '#3b82f6', next: '#d1d5db' }[v] || '#999'
  }

  function wireCollapsible(root) {
    var trig = root.querySelector('[data-slot="collapsible-trigger"]')
    var body = root.querySelector('[data-slot="collapsible-content"]')
    if (!trig || !body) return
    trig.addEventListener('click', function () {
      var open = root.getAttribute('data-state') !== 'closed'
      var next = open ? 'closed' : 'open'
      root.setAttribute('data-state', next)
      trig.setAttribute('data-state', next)
      trig.setAttribute('aria-expanded', String(!open))
      body.setAttribute('data-state', next)
    })
  }

  function amberBox(icon, text) {
    var d = document.createElement('div')
    d.className = 'flex items-start gap-2 p-2 bg-amber-50 rounded border border-amber-200 ml-12'
    d.innerHTML = icon + '<p class="text-xs text-amber-700">' + text + '</p>'
    return d
  }

  // ---------------- 基础格式检查 ----------------

  function initBasicFormat(preview) {
    var root = preview.querySelector('[data-preview="basic-format"]')
    if (!root) return
    wireCollapsible(root)

    Array.prototype.forEach.call(root.querySelectorAll('[data-card]'), function (card) {
      var key = card.dataset.card
      var enable = card.querySelector('[data-role="enable"]')
      var observe = card.querySelector('[data-role="observe"]')
      var trig = card.querySelector('[data-role="action-select"]')
      var actionRow = card.querySelector('[data-role="action-row"]')
      var nameSpan = card.querySelector('[data-role="check-name"]')
      var bodyParts = card.querySelectorAll('[data-body-part]')

      // The demo keeps the pre-observe action in a cached state field; mirror it.
      card.dataset.prevAction = trig ? trig.dataset.value : ''

      var readonly = document.createElement('div')
      readonly.className = 'flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded text-sm text-muted-foreground'
      readonly.textContent = '允许（仅记录）'
      readonly.hidden = true
      if (actionRow) actionRow.appendChild(readonly)

      var tag = document.createElement('span')
      tag.className = 'flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs'
      tag.innerHTML = '<span class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>观察中'
      tag.hidden = true
      if (nameSpan && nameSpan.parentElement) nameSpan.parentElement.appendChild(tag)

      var observeNote = amberBox(ICON_INFO, '观察模式已开启，本规则仅记录不阻断')
      observeNote.hidden = true
      card.appendChild(observeNote)

      // Reuse the demo's own warning node when it was rendered; otherwise create one.
      var warn = card.querySelector('[data-role="risk-warning"]')
      if (!warn) {
        warn = amberBox(ICON_WARN, CARD_WARNING[key])
        warn.setAttribute('data-role', 'risk-warning')
        if (actionRow && actionRow.nextSibling) card.insertBefore(warn, actionRow.nextSibling)
        else card.appendChild(warn)
      }
      warn.setAttribute('data-body-part', '1')
      observeNote.setAttribute('data-body-part', '1')
      bodyParts = card.querySelectorAll('[data-body-part]')

      function sync() {
        var on = isOn(enable)
        var obs = isOn(observe)
        Array.prototype.forEach.call(bodyParts, function (n) { n.hidden = !on })
        setDisabled(observe, !on)
        tag.hidden = !(on && obs)
        if (trig) trig.hidden = obs
        readonly.hidden = !obs
        observeNote.hidden = !(on && obs)
        var v = trig ? trig.dataset.value : ''
        warn.hidden = !(on && !obs && (v === 'reject' || v === 'drop'))
      }

      enable.addEventListener('click', function () {
        var next = !isOn(enable)
        setSwitch(enable, next)
        if (!next && isOn(observe)) { setSwitch(observe, false) } // demo: disabling the check clears observe
        sync()
      })
      observe.addEventListener('click', function () {
        if (observe.hasAttribute('disabled')) return
        var next = !isOn(observe)
        if (next) card.dataset.prevAction = trig.dataset.value
        else renderValue(trig, card.dataset.prevAction)
        setSwitch(observe, next)
        sync()
      })
      if (trig) wireSelect(trig, sync)
      sync()
    })
  }

  // ---------------- 认证协议检查 ----------------

  function initAuthProtocol(preview) {
    var root = preview.querySelector('[data-preview="auth-protocol"]')
    if (!root) return
    wireCollapsible(root)

    var state = {
      template: 'standard',
      observe: false,
      tab: 'spf',
      actions: { spf: {}, dkim: {}, dmarc: {}, ptr: {} },
    }

    var panels = {}
    Array.prototype.forEach.call(root.querySelectorAll('[data-role="tabpanel"]'), function (p) {
      panels[p.dataset.panel] = p
      Array.prototype.forEach.call(p.querySelectorAll('[data-role="action-select"]'), function (trig, i) {
        var proto = p.dataset.panel
        state.actions[proto][ROW_KEYS[proto][i]] = trig.dataset.value
        wireSelect(trig, function (v) {
          state.actions[proto][ROW_KEYS[proto][i]] = v
          render()
        })
      })
    })

    var tabs = root.querySelectorAll('[data-role="tab"]')
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () { state.tab = t.dataset.tab; render() })
    })
    var flowNodes = root.querySelectorAll('[data-role="flow-node"]')
    Array.prototype.forEach.call(flowNodes, function (n) {
      n.addEventListener('click', function () {
        if (n.dataset.node === 'pipeline' || n.dataset.node === 'next') return
        state.tab = n.dataset.node
        render()
      })
    })

    var gObs = root.querySelector('[data-role="observe-global"]')
    gObs.addEventListener('click', function () { state.observe = !state.observe; render() })

    var obsChip = document.createElement('div')
    obsChip.className = 'flex items-center gap-2 px-2 py-1 bg-amber-100 rounded text-xs text-amber-700'
    obsChip.innerHTML = '<span class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>预计丢弃: 23'
    obsChip.hidden = true
    gObs.parentElement.parentElement.appendChild(obsChip)

    var health = root.querySelector('[data-role="health-panel"]')

    // The demo only mounts this red banner when spf.fail === 'drop'; pre-create it hidden.
    if (panels.spf && !panels.spf.querySelector('[data-role="risk-warning"]')) {
      var spfWarn = document.createElement('div')
      spfWarn.setAttribute('data-role', 'risk-warning')
      spfWarn.className = 'flex items-start gap-2 p-3 bg-red-50 rounded border border-red-200'
      spfWarn.innerHTML = ICON_WARN.replace(/text-amber-600/, 'text-red-600') +
        '<p class="text-xs text-red-700">高风险：SPF硬拒绝设置为丢弃，邮件将永久丢失且发送方无感知。建议先开启观察模式验证影响面。</p>'
      spfWarn.hidden = true
      panels.spf.firstElementChild.appendChild(spfWarn)
    }

    Array.prototype.forEach.call(root.querySelectorAll('[data-role="template"]'), function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.template === state.template) return // demo: clicking the active template is a no-op
        openTemplateDialog(b.dataset.template)
      })
    })

    function openTemplateDialog(pending) {
      var overlay = document.createElement('div')
      overlay.className = 'spec-dialog-overlay'
      overlay.setAttribute('role', 'dialog')
      var strictWarn = pending === 'strict'
        ? '<div class="flex items-start gap-2 p-3 bg-amber-50 rounded border border-amber-200">' + ICON_WARN + '<p class="text-xs text-amber-700">严格模式包含多处"丢弃"动作，切换后将强制开启观察模式至少2小时</p></div>'
        : ''
      overlay.innerHTML =
        '<div class="spec-dialog">' +
        '<h2 class="text-lg font-semibold">确认切换策略模板？</h2>' +
        '<p class="text-sm text-muted-foreground" style="margin:.5rem 0 1rem">即将从 ' + TEMPLATE_LABEL[state.template] + ' 模式 切换到 ' + TEMPLATE_LABEL[pending] + ' 模式</p>' +
        '<div class="p-3 bg-gray-50 rounded-lg" style="margin-bottom:.75rem"><p class="text-sm font-medium" style="margin-bottom:.5rem">模板说明</p>' +
        '<p class="text-xs text-muted-foreground">' + TEMPLATE_DESC[pending] + '</p></div>' +
        strictWarn +
        '<div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">' +
        '<button data-act="cancel" class="h-9 px-4 rounded-md border text-sm">取消</button>' +
        '<button data-act="confirm" class="h-9 px-4 rounded-md text-sm bg-primary text-primary-foreground">确认切换</button>' +
        '</div></div>'
      overlay.addEventListener('click', function (e) { e.stopPropagation() })
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', function () { overlay.remove() })
      overlay.querySelector('[data-act="confirm"]').addEventListener('click', function () {
        state.template = pending
        // demo: strict forces observe mode on; per-protocol actions are NOT rewritten (see §9 diff #2)
        if (pending === 'strict') state.observe = true
        overlay.remove()
        render()
      })
      preview.appendChild(overlay)
    }

    function render() {
      // template buttons
      Array.prototype.forEach.call(root.querySelectorAll('[data-role="template"]'), function (b) {
        var active = b.dataset.template === state.template
        b.className = 'px-3 py-1.5 rounded text-sm transition-all ' +
          (active ? TEMPLATE_BTN_CLS[b.dataset.template] + ' font-medium shadow-sm' : 'hover:bg-gray-100')
      })
      // observe switch + chip
      setSwitch(gObs, state.observe)
      obsChip.hidden = !state.observe

      // tabs & panels
      Array.prototype.forEach.call(tabs, function (t) {
        var on = t.dataset.tab === state.tab
        t.setAttribute('data-state', on ? 'active' : 'inactive')
        t.setAttribute('aria-selected', String(on))
      })
      Object.keys(panels).forEach(function (k) {
        var on = k === state.tab
        panels[k].setAttribute('data-state', on ? 'active' : 'inactive')
        if (on) panels[k].removeAttribute('hidden'); else panels[k].setAttribute('hidden', '')
      })

      // per-panel badge + select disabled state (demo: editable only under `custom`)
      Object.keys(panels).forEach(function (k) {
        var badge = panels[k].querySelector('[data-role="template-badge"]')
        if (badge) {
          badge.textContent = TEMPLATE_BADGE[state.template]
          badge.className = 'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 border-transparent ' + TEMPLATE_BADGE_CLS[state.template]
        }
        Array.prototype.forEach.call(panels[k].querySelectorAll('[data-role="action-select"]'), function (trig) {
          setDisabled(trig, state.template !== 'custom')
        })
        var rw = panels[k].querySelector('[data-role="risk-warning"]')
        if (k === 'spf' && rw) rw.hidden = state.actions.spf.fail !== 'drop'
      })

      // flow diagram: node label + colour follow that protocol's primary action
      var flowSpec = {
        spf: { v: state.actions.spf.fail, base: 'bg-blue-100', text: 'text-blue-700' },
        dkim: { v: state.actions.dkim.fail, base: 'bg-green-100', text: 'text-green-700' },
        dmarc: { v: state.actions.dmarc.reject, base: 'bg-purple-100', text: 'text-purple-700' },
        ptr: { v: state.actions.ptr.ehlomismatch, base: 'bg-orange-100', text: 'text-orange-700', plain: '检查' },
      }
      Array.prototype.forEach.call(flowNodes, function (n) {
        var id = n.dataset.node
        var ring = state.tab === id ? ' ring-2 ring-blue-500 ring-offset-2' : ''
        if (!flowSpec[id]) {
          n.className = 'px-3 py-2 rounded-lg text-center min-w-[70px] transition-all bg-gray-200' + ring
          return
        }
        var f = flowSpec[id]
        var drop = f.v === 'drop'
        var sub = f.plain
          ? (drop ? '丢弃' : f.plain)
          : (drop ? '丢弃' : f.v === 'block' ? '阻断' : '隔离')
        n.className = 'px-3 py-2 rounded-lg text-center min-w-[70px] transition-all ' + (drop ? 'bg-black text-white' : f.base) + ring
        var tcls = drop ? 'text-white' : f.text
        n.innerHTML = '<div class="text-xs font-medium ' + tcls + '">' + id.toUpperCase() + '</div>' +
          '<div class="text-[10px] mt-0.5 ' + tcls + ' opacity-70">' + sub + '</div>'
      })

      // config-health panel
      var a = state.actions
      var show = a.spf.fail === 'drop' || a.spf.softfail === 'drop' || !state.observe
      if (health) {
        health.hidden = !show
        renderHealthRows(health, a)
      }
    }

    function renderHealthRows(panel, a) {
      Array.prototype.forEach.call(panel.querySelectorAll('[data-health-row]'), function (n) { n.remove() })
      if (a.spf.softfail === 'drop') {
        var r1 = document.createElement('div')
        r1.setAttribute('data-health-row', '')
        r1.className = 'flex items-start gap-2 p-2 bg-white rounded border border-amber-300'
        r1.innerHTML = '<span class="text-amber-600">!</span><div class="flex-1">' +
          '<p class="text-xs text-amber-800">高风险：SPF软拒绝设置为丢弃</p>' +
          '<p class="text-xs text-muted-foreground">软拒绝(~all)可能是过渡配置，直接丢弃可能误杀合法邮件</p></div>' +
          '<div class="flex gap-1"><button data-fix="quarantine" class="h-6 text-xs px-2 rounded border">改为隔离</button>' +
          '<button data-fix="tag" class="h-6 text-xs px-2 rounded border">改为标记</button></div>'
        r1.querySelectorAll('[data-fix]').forEach(function (b) {
          b.addEventListener('click', function () {
            var v = b.dataset.fix
            state.actions.spf.softfail = v
            var trig = panels.spf.querySelectorAll('[data-role="action-select"]')[1]
            renderValue(trig, v)
            render()
          })
        })
        panel.appendChild(r1)
      }
      if (!state.observe && (a.spf.fail === 'drop' || a.dmarc.reject === 'drop')) {
        var r2 = document.createElement('div')
        r2.setAttribute('data-health-row', '')
        r2.className = 'flex items-center gap-2 p-2 bg-white rounded border border-blue-300'
        r2.innerHTML = '<p class="text-xs text-muted-foreground flex-1">当前配置包含"丢弃"动作，建议开启观察模式验证影响面</p>' +
          '<button data-fix-observe class="h-6 text-xs px-2 rounded border">开启观察模式</button>'
        r2.querySelector('[data-fix-observe]').addEventListener('click', function () { state.observe = true; render() })
        panel.appendChild(r2)
      }
    }

    render()
  }

  // ---------------- 模块启用/禁用 ----------------

  function initModuleToggle(preview) {
    var sw = preview.querySelector('[data-role="module-enable"]')
    var body = preview.querySelector('[data-role="module-body"]')
    if (!sw || !body) return
    sw.addEventListener('click', function () {
      var next = !isOn(sw)
      setSwitch(sw, next)
      body.classList.toggle('opacity-50', !next)
      body.classList.toggle('pointer-events-none', !next)
    })
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('.component-preview'), function (p) {
      initBasicFormat(p)
      initAuthProtocol(p)
      initModuleToggle(p)
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
