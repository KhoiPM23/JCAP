/* @ds-bundle: {"format":4,"namespace":"JCAP","components":[{"name":"Logo"},{"name":"Icon"},{"name":"Button"},{"name":"IconButton"},{"name":"TextField"},{"name":"Select"},{"name":"Switch"},{"name":"SegmentedControl"},{"name":"JlptBadge"},{"name":"CreditBadge"},{"name":"Badge"},{"name":"Alert"},{"name":"Toast"},{"name":"Tabs"},{"name":"Stepper"},{"name":"AppHeader"},{"name":"SideNav"},{"name":"BottomNav"},{"name":"Card"},{"name":"ScenarioCard"},{"name":"ShadowingCard"},{"name":"Table"},{"name":"ProgressBar"},{"name":"QuotaMeter"},{"name":"ScoreRing"},{"name":"EmptyState"},{"name":"Skeleton"},{"name":"Modal"},{"name":"Drawer"},{"name":"MicButton"},{"name":"AudioPlayer"},{"name":"JpText"},{"name":"ChatBubble"},{"name":"WordDiff"},{"name":"FeedbackItem"}]} */
(function () {
  'use strict';
  var R = window.React;
  var h = R.createElement;
  var F = R.Fragment;
  var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef, useId = R.useId || function () { var r = useRef('jc' + Math.random().toString(36).slice(2, 8)); return r.current; };

  function cx() { var o = []; for (var i = 0; i < arguments.length; i++) { if (arguments[i]) o.push(arguments[i]); } return o.join(' '); }
  function omit(p, keys) { var o = {}; for (var k in p) { if (keys.indexOf(k) < 0) o[k] = p[k]; } return o; }
  function useCtl(value, def, onChange) {
    var s = useState(def);
    var ctl = value !== undefined;
    return [ctl ? value : s[0], function (v) { if (!ctl) s[1](v); if (onChange) onChange(v); }];
  }
  function fmt(n) { return typeof n === 'number' ? n.toLocaleString('vi-VN') : n; }

  /* ---------- Icon ---------- */
  function Icon(p) {
    var size = p.size || 20;
    return h('span', {
      className: cx('jc-icon material-symbols-rounded', p.spin && 'jc-spin', p.className),
      style: Object.assign({ fontSize: size + 'px', width: size + 'px', height: size + 'px', fontVariationSettings: "'FILL' " + (p.fill ? 1 : 0) + ", 'wght' 400, 'GRAD' 0, 'opsz' " + Math.min(48, Math.max(20, size)) }, p.style),
      'aria-hidden': p.label ? undefined : 'true',
      role: p.label ? 'img' : undefined,
      'aria-label': p.label
    }, p.name);
  }

  /* ---------- Button ---------- */
  function Button(p) {
    var variant = p.variant || 'secondary', size = p.size || 'md';
    var rest = omit(p, ['variant', 'size', 'icon', 'iconRight', 'loading', 'block', 'children', 'className']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('jc-btn', 'jc-btn--' + variant, 'jc-btn--' + size, p.block && 'jc-btn--block', p.loading && 'is-loading', p.className),
      disabled: p.disabled || p.loading,
      'aria-busy': p.loading ? 'true' : undefined
    }),
      p.loading ? h(Icon, { name: 'progress_activity', spin: true, size: 18 }) : (p.icon ? h(Icon, { name: p.icon, size: 20 }) : null),
      p.children ? h('span', { className: 'jc-btn__label' }, p.children) : null,
      p.iconRight && !p.loading ? h(Icon, { name: p.iconRight, size: 20 }) : null
    );
  }

  function IconButton(p) {
    var rest = omit(p, ['icon', 'label', 'variant', 'size', 'active', 'className', 'fill']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('jc-iconbtn', 'jc-iconbtn--' + (p.variant || 'ghost'), 'jc-iconbtn--' + (p.size || 'md'), p.active && 'is-active', p.className),
      'aria-label': p.label, title: p.label, 'aria-pressed': p.active === undefined ? undefined : !!p.active
    }), h(Icon, { name: p.icon, size: p.size === 'sm' ? 18 : 22, fill: p.fill || p.active }));
  }

  /* ---------- Forms ---------- */
  function Field(p) {
    return h('div', { className: cx('jc-field', p.error && 'has-error', p.className) },
      p.label ? h('label', { className: 'jc-field__label', htmlFor: p.id }, p.label, p.required ? h('span', { className: 'jc-field__req', 'aria-hidden': 'true' }, ' *') : null) : null,
      p.children,
      p.error ? h('p', { className: 'jc-field__error', id: p.id + '-msg' }, h(Icon, { name: 'error', size: 16 }), p.error)
        : p.hint ? h('p', { className: 'jc-field__hint', id: p.id + '-msg' }, p.hint) : null
    );
  }

  function TextField(p) {
    var autoId = useId(); var id = p.id || autoId;
    var show = useState(false);
    var isPw = p.type === 'password';
    var rest = omit(p, ['label', 'hint', 'error', 'icon', 'className', 'multiline', 'rows', 'type', 'trailing', 'id']);
    var inputProps = Object.assign({}, rest, {
      id: id, className: 'jc-input__el', 'aria-invalid': p.error ? 'true' : undefined,
      'aria-describedby': (p.error || p.hint) ? id + '-msg' : undefined
    });
    var el = p.multiline ? h('textarea', Object.assign(inputProps, { rows: p.rows || 3 }))
      : h('input', Object.assign(inputProps, { type: isPw && show[0] ? 'text' : (p.type || 'text') }));
    return h(Field, { id: id, label: p.label, hint: p.hint, error: p.error, required: p.required, className: p.className },
      h('div', { className: cx('jc-input', p.multiline && 'jc-input--multi', p.disabled && 'is-disabled') },
        p.icon ? h(Icon, { name: p.icon, size: 20, className: 'jc-input__icon' }) : null,
        el,
        isPw ? h('button', { type: 'button', className: 'jc-input__toggle', onClick: function () { show[1](!show[0]); }, 'aria-label': show[0] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu' }, h(Icon, { name: show[0] ? 'visibility_off' : 'visibility', size: 20 })) : null,
        p.trailing || null
      ));
  }

  function Select(p) {
    var autoId = useId(); var id = p.id || autoId;
    var rest = omit(p, ['label', 'hint', 'error', 'options', 'className', 'id', 'placeholder']);
    return h(Field, { id: id, label: p.label, hint: p.hint, error: p.error, required: p.required, className: p.className },
      h('div', { className: 'jc-input jc-select' },
        h('select', Object.assign({}, rest, { id: id, className: 'jc-input__el', 'aria-invalid': p.error ? 'true' : undefined }),
          p.placeholder ? h('option', { value: '', disabled: true }, p.placeholder) : null,
          (p.options || []).map(function (o) { var v = typeof o === 'string' ? o : o.value; return h('option', { key: v, value: v, disabled: o.disabled }, typeof o === 'string' ? o : o.label); })),
        h(Icon, { name: 'expand_more', size: 20, className: 'jc-select__chev' })));
  }

  function Switch(p) {
    var st = useCtl(p.checked, !!p.defaultChecked, p.onChange);
    var autoId = useId();
    return h('div', { className: cx('jc-switch', p.disabled && 'is-disabled', p.className) },
      h('div', { className: 'jc-switch__text' },
        p.label ? h('label', { className: 'jc-switch__label', htmlFor: autoId }, p.label) : null,
        p.description ? h('p', { className: 'jc-switch__desc' }, p.description) : null),
      h('button', {
        id: autoId, type: 'button', role: 'switch', 'aria-checked': !!st[0], disabled: p.disabled,
        className: cx('jc-switch__track', st[0] && 'is-on'), onClick: function () { st[1](!st[0]); }
      }, h('span', { className: 'jc-switch__thumb' }, st[0] ? h(Icon, { name: 'check', size: 14 }) : null)));
  }

  function SegmentedControl(p) {
    var opts = p.options || [];
    var st = useCtl(p.value, p.defaultValue !== undefined ? p.defaultValue : (opts[0] && (opts[0].value || opts[0])), p.onChange);
    return h('div', { className: cx('jc-seg', 'jc-seg--' + (p.size || 'md'), p.block && 'jc-seg--block', p.className), role: 'radiogroup', 'aria-label': p.ariaLabel },
      opts.map(function (o) {
        var v = typeof o === 'string' ? o : o.value, on = v === st[0];
        return h('button', { key: v, type: 'button', role: 'radio', 'aria-checked': on, disabled: o.disabled, className: cx('jc-seg__opt', on && 'is-on'), onClick: function () { st[1](v); } },
          o.icon ? h(Icon, { name: o.icon, size: 18 }) : null, typeof o === 'string' ? o : o.label,
          o.count !== undefined ? h('span', { className: 'jc-seg__count' }, o.count) : null);
      }));
  }

  /* ---------- Badges ---------- */
  function JlptBadge(p) {
    var lv = String(p.level || 'N5').toUpperCase();
    return h('span', { className: cx('jc-jlpt', 'jc-jlpt--' + lv.toLowerCase(), 'jc-jlpt--' + (p.size || 'md'), p.className), title: 'Trình độ JLPT ' + lv }, lv);
  }

  function CreditBadge(p) {
    var variant = p.variant || 'balance';
    var text = variant === 'cost' ? fmt(p.amount) + ' Credit' : fmt(p.amount);
    var inner = [
      h('span', { key: 'c', className: 'jc-credit__coin', 'aria-hidden': 'true' }, h(Icon, { name: 'toll', size: p.size === 'lg' ? 22 : 16 })),
      h('span', { key: 'n', className: 'jc-credit__num' }, text),
      variant === 'balance' && p.size !== 'sm' ? h('span', { key: 'u', className: 'jc-credit__unit' }, p.unit || 'Credit') : null
    ];
    var cls = cx('jc-credit', 'jc-credit--' + (p.size || 'md'), 'jc-credit--' + variant, p.low && 'is-low', p.className);
    var aria = (variant === 'cost' ? 'Chi phí ' : 'Số dư ') + fmt(p.amount) + ' Credit';
    return p.onClick ? h('button', { type: 'button', className: cls, onClick: p.onClick, 'aria-label': aria + '. Mở Gói & Credit' }, inner)
      : h('span', { className: cls, 'aria-label': aria }, inner);
  }

  function Badge(p) {
    return h('span', { className: cx('jc-badge', 'jc-badge--' + (p.tone || 'neutral'), p.className) },
      p.dot ? h('span', { className: 'jc-badge__dot', 'aria-hidden': 'true' }) : null,
      p.icon ? h(Icon, { name: p.icon, size: 16 }) : null, p.children);
  }

  /* ---------- Feedback ---------- */
  var TONE_ICON = { info: 'info', success: 'check_circle', warning: 'warning', danger: 'error', neutral: 'info' };
  function Alert(p) {
    var tone = p.tone || 'info';
    return h('div', { className: cx('jc-alert', 'jc-alert--' + tone, p.className), role: tone === 'danger' ? 'alert' : 'status' },
      h(Icon, { name: p.icon || TONE_ICON[tone], size: 22, className: 'jc-alert__icon', fill: true }),
      h('div', { className: 'jc-alert__body' },
        p.title ? h('p', { className: 'jc-alert__title' }, p.title) : null,
        p.children ? h('div', { className: 'jc-alert__text' }, p.children) : null,
        p.action ? h('div', { className: 'jc-alert__action' }, p.action) : null),
      p.onClose ? h(IconButton, { icon: 'close', label: 'Đóng', size: 'sm', onClick: p.onClose, className: 'jc-alert__close' }) : null);
  }

  function Toast(p) {
    var tone = p.tone || 'success';
    return h('div', { className: cx('jc-toast', 'jc-toast--' + tone, p.className), role: 'status', 'aria-live': 'polite' },
      h(Icon, { name: p.icon || TONE_ICON[tone], size: 22, fill: true, className: 'jc-toast__icon' }),
      h('div', { className: 'jc-toast__body' },
        p.title ? h('p', { className: 'jc-toast__title' }, p.title) : null,
        p.children ? h('p', { className: 'jc-toast__text' }, p.children) : null),
      p.action || null,
      p.onClose ? h(IconButton, { icon: 'close', label: 'Đóng thông báo', size: 'sm', onClick: p.onClose }) : null);
  }

  /* ---------- Navigation ---------- */
  function Tabs(p) {
    var items = p.items || [];
    var st = useCtl(p.value, p.defaultValue || (items[0] && items[0].id), p.onChange);
    return h('div', { className: cx('jc-tabs', p.className), role: 'tablist', 'aria-label': p.ariaLabel },
      items.map(function (t) {
        var on = t.id === st[0];
        return h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': on, tabIndex: on ? 0 : -1, className: cx('jc-tab', on && 'is-on'), onClick: function () { st[1](t.id); } },
          t.icon ? h(Icon, { name: t.icon, size: 20, fill: on }) : null,
          h('span', null, t.label),
          t.count !== undefined ? h('span', { className: 'jc-tab__count' }, t.count) : null);
      }));
  }

  var STEP_ICON = { done: 'check', locked: 'lock', error: 'priority_high' };
  function Stepper(p) {
    var steps = p.steps || [];
    return h('ol', { className: cx('jc-stepper', 'jc-stepper--' + (p.orientation || 'horizontal'), p.className) },
      steps.map(function (s, i) {
        var st = s.status || 'todo';
        return h('li', { key: i, className: cx('jc-step', 'is-' + st), 'aria-current': st === 'current' ? 'step' : undefined },
          h('span', { className: 'jc-step__dot' }, STEP_ICON[st] ? h(Icon, { name: STEP_ICON[st], size: 16 }) : (s.number || i + 1)),
          h('span', { className: 'jc-step__text' },
            h('span', { className: 'jc-step__label' }, s.label),
            s.description ? h('span', { className: 'jc-step__desc' }, s.description) : null),
          s.tag ? h('span', { className: 'jc-step__tag' }, s.tag) : null);
      }));
  }

  var LOGO_MARK = '/_blob/a497f0579835c6a1f2bed4d25d4f7c82';
  var LOGO_LOCKUP = '/_blob/07e9c128f2136e0c1ea1980a3a39ecbc';
  function Logo(p) {
    var size = p.size || 36;
    if (p.variant === 'lockup') {
      return h('span', { className: cx('jc-logo jc-logo--lockup', p.className) },
        h('span', { className: 'jc-logo__plate' }, h('img', { src: p.src || LOGO_LOCKUP, alt: 'JCAP — 千里の道も一言から', height: size, style: { height: size + 'px', width: 'auto' } })));
    }
    return h('span', { className: cx('jc-logo', p.className) },
      h('span', { className: 'jc-logo__plate' }, h('img', { src: p.src || LOGO_MARK, alt: p.withName === false ? 'JCAP' : '', width: size, height: size })),
      p.withName === false ? null : h('span', { className: 'jc-logo__name' }, 'JCAP'));
  }

  function AppHeader(p) {
    var open = useState(!!p.menuOpen);
    var ref = useRef(null);
    useEffect(function () {
      if (!open[0]) return;
      function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) open[1](false); }
      function onKey(e) { if (e.key === 'Escape') open[1](false); }
      document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, [open[0]]);
    var admin = p.role === 'admin';
    var items = p.menuItems || [
      { icon: 'person', label: 'Hồ sơ cá nhân' }, { icon: 'toll', label: 'Nạp thêm Credit' },
      { icon: 'receipt_long', label: 'Lịch sử giao dịch' }, { icon: 'logout', label: 'Đăng xuất', tone: 'danger' }];
    var initials = (p.name || '?').split(' ').map(function (w) { return w[0]; }).slice(-2).join('').toUpperCase();
    return h('header', { className: cx('jc-header', p.className) },
      p.onMenu ? h(IconButton, { icon: 'menu', label: 'Mở menu', onClick: p.onMenu, className: 'jc-header__menu' }) : null,
      h(Logo, { size: 32 }),
      admin ? h(Badge, { tone: 'shu', className: 'jc-header__role' }, 'Quản trị') : null,
      h('div', { className: 'jc-header__spacer' }),
      !admin && p.credits !== undefined ? h(CreditBadge, { amount: p.credits, onClick: p.onCreditClick || function () { }, low: p.creditsLow }) : null,
      h('div', { className: 'jc-header__user', ref: ref },
        h('button', { type: 'button', className: 'jc-header__avatarbtn', 'aria-haspopup': 'menu', 'aria-expanded': open[0], onClick: function () { open[1](!open[0]); } },
          h('span', { className: 'jc-header__who' },
            h('span', { className: 'jc-header__name' }, p.name),
            admin ? h('span', { className: 'jc-header__sub' }, 'Quản trị viên') : (p.level ? h(JlptBadge, { level: p.level, size: 'sm' }) : null)),
          p.avatarUrl ? h('img', { className: 'jc-avatar', src: p.avatarUrl, alt: '' }) : h('span', { className: 'jc-avatar', 'aria-hidden': 'true' }, initials),
          h(Icon, { name: 'expand_more', size: 18, className: 'jc-header__chev' })),
        open[0] ? h('div', { className: 'jc-menu', role: 'menu' },
          items.map(function (it, i) {
            return h('button', { key: i, type: 'button', role: 'menuitem', className: cx('jc-menu__item', it.tone === 'danger' && 'is-danger'), onClick: function () { open[1](false); if (it.onClick) it.onClick(); } },
              h(Icon, { name: it.icon, size: 20 }), it.label);
          })) : null));
  }

  function SideNav(p) {
    var st = useCtl(p.value, p.defaultValue, p.onChange);
    return h('nav', { className: cx('jc-sidenav', p.className), 'aria-label': p.ariaLabel || 'Điều hướng chính' },
      (p.sections || []).map(function (sec, si) {
        return h('div', { key: si, className: 'jc-sidenav__sec' },
          sec.title ? h('p', { className: 'jc-sidenav__title' }, sec.title) : null,
          h('ul', null, sec.items.map(function (it) {
            var on = it.id === st[0];
            return h('li', { key: it.id }, h('a', {
              href: it.href || '#', className: cx('jc-navitem', on && 'is-on'), 'aria-current': on ? 'page' : undefined,
              onClick: function (e) { if (!it.href) e.preventDefault(); st[1](it.id); }
            }, h(Icon, { name: it.icon, size: 22, fill: on }), h('span', null, it.label),
              it.badge !== undefined ? h('span', { className: 'jc-navitem__badge' }, it.badge) : null));
          })));
      }));
  }

  function BottomNav(p) {
    var st = useCtl(p.value, p.defaultValue, p.onChange);
    return h('nav', { className: cx('jc-bottomnav', p.className), 'aria-label': 'Điều hướng chính' },
      (p.items || []).map(function (it) {
        var on = it.id === st[0];
        return h('a', { key: it.id, href: it.href || '#', className: cx('jc-bottomnav__item', on && 'is-on'), 'aria-current': on ? 'page' : undefined, onClick: function (e) { if (!it.href) e.preventDefault(); st[1](it.id); } },
          h('span', { className: 'jc-bottomnav__pill' }, h(Icon, { name: it.icon, size: 24, fill: on })),
          h('span', { className: 'jc-bottomnav__label' }, it.label));
      }));
  }

  /* ---------- Cards ---------- */
  function Card(p) {
    var Tag = p.onClick ? 'button' : (p.as || 'section');
    return h(Tag, {
      type: p.onClick ? 'button' : undefined, onClick: p.onClick,
      className: cx('jc-card', p.onClick && 'jc-card--interactive', p.tone && 'jc-card--' + p.tone, p.padding === 'none' && 'jc-card--flush', p.className)
    },
      (p.title || p.actions) ? h('div', { className: 'jc-card__head' },
        h('div', null,
          p.eyebrow ? h('p', { className: 'jc-card__eyebrow' }, p.eyebrow) : null,
          p.title ? h('h3', { className: 'jc-card__title' }, p.title) : null,
          p.subtitle ? h('p', { className: 'jc-card__sub' }, p.subtitle) : null),
        p.actions ? h('div', { className: 'jc-card__actions' }, p.actions) : null) : null,
      p.children);
  }

  function ScenarioCard(p) {
    var Tag = p.onClick ? 'button' : 'article';
    return h(Tag, { type: p.onClick ? 'button' : undefined, onClick: p.onClick, className: cx('jc-scard', p.onClick && 'jc-card--interactive', p.className) },
      h('div', { className: 'jc-scard__thumb' },
        p.thumbnail ? h('img', { src: p.thumbnail, alt: '', loading: 'lazy' }) : h('div', { className: 'jc-seigaiha', 'aria-hidden': 'true' }),
        p.code ? h('span', { className: 'jc-scard__code' }, p.code) : null),
      h('div', { className: 'jc-scard__body' },
        h('h3', { className: 'jc-scard__title' }, p.title),
        p.description ? h('p', { className: 'jc-scard__desc' }, p.description) : null,
        p.progress ? h('div', { className: 'jc-scard__progress' }, h(ProgressBar, { value: p.progress.done, max: p.progress.total, label: 'Đang dở: ' + p.progress.done + '/' + p.progress.total + ' nhiệm vụ', size: 'sm' })) : null,
        h('div', { className: 'jc-scard__foot' },
          h('div', { className: 'jc-scard__levels' }, (p.levels || []).map(function (l) { return h(JlptBadge, { key: l, level: l, size: 'sm' }); })),
          p.status === 'draft' ? h(Badge, { tone: 'neutral', dot: true }, 'Nháp')
            : p.cost !== undefined ? h(CreditBadge, { amount: p.cost, variant: 'cost', size: 'sm' }) : null)));
  }

  function ShadowingCard(p) {
    var inProg = p.progress && p.progress.done > 0 && p.progress.done < p.progress.total;
    var done = p.progress && p.progress.done >= p.progress.total;
    return h('article', { className: cx('jc-shcard', p.className) },
      h('div', { className: 'jc-shcard__top' },
        h('div', { className: 'jc-shcard__meta' },
          p.level ? h(JlptBadge, { level: p.level, size: 'sm' }) : null,
          p.textbook ? h('span', { className: 'jc-shcard__book', lang: 'ja' }, p.textbook) : null),
        h(IconButton, { icon: 'bookmark', label: p.bookmarked ? 'Bỏ lưu bài' : 'Lưu bài', active: !!p.bookmarked, size: 'sm', onClick: p.onBookmark })),
      h('h3', { className: 'jc-shcard__title' }, p.title),
      p.topic ? h('p', { className: 'jc-shcard__topic' }, p.topic) : null,
      h('p', { className: 'jc-shcard__stats' },
        h(Icon, { name: 'format_list_bulleted', size: 16 }), (p.sentences || 0) + ' câu',
        h('span', { 'aria-hidden': 'true' }, '·'),
        h(Icon, { name: 'schedule', size: 16 }), '~' + (p.minutes || 0) + ' phút',
        p.bestScore !== undefined ? [h('span', { key: 'd', 'aria-hidden': 'true' }, '·'), h(Icon, { key: 'i', name: 'insights', size: 16 }), h('span', { key: 's' }, 'Cao nhất ' + p.bestScore)] : null),
      inProg ? h(ProgressBar, { value: p.progress.done, max: p.progress.total, label: p.progress.done + '/' + p.progress.total + ' câu', size: 'sm' }) : null,
      h('div', { className: 'jc-shcard__foot' },
        done ? h(Badge, { tone: 'success', icon: 'check_circle' }, 'Đã hoàn thành') : h('span'),
        h(Button, { variant: inProg ? 'primary' : 'secondary', size: 'sm', iconRight: 'arrow_forward', onClick: p.onStart }, inProg ? 'Tiếp tục' : done ? 'Luyện lại' : 'Bắt đầu')));
  }

  /* ---------- Data ---------- */
  function Table(p) {
    var cols = p.columns || [], rows = p.rows || [];
    var body;
    if (p.loading) {
      body = [0, 1, 2].map(function (i) { return h('tr', { key: i }, cols.map(function (c) { return h('td', { key: c.key }, h('span', { className: 'jc-skel jc-skel--text', style: { width: '70%' } })); })); });
    } else if (!rows.length) {
      body = h('tr', null, h('td', { colSpan: cols.length, className: 'jc-table__empty' }, p.empty || 'Chưa có dữ liệu.'));
    } else {
      body = rows.map(function (r, i) {
        return h('tr', { key: r.id || i }, cols.map(function (c) {
          return h('td', { key: c.key, className: cx(c.align && 'is-' + c.align) }, c.render ? c.render(r) : r[c.key]);
        }));
      });
    }
    return h('div', { className: cx('jc-table', p.stickyFirst && 'jc-table--sticky', p.className) },
      h('table', null,
        p.caption ? h('caption', { className: 'jc-sr' }, p.caption) : null,
        h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { key: c.key, scope: 'col', style: c.width ? { width: c.width } : null, className: cx(c.align && 'is-' + c.align) }, c.label); }))),
        h('tbody', null, body)));
  }

  function ProgressBar(p) {
    var max = p.max || 100, pct = Math.max(0, Math.min(100, (p.value || 0) / max * 100));
    return h('div', { className: cx('jc-progress', 'jc-progress--' + (p.size || 'md'), p.className) },
      (p.label || p.showValue) ? h('div', { className: 'jc-progress__row' },
        p.label ? h('span', { className: 'jc-progress__label' }, p.label) : h('span'),
        p.showValue ? h('span', { className: 'jc-progress__val' }, Math.round(pct) + '%') : null) : null,
      h('div', { className: 'jc-progress__track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': p.value || 0, 'aria-label': typeof p.label === 'string' ? p.label : undefined },
        h('div', { className: cx('jc-progress__fill', 'jc-tone-' + (p.tone || 'ai')), style: { width: pct + '%' } })));
  }

  function QuotaMeter(p) {
    var tone = p.tone || '5h';
    var used = p.used || 0, total = p.total || 1;
    var pct = Math.min(100, Math.round(used / total * 100)), left = Math.max(0, total - used);
    var state = pct >= 100 ? 'is-empty' : pct >= 80 ? 'is-low' : '';
    return h('div', { className: cx('jc-quota', 'jc-quota--' + tone, state, p.className) },
      h('div', { className: 'jc-quota__head' },
        h('span', { className: 'jc-quota__label' }, h(Icon, { name: p.icon || (tone === 'week' ? 'date_range' : 'timelapse'), size: 20 }), p.label),
        h('span', { className: 'jc-quota__left' }, pct >= 100 ? 'Đã hết' : 'Còn ' + fmt(left))),
      h('div', { className: 'jc-quota__track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': used, 'aria-label': p.label + ': đã dùng ' + used + ' trên ' + total },
        h('div', { className: 'jc-quota__fill', style: { width: pct + '%' } })),
      h('div', { className: 'jc-quota__foot' },
        h('span', null, 'Đã dùng ' + fmt(used) + ' / ' + fmt(total) + ' · ' + pct + '%'),
        p.resetIn ? h('span', null, h(Icon, { name: 'history', size: 16 }), 'Hồi phục sau ' + p.resetIn) : null));
  }

  function verdict(v) { return v >= 80 ? 'good' : v >= 50 ? 'mid' : 'low'; }
  var VERDICT = { good: ['Khớp tốt', 'check_circle'], mid: ['Khớp một phần', 'change_history'], low: ['Chưa khớp', 'cancel'] };
  function ScoreRing(p) {
    var size = p.size || 96, stroke = Math.max(6, Math.round(size / 12)), r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var v = Math.max(0, Math.min(100, p.value || 0)), tone = p.tone || verdict(v);
    return h('div', { className: cx('jc-ring', 'jc-ring--' + tone, p.className), style: { minWidth: size + 'px' } },
      h('div', { className: 'jc-ring__fig', style: { width: size + 'px', height: size + 'px' } },
        h('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' },
          h('circle', { className: 'jc-ring__track', cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, fill: 'none' }),
          h('circle', { className: 'jc-ring__bar', cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, fill: 'none', strokeDasharray: c, strokeDashoffset: c * (1 - v / 100), strokeLinecap: 'round', transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' })),
        h('span', { className: 'jc-ring__num', style: { fontSize: Math.round(size * 0.32) + 'px' } }, Math.round(v),
          size >= 96 ? h('span', { className: 'jc-ring__max' }, '/100') : null)),
      p.label ? h('span', { className: 'jc-ring__label' }, p.label) : null,
      p.showVerdict ? h('span', { className: 'jc-ring__verdict' }, h(Icon, { name: VERDICT[tone][1], size: 16, fill: true }), VERDICT[tone][0]) : null);
  }

  function EmptyState(p) {
    return h('div', { className: cx('jc-empty', p.compact && 'jc-empty--compact', p.className) },
      h('span', { className: 'jc-empty__icon' }, h(Icon, { name: p.icon || 'inbox', size: 32 })),
      h('h3', { className: 'jc-empty__title' }, p.title),
      p.children ? h('p', { className: 'jc-empty__text' }, p.children) : null,
      (p.action || p.secondaryAction) ? h('div', { className: 'jc-empty__actions' }, p.action, p.secondaryAction) : null);
  }

  function Skeleton(p) {
    var v = p.variant || 'text';
    if (v === 'card') return h('div', { className: 'jc-skelcard', 'aria-hidden': 'true' },
      h('span', { className: 'jc-skel', style: { height: '120px', borderRadius: 'var(--radius-md)' } }),
      h('span', { className: 'jc-skel jc-skel--text', style: { width: '70%', height: '18px' } }),
      h('span', { className: 'jc-skel jc-skel--text', style: { width: '95%' } }),
      h('span', { className: 'jc-skel jc-skel--text', style: { width: '40%' } }));
    if (v === 'bubble') return h('div', { className: 'jc-skelbubble', 'aria-hidden': 'true' },
      h('span', { className: 'jc-skel', style: { width: '36px', height: '36px', borderRadius: '50%' } }),
      h('span', { className: 'jc-skel', style: { width: p.width || '60%', height: '64px', borderRadius: 'var(--radius-lg)' } }));
    var n = p.lines || 3, out = [];
    for (var i = 0; i < n; i++) out.push(h('span', { key: i, className: 'jc-skel jc-skel--text', style: { width: i === n - 1 ? '55%' : (p.width || '100%') } }));
    return h('div', { className: 'jc-skeltext', role: 'status', 'aria-label': 'Đang tải' }, out);
  }

  /* ---------- Overlays ---------- */
  function Modal(p) {
    useEffect(function () {
      if (p.inline || !p.onClose || p.open === false) return;
      function k(e) { if (e.key === 'Escape') p.onClose(); }
      document.addEventListener('keydown', k); return function () { document.removeEventListener('keydown', k); };
    }, [p.inline, p.onClose, p.open]);
    if (p.open === false) return null;
    return h('div', { className: cx('jc-overlay', p.inline && 'is-inline'), onMouseDown: function (e) { if (e.target === e.currentTarget && p.onClose) p.onClose(); } },
      h('div', { className: cx('jc-modal', 'jc-modal--' + (p.size || 'md'), p.className), role: 'dialog', 'aria-modal': 'true', 'aria-label': p.title },
        h('div', { className: 'jc-modal__head' },
          p.icon ? h('span', { className: cx('jc-modal__icon', 'jc-tone-bg-' + (p.tone || 'ai')) }, h(Icon, { name: p.icon, size: 24 })) : null,
          h('h2', { className: 'jc-modal__title' }, p.title),
          p.onClose ? h(IconButton, { icon: 'close', label: 'Đóng', onClick: p.onClose }) : null),
        h('div', { className: 'jc-modal__body' }, p.children),
        p.footer ? h('div', { className: 'jc-modal__foot' }, p.footer) : null));
  }

  function Drawer(p) {
    if (p.open === false) return null;
    var side = p.side || 'right';
    return h('div', { className: cx('jc-overlay', 'jc-overlay--drawer', 'jc-overlay--' + side, p.inline && 'is-inline'), onMouseDown: function (e) { if (e.target === e.currentTarget && p.onClose) p.onClose(); } },
      h('aside', { className: cx('jc-drawer', 'jc-drawer--' + side, p.className), role: 'dialog', 'aria-modal': 'true', 'aria-label': p.title, style: p.width && side !== 'bottom' ? { width: p.width } : null },
        side === 'bottom' ? h('span', { className: 'jc-drawer__grip', 'aria-hidden': 'true' }) : null,
        h('div', { className: 'jc-drawer__head' },
          h('h2', { className: 'jc-drawer__title' }, p.title),
          p.onClose ? h(IconButton, { icon: 'close', label: 'Đóng', onClick: p.onClose }) : null),
        h('div', { className: 'jc-drawer__body' }, p.children),
        p.footer ? h('div', { className: 'jc-drawer__foot' }, p.footer) : null));
  }

  /* ---------- Speaking ---------- */
  var MIC = {
    idle: ['mic', 'Bấm để nói'],
    permission: ['mic', 'Đang xin quyền micro…'],
    recording: ['graphic_eq', 'Đang nghe… bấm để dừng'],
    analyzing: ['progress_activity', 'Đang phân tích…'],
    denied: ['mic_off', 'Chưa có quyền micro'],
    unsupported: ['mic_off', 'Trình duyệt không hỗ trợ'],
    disabled: ['mic', 'Micro tạm khoá']
  };
  function MicButton(p) {
    var s = p.state || 'idle', m = MIC[s] || MIC.idle;
    var lvl = Math.max(0, Math.min(1, p.level || 0));
    var blocked = s === 'denied' || s === 'unsupported' || s === 'disabled' || s === 'analyzing' || s === 'permission';
    return h('div', { className: cx('jc-mic', 'is-' + s, 'jc-mic--' + (p.size || 'lg'), p.className) },
      h('div', { className: 'jc-mic__wrap', style: { '--lvl': lvl } },
        s === 'recording' ? h('span', { className: 'jc-mic__wave', 'aria-hidden': 'true' }) : null,
        h('button', { type: 'button', className: 'jc-mic__btn', onClick: p.onClick, disabled: blocked && s !== 'denied', 'aria-pressed': s === 'recording', 'aria-label': p.label || m[1] },
          h(Icon, { name: m[0], size: p.size === 'md' ? 26 : 32, fill: s === 'recording' || s === 'idle', spin: s === 'analyzing' }))),
      p.hideLabel ? null : h('span', { className: 'jc-mic__label', 'aria-live': 'polite' }, p.label || m[1]),
      p.hint ? h('span', { className: 'jc-mic__hint' }, p.hint) : null);
  }

  function mmss(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function AudioPlayer(p) {
    var st = useCtl(p.playing, false, p.onToggle);
    var dur = p.duration || 0, prog = p.progress !== undefined ? p.progress : 0;
    if (p.variant === 'chip') {
      return h('button', { type: 'button', className: cx('jc-audiochip', st[0] && 'is-playing', p.className), onClick: function () { st[1](!st[0]); }, 'aria-label': (st[0] ? 'Dừng ' : 'Nghe ') + (p.label || '') },
        h(Icon, { name: st[0] ? 'stop_circle' : 'volume_up', size: 18, fill: st[0] }), p.label);
    }
    return h('div', { className: cx('jc-audio', st[0] && 'is-playing', p.className) },
      h('button', { type: 'button', className: 'jc-audio__play', onClick: function () { st[1](!st[0]); }, 'aria-label': st[0] ? 'Tạm dừng' : 'Phát ' + (p.label || '') },
        h(Icon, { name: st[0] ? 'pause' : 'play_arrow', size: 22, fill: true })),
      h('div', { className: 'jc-audio__main' },
        p.label ? h('span', { className: 'jc-audio__label' }, p.label) : null,
        h('div', { className: 'jc-audio__track' }, h('div', { className: 'jc-audio__fill', style: { width: Math.round(prog * 100) + '%' } }))),
      h('span', { className: 'jc-audio__time' }, mmss(prog * dur) + ' / ' + mmss(dur)),
      p.speeds ? h('button', { type: 'button', className: 'jc-audio__speed', onClick: p.onSpeed, 'aria-label': 'Tốc độ phát ' + (p.speed || 1) + 'x' }, (p.speed || 1) + '×') : null);
  }

  /* ---------- Japanese text ---------- */
  function parseRuby(text) {
    var out = [], re = /\{([^|}]+)\|([^}]+)\}/g, last = 0, m, i = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(h('ruby', { key: 'r' + (i++) }, m[1], h('rp', null, '('), h('rt', null, m[2]), h('rp', null, ')')));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  function JpText(p) {
    var Tag = p.as || 'span';
    return h(Tag, { lang: 'ja', className: cx('jc-jp', 'jc-jp--' + (p.size || 'md'), p.furigana === false && 'no-furi', p.className) },
      parseRuby(p.text || ''),
      p.romaji ? h('span', { className: 'jc-jp__romaji', lang: 'ja-Latn' }, p.romaji) : null);
  }

  function ChatBubble(p) {
    var me = p.from === 'me';
    var tr = useState(p.showTranslation !== undefined ? p.showTranslation : false);
    var showTr = p.showTranslation !== undefined ? p.showTranslation : tr[0];
    var sel = me && p.onSelect;
    var bubble = h(sel ? 'button' : 'div', {
      type: sel ? 'button' : undefined, onClick: sel ? p.onSelect : undefined,
      className: cx('jc-bubble__box', p.selected && 'is-selected'), 'aria-pressed': sel ? !!p.selected : undefined,
      'aria-label': sel ? 'Xem đánh giá câu này' : undefined
    },
      h(JpText, { text: p.jp, furigana: p.showFurigana !== false, size: 'md', as: 'p' }),
      showTr && p.vi ? h('p', { className: 'jc-bubble__vi' }, p.vi) : null,
      p.romaji ? h('p', { className: 'jc-bubble__romaji' }, p.romaji) : null);
    return h('div', { className: cx('jc-bubble', me ? 'jc-bubble--me' : 'jc-bubble--ai', p.status && 'is-' + p.status, p.className) },
      !me ? h('span', { className: 'jc-bubble__avatar', 'aria-hidden': 'true' }, p.avatar || h(Icon, { name: 'face', size: 22 })) : null,
      h('div', { className: 'jc-bubble__col' },
        p.name ? h('span', { className: 'jc-bubble__name' }, p.name) : null,
        bubble,
        h('div', { className: 'jc-bubble__tools' },
          p.onPlay !== null ? h(AudioPlayer, { variant: 'chip', label: me ? 'Nghe lại' : 'Nghe', onToggle: p.onPlay }) : null,
          p.vi && p.showTranslation === undefined ? h('button', { type: 'button', className: 'jc-audiochip', onClick: function () { tr[1](!tr[0]); }, 'aria-pressed': tr[0] }, h(Icon, { name: 'translate', size: 18 }), tr[0] ? 'Ẩn dịch' : 'Dịch') : null,
          me && p.score !== undefined ? h('span', { className: cx('jc-bubble__score', 'jc-v-' + verdict(p.score)) }, h(Icon, { name: VERDICT[verdict(p.score)][1], size: 16, fill: true }), p.score + ' điểm') : null,
          p.status === 'sending' ? h('span', { className: 'jc-bubble__status' }, h(Icon, { name: 'progress_activity', size: 16, spin: true }), 'Đang gửi…') : null,
          p.status === 'error' ? h('button', { type: 'button', className: 'jc-bubble__status is-error', onClick: p.onRetry }, h(Icon, { name: 'refresh', size: 16 }), 'Gửi thất bại · Thử lại') : null)));
  }

  var ERR = { chouon: 'Trường âm', sokuon: 'Âm ngắt っ', hatsuon: 'Âm mũi ん', dakuon: 'Hữu thanh ゛', mora: 'Số mora', particle: 'Trợ từ', word: 'Sai từ', extra: 'Thừa âm' };
  var WD_ICON = { ok: 'check', wrong: 'close', missing: 'remove', extra: 'add' };
  function WordDiff(p) {
    var toks = p.tokens || [];
    return h('div', { className: cx('jc-diff', p.className) },
      h('div', { className: 'jc-diff__row', lang: 'ja' }, toks.map(function (t, i) {
        var s = t.status || 'ok';
        return h('span', { key: i, className: cx('jc-diff__tok', 'is-' + s), title: s !== 'ok' ? (ERR[t.error] || '') : undefined },
          t.reading ? h('span', { className: 'jc-diff__reading' }, t.reading) : null,
          h('span', { className: 'jc-diff__text' }, s === 'missing' ? (t.expected || t.text) : t.text),
          s !== 'ok' ? h('span', { className: 'jc-diff__tag', lang: 'vi' }, h(Icon, { name: WD_ICON[s], size: 12 }), t.error ? ERR[t.error] : (s === 'missing' ? 'Thiếu' : s === 'extra' ? 'Thừa' : 'Sai')) : null,
          s === 'wrong' && t.expected ? h('span', { className: 'jc-diff__expected', lang: 'vi' }, 'Đúng: ', h('span', { lang: 'ja' }, t.expected)) : null);
      })),
      p.showLegend !== false ? h('ul', { className: 'jc-diff__legend' },
        h('li', { className: 'is-ok' }, h('span', { className: 'jc-diff__sw' }, h(Icon, { name: 'check', size: 12 })), 'Đúng'),
        h('li', { className: 'is-wrong' }, h('span', { className: 'jc-diff__sw' }, h(Icon, { name: 'close', size: 12 })), 'Sai'),
        h('li', { className: 'is-missing' }, h('span', { className: 'jc-diff__sw' }, h(Icon, { name: 'remove', size: 12 })), 'Thiếu'),
        h('li', { className: 'is-extra' }, h('span', { className: 'jc-diff__sw' }, h(Icon, { name: 'add', size: 12 })), 'Thừa')) : null);
  }

  var FB = { success: ['check_circle', 'Làm tốt'], warning: ['change_history', 'Nên chỉnh'], error: ['cancel', 'Cần sửa'], tip: ['lightbulb', 'Mẹo'] };
  function FeedbackItem(p) {
    var tone = p.tone || 'tip', f = FB[tone];
    return h('div', { className: cx('jc-fb', 'jc-fb--' + tone, p.className) },
      h(Icon, { name: f[0], size: 20, fill: true, className: 'jc-fb__icon' }),
      h('div', { className: 'jc-fb__body' },
        h('p', { className: 'jc-fb__title' }, h('span', { className: 'jc-sr' }, f[1] + ': '), p.title),
        p.children ? h('div', { className: 'jc-fb__text' }, p.children) : null,
        p.suggestion ? h('div', { className: 'jc-fb__sugg' },
          h(JpText, { text: p.suggestion.jp, size: 'sm', as: 'p' }),
          p.suggestion.vi ? h('p', { className: 'jc-fb__vi' }, p.suggestion.vi) : null,
          h('div', { className: 'jc-fb__tools' },
            h(AudioPlayer, { variant: 'chip', label: 'Nghe mẫu', onToggle: p.onPlay }),
            h('button', { type: 'button', className: 'jc-audiochip', onClick: p.onCopy }, h(Icon, { name: 'content_copy', size: 18 }), 'Chép'))) : null));
  }

  window.JCAP = Object.assign(window.JCAP || {}, {
    Icon: Icon, Button: Button, IconButton: IconButton, TextField: TextField, Select: Select, Switch: Switch, SegmentedControl: SegmentedControl,
    JlptBadge: JlptBadge, CreditBadge: CreditBadge, Badge: Badge, Alert: Alert, Toast: Toast, Tabs: Tabs, Stepper: Stepper,
    AppHeader: AppHeader, SideNav: SideNav, BottomNav: BottomNav, Card: Card, ScenarioCard: ScenarioCard, ShadowingCard: ShadowingCard,
    Table: Table, ProgressBar: ProgressBar, QuotaMeter: QuotaMeter, ScoreRing: ScoreRing, EmptyState: EmptyState, Skeleton: Skeleton,
    Modal: Modal, Drawer: Drawer, MicButton: MicButton, AudioPlayer: AudioPlayer, JpText: JpText, ChatBubble: ChatBubble,
    WordDiff: WordDiff, FeedbackItem: FeedbackItem, Logo: Logo
  });
})();
