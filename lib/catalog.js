'use strict';

// Keeps the list of series and episodes in one JSON file (data/catalog.json).
// Every change is checked here before it is saved.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.TDUB_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'catalog.json');

// Video qualities the player understands, best first.
const QUALITIES = ['2160p', '1440p', '1080p', '720p', '480p', '360p'];

function load() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { series: [] };
    throw err;
  }
  // If the file is damaged we stop here, so it is never overwritten by mistake.
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.series)) {
    throw new Error('data/catalog.json has the wrong shape. Fix or move the file, then start again.');
  }
  return parsed;
}

let db = load();

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, max, label, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw bad(`${label} is required.`);
  if (text.length > max) throw bad(`${label} is too long (the most is ${max} characters).`);
  return text;
}

function cleanLink(value, label) {
  const text = cleanText(value, 2000, label);
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw bad(`${label} must be a full link that starts with https://`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw bad(`${label} must start with https://`);
  }
  return url.href;
}

function cleanNumber(value, label, min, max, fallback) {
  if (value === '' || value === null || value === undefined) {
    if (fallback !== undefined) return fallback;
    throw bad(`${label} is required.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw bad(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function cleanGenres(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const out = [];
  for (const item of list) {
    const genre = cleanText(String(item), 30, 'Genre');
    if (genre && !out.some((g) => g.toLowerCase() === genre.toLowerCase())) out.push(genre);
  }
  if (out.length > 6) throw bad('Use at most 6 genres.');
  return out;
}

function cleanSources(value) {
  const sources = {};
  for (const q of QUALITIES) {
    const link = cleanLink(value && value[q], `${q} link`);
    if (link) sources[q] = link;
  }
  if (!Object.keys(sources).length) {
    throw bad('Add at least one video link, for example for 720p.');
  }
  return sources;
}

function findSeries(id) {
  return db.series.find((s) => s.id === id) || null;
}

// The short version of a series, used by the front page shelves.
function summary(s) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    year: s.year,
    genres: s.genres,
    poster: s.poster,
    backdrop: s.backdrop,
    featured: s.featured,
    createdAt: s.createdAt,
    type: s.type || 'series',
    duration: s.duration || '',
    episodeCount: s.episodes.length,
  };
}

function listSeries() {
  return db.series
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(summary);
}

function getSeries(id) {
  const s = findSeries(id);
  return s ? clone(s) : null;
}

function getAllSeries() {
  return clone(
    db.series.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );
}

function saveSeries(input) {
  if (!input || typeof input !== 'object') throw bad('Send the series details.');
  const now = new Date().toISOString();
  const existing = input.id ? findSeries(String(input.id)) : null;
  if (input.id && !existing) throw notFound('That series was not found.');

  // All checks run first, so a bad form never changes the saved data.
  const series = {
    id: existing ? existing.id : crypto.randomUUID(),
    type: existing ? existing.type || 'series' : 'series',
    title: cleanText(input.title, 120, 'Title', true),
    description: cleanText(input.description, 2000, 'Description'),
    year: cleanNumber(input.year, 'Year', 1900, 2100, null),
    genres: cleanGenres(input.genres),
    poster: cleanLink(input.poster, 'Poster link'),
    backdrop: cleanLink(input.backdrop, 'Wide banner link'),
    featured: input.featured === true || input.featured === 'true',
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    episodes: existing ? existing.episodes : [],
  };

  if (existing) Object.assign(existing, series);
  else db.series.push(series);
  save();
  return clone(series);
}

// A movie is saved as one video item, so the player and the movie page work the same way as for episodes.
function saveMovie(input) {
  if (!input || typeof input !== 'object') throw bad('Send the movie details.');
  const now = new Date().toISOString();
  const existing = input.id ? findSeries(String(input.id)) : null;
  if (input.id && (!existing || existing.type !== 'movie')) throw notFound('That movie was not found.');

  const title = cleanText(input.title, 120, 'Title', true);
  const description = cleanText(input.description, 2000, 'Description');
  const duration = cleanText(input.duration, 20, 'Length');
  const poster = cleanLink(input.poster, 'Poster link');
  const oldVideo = existing && existing.episodes[0];

  const movie = {
    id: existing ? existing.id : crypto.randomUUID(),
    type: 'movie',
    title,
    description,
    year: cleanNumber(input.year, 'Year', 1900, 2100, null),
    duration,
    genres: cleanGenres(input.genres),
    poster,
    backdrop: cleanLink(input.backdrop, 'Wide banner link'),
    featured: input.featured === true || input.featured === 'true',
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    episodes: [
      {
        id: oldVideo ? oldVideo.id : crypto.randomUUID(),
        season: 1,
        number: 1,
        title,
        description,
        duration,
        thumbnail: poster,
        sources: cleanSources(input.sources),
        updatedAt: now,
      },
    ],
  };

  if (existing) Object.assign(existing, movie);
  else db.series.push(movie);
  save();
  return clone(movie);
}

function deleteSeries(id) {
  const index = db.series.findIndex((s) => s.id === id);
  if (index === -1) throw notFound('That series was not found.');
  db.series.splice(index, 1);
  save();
}

function saveEpisode(seriesId, input) {
  const series = findSeries(seriesId);
  if (!series) throw notFound('That series was not found.');
  if (!input || typeof input !== 'object') throw bad('Send the episode details.');

  const now = new Date().toISOString();
  const existing = input.id ? series.episodes.find((e) => e.id === String(input.id)) : null;
  if (input.id && !existing) throw notFound('That episode was not found.');

  const episode = {
    id: existing ? existing.id : crypto.randomUUID(),
    season: cleanNumber(input.season, 'Season', 1, 99, 1),
    number: cleanNumber(input.number, 'Episode number', 1, 9999),
    title: cleanText(input.title, 150, 'Episode title'),
    description: cleanText(input.description, 1000, 'Episode description'),
    duration: cleanText(input.duration, 20, 'Length'),
    thumbnail: cleanLink(input.thumbnail, 'Thumbnail link'),
    sources: cleanSources(input.sources),
    updatedAt: now,
  };

  if (existing) Object.assign(existing, episode);
  else series.episodes.push(episode);
  series.episodes.sort((a, b) => a.season - b.season || a.number - b.number);
  series.updatedAt = now;
  save();
  return clone(episode);
}

function deleteEpisode(seriesId, episodeId) {
  const series = findSeries(seriesId);
  if (!series) throw notFound('That series was not found.');
  const index = series.episodes.findIndex((e) => e.id === episodeId);
  if (index === -1) throw notFound('That episode was not found.');
  series.episodes.splice(index, 1);
  series.updatedAt = new Date().toISOString();
  save();
}

module.exports = {
  QUALITIES,
  listSeries,
  getSeries,
  getAllSeries,
  saveSeries,
  saveMovie,
  deleteSeries,
  saveEpisode,
  deleteEpisode,
};
