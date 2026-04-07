/* ================================================================
   NIMBUS WEATHER APP — script.js
   Modular, ES6+, OpenWeatherMap API + Demo Mode
   ================================================================ */

'use strict';

/* ── CONFIG ──────────────────────────────────────────────────── */
const CONFIG = {
  BASE_URL:    'https://api.openweathermap.org/data/2.5',
  GEO_URL:     'https://api.openweathermap.org/geo/1.0',
  DEFAULT_CITY: 'London',
  STORAGE_KEY:  'nimbus_api_key',
  UNIT_KEY:     'nimbus_unit',      // 'metric' | 'imperial'
  THEME_KEY:    'nimbus_theme',     // 'dark' | 'light'
};

/* ── STATE ───────────────────────────────────────────────────── */
const state = {
  apiKey:    localStorage.getItem(CONFIG.STORAGE_KEY) || '',
  unit:      localStorage.getItem(CONFIG.UNIT_KEY) || 'metric',
  theme:     localStorage.getItem(CONFIG.THEME_KEY) || 'dark',
  city:      CONFIG.DEFAULT_CITY,
  demoMode:  false,
  data:      null,           // latest full weather bundle
  searchDebounce: null,
};

/* ── DOM REFS ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dom = {
  body:             document.body,
  html:             document.documentElement,
  appShell:         $('appShell'),
  skeletonScreen:   $('skeletonScreen'),
  errorState:       $('errorState'),
  weatherMain:      $('weatherMain'),
  errorTitle:       $('errorTitle'),
  errorSub:         $('errorSub'),
  btnRetry:         $('btnRetry'),

  cityName:         $('cityName'),
  countryBadge:     $('countryBadge'),
  localTime:        $('localTime'),
  weatherEmoji:     $('weatherEmoji'),
  tempValue:        $('tempValue'),
  tempUnitLabel:    $('tempUnitLabel'),
  conditionText:    $('conditionText'),
  humidity:         $('humidity'),
  windSpeed:        $('windSpeed'),
  feelsLike:        $('feelsLike'),
  pressure:         $('pressure'),
  visibility:       $('visibility'),
  uvIndex:          $('uvIndex'),
  sunrise:          $('sunrise'),
  sunset:           $('sunset'),
  dewPoint:         $('dewPoint'),
  airQuality:       $('airQuality'),
  hourlyScroll:     $('hourlyScroll'),
  weeklyGrid:       $('weeklyGrid'),
  lastUpdated:      $('lastUpdated'),
  tempCanvas:       $('tempGraph'),

  searchToggle:     $('searchToggle'),
  searchPanel:      $('searchPanel'),
  searchInput:      $('searchInput'),
  searchGo:         $('searchGo'),
  searchSuggestions:$('searchSuggestions'),
  unitToggle:       $('unitToggle'),
  themeToggle:      $('themeToggle'),
  bgLayer:          $('bgLayer'),
  weatherParticles: $('weatherParticles'),

  apiModalOverlay:  $('apiModalOverlay'),
  apiKeyInput:      $('apiKeyInput'),
  apiKeySave:       $('apiKeySave'),
  useDemo:          $('useDemo'),
};

/* ── WEATHER CODE → EMOJI MAP ────────────────────────────────── */
const WEATHER_EMOJI = {
  200:'⛈', 201:'⛈', 202:'⛈', 210:'🌩', 211:'🌩', 212:'🌩',
  221:'🌩', 230:'⛈', 231:'⛈', 232:'⛈',
  300:'🌦', 301:'🌦', 302:'🌧', 310:'🌦', 311:'🌧', 312:'🌧',
  313:'🌦', 314:'🌧', 321:'🌦',
  500:'🌧', 501:'🌧', 502:'🌧', 503:'🌧', 504:'🌧',
  511:'🌨', 520:'🌦', 521:'🌧', 522:'🌧', 531:'🌧',
  600:'🌨', 601:'❄️', 602:'❄️', 611:'🌨', 612:'🌨',
  613:'🌨', 615:'🌨', 616:'🌨', 620:'🌨', 621:'❄️', 622:'❄️',
  701:'🌫', 711:'🌫', 721:'🌫', 731:'🌪', 741:'🌫',
  751:'🌪', 761:'🌫', 762:'🌋', 771:'🌬', 781:'🌪',
  800:'☀️', 801:'🌤', 802:'⛅', 803:'🌥', 804:'☁️',
};

