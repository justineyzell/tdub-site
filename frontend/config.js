/**
 * TDub frontend config.
 * Set API_BASE to your deployed backend URL (no trailing slash),
 * e.g. "https://tdub-api.onrender.com".
 * When the site runs on localhost it talks to the local API automatically.
 */
(function () {
  var isLocal = ['localhost', '127.0.0.1'].indexOf(window.location.hostname) !== -1;
  window.TDUB_CONFIG = {
    API_BASE: isLocal ? 'http://localhost:3000' : 'https://tdud-streaming-api.onrender.com',
    PLACEHOLDER_POSTER: '/assets/placeholder-poster.svg',
  };
})();
