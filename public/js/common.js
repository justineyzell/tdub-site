// Shared helpers for every page: the header, the bottom ad strip, and talking to the server.
(function () {
  'use strict';

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function api(path, options) {
    const opts = Object.assign({ headers: {}, credentials: 'same-origin' }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Please try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  function header(active) {
    const el = document.getElementById('site-header');
    if (!el) return;
    el.innerHTML =
      '<a class="logo" href="/">T<span>Dub</span></a>' +
      '<nav class="nav">' +
        '<a href="/" class="' + (active === 'home' ? 'active' : '') + '">Library</a>' +
      '</nav>' +
      '<input class="search" id="search" type="search" placeholder="Search series and episodes" aria-label="Search" />';
    const box = document.getElementById('search');
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const q = box.value.trim();
        window.location.href = '/?q=' + encodeURIComponent(q);
      }
    });
    const current = param('q');
    if (current && active === 'home') box.value = current;
  }

  // The ad strip: a thin horizontal banner at the bottom. No pop-ups, no full-screen ads.
  function adStrip() {
    // The strip is always on the page. Google's script is only loaded once an ad ID is set in js/config.js.
    const cfg = window.TDUB_ADS || {};
    const bar = document.createElement('div');
    bar.className = 'ad-strip';
    bar.setAttribute('aria-label', 'Advertisement');
    bar.innerHTML =
      '<span class="ad-label">Ad</span>' +
      '<div class="ad-inner">' +
        (cfg.client && cfg.slot
          ? '<ins class="adsbygoogle" style="display:block;width:100%;height:90px"' +
            ' data-ad-client="' + esc(cfg.client) + '"' +
            ' data-ad-slot="' + esc(cfg.slot) + '"' +
            ' data-ad-format="horizontal"' +
            ' data-full-width-responsive="true"></ins>'
          : '') +
      '</div>';
    document.body.appendChild(bar);
    if (!cfg.client || !cfg.slot) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.client);
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ad blocked or not ready */ }
  }

  function footer() {
    const el = document.getElementById('site-footer');
    if (el) el.innerHTML = '&copy; ' + new Date().getFullYear() + ' TDub. All rights reserved.';
  }

  window.TDub = { esc: esc, api: api, param: param, header: header, adStrip: adStrip, footer: footer };
})();