/* ── WEATHER CODE → BACKGROUND CLASS ────────────────────────── */
function getBgClass(id, hour) {
  const isNight = hour < 6 || hour >= 20;
  if (isNight) return 'weather-night';
  if (id === 800) return 'weather-sunny';
  if (id >= 801 && id <= 804) return 'weather-cloudy';
  if (id >= 600 && id < 700) return 'weather-snow';
  if (id >= 200 && id < 300) return 'weather-storm';
  if (id >= 300 && id < 600) return 'weather-rainy';
  return 'weather-sunny';
}

/* ── UNIT HELPERS ────────────────────────────────────────────── */
const isCelsius = () => state.unit === 'metric';
const fmtTemp   = t  => `${Math.round(t)}`;
const fmtWind   = ms => isCelsius()
  ? `${(ms * 3.6).toFixed(1)} km/h`
  : `${(ms * 2.237).toFixed(1)} mph`;

/* ── TIME HELPERS ────────────────────────────────────────────── */
function fmtTime(unixSec, tzOffset = 0) {
  const d = new Date((unixSec + tzOffset) * 1000);
  return d.toISOString().slice(11, 16); // HH:MM in UTC adjusted
}

function localClock(tzOffset) {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const localMs = utcMs + tzOffset * 1000;
  const local = new Date(localMs);
  const opts = { weekday:'long', hour:'2-digit', minute:'2-digit', hour12:true };
  return local.toLocaleString('en-US', opts);
}

/* ── API CALLS ───────────────────────────────────────────────── */
async function fetchWeather(city) {
  if (state.demoMode) return getDemoData(city);

  const key    = state.apiKey;
  const units  = state.unit;
  const [cur, fore] = await Promise.all([
    fetch(`${CONFIG.BASE_URL}/weather?q=${encodeURIComponent(city)}&units=${units}&appid=${key}`)
      .then(r => { if (!r.ok) throw new Error(r.status + ''); return r.json(); }),
    fetch(`${CONFIG.BASE_URL}/forecast?q=${encodeURIComponent(city)}&units=${units}&cnt=40&appid=${key}`)
      .then(r => { if (!r.ok) throw new Error(r.status + ''); return r.json(); }),
  ]);
  return { cur, fore };
}

