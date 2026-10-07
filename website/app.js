// Vocravox website script. No libraries. It does two small things:
//   1. soft touches: sections fade in as they scroll into view, and the header firms up once you scroll;
//      with reduced motion, or without this script, everything is simply visible;
//   2. asks GitHub (public API, no key) for the latest published release, so the download button,
//      version and size are always current without redeploying this site.
// Every failure path falls back to a plain link to the releases page.
(function () {
  'use strict';

  var REPO = 'Farhaal/vocravox';
  var RELEASES_PAGE = 'https://github.com/' + REPO + '/releases/latest';
  var DOWNLOAD_PREFIX = 'https://github.com/' + REPO + '/releases/download/';
  var CACHE_KEY = 'vx-latest-release';
  var CACHE_MS = 10 * 60 * 1000;

  var $ = function (id) { return document.getElementById(id); };

  // ---------- soft touches ----------
  function effects() {
    var header = document.querySelector('.site-header');
    if (header) {
      var ticking = false;
      var update = function () { header.classList.toggle('scrolled', window.scrollY > 8); ticking = false; };
      window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      update();
    }

    var items = document.querySelectorAll('.reveal');
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!items.length || calm || !('IntersectionObserver' in window)) return;   // leave everything visible
    document.documentElement.classList.add('js');
    var settle = function (el) { setTimeout(function () { el.classList.add('done'); }, 1300); };
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        settle(e.target);
        seen.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    var height = window.innerHeight || document.documentElement.clientHeight;
    Array.prototype.forEach.call(items, function (el) {
      // Anything already on screen appears at once, so nothing flashes when the page opens.
      if (el.getBoundingClientRect().top < height) { el.classList.add('in', 'now', 'done'); } else seen.observe(el);
    });
  }

  // ---------- platform ----------
  function platform() {
    var ua = (navigator.userAgent || '').toLowerCase();
    var plat = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toLowerCase();
    if (/android|iphone|ipad|ipod/.test(ua)) return 'mobile';
    if (/mac/.test(plat) || /macintosh|mac os/.test(ua)) return 'mac';
    if (/win/.test(plat) || /windows/.test(ua)) return 'windows';
    return 'other';
  }

  // ---------- release data ----------
  // A release is usable only if its file really lives in this project's releases.
  function safeUrl(url) {
    return typeof url === 'string' && url.indexOf(DOWNLOAD_PREFIX) === 0 ? url : null;
  }

  function parseRelease(json) {
    if (!json || json.draft || json.prerelease || !Array.isArray(json.assets)) return null;
    var out = { version: String(json.tag_name || '').replace(/^v/i, ''), date: json.published_at || null, windows: null, mac: null };
    json.assets.forEach(function (a) {
      var name = String(a.name || '').toLowerCase();
      var url = safeUrl(a.browser_download_url);
      if (!url) return;
      var file = { url: url, mb: a.size ? Math.round(a.size / 1048576) : null };
      if (/\.exe$/.test(name) && !out.windows) out.windows = file;
      if (/\.dmg$/.test(name) && !out.mac) out.mac = file;
    });
    return out.windows || out.mac ? out : null;
  }

  function loadRelease() {
    try {
      var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.release);
    } catch (e) { /* storage can be blocked: just fetch */ }
    return fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) {
        if (r.status === 404) return { none: true };     // nothing published yet
        if (!r.ok) throw new Error('GitHub answered ' + r.status);
        return r.json();
      })
      .then(function (json) {
        var release = json && json.none ? 'none' : parseRelease(json);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release: release })); } catch (e) { /* fine */ }
        return release;
      });
  }

  // ---------- rendering ----------
  function setLinks(url, disabled) {
    ['dl-header', 'dl-primary', 'dl-footer'].forEach(function (id) {
      var a = $(id);
      if (!a) return;
      a.href = url;
      if (disabled) a.setAttribute('aria-disabled', 'true'); else a.removeAttribute('aria-disabled');
    });
    // The small header button is only worth showing when it can actually download something.
    $('dl-header').hidden = !!disabled;
  }

  function label(text) {
    $('dl-label').textContent = text;
    if ($('dl-footer')) $('dl-footer').textContent = text;
  }

  // state: { platform: 'windows'|'mac'|'mobile'|'other', release: object | 'none' | null (unknown) }
  function render(state) {
    var meta = $('dl-meta');
    var other = $('dl-other');
    var rel = state.release;
    other.hidden = true;

    if (state.platform === 'mobile') {
      setLinks(RELEASES_PAGE, true);
      label('Open on your computer');
      meta.textContent = 'Vocravox is a desktop app for Windows. Visit this page on your PC to download it.';
      return;
    }

    if (state.platform === 'mac') {
      setLinks(RELEASES_PAGE, true);
      label('Mac version coming soon');
      meta.textContent = 'Apple Silicon is planned. Today Vocravox runs on Windows 10 and 11.';
      return;
    }

    // Windows and anything else get the Windows installer.
    if (rel === 'none') {
      setLinks(RELEASES_PAGE, true);
      label('Coming soon');
      meta.textContent = 'The first public version is almost ready. Check back shortly.';
      return;
    }
    if (rel && rel.windows) {
      setLinks(rel.windows.url, false);
      label('Download for Windows');
      var parts = ['Windows 10 or 11', 'Free to use', 'Version ' + rel.version];
      if (rel.windows.mb) parts.push(rel.windows.mb + ' MB');
      meta.textContent = parts.join(' · ');
      return;
    }
    // Unknown (GitHub unreachable) or no Windows file: send people to the releases page.
    setLinks(RELEASES_PAGE, false);
    label('Download for Windows');
    meta.textContent = 'Windows 10 or 11 · Free to use';
  }

  function init() {
    effects();
    var p = platform();
    render({ platform: p, release: null });           // sensible text immediately
    if (p === 'mobile' || p === 'mac') return;        // nothing to look up
    loadRelease().then(function (release) { render({ platform: p, release: release }); }, function () { /* keep the fallback */ });
  }

  // Exposed only so the page can be tested with sample data.
  window.VX = { render: render, parseRelease: parseRelease, platform: platform };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
