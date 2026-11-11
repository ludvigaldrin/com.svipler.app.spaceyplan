// Some embedded browsers (wall displays) drop colours written as #rrggbbaa,
// which the capability renderers use for icon fills and glows. Where the
// browser rejects them, rewrite those values to rgba() as they are assigned.
//
// Found 2026-11-11: the Shelly Wall Display (Android WebView, Chrome 131)
// rejects #rrggbbaa. Current Chrome has no per-property accessors on
// CSSStyleDeclaration to patch, so element.style is wrapped in a Proxy instead.
// Add ?colorfix=1 to the page URL to force it on for testing.
(function () {
  var supported = false;
  try { supported = !!(window.CSS && CSS.supports && CSS.supports('color', '#00000080')); } catch (e) { supported = false; }
  var forced = /[?&]colorfix=1\b/.test(location.search);
  if (supported && !forced) return;
  if (typeof Proxy === 'undefined' || typeof WeakMap === 'undefined') return;

  var hex8 = /#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})(?![0-9a-fA-F])/g;
  function fix(value) {
    if (typeof value !== 'string' || value.indexOf('#') < 0) return value;
    return value.replace(hex8, function (match, r, g, b, a) {
      return 'rgba(' + parseInt(r, 16) + ',' + parseInt(g, 16) + ',' + parseInt(b, 16) + ',' +
        (parseInt(a, 16) / 255).toFixed(3) + ')';
    });
  }

  var descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
  if (!descriptor || !descriptor.get) return;
  var getStyle = descriptor.get;
  var proxies = new WeakMap();

  function wrap(style) {
    var proxy = proxies.get(style);
    if (proxy) return proxy;
    proxy = new Proxy(style, {
      get: function (target, prop) {
        if (prop === 'setProperty') {
          return function (name, value, priority) { return target.setProperty(name, fix(value), priority); };
        }
        var value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set: function (target, prop, value) {
        target[prop] = fix(value);
        return true;
      }
    });
    proxies.set(style, proxy);
    return proxy;
  }

  Object.defineProperty(HTMLElement.prototype, 'style', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: function () { return wrap(getStyle.call(this)); },
    set: descriptor.set ? function (value) { descriptor.set.call(this, fix(value)); } : undefined
  });
  window.__spaceyColorFix = true;
})();