async function fetchGeoSuggestions(query) {
  if (state.demoMode || !query.trim()) return [];
  try {
    const r = await fetch(`${CONFIG.GEO_URL}/direct?q=${encodeURIComponent(query)}&limit=5&appid=${state.apiKey}`);
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

/* ── RENDER ──────────────────────────────────────────────────── */
function renderAll(bundle) {
  const { cur, fore } = bundle;
  state.data = bundle;

  const wid    = cur.weather[0].id;
  const tz     = cur.timezone;
  const hourNow= new Date().getHours();

  /* Background */
  const bgClass = getBgClass(wid, hourNow);
  dom.body.className = bgClass;
  spawnParticles(bgClass);

  /* Hero */
  dom.cityName.textContent    = cur.name;
  dom.countryBadge.textContent= cur.sys.country || '';
  dom.localTime.textContent   = localClock(tz);
  dom.weatherEmoji.textContent= WEATHER_EMOJI[wid] || '🌡';
  dom.tempValue.textContent   = fmtTemp(cur.main.temp);
  dom.tempUnitLabel.textContent= isCelsius() ? '°C' : '°F';
  dom.conditionText.textContent= cur.weather[0].description
    .replace(/^\w/, c => c.toUpperCase());
  dom.humidity.textContent    = `${cur.main.humidity}%`;
  dom.windSpeed.textContent   = fmtWind(cur.wind.speed);
  dom.feelsLike.textContent   = `${fmtTemp(cur.main.feels_like)}°`;
  dom.pressure.textContent    = `${cur.main.pressure} hPa`;
  dom.visibility.textContent  = cur.visibility
    ? `${(cur.visibility / 1000).toFixed(1)} km` : '—';
  dom.uvIndex.textContent     = '—'; // UV not in free tier

  /* Sunrise / Sunset */
  dom.sunrise.textContent = fmtTime(cur.sys.sunrise, tz);
  dom.sunset.textContent  = fmtTime(cur.sys.sunset,  tz);

  /* Dew point approx from Magnus formula */
  const td = dewPoint(cur.main.temp, cur.main.humidity);
  dom.dewPoint.textContent    = `${td}°`;
  dom.airQuality.textContent  = '—';

  /* Hourly (next 24h = 8 x 3h slots) */
  renderHourly(fore);

  /* 7-day */
  renderWeekly(fore);

  /* Graph */
  renderGraph(fore);

  /* Footer */
  dom.lastUpdated.textContent = new Date().toLocaleTimeString();
}

/* Dew point Magnus approximation */
function dewPoint(T, RH) {
  const a = 17.27, b = 237.7;
  const alpha = ((a * T) / (b + T)) + Math.log(RH / 100);
  return Math.round((b * alpha) / (a - alpha));
}

/* ── HOURLY ──────────────────────────────────────────────────── */
function renderHourly(fore) {
  const slots = fore.list.slice(0, 9); // ~27h
  dom.hourlyScroll.innerHTML = '';
  slots.forEach((slot, i) => {
    const time  = new Date(slot.dt * 1000);
    const hour  = time.getHours();
    const ampm  = hour < 12 ? 'am' : 'pm';
    const h12   = hour % 12 || 12;
    const label = i === 0 ? 'Now' : `${h12}${ampm}`;
    const emoji = WEATHER_EMOJI[slot.weather[0].id] || '🌡';
    const rain  = slot.pop ? `${Math.round(slot.pop * 100)}%` : '';

    const card = document.createElement('div');
    card.className = `hourly-card${i === 0 ? ' now' : ''}`;
    card.innerHTML = `
      <span class="hourly-time">${label}</span>
      <span class="hourly-emoji">${emoji}</span>
      <span class="hourly-temp">${fmtTemp(slot.main.temp)}°</span>
      ${rain ? `<span class="hourly-rain">💧${rain}</span>` : ''}
    `;
    dom.hourlyScroll.appendChild(card);
  });
}

/* ── 7-DAY FORECAST ──────────────────────────────────────────── */
function renderWeekly(fore) {
  // Group by day
  const dayMap = {};
  fore.list.forEach(slot => {
    const d = new Date(slot.dt * 1000);
    const key = d.toDateString();
    if (!dayMap[key]) dayMap[key] = { slots:[], date:d };
    dayMap[key].slots.push(slot);
  });

  const days = Object.values(dayMap).slice(0, 7);
  dom.weeklyGrid.innerHTML = '';

  days.forEach((day, i) => {
    const temps   = day.slots.map(s => s.main.temp);
    const max     = Math.max(...temps);
    const min     = Math.min(...temps);
    const midSlot = day.slots[Math.floor(day.slots.length / 2)];
    const emoji   = WEATHER_EMOJI[midSlot.weather[0].id] || '🌡';
    const cond    = midSlot.weather[0].main;
    const dayName = i === 0 ? 'Today' : day.date.toLocaleDateString('en-US', { weekday: 'long' });

    const card = document.createElement('div');
    card.className = `day-card glass${i === 0 ? ' today' : ''}`;
    card.style.animationDelay = `${i * 0.05}s`;
    card.innerHTML = `
      <div class="day-info">
        <span class="day-name">${dayName}</span>
        <span class="day-cond">${cond}</span>
      </div>
      <span class="day-emoji">${emoji}</span>
      <div class="day-temps">
        <span class="day-max">${fmtTemp(max)}°</span>
        <span class="day-min">${fmtTemp(min)}°</span>
      </div>
    `;
    dom.weeklyGrid.appendChild(card);
  });
}

/* ── TEMPERATURE GRAPH (Canvas) ──────────────────────────────── */
function renderGraph(fore) {
  const canvas = dom.tempCanvas;
  const ctx    = canvas.getContext('2d');
  const slots  = fore.list.slice(0, 9);
  const temps  = slots.map(s => s.main.temp);
  const labels = slots.map((s, i) => {
    if (i === 0) return 'Now';
    const d = new Date(s.dt * 1000);
    return `${d.getHours()}h`;
  });

  // HiDPI
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.offsetWidth;
  const h   = canvas.offsetHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const padL = 36, padR = 16, padT = 20, padB = 30;
  const cw = w - padL - padR;
  const ch = h - padT - padB;

  const minT = Math.min(...temps) - 2;
  const maxT = Math.max(...temps) + 2;
  const range = maxT - minT || 1;

  const xOf = i => padL + (i / (temps.length - 1)) * cw;
  const yOf = t => padT + ch - ((t - minT) / range) * ch;

  ctx.clearRect(0, 0, w, h);

  // Detect theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const txtCol = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,50,0.55)';
  const dotCol = isDark ? '#ffffff' : '#1a1a2e';

  // Gradient fill under curve
  const grd = ctx.createLinearGradient(0, padT, 0, padT + ch);
  grd.addColorStop(0, 'rgba(255,200,100,0.35)');
  grd.addColorStop(1, 'rgba(255,200,100,0.00)');

  // Draw curve path
  ctx.beginPath();
  temps.forEach((t, i) => {
    const x = xOf(i), y = yOf(t);
    i === 0 ? ctx.moveTo(x, y) : ctx.bezierCurveTo(
      xOf(i - 0.5), yOf(temps[i-1]),
      xOf(i - 0.5), y,
      x, y
    );
  });

  // Fill under
  ctx.lineTo(xOf(temps.length - 1), padT + ch);
  ctx.lineTo(xOf(0), padT + ch);
  ctx.closePath();
  ctx.fillStyle = grd;
  ctx.fill();

  // Stroke line
  ctx.beginPath();
  temps.forEach((t, i) => {
    const x = xOf(i), y = yOf(t);
    i === 0 ? ctx.moveTo(x, y) : ctx.bezierCurveTo(
      xOf(i - 0.5), yOf(temps[i-1]),
      xOf(i - 0.5), y,
      x, y
    );
  });
  ctx.strokeStyle = 'rgba(255,200,100,0.85)';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Dots + labels
  ctx.font = `500 11px 'DM Sans', sans-serif`;
  ctx.fillStyle   = txtCol;
  ctx.textAlign   = 'center';
  temps.forEach((t, i) => {
    const x = xOf(i), y = yOf(t);

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,200,100,1)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Temp label
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(20,20,50,0.8)';
    ctx.fillText(`${fmtTemp(t)}°`, x, y - 10);

    // Time label at bottom
    ctx.fillStyle = txtCol;
    ctx.fillText(labels[i], x, padT + ch + 18);
  });
}

/* ── PARTICLES ───────────────────────────────────────────────── */
function spawnParticles(bgClass) {
  dom.weatherParticles.innerHTML = '';
  if (bgClass === 'weather-rainy' || bgClass === 'weather-storm') {
    spawnRain();
  } else if (bgClass === 'weather-snow') {
    spawnSnow();
  } else if (bgClass === 'weather-night') {
    spawnStars();
  }
}

function spawnRain() {
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const left   = Math.random() * 100;
    const delay  = Math.random() * 3;
    const dur    = 0.5 + Math.random() * 0.5;
    const size   = 1 + Math.random() * 1.5;
    Object.assign(p.style, {
      left: `${left}%`,
      width: `${size}px`,
      height: `${size * 10}px`,
      background: 'rgba(120,190,255,0.5)',
      borderRadius: '2px',
      animationDuration: `${dur}s`,
      animationDelay: `${delay}s`,
      top: '-20px',
    });
    dom.weatherParticles.appendChild(p);
  }
}

