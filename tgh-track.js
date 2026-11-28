/* Tiny Game Hub - visitor tracker
   Add this line just before </body> on every page you want to track:
   <script src="/tgh-track.js" defer></script>
*/
(function () {
  var PROJECT = 'tinygamehub';
  var API_KEY = 'AIzaSyAfZ-7Y7_hxZVrJTnnFOGihQTLl3gRdGOk';
  var ENDPOINT = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/plays?key=' + API_KEY;
  var IDLE_LIMIT = 120000; // stop counting time after 2 minutes with no taps/keys/mouse

  // Don't track when testing on your own computer
  if (location.protocol === 'file:' || /^(localhost|127\.|192\.168\.)/.test(location.hostname)) return;

  function store(kind, key, val) {
    try {
      var s = kind === 'local' ? window.localStorage : window.sessionStorage;
      if (val === undefined) return s.getItem(key);
      s.setItem(key, val);
    } catch (e) { return null; }
  }

  // The admin dashboard can switch this on so your own plays aren't counted
  if (store('local', 'tgh_ignore') === '1') return;

  // Which game is this? ("/storm-sailor/" -> "storm-sailor", "/" -> "home")
  function gameName() {
    var parts = location.pathname.split('/').filter(function (p) { return p && !/^index\.html?$/i.test(p); });
    var name = parts.length ? parts[0].replace(/\.html?$/i, '') : 'home';
    name = name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    return name || 'home';
  }

  function makeId() {
    var c = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    for (var i = 0; i < 20; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }

  function deviceType() {
    var ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
        (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
    if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function referrer() {
    try {
      if (!document.referrer) return '';
      var h = new URL(document.referrer).hostname.replace(/^www\./, '');
      return h === location.hostname.replace(/^www\./, '') ? '' : h.slice(0, 100);
    } catch (e) { return ''; }
  }

  var vid = store('local', 'tgh_vid');
  var isNew = false;
  if (!vid) { vid = makeId(); isNew = true; store('local', 'tgh_vid', vid); }

  // Country (from Vercel), fetched once per visit
  var country = store('session', 'tgh_cc') || '';
  if (!country) {
    fetch('/api/country').then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d.country === 'string' && /^[A-Z]{2}$/.test(d.country)) {
        country = d.country; store('session', 'tgh_cc', country);
      }
    }).catch(function () {});
  }

  var game = gameName();
  var ref = referrer();
  var device = deviceType();
  var lang = (navigator.language || '').slice(0, 20);
  var activeMs = 0;
  var lastActive = Date.now();
  var maxLevel = 0;
  var sent = false;

  // Games can call TGH.level(3) when a player reaches level 3
  window.TGH = {
    level: function (n) {
      n = parseInt(n, 10);
      if (n > maxLevel && n <= 10000) maxLevel = n;
    }
  };

  ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastActive = Date.now(); }, { capture: true, passive: true });
  });

  setInterval(function () {
    if (document.visibilityState === 'visible' && Date.now() - lastActive < IDLE_LIMIT) activeMs += 1000;
  }, 1000);

  function send() {
    var secs = Math.min(86400, Math.round(activeMs / 1000));
    if (sent && secs < 1) return; // nothing new to report
    var fields = {
      game: { stringValue: game },
      vid: { stringValue: vid },
      isNew: { booleanValue: isNew && !sent },
      cont: { booleanValue: sent },
      secs: { integerValue: String(secs) },
      level: { integerValue: String(maxLevel) },
      country: { stringValue: country },
      device: { stringValue: device },
      lang: { stringValue: lang },
      ref: { stringValue: sent ? '' : ref },
      ts: { timestampValue: new Date().toISOString() }
    };
    activeMs = 0;
    sent = true;
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields })
      }).catch(function () {});
    } catch (e) {}
  }

  // Save when the player leaves, closes, or switches away from the tab
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') send();
    else lastActive = Date.now();
  });
  window.addEventListener('pagehide', send);
})();
