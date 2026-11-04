/**
 * TDub admin dashboard — login + upload form.
 * The password is never stored in the page; it is sent to the API as a Bearer token
 * and checked on the server for every upload.
 */
(function () {
  'use strict';

  var CONFIG = window.TDUB_CONFIG || {};
  var API_BASE = String(CONFIG.API_BASE || '').replace(/\/+$/, '');
  var PLACEHOLDER = CONFIG.PLACEHOLDER_POSTER || '/assets/placeholder-poster.svg';
  var STORE_KEY = 'tdub:admin';

  var password = null;

  function $(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------- */
  /* Auth                                                              */
  /* ---------------------------------------------------------------- */

  function getSaved() {
    return sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY);
  }

  function savePassword(pw, remember) {
    clearSaved();
    (remember ? localStorage : sessionStorage).setItem(STORE_KEY, pw);
  }

  function clearSaved() {
    sessionStorage.removeItem(STORE_KEY);
    localStorage.removeItem(STORE_KEY);
  }

  function verify(pw) {
    return fetch(API_BASE + '/api/admin/verify', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + pw },
    }).then(function (res) {
      if (res.status === 401) throw new Error('Wrong password.');
      if (res.status === 429) throw new Error('Too many attempts. Wait a few minutes.');
      if (!res.ok) throw new Error('Server error (' + res.status + ').');
      return true;
    });
  }

  function showAdmin() {
    $('loginView').classList.add('hidden');
    $('adminView').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
    loadLibrary();
  }

  function showLogin(message) {
    password = null;
    $('adminView').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    var err = $('loginError');
    err.textContent = message || '';
    err.classList.toggle('hidden', !message);
    $('passwordInput').focus();
  }

  function initAuth() {
    $('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = $('passwordInput').value;
      if (!pw) return;
      var btn = $('loginBtn');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      $('loginError').classList.add('hidden');

      verify(pw)
        .then(function () {
          password = pw;
          savePassword(pw, $('rememberMe').checked);
          $('passwordInput').value = '';
          showAdmin();
        })
        .catch(function (err) {
          showLogin(err.message === 'Failed to fetch' ? 'Cannot reach the server. It may be waking up — try again.' : err.message);
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = 'Unlock';
        });
    });

    $('logoutBtn').addEventListener('click', function () {
      clearSaved();
      showLogin();
    });

    var saved = getSaved();
    if (saved) {
      verify(saved)
        .then(function () { password = saved; showAdmin(); })
        .catch(function (err) {
          if (err.message === 'Wrong password.') clearSaved();
          showLogin();
        });
    } else {
      showLogin();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Form building                                                     */
  /* ---------------------------------------------------------------- */

  function cloneTpl(id) {
    return document.getElementById(id).content.firstElementChild.cloneNode(true);
  }

  function addSourceRow(container, defaults) {
    var row = cloneTpl('sourceRowTpl');
    var count = container.querySelectorAll('.source-row').length;
    var name = row.querySelector('.src-name');
    var url = row.querySelector('.src-url');
    name.value = (defaults && defaults.serverName) || (count === 0 ? 'Server 1 (Abyss)' : 'Server ' + (count + 1) + ' (Backup)');
    url.value = (defaults && defaults.url) || '';
    if (count === 0) url.placeholder = 'Primary Abyss embed URL (https://abyss.to/...)';
    else url.placeholder = 'Backup mirror embed URL';
    row.querySelector('.remove-source').addEventListener('click', function () {
      if (container.querySelectorAll('.source-row').length <= 1) {
        name.value = 'Server 1 (Abyss)';
        url.value = '';
        return;
      }
      row.remove();
    });
    container.appendChild(row);
    return row;
  }

  function relabelEpisodes() {
    var cards = $('episodesContainer').querySelectorAll('.episode-card');
    cards.forEach(function (card, i) {
      card.querySelector('.episode-label').textContent = 'Episode entry #' + (i + 1);
    });
  }

  function addEpisode() {
    var container = $('episodesContainer');
    var card = cloneTpl('episodeTpl');

    // Smart defaults: same season, next episode number.
    var last = container.querySelector('.episode-card:last-child');
    if (last) {
      card.querySelector('.ep-season').value = last.querySelector('.ep-season').value || 1;
      card.querySelector('.ep-number').value = (Number(last.querySelector('.ep-number').value) || 0) + 1;
    }

    var sources = card.querySelector('.ep-sources');
    addSourceRow(sources);
    card.querySelector('.add-ep-source').addEventListener('click', function () { addSourceRow(sources); });
    card.querySelector('.remove-episode').addEventListener('click', function () {
      if (container.querySelectorAll('.episode-card').length <= 1) return;
      card.remove();
      relabelEpisodes();
    });

    container.appendChild(card);
    relabelEpisodes();
    return card;
  }

  function currentType() {
    var checked = document.querySelector('input[name="type"]:checked');
    return checked ? checked.value : 'movie';
  }

  function applyTypeToggle() {
    var isSeries = currentType() === 'series';
    $('movieSection').classList.toggle('hidden', isSeries);
    $('seriesSection').classList.toggle('hidden', !isSeries);
    if (isSeries && !$('episodesContainer').children.length) addEpisode();
  }

  function setupPosterPreview() {
    var input = $('posterUrl');
    var img = $('posterPreview');
    var status = $('posterStatus');
    var timer;

    img.addEventListener('load', function () {
      status.textContent = img.src.indexOf(PLACEHOLDER) !== -1 ? '' : 'Image loaded ✓';
      status.className = 'text-xs mt-1 text-emerald-400';
    });
    img.addEventListener('error', function () {
      status.textContent = 'Could not load that image — the site will show a placeholder.';
      status.className = 'text-xs mt-1 text-amber-400';
      img.src = PLACEHOLDER;
    });
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var v = input.value.trim();
        status.textContent = '';
        img.src = /^https?:\/\//i.test(v) ? v : PLACEHOLDER;
      }, 350);
    });
  }

  function resetForm() {
    $('uploadForm').reset();
    $('movieSources').innerHTML = '';
    $('episodesContainer').innerHTML = '';
    addSourceRow($('movieSources'));
    $('posterPreview').src = PLACEHOLDER;
    $('posterStatus').textContent = '';
    applyTypeToggle();
  }

  /* ---------------------------------------------------------------- */
  /* Collect + validate + submit                                       */
  /* ---------------------------------------------------------------- */

  function isUrl(v) {
    try {
      var u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) { return false; }
  }

  function readSources(container, label) {
    var out = [];
    container.querySelectorAll('.source-row').forEach(function (row, i) {
      var url = row.querySelector('.src-url').value.trim();
      var name = row.querySelector('.src-name').value.trim();
      if (!url) return;
      if (!isUrl(url)) throw new Error(label + ': link #' + (i + 1) + ' is not a valid URL.');
      out.push({ serverName: name || 'Server ' + (out.length + 1), url: url });
    });
    return out;
  }

  function collect() {
    var type = currentType();
    var title = $('title').value.trim();
    if (!title) throw new Error('Title is required.');

    var posterUrl = $('posterUrl').value.trim();
    if (posterUrl && !isUrl(posterUrl)) throw new Error('Poster URL must start with http:// or https://');

    var payload = {
      title: title,
      description: $('description').value.trim(),
      posterUrl: posterUrl,
      type: type,
      genre: $('genre').value.split(',').map(function (g) { return g.trim(); }).filter(Boolean),
      qualityBadge: $('qualityBadge').value,
    };

    if (type === 'movie') {
      payload.sources = readSources($('movieSources'), 'Movie');
      if (!payload.sources.length) throw new Error('Add at least one video link (the primary Abyss URL).');
    } else {
      var seen = {};
      payload.episodes = [];
      $('episodesContainer').querySelectorAll('.episode-card').forEach(function (card) {
        var season = parseInt(card.querySelector('.ep-season').value, 10);
        var num = parseInt(card.querySelector('.ep-number').value, 10);
        if (!isFinite(season) || season < 0) throw new Error('Every episode needs a valid Season #.');
        if (!isFinite(num) || num < 0) throw new Error('Every episode needs a valid Episode #.');
        var key = season + '-' + num;
        if (seen[key]) throw new Error('Duplicate episode: S' + season + 'E' + num + '.');
        seen[key] = true;
        var label = 'S' + season + 'E' + num;
        var sources = readSources(card.querySelector('.ep-sources'), label);
        if (!sources.length) throw new Error(label + ' needs at least one video link.');
        payload.episodes.push({
          season: season,
          episodeNumber: num,
          title: card.querySelector('.ep-title').value.trim(),
          sources: sources,
        });
      });
      if (!payload.episodes.length) throw new Error('Add at least one episode.');
    }
    return payload;
  }

  function setStatus(kind, message) {
    var box = $('formStatus');
    box.textContent = message;
    box.className = 'rounded-md px-4 py-3 text-sm ' + (kind === 'ok'
      ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30'
      : 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30');
    box.classList.remove('hidden');
  }

  function onSubmit(e) {
    e.preventDefault();
    $('formStatus').classList.add('hidden');

    var payload;
    try { payload = collect(); } catch (err) { setStatus('error', err.message); return; }

    var btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Publishing…';

    fetch(API_BASE + '/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + password },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.status === 401) {
            clearSaved();
            showLogin('Session expired or password changed. Please log in again.');
            throw new Error('Unauthorized');
          }
          if (!res.ok) throw new Error(data.error || ('Upload failed (' + res.status + ').'));
          return data;
        });
      })
      .then(function (video) {
        resetForm();
        var msg = '“' + video.title + '” was published successfully.';
        setStatus('ok', msg);
        loadLibrary();
        window.alert('✅ ' + msg);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (err) {
        if (err.message === 'Unauthorized') return;
        var msg = err.message === 'Failed to fetch' ? 'Cannot reach the server. Check the API URL or try again.' : err.message;
        setStatus('error', msg);
        window.alert('❌ ' + msg);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Publish title';
      });
  }

  /* ---------------------------------------------------------------- */
  /* Manage Library (GET/DELETE /api/media, episodes add/delete)       */
  /* ---------------------------------------------------------------- */

  var library = [];
  var openSeries = {}; // remembers which series panels are expanded

  /** fetch() wrapper for admin calls: adds the password, parses JSON, handles 401. */
  function adminFetch(path, options) {
    options = options || {};
    var headers = { Authorization: 'Bearer ' + password };
    if (options.body) headers['Content-Type'] = 'application/json';
    return fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          clearSaved();
          showLogin('Session expired or password changed. Please log in again.');
          throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ').'));
        return data;
      });
    }).catch(function (err) {
      if (err.message === 'Failed to fetch') throw new Error('Cannot reach the server. Check that the API is running.');
      throw err;
    });
  }

  function setLibraryStatus(kind, message) {
    var box = $('libraryStatus');
    if (!message) { box.classList.add('hidden'); return; }
    box.textContent = message;
    box.className = 'mt-4 rounded-md px-4 py-3 text-sm ' + (kind === 'ok'
      ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30'
      : 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30');
    clearTimeout(setLibraryStatus.timer);
    if (kind === 'ok') setLibraryStatus.timer = setTimeout(function () { box.classList.add('hidden'); }, 4000);
  }

  function loadLibrary() {
    if (!password) return;
    $('libraryLoading').classList.remove('hidden');
    adminFetch('/api/media')
      .then(function (items) {
        library = Array.isArray(items) ? items : [];
        renderLibrary();
      })
      .catch(function (err) {
        if (err.message !== 'Unauthorized') setLibraryStatus('error', err.message);
      })
      .then(function () { $('libraryLoading').classList.add('hidden'); });
  }

  /** Replace one item in the local list (after an episode change) and redraw. */
  function replaceItem(updated) {
    library = library.map(function (v) { return v._id === updated._id ? updated : v; });
    renderLibrary();
  }

  function setPoster(img, url) {
    img.src = url || PLACEHOLDER;
    img.onerror = function () { img.onerror = null; img.src = PLACEHOLDER; };
  }

  function epCode(ep) {
    return 'S' + String(ep.season).padStart(2, '0') + 'E' + String(ep.episodeNumber).padStart(2, '0');
  }

  function emptyNote(text) {
    var li = document.createElement('li');
    li.className = 'text-sm text-gray-500 px-1';
    li.textContent = text;
    return li;
  }

  function renderLibrary() {
    var q = $('librarySearch').value.trim().toLowerCase();
    var filter = $('libraryFilter').value;
    var movies = [];
    var series = [];
    library.forEach(function (v) {
      if (q && String(v.title || '').toLowerCase().indexOf(q) === -1) return;
      if (v.type === 'series') series.push(v); else movies.push(v);
    });

    var totalMovies = library.filter(function (v) { return v.type !== 'series'; }).length;
    $('libraryCount').textContent = totalMovies + ' movie' + (totalMovies === 1 ? '' : 's') + ' · ' +
      (library.length - totalMovies) + ' series';

    $('moviesBlock').classList.toggle('hidden', filter === 'series');
    $('seriesBlock').classList.toggle('hidden', filter === 'movie');

    var moviesList = $('moviesList');
    moviesList.innerHTML = '';
    movies.forEach(function (m) { moviesList.appendChild(renderMovie(m)); });
    if (!movies.length) moviesList.appendChild(emptyNote(q ? 'No movies match your search.' : 'No movies yet.'));

    var seriesList = $('seriesList');
    seriesList.innerHTML = '';
    series.forEach(function (s) { seriesList.appendChild(renderSeries(s)); });
    if (!series.length) seriesList.appendChild(emptyNote(q ? 'No series match your search.' : 'No series yet.'));
  }

  function fillCommon(el, item, metaText) {
    setPoster(el.querySelector('.item-poster'), item.posterUrl);
    el.querySelector('.item-title').textContent = item.title;
    el.querySelector('.item-meta').textContent = metaText;
    el.querySelector('.item-watch').href = '/watch.html?id=' + encodeURIComponent(item._id);
  }

  function renderMovie(movie) {
    var li = cloneTpl('movieItemTpl');
    var links = (movie.sources || []).length;
    fillCommon(li, movie, [movie.qualityBadge, links + ' link' + (links === 1 ? '' : 's'), (movie.genre || []).join(', ')]
      .filter(Boolean).join(' · '));
    li.querySelector('.delete-media').addEventListener('click', function (e) { deleteMedia(movie, e.currentTarget); });
    return li;
  }

  function renderSeries(series) {
    var li = cloneTpl('seriesItemTpl');
    var episodes = series.episodes || [];
    var seasons = {};
    episodes.forEach(function (ep) { seasons[ep.season] = true; });
    var seasonCount = Object.keys(seasons).length;
    fillCommon(li, series, [series.qualityBadge,
      seasonCount + ' season' + (seasonCount === 1 ? '' : 's'),
      episodes.length + ' episode' + (episodes.length === 1 ? '' : 's')].filter(Boolean).join(' · '));

    // Delete the whole series (and all its episodes)
    li.querySelector('.delete-media').addEventListener('click', function (e) { deleteMedia(series, e.currentTarget); });

    // Expand / collapse episodes
    var panel = li.querySelector('.episodes-panel');
    var label = li.querySelector('.toggle-label');
    function applyOpen() {
      var open = !!openSeries[series._id];
      panel.classList.toggle('hidden', !open);
      label.textContent = open ? 'Hide episodes' : 'Show episodes (' + episodes.length + ')';
    }
    li.querySelectorAll('.toggle-episodes').forEach(function (btn) {
      btn.addEventListener('click', function () { openSeries[series._id] = !openSeries[series._id]; applyOpen(); });
    });
    applyOpen();

    // Episode rows
    var list = li.querySelector('.episode-list');
    episodes.forEach(function (ep) {
      var row = cloneTpl('episodeItemTpl');
      row.querySelector('.ep-code').textContent = epCode(ep);
      row.querySelector('.ep-name').textContent = ep.title || 'Episode ' + ep.episodeNumber;
      var n = (ep.sources || []).length;
      row.querySelector('.ep-links').textContent = n + ' link' + (n === 1 ? '' : 's');
      var del = row.querySelector('.delete-episode');
      if (!ep._id) {
        del.disabled = true;
        del.title = 'Restart the server once so older episodes get an ID.';
      } else {
        del.addEventListener('click', function () { deleteEpisode(series, ep, del); });
      }
      list.appendChild(row);
    });
    if (!episodes.length) list.appendChild(emptyNote('No episodes yet — add one below.'));

    // Inline add-episode form: default to the last season, next episode number
    var form = li.querySelector('.add-episode-form');
    var last = episodes[episodes.length - 1];
    form.querySelector('.ae-season').value = last ? last.season : 1;
    form.querySelector('.ae-number').value = last ? last.episodeNumber + 1 : 1;
    form.addEventListener('submit', function (e) { e.preventDefault(); addEpisodeTo(series, form); });

    return li;
  }

  function deleteMedia(item, btn) {
    var kind = item.type === 'series' ? 'series (and all its episodes)' : 'movie';
    if (!window.confirm('Delete the ' + kind + ' “' + item.title + '”? This cannot be undone.')) return;
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    adminFetch('/api/media/' + encodeURIComponent(item._id), { method: 'DELETE' })
      .then(function () {
        library = library.filter(function (v) { return v._id !== item._id; });
        delete openSeries[item._id];
        renderLibrary();
        setLibraryStatus('ok', '“' + item.title + '” was deleted.');
      })
      .catch(function (err) {
        if (err.message === 'Unauthorized') return;
        btn.disabled = false;
        btn.textContent = item.type === 'series' ? 'Delete Series' : 'Delete Movie';
        setLibraryStatus('error', err.message);
      });
  }

  function deleteEpisode(series, ep, btn) {
    if (!window.confirm('Delete ' + epCode(ep) + ' from “' + series.title + '”?')) return;
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    adminFetch('/api/media/' + encodeURIComponent(series._id) + '/episodes/' + encodeURIComponent(ep._id), { method: 'DELETE' })
      .then(function (updated) {
        replaceItem(updated);
        setLibraryStatus('ok', epCode(ep) + ' was removed from “' + series.title + '”.');
      })
      .catch(function (err) {
        if (err.message === 'Unauthorized') return;
        btn.disabled = false;
        btn.textContent = 'Delete Episode';
        setLibraryStatus('error', err.message);
      });
  }

  function addEpisodeTo(series, form) {
    var season = parseInt(form.querySelector('.ae-season').value, 10);
    var num = parseInt(form.querySelector('.ae-number').value, 10);
    var url = form.querySelector('.ae-url').value.trim();
    if (!isFinite(season) || season < 0) return setLibraryStatus('error', 'Enter a valid season number.');
    if (!isFinite(num) || num < 0) return setLibraryStatus('error', 'Enter a valid episode number.');
    if (!isUrl(url)) return setLibraryStatus('error', 'Enter a valid video link (https://…).');

    var btn = form.querySelector('.ae-submit');
    btn.disabled = true;
    btn.textContent = 'Adding…';
    adminFetch('/api/media/' + encodeURIComponent(series._id) + '/episodes', {
      method: 'POST',
      body: {
        season: season,
        episodeNumber: num,
        title: form.querySelector('.ae-title').value.trim(),
        sources: [{ serverName: 'Server 1 (Abyss)', url: url }],
      },
    })
      .then(function (updated) {
        openSeries[series._id] = true;
        replaceItem(updated);
        setLibraryStatus('ok', 'S' + season + 'E' + num + ' was added to “' + series.title + '”.');
      })
      .catch(function (err) {
        if (err.message === 'Unauthorized') return;
        btn.disabled = false;
        btn.textContent = '+ Add Episode';
        setLibraryStatus('error', err.message);
      });
  }

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    initAuth();

    document.querySelectorAll('input[name="type"]').forEach(function (r) {
      r.addEventListener('change', applyTypeToggle);
    });
    $('addMovieSource').addEventListener('click', function () { addSourceRow($('movieSources')); });
    $('addEpisode').addEventListener('click', addEpisode);
    $('resetBtn').addEventListener('click', function () {
      if (window.confirm('Clear everything in the form?')) {
        resetForm();
        $('formStatus').classList.add('hidden');
      }
    });
    $('uploadForm').addEventListener('submit', onSubmit);

    // Manage Library controls
    $('refreshLibrary').addEventListener('click', loadLibrary);
    $('libraryFilter').addEventListener('change', renderLibrary);
    var searchTimer;
    $('librarySearch').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderLibrary, 200);
    });

    setupPosterPreview();
    resetForm();
  });
})();