function spawnSnow() {
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const left  = Math.random() * 100;
    const size  = 3 + Math.random() * 5;
    const delay = Math.random() * 6;
    const dur   = 4 + Math.random() * 4;
    Object.assign(p.style, {
      left: `${left}%`,
      width: `${size}px`,
      height: `${size}px`,
      background: 'rgba(230,240,255,0.75)',
      animationDuration: `${dur}s`,
      animationDelay: `${delay}s`,
      top: '-10px',
    });
    dom.weatherParticles.appendChild(p);
  }
}

function spawnStars() {
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size  = 1 + Math.random() * 2.5;
    Object.assign(p.style, {
      left:   `${Math.random() * 100}%`,
      top:    `${Math.random() * 60}%`,
      width:  `${size}px`,
      height: `${size}px`,
      background: 'rgba(255,255,255,0.8)',
      animationName: 'none',
      opacity: Math.random() * 0.8 + 0.1,
      animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite ${Math.random() * 3}s`,
    });
    dom.weatherParticles.appendChild(p);
  }
  // Add twinkle keyframes if not there
  if (!document.getElementById('twinkleKf')) {
    const style = document.createElement('style');
    style.id = 'twinkleKf';
    style.textContent = `@keyframes twinkle {
      0%,100% { opacity: 0.1; transform: scale(0.8); }
      50%      { opacity: 0.9; transform: scale(1.2); }
    }`;
    document.head.appendChild(style);
  }
}

/* ── SHOW / HIDE STATES ──────────────────────────────────────── */
function showSkeleton() {
  dom.skeletonScreen.hidden = false;
  dom.errorState.hidden     = true;
  dom.weatherMain.hidden    = true;
}
function showError(title, sub) {
  dom.skeletonScreen.hidden = true;
  dom.errorState.hidden     = false;
  dom.weatherMain.hidden    = true;
  dom.errorTitle.textContent = title;
  dom.errorSub.textContent   = sub;
}
function showWeather() {
  dom.skeletonScreen.hidden = true;
  dom.errorState.hidden     = true;
  dom.weatherMain.hidden    = false;
}

/* ── LOAD WEATHER ────────────────────────────────────────────── */
async function loadWeather(city) {
  state.city = city;
  showSkeleton();
  try {
    const bundle = await fetchWeather(city);
    renderAll(bundle);
    showWeather();
  } catch (err) {
    console.error(err);
    if (err.message === '404') {
      showError('City not found', `"${city}" doesn't match any known city.`);
    } else if (err.message === '401') {
      showError('Invalid API key', 'Check your OpenWeatherMap key.');
    } else {
      showError('Connection error', 'Please check your internet and try again.');
    }
  }
}

