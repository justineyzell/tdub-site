/**
 * TDub frontend — catalog (index.html) + player (watch.html).
 * Plain JavaScript, no build step. Requires config.js to load first.
 */
(function () {
  'use strict';

  var CONFIG = window.TDUB_CONFIG || {};
  var API_BASE = String(CONFIG.API_BASE || '').replace(/\/+$/, '');
  var PLACEHOLDER = CONFIG.PLACEHOLDER_POSTER || '/assets/placeholder-poster.svg';

  /* ---------------------------------------------------------------- */
  /* Shared helpers                                                    */
  /* ---------------------------------------------------------------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /** Fetch JSON with timeout + retries (free hosts can take ~30s to wake up). */
  function apiGet(path, opts) {
    opts = opts || {};
    var retries = opts.retries == null ? 2 : opts.retries;
    var timeout = opts.timeout || 25000;

    function attempt(n) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout) : null;
      return fetch(API_BASE + path, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (timer) clearTimeout(timer);
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
              var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
              err.status = res.status;
              throw err;
            }
            return data;
          });
        })
        .catch(function (err) {
          if (timer) clearTimeout(timer);
          var retryable = !err.status || err.status >= 500;
          if (n < retries && retryable) {
            return new Promise(function (r) { setTimeout(r, 1500 * (n + 1)); }).then(function () { return attempt(n + 1); });
          }
          throw err;
        });
    }
    return attempt(0);
  }

  function safeImageUrl(url) {
    if (!url) return PLACEHOLDER;
    try {
      var u = new URL(url, window.location.href);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : PLACEHOLDER;
    } catch (e) { return PLACEHOLDER; }
  }

  /** Attaches the placeholder fallback to an <img>. Safe against loops. */
  function withFallback(img) {
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      if (img.getAttribute('src') !== PLACEHOLDER) img.src = PLACEHOLDER;
    });
    return img;
  }

  /** Small SVG icon (SVG must be created with its namespace). */
  function icon(pathD, cls) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', cls || 'w-4 h-4');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', pathD);
    svg.appendChild(p);
    return svg;
  }
  var PLAY_PATH = 'M8 5v14l11-7z';

  function badge(text, cls) {
    return el('span', { class: 'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ' + cls, text: text });
  }

  function hasGenre(v, word) {
    word = word.toLowerCase();
    return (v.genre || []).some(function (g) { return String(g).toLowerCase().indexOf(word) !== -1; });
  }

  function watchUrl(id, extra) {
    var q = 'id=' + encodeURIComponent(id);
    if (extra) Object.keys(extra).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(extra[k]); });
    return '/watch.html?' + q;
  }

  function setupAdBar() {
    var bar = $('adBar');
    var close = $('adClose');
    if (!bar || !close) return;
    close.addEventListener('click', function () {
      bar.remove();
      document.body.classList.remove('has-ad-bar');
    });
  }

  /* ---------------------------------------------------------------- */
  /* Catalog page                                                      */
  /* ---------------------------------------------------------------- */

  function initHome() {
    var allVideos = [];
    var currentFilter = 'all';
    var searchTerm = '';

    var header = $('siteHeader');
    window.addEventListener('scroll', function () {
      header.classList.toggle('bg-ink', window.scrollY > 40);
    }, { passive: true });

    $('year').textContent = new Date().getFullYear();
    $('retryBtn').addEventListener('click', load);

    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentFilter = btn.getAttribute('data-filter');
        document.querySelectorAll('.filter-btn').forEach(function (b) {
          var on = b.getAttribute('data-filter') === currentFilter;
          b.classList.toggle('text-white', on);
          b.classList.toggle('font-semibold', on);
        });
        render();
      });
    });

    var searchTimer;
    $('searchInput').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        searchTerm = e.target.value.trim().toLowerCase();
        render();
      }, 200);
    });

    function load() {
      $('errorBox').classList.add('hidden');
      $('loading').classList.remove('hidden');
      $('rows').innerHTML = '';
      apiGet('/api/videos')
        .then(function (data) {
          allVideos = Array.isArray(data) ? data : [];
          $('loading').classList.add('hidden');
          render();
        })
        .catch(function (err) {
          $('loading').classList.add('hidden');
          $('errorText').textContent = err.message === 'Failed to fetch' || err.name === 'AbortError'
            ? 'The server may be waking up. Please try again in a few seconds.'
            : err.message;
          $('errorBox').classList.remove('hidden');
        });
    }

    function render() {
      var rows = $('rows');
      rows.innerHTML = '';

      var list = allVideos.filter(function (v) {
        if (currentFilter !== 'all' && v.type !== currentFilter) return false;
        if (searchTerm) {
          var hay = (v.title + ' ' + (v.genre || []).join(' ')).toLowerCase();
          if (hay.indexOf(searchTerm) === -1) return false;
        }
        return true;
      });

      $('emptyBox').classList.toggle('hidden', list.length > 0);

      // Search mode: one grid of results, no hero.
      if (searchTerm) {
        $('hero').classList.add('hidden');
        rows.style.marginTop = '7rem';
        if (list.length) rows.appendChild(buildGrid('Results for “' + searchTerm + '”', list));
        return;
      }

      renderHero(list[0]);
      rows.style.marginTop = list.length ? '-3rem' : '7rem';
      if (!list.length) return;

      var sections = [];
      var anime = list.filter(function (v) { return hasGenre(v, 'anime'); });
      var dubs = list.filter(function (v) { return hasGenre(v, 'dub') || /\bdub(bed)?\b/i.test(v.title); });
      var movies = list.filter(function (v) { return v.type === 'movie'; });
      var series = list.filter(function (v) { return v.type === 'series'; });

      // Trending: 4K first, then newest.
      var trending = anime.slice().sort(function (a, b) {
        return (b.qualityBadge === '4K') - (a.qualityBadge === '4K');
      });

      sections.push(['Trending Anime', trending]);
      sections.push(['Latest Dubs', dubs]);
      sections.push(['Popular Movies', movies]);
      sections.push(['TV Series', series]);
      sections.push(['Recently Added', list]);

      // Extra rows per genre (most common first), skipping ones already shown.
      var counts = {};
      list.forEach(function (v) {
        (v.genre || []).forEach(function (g) {
          var key = String(g).trim();
          if (!key || /^(anime|dub|dubbed)$/i.test(key)) return;
          counts[key] = (counts[key] || 0) + 1;
        });
      });
      Object.keys(counts)
        .filter(function (g) { return counts[g] >= 2; })
        .sort(function (a, b) { return counts[b] - counts[a]; })
        .slice(0, 6)
        .forEach(function (g) {
          sections.push([g, list.filter(function (v) { return hasGenre(v, g); })]);
        });

      sections.forEach(function (s) {
        if (s[1].length) rows.appendChild(buildRow(s[0], s[1]));
      });
    }

    function renderHero(v) {
      var hero = $('hero');
      if (!v) { hero.classList.add('hidden'); return; }
      hero.classList.remove('hidden');
      var img = safeImageUrl(v.posterUrl);
      // Preload so a broken poster falls back to the placeholder.
      var probe = new Image();
      probe.onload = function () { $('heroBg').style.backgroundImage = 'url("' + img.replace(/"/g, '%22') + '")'; };
      probe.onerror = function () { $('heroBg').style.backgroundImage = 'url("' + PLACEHOLDER + '")'; };
      probe.src = img;

      $('heroTitle').textContent = v.title;
      $('heroDesc').textContent = v.description || '';
      $('heroPlay').href = watchUrl(v._id);
      var meta = $('heroMeta');
      meta.innerHTML = '';
      meta.appendChild(badge(v.qualityBadge || 'HD', 'bg-brand text-white'));
      meta.appendChild(badge(v.type === 'series' ? 'Series' : 'Movie', 'bg-white/15 text-white'));
      (v.genre || []).slice(0, 3).forEach(function (g) {
        meta.appendChild(el('span', { class: 'text-gray-300', text: g }));
      });
    }

    function buildCard(v, wide) {
      var img = withFallback(el('img', {
        src: safeImageUrl(v.posterUrl),
        alt: v.title,
        loading: 'lazy',
        decoding: 'async',
        class: 'w-full h-full object-cover',
      }));

      return el('a', {
        href: watchUrl(v._id),
        class: 'poster-card group block flex-shrink-0 focus:outline-none ' + (wide ? '' : 'w-32 sm:w-40 md:w-44 snap-start'),
        title: v.title,
      }, [
        el('div', { class: 'relative aspect-[2/3] rounded-md overflow-hidden bg-panel ring-1 ring-white/5 group-hover:ring-brand/70 group-focus-visible:ring-brand' }, [
          img,
          el('div', { class: 'absolute top-1.5 left-1.5 flex gap-1' }, [
            badge(v.qualityBadge || 'HD', 'bg-brand text-white shadow'),
          ]),
          v.type === 'series' ? el('div', { class: 'absolute top-1.5 right-1.5' }, [badge('Series', 'bg-black/70 text-gray-200')]) : null,
          el('div', { class: 'play-badge absolute inset-0 flex items-center justify-center' }, [
            el('span', { class: 'w-12 h-12 rounded-full bg-brand/90 flex items-center justify-center shadow-lg text-white' }, [
              icon(PLAY_PATH, 'w-6 h-6 ml-0.5'),
            ]),
          ]),
        ]),
        el('p', { class: 'mt-2 text-sm font-medium truncate text-gray-200 group-hover:text-white', text: v.title }),
        el('p', { class: 'text-xs text-gray-500 truncate', text: (v.genre || []).slice(0, 2).join(' • ') || (v.type === 'series' ? 'Series' : 'Movie') }),
      ]);
    }

    function buildRow(title, items) {
      var track = el('div', { class: 'no-scrollbar flex gap-3 md:gap-4 overflow-x-auto snap-x scroll-smooth pb-2' });
      items.forEach(function (v) { track.appendChild(buildCard(v)); });

      function scrollBy(dir) { track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: 'smooth' }); }
      var arrowCls = 'hidden md:flex absolute top-0 bottom-8 w-10 items-center justify-center bg-ink/70 hover:bg-ink/90 text-2xl z-10 opacity-0 group-hover/row:opacity-100 transition';

      return el('section', { class: 'relative' }, [
        el('h2', { class: 'text-lg md:text-xl font-bold mb-3', text: title }),
        el('div', { class: 'relative group/row' }, [
          el('button', { type: 'button', 'aria-label': 'Scroll left', class: arrowCls + ' left-0 rounded-r', text: '‹', onclick: function () { scrollBy(-1); } }),
          track,
          el('button', { type: 'button', 'aria-label': 'Scroll right', class: arrowCls + ' right-0 rounded-l', text: '›', onclick: function () { scrollBy(1); } }),
        ]),
      ]);
    }

    function buildGrid(title, items) {
      var grid = el('div', { class: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4' });
      items.forEach(function (v) { grid.appendChild(buildCard(v, true)); });
      return el('section', {}, [el('h2', { class: 'text-lg md:text-xl font-bold mb-4', text: title }), grid]);
    }

    load();
  }

  /* ---------------------------------------------------------------- */
  /* Watch page                                                        */
  /* ---------------------------------------------------------------- */

  function initWatch() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var video = null;
    var episodes = [];      // sorted list for series
    var currentEp = null;   // current episode object (series)
    var currentSources = [];
    var SERVER_PREF_KEY = 'tdub:server';

    if (!id) return showError('No video selected.', 'Pick a title from the catalog.');

    apiGet('/api/videos/' + encodeURIComponent(id))
      .then(function (data) {
        video = data;
        $('loading').classList.add('hidden');
        $('watchMain').classList.remove('hidden');
        renderDetails();
        if (video.type === 'series') setupSeries();
        else setupMovie();
      })
      .catch(function (err) {
        if (err.status === 404) showError('Video not found.', 'It may have been removed.');
        else showError('Couldn’t load this video.', 'The server may be waking up. Refresh in a few seconds.');
      });

    function showError(title, text) {
      $('loading').classList.add('hidden');
      $('errorTitle').textContent = title;
      $('errorText').textContent = text || '';
      $('errorBox').classList.remove('hidden');
    }

    function renderDetails() {
      document.title = video.title + ' — TDub';
      $('detailTitle').textContent = video.title;
      $('detailDesc').textContent = video.description || '';
      var poster = withFallback($('detailPoster'));
      poster.src = safeImageUrl(video.posterUrl);
      poster.alt = video.title;

      var meta = $('detailMeta');
      meta.innerHTML = '';
      meta.appendChild(badge(video.qualityBadge || 'HD', 'bg-brand text-white'));
      meta.appendChild(badge(video.type === 'series' ? 'Series' : 'Movie', 'bg-white/15 text-white'));
      (video.genre || []).forEach(function (g) {
        meta.appendChild(el('span', { class: 'px-2 py-0.5 rounded-full bg-white/5 text-gray-300', text: g }));
      });
    }

    /* ----- Player + server switcher ----- */

    function isPlayableUrl(url) {
      try {
        var u = new URL(url);
        return u.protocol === 'https:' || u.protocol === 'http:';
      } catch (e) { return false; }
    }

    function loadSources(sources, label) {
      currentSources = (sources || []).filter(function (s) { return s && isPlayableUrl(s.url); });
      $('nowPlaying').textContent = label || '';

      var list = $('serverList');
      list.innerHTML = '';

      if (!currentSources.length) {
        $('player').src = 'about:blank';
        $('playerMsg').classList.remove('hidden');
        list.appendChild(el('p', { class: 'text-sm text-gray-500', text: 'No servers available.' }));
        return;
      }

      // Re-use the server the viewer picked last time if it exists here.
      var preferred = localStorage.getItem(SERVER_PREF_KEY);
      var startIndex = 0;
      currentSources.forEach(function (s, i) { if (preferred && s.serverName === preferred) startIndex = i; });

      currentSources.forEach(function (s, i) {
        list.appendChild(el('button', {
          type: 'button',
          role: 'tab',
          'data-index': String(i),
          class: 'server-btn inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium ring-1 transition',
          onclick: function () {
            localStorage.setItem(SERVER_PREF_KEY, s.serverName);
            selectServer(i);
          },
        }, [
          icon(PLAY_PATH, 'w-3.5 h-3.5'),
          s.serverName || ('Server ' + (i + 1)),
        ]));
      });
      selectServer(startIndex);
    }

    function selectServer(index) {
      var src = currentSources[index];
      if (!src) return;
      $('playerMsg').classList.add('hidden');
      var player = $('player');
      if (player.src !== src.url) player.src = src.url;

      document.querySelectorAll('.server-btn').forEach(function (b) {
        var on = Number(b.getAttribute('data-index')) === index;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.className = 'server-btn inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium ring-1 transition ' +
          (on ? 'bg-brand text-white ring-brand' : 'bg-white/5 text-gray-300 ring-white/10 hover:bg-white/10 hover:text-white');
      });
    }

    /* ----- Movie ----- */

    function setupMovie() {
      loadSources(video.sources, 'Now playing: ' + video.title);
    }

    /* ----- Series ----- */

    function setupSeries() {
      episodes = (video.episodes || []).slice().sort(function (a, b) {
        return a.season - b.season || a.episodeNumber - b.episodeNumber;
      });
      if (!episodes.length) {
        loadSources([], 'No episodes yet.');
        return;
      }

      $('episodePanel').classList.remove('hidden');
      $('epNav').classList.remove('hidden');

      var seasons = [];
      episodes.forEach(function (ep) { if (seasons.indexOf(ep.season) === -1) seasons.push(ep.season); });

      var select = $('seasonSelect');
      select.innerHTML = '';
      seasons.forEach(function (s) {
        select.appendChild(el('option', { value: String(s), text: s === 0 ? 'Specials' : 'Season ' + s }));
      });
      select.addEventListener('change', function () { renderEpisodeList(Number(select.value)); });
      $('episodeFilter').addEventListener('input', function () { renderEpisodeList(Number(select.value)); });

      $('prevEp').addEventListener('click', function () { stepEpisode(-1); });
      $('nextEp').addEventListener('click', function () { stepEpisode(1); });

      // Start from ?s=&e= in the URL, otherwise the first episode.
      var s = Number(params.get('s'));
      var e = Number(params.get('e'));
      var start = episodes.filter(function (ep) { return ep.season === s && ep.episodeNumber === e; })[0] || episodes[0];
      playEpisode(start, false);
    }

    function renderEpisodeList(season) {
      var list = $('episodeList');
      var term = $('episodeFilter').value.trim().toLowerCase();
      list.innerHTML = '';
      episodes
        .filter(function (ep) { return ep.season === season; })
        .filter(function (ep) {
          if (!term) return true;
          return String(ep.episodeNumber).indexOf(term) !== -1 || (ep.title || '').toLowerCase().indexOf(term) !== -1;
        })
        .forEach(function (ep) {
          var active = currentEp && ep.season === currentEp.season && ep.episodeNumber === currentEp.episodeNumber;
          list.appendChild(el('li', {}, [
            el('button', {
              type: 'button',
              'aria-current': active ? 'true' : null,
              class: 'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition ' +
                (active ? 'bg-brand/20 text-white ring-1 ring-brand/60' : 'hover:bg-white/5 text-gray-300'),
              onclick: function () { playEpisode(ep, true); },
            }, [
              el('span', {
                class: 'w-9 h-9 flex-shrink-0 rounded flex items-center justify-center font-bold ' + (active ? 'bg-brand text-white' : 'bg-white/5 text-gray-400'),
                text: String(ep.episodeNumber),
              }),
              el('span', { class: 'truncate', text: ep.title || ('Episode ' + ep.episodeNumber) }),
            ]),
          ]));
        });
      if (!list.children.length) {
        list.appendChild(el('li', { class: 'text-sm text-gray-500 px-3 py-4', text: 'No episodes match.' }));
      }
      var activeBtn = list.querySelector('[aria-current="true"]');
      if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest' });
    }

    function playEpisode(ep, updateUrl) {
      currentEp = ep;
      $('seasonSelect').value = String(ep.season);
      renderEpisodeList(ep.season);

      var label = 'Now playing: S' + ep.season + ' E' + ep.episodeNumber + (ep.title ? ' — ' + ep.title : '');
      loadSources(ep.sources, label);

      var idx = episodes.indexOf(ep);
      $('prevEp').disabled = idx <= 0;
      $('nextEp').disabled = idx >= episodes.length - 1;

      if (updateUrl) {
        history.replaceState(null, '', watchUrl(video._id, { s: ep.season, e: ep.episodeNumber }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function stepEpisode(dir) {
      var idx = episodes.indexOf(currentEp) + dir;
      if (idx >= 0 && idx < episodes.length) playEpisode(episodes[idx], true);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    setupAdBar();
    var page = document.body.getAttribute('data-page');
    if (page === 'home') initHome();
    else if (page === 'watch') initWatch();
  });
})();
