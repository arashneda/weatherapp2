const cityInput = document.getElementById("city-input");
const suggestionsEl = document.getElementById("suggestions");
const currentEl = document.getElementById("current");
const hourlyEl = document.getElementById("hourly");
const dailyEl = document.getElementById("daily");
const placeNameEl = document.getElementById("place-name");
const updatedEl = document.getElementById("updated");
const toastEl = document.getElementById("toast");
const geoBtn = document.getElementById("geo-btn");

const WEATHER = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Icy fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌧️" },
  61: { label: "Light rain", icon: "🌧️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "🌨️" },
  73: { label: "Snow", icon: "❄️" },
  75: { label: "Heavy snow", icon: "❄️" },
  80: { label: "Rain showers", icon: "🌦️" },
  81: { label: "Rain showers", icon: "🌧️" },
  82: { label: "Violent showers", icon: "⛈️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Storm with hail", icon: "⛈️" },
  99: { label: "Storm with hail", icon: "⛈️" },
};

const state = {
  unit: "celsius",
  place: null,
  weather: null,
};

let suggestTimer;

function weatherMeta(code) {
  return WEATHER[code] || { label: "Unknown", icon: "🌡️" };
}

function formatTemp(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}°`;
}

function showToast(message, isError = true) {
  toastEl.textContent = message;
  toastEl.classList.toggle("error", isError);
  toastEl.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

async function searchCities(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const res = await fetch(url);
  if (!res.ok) throw new Error("City search failed");
  const data = await res.json();
  return data.results || [];
}

async function fetchWeather(lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m");
  url.searchParams.set("hourly", "temperature_2m,weather_code,precipitation_probability");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("temperature_unit", state.unit);
  url.searchParams.set("wind_speed_unit", "kmh");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather request failed");
  return res.json();
}

function renderSuggestions(cities) {
  if (!cities.length) {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = "";
    return;
  }

  suggestionsEl.hidden = false;
  suggestionsEl.innerHTML = cities
    .map((city, index) => {
      const extra = [city.admin1, city.country].filter(Boolean).join(", ");
      return `<li><button type="button" data-index="${index}">${city.name}${extra ? ` — ${extra}` : ""}</button></li>`;
    })
    .join("");

  suggestionsEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const city = cities[Number(btn.dataset.index)];
      suggestionsEl.hidden = true;
      cityInput.value = city.name;
      loadPlace(city);
    });
  });
}

function renderCurrent() {
  const { place, weather } = state;
  if (!place || !weather) return;

  const current = weather.current;
  const meta = weatherMeta(current.weather_code);
  const windDir = `${Math.round(current.wind_direction_10m)}°`;

  currentEl.innerHTML = `
    <p class="place">${place.name}</p>
    <p class="summary">${meta.label}</p>
    <div class="temp">${formatTemp(current.temperature_2m)}</div>
    <div class="stats">
      <div class="stat"><span>Feels like</span><strong>${formatTemp(current.apparent_temperature)}</strong></div>
      <div class="stat"><span>Humidity</span><strong>${Math.round(current.relative_humidity_2m)}%</strong></div>
      <div class="stat"><span>Wind</span><strong>${Math.round(current.wind_speed_10m)} km/h</strong></div>
      <div class="stat"><span>Direction</span><strong>${windDir}</strong></div>
    </div>
  `;

  const extra = [place.admin1, place.country].filter(Boolean).join(", ");
  placeNameEl.textContent = extra ? `${place.name}, ${extra}` : place.name;
  updatedEl.textContent = `Updated ${new Date(current.time).toLocaleString()}`;
}

function renderHourly() {
  const hours = state.weather.hourly;
  const now = Date.now();
  const items = [];

  for (let i = 0; i < hours.time.length && items.length < 24; i += 1) {
    const stamp = new Date(hours.time[i]).getTime();
    if (stamp < now - 60 * 60 * 1000) continue;
    const meta = weatherMeta(hours.weather_code[i]);
    items.push(`
      <article class="hour">
        <div class="time">${new Date(hours.time[i]).toLocaleTimeString([], { hour: "numeric" })}</div>
        <div class="icon">${meta.icon}</div>
        <strong>${formatTemp(hours.temperature_2m[i])}</strong>
        <div class="muted">${hours.precipitation_probability[i] ?? 0}%</div>
      </article>
    `);
  }

  hourlyEl.innerHTML = items.join("") || `<p class="muted">No hourly data.</p>`;
}

function renderDaily() {
  const days = state.weather.daily;
  dailyEl.innerHTML = days.time
    .map((time, i) => {
      const meta = weatherMeta(days.weather_code[i]);
      const name = new Date(time).toLocaleDateString([], { weekday: "long" });
      return `
        <article class="day">
          <div class="name">${name}</div>
          <div class="icon">${meta.icon} ${meta.label}</div>
          <div class="temps">
            <span class="muted">${formatTemp(days.temperature_2m_min[i])}</span>
            <strong> ${formatTemp(days.temperature_2m_max[i])}</strong>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadPlace(place) {
  try {
    updatedEl.textContent = "Loading…";
    state.place = place;
    state.weather = await fetchWeather(place.latitude, place.longitude);
    renderCurrent();
    renderHourly();
    renderDaily();
  } catch (error) {
    showToast(error.message || "Could not load weather");
  }
}

cityInput.addEventListener("input", () => {
  const query = cityInput.value.trim();
  clearTimeout(suggestTimer);
  if (query.length < 2) {
    renderSuggestions([]);
    return;
  }
  suggestTimer = setTimeout(async () => {
    try {
      const cities = await searchCities(query);
      renderSuggestions(cities);
    } catch {
      showToast("Could not search cities");
    }
  }, 250);
});

document.querySelector(".search").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = cityInput.value.trim();
  if (!query) return;
  try {
    const cities = await searchCities(query);
    if (!cities.length) {
      showToast("No matching city found");
      return;
    }
    suggestionsEl.hidden = true;
    loadPlace(cities[0]);
  } catch {
    showToast("Could not search cities");
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search")) {
    suggestionsEl.hidden = true;
  }
});

geoBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      loadPlace({
        name: "Current location",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    () => showToast("Location permission denied")
  );
});

document.querySelectorAll(".unit-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".unit-btn").forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    state.unit = btn.dataset.unit;
    if (state.place) loadPlace(state.place);
  });
});

loadPlace({
  name: "London",
  admin1: "England",
  country: "United Kingdom",
  latitude: 51.5072,
  longitude: -0.1276,
});