/* ── SEARCH ──────────────────────────────────────────────────── */
function openSearch() {
  dom.searchPanel.classList.add('open');
  setTimeout(() => dom.searchInput.focus(), 200);
}
function closeSearch() {
  dom.searchPanel.classList.remove('open');
  dom.searchInput.value = '';
  hideSuggestions();
}

function hideSuggestions() {
  dom.searchSuggestions.classList.remove('visible');
  dom.searchSuggestions.innerHTML = '';
}

dom.searchToggle.addEventListener('click', () => {
  dom.searchPanel.classList.contains('open') ? closeSearch() : openSearch();
});

dom.searchInput.addEventListener('input', () => {
  clearTimeout(state.searchDebounce);
  const q = dom.searchInput.value.trim();
  if (!q) { hideSuggestions(); return; }
  state.searchDebounce = setTimeout(() => loadSuggestions(q), 350);
});

async function loadSuggestions(q) {
  const results = await fetchGeoSuggestions(q);
  if (!results.length) { hideSuggestions(); return; }
  dom.searchSuggestions.innerHTML = '';
  results.forEach(r => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sug-city">${r.name}</span><span class="sug-country">${r.country}${r.state ? ', ' + r.state : ''}</span>`;
    li.addEventListener('click', () => {
      closeSearch();
      loadWeather(r.name);
    });
    dom.searchSuggestions.appendChild(li);
  });
  dom.searchSuggestions.classList.add('visible');
}

function doSearch() {
  const q = dom.searchInput.value.trim();
  if (!q) return;
  closeSearch();
  loadWeather(q);
}

dom.searchGo.addEventListener('click', doSearch);
dom.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
  if (e.key === 'Escape') closeSearch();
});

// Close search on outside click
document.addEventListener('click', e => {
  if (!dom.searchWrapper.contains(e.target)) closeSearch();
});

/* ── UNIT TOGGLE ─────────────────────────────────────────────── */
dom.unitToggle.addEventListener('click', () => {
  state.unit = state.unit === 'metric' ? 'imperial' : 'metric';
  localStorage.setItem(CONFIG.UNIT_KEY, state.unit);
  dom.unitToggle.textContent = state.unit === 'metric' ? '°C' : '°F';
  if (state.data) {
    // Re-fetch with new unit
    loadWeather(state.city);
  }
});
// Init label
dom.unitToggle.textContent = state.unit === 'metric' ? '°C' : '°F';

