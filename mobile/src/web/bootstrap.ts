type Bootstrap = {
  page: "front" | "article";
  articleId?: string;
  context: object;
  insets: { top: number; bottom: number };
};

// The smallest possible script for the one hook that runs before the page's
// own scripts. On Android that hook races those scripts, and the web tracker
// reads window.appContext the moment it starts, so everything else waits.
export function contextScript(config: Bootstrap) {
  return `window.appContext = ${JSON.stringify(config.context)}; window.appInsets = ${JSON.stringify(config.insets)}; true;`;
}

// These scripts belong to the native integration. The fixture documents stay untouched.
export function bootstrapScript(config: Bootstrap) {
  return `(function () {
    window.appContext = ${JSON.stringify(config.context)};
    window.appInsets = ${JSON.stringify(config.insets)};
    if (window.__newsBridge) return;
    var config = ${JSON.stringify(config)};
    var bridge = window.__newsBridge = { active: false, ready: false, read: false, lastSeq: -1, insets: config.insets };
    function post(data) { window.ReactNativeWebView.postMessage(JSON.stringify(data)); }
    function checkRead() {
      if (config.page !== 'article' || !bridge.active || !bridge.ready || bridge.read || document.hidden) return;
      var paragraphs = document.querySelectorAll('.articlecomponent.text p');
      var last = paragraphs[paragraphs.length - 1];
      if (!last) return;
      // Measure the final rendered text line, not the whole paragraph or document.
      var walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
      var node, finalNode;
      while ((node = walker.nextNode())) { if (node.textContent.trim()) finalNode = node; }
      if (!finalNode) return;
      var end = finalNode.textContent.trimEnd().length;
      var range = document.createRange();
      range.setStart(finalNode, Math.max(0, end - 1)); range.setEnd(finalNode, end);
      var bounds = range.getBoundingClientRect();
      if (bounds.height > 0 && bounds.top >= bridge.insets.top && bounds.bottom <= window.innerHeight - bridge.insets.bottom + 1) {
        bridge.read = true;
        post({ type: 'native:read', articleId: config.articleId, title: document.title });
      }
    }
    bridge.check = checkRead;
    function install() {
      if (bridge.installed) return;
      bridge.installed = true;
      post({ type: 'native:metadata', title: document.title });
      document.addEventListener('click', function (event) {
        var anchor = event.target.closest && event.target.closest('a[href]');
        if (!anchor) return;
        var url;
        try { url = new URL(anchor.href, location.href); } catch (_) { return; }
        var here = new URL(location.href);
        if (url.origin === here.origin && url.pathname === here.pathname && url.search === here.search && url.hash) {
          event.preventDefault();
          var target;
          try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch (_) {}
          if (target) {
            if (config.page === 'front') post({ type: 'native:anchor', y: target.getBoundingClientRect().top + window.scrollY });
            else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - bridge.insets.top, behavior: 'smooth' });
          }
          return;
        }
        event.preventDefault();
        post({ type: 'native:link', url: url.href });
      }, true);
      if (config.page === 'article') {
        var startX = 0, startY = 0, pulling = false, distance = 0;
        document.addEventListener('touchstart', function (event) {
          if (event.touches.length !== 1) return;
          startX = event.touches[0].clientX; startY = event.touches[0].clientY;
          pulling = window.scrollY <= 1; distance = 0;
        }, { passive: true });
        document.addEventListener('touchmove', function (event) {
          if (!pulling || event.touches.length !== 1) return;
          var dx = Math.abs(event.touches[0].clientX - startX);
          distance = event.touches[0].clientY - startY;
          if (dx > 50 || distance < -5) pulling = false;
        }, { passive: true });
        document.addEventListener('touchend', function () {
          if (pulling && distance > 95) post({ type: 'native:refresh' });
          pulling = false;
        });
        window.addEventListener('scroll', checkRead, { passive: true });
        window.addEventListener('resize', checkRead);
        new ResizeObserver(checkRead).observe(document.body);
        setInterval(checkRead, 300);
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  })(); true;`;
}

export function stateScript(
  events: [string, object][],
  active: boolean,
  ready: boolean,
  insets: { top: number; bottom: number },
  seq = 0,
) {
  return `(function () {
    var bridge = window.__newsBridge;
    if (bridge) {
      bridge.active = ${active}; bridge.ready = ${ready};
      bridge.insets = ${JSON.stringify(insets)};
    }
    // A resend of a sequence the page already applied must not reach it twice.
    if (!bridge || bridge.lastSeq < ${seq}) {
      if (bridge) bridge.lastSeq = ${seq};
      ${events.map(([name, detail]) => `window.dispatchEvent(new CustomEvent(${JSON.stringify(name)}, { detail: ${JSON.stringify(detail)} }));`).join(" ")}
    }
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'native:stateAck', seq: ${seq} })); } catch (e) {}
    if (bridge && bridge.check) requestAnimationFrame(function () { bridge.check(); });
  })(); true;`;
}
