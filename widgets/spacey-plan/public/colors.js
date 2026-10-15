// Older embedded browsers (wall displays) drop colours written as #rrggbbaa,
// which the capability renderers use for icon fills and glows. Where the
// browser lacks support, rewrite those values to rgba() as they are assigned.
// A no-op everywhere else.
(function () {
  var supported = false;
  try { supported = !!(window.CSS && CSS.supports && CSS.supports('color', '#00000080')); } catch (e) { supported = false; }
  if (supported || typeof CSSStyleDeclaration === 'undefined') return;

  var hex8 = /#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})(?![0-9a-fA-F])/g;
  function fix(value) {
    if (typeof value !== 'string') return value;
    return value.replace(hex8, function (match, r, g, b, a) {
      return 'rgba(' + parseInt(r, 16) + ',' + parseInt(g, 16) + ',' + parseInt(b, 16) + ',' +
        (parseInt(a, 16) / 255).toFixed(3) + ')';
    });
  }

  ['backgroundColor', 'background', 'boxShadow', 'filter', 'borderColor', 'color', 'outlineColor'].forEach(function (prop) {
    var descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
    if (!descriptor || !descriptor.set) return;
    Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
      configurable: true,
      get: descriptor.get,
      set: function (value) { descriptor.set.call(this, fix(value)); }
    });
  });
})();