/* ── THEME TOGGLE ────────────────────────────────────────────── */
function setTheme(t) {
  state.theme = t;
  dom.html.setAttribute('data-theme', t);
  localStorage.setItem(CONFIG.THEME_KEY, t);
  // Re-render graph with correct colors
  if (state.data) renderGraph(state.data.fore);
}

dom.themeToggle.addEventListener('click', () => {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
});
setTheme(state.theme);

/* ── RETRY ───────────────────────────────────────────────────── */
dom.btnRetry.addEventListener('click', () => loadWeather(state.city));

/* ── LOCAL TIME CLOCK (updates every minute) ─────────────────── */
setInterval(() => {
  if (!state.data) return;
  dom.localTime.textContent = localClock(state.data.cur.timezone);
}, 60000);

/* ── AUTO-REFRESH EVERY 10 MINUTES ──────────────────────────── */
setInterval(() => {
  if (state.data) loadWeather(state.city);
}, 10 * 60 * 1000);

/* ── CANVAS RESIZE ───────────────────────────────────────────── */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.data) renderGraph(state.data.fore);
  }, 200);
});

/* ══════════════════════════════════════════════════════════════
   DEMO DATA — realistic mock for demo mode
   ══════════════════════════════════════════════════════════════ */
function getDemoData(city) {
  const now = Math.floor(Date.now() / 1000);
  const foreList = [];
  const conditions = [
    { id:800, main:'Clear', description:'clear sky' },
    { id:801, main:'Clouds', description:'few clouds' },
    { id:802, main:'Clouds', description:'scattered clouds' },
    { id:500, main:'Rain',   description:'light rain' },
    { id:800, main:'Clear',  description:'clear sky' },
    { id:803, main:'Clouds', description:'broken clouds' },
    { id:800, main:'Clear',  description:'clear sky' },
    { id:800, main:'Clear',  description:'clear sky' },
    { id:801, main:'Clouds', description:'few clouds' },
  ];
  const baseTemp = 22;
  for (let i = 0; i < 40; i++) {
    const cond = conditions[i % conditions.length];
    foreList.push({
      dt: now + i * 10800,
      main: {
        temp:       baseTemp + Math.sin(i * 0.5) * 6 + (Math.random() - 0.5) * 2,
        feels_like: baseTemp - 1 + Math.sin(i * 0.5) * 5,
        humidity:   55 + Math.round(Math.random() * 30),
        pressure:   1013 + Math.round((Math.random() - 0.5) * 10),
      },
      weather:    [cond],
      wind:       { speed: 2 + Math.random() * 5 },
      pop:        Math.random() > 0.7 ? Math.random() * 0.5 : 0,
    });
  }

  return {
    cur: {
      name: city || 'New York',
      timezone: -18000,
      weather: [{ id:800, main:'Clear', description:'clear sky' }],
      main: {
        temp:       24.3,
        feels_like: 23.1,
        humidity:   58,
        pressure:   1015,
      },
      wind:       { speed: 3.5 },
      visibility: 10000,
      sys:  { country:'US', sunrise: now - 21600, sunset: now + 18000 },
    },
    fore: { list: foreList },
  };
}

/* ══════════════════════════════════════════════════════════════
   API KEY MODAL
   ══════════════════════════════════════════════════════════════ */
function initApp() {
  if (state.apiKey) {
    dom.apiModalOverlay.classList.add('hidden');
    loadWeather(CONFIG.DEFAULT_CITY);
  } else {
    dom.apiModalOverlay.classList.remove('hidden');
  }
}

dom.apiKeySave.addEventListener('click', () => {
  const key = dom.apiKeyInput.value.trim();
  if (!key) return;
  state.apiKey = key;
  localStorage.setItem(CONFIG.STORAGE_KEY, key);
  dom.apiModalOverlay.classList.add('hidden');
  loadWeather(CONFIG.DEFAULT_CITY);
});

dom.apiKeyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') dom.apiKeySave.click();
});

dom.useDemo.addEventListener('click', () => {
  state.demoMode = true;
  dom.apiModalOverlay.classList.add('hidden');
  loadWeather(CONFIG.DEFAULT_CITY);
});

/* ── KICK OFF ─────────────────────────────────────────────────── */
initApp();