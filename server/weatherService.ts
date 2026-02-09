const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

const WMO_WEATHER_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: 'Clear sky', icon: 'sun' },
  1: { description: 'Mainly clear', icon: 'sun' },
  2: { description: 'Partly cloudy', icon: 'cloud-sun' },
  3: { description: 'Overcast', icon: 'cloud' },
  45: { description: 'Foggy', icon: 'cloud-fog' },
  48: { description: 'Depositing rime fog', icon: 'cloud-fog' },
  51: { description: 'Light drizzle', icon: 'cloud-drizzle' },
  53: { description: 'Moderate drizzle', icon: 'cloud-drizzle' },
  55: { description: 'Dense drizzle', icon: 'cloud-drizzle' },
  56: { description: 'Freezing drizzle', icon: 'cloud-drizzle' },
  57: { description: 'Dense freezing drizzle', icon: 'cloud-drizzle' },
  61: { description: 'Slight rain', icon: 'cloud-rain' },
  63: { description: 'Moderate rain', icon: 'cloud-rain' },
  65: { description: 'Heavy rain', icon: 'cloud-rain' },
  66: { description: 'Freezing rain', icon: 'cloud-rain' },
  67: { description: 'Heavy freezing rain', icon: 'cloud-rain' },
  71: { description: 'Slight snow', icon: 'snowflake' },
  73: { description: 'Moderate snow', icon: 'snowflake' },
  75: { description: 'Heavy snow', icon: 'snowflake' },
  77: { description: 'Snow grains', icon: 'snowflake' },
  80: { description: 'Slight showers', icon: 'cloud-rain' },
  81: { description: 'Moderate showers', icon: 'cloud-rain' },
  82: { description: 'Violent showers', icon: 'cloud-rain' },
  85: { description: 'Slight snow showers', icon: 'snowflake' },
  86: { description: 'Heavy snow showers', icon: 'snowflake' },
  95: { description: 'Thunderstorm', icon: 'cloud-lightning' },
  96: { description: 'Thunderstorm with hail', icon: 'cloud-lightning' },
  99: { description: 'Thunderstorm with heavy hail', icon: 'cloud-lightning' },
};

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGusts: number;
  weatherCode: number;
  description: string;
  icon: string;
  precipitation: number;
  isDay: boolean;
  cachedAt: string;
}

interface CacheEntry {
  data: WeatherData;
  expiry: number;
}

const weatherCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function getWeather(lat: number, lng: number): Promise<WeatherData | null> {
  const key = getCacheKey(lat, lng);

  const cached = weatherCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const url = `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day&timezone=America/Edmonton&temperature_unit=celsius&wind_speed_unit=kmh`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      console.error(`Open-Meteo API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const current = data.current;

    if (!current) return null;

    const weatherCode = current.weather_code ?? 0;
    const wmoInfo = WMO_WEATHER_CODES[weatherCode] || { description: 'Unknown', icon: 'cloud' };

    const weather: WeatherData = {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      windGusts: current.wind_gusts_10m,
      weatherCode,
      description: wmoInfo.description,
      icon: wmoInfo.icon,
      precipitation: current.precipitation,
      isDay: current.is_day === 1,
      cachedAt: new Date().toISOString(),
    };

    weatherCache.set(key, { data: weather, expiry: Date.now() + CACHE_TTL_MS });

    return weather;
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

export async function getWeatherBatch(
  locations: { lat: number; lng: number; id: string }[]
): Promise<Record<string, WeatherData | null>> {
  const results: Record<string, WeatherData | null> = {};

  const uniqueLocations = new Map<string, { lat: number; lng: number; ids: string[] }>();
  for (const loc of locations) {
    const key = getCacheKey(loc.lat, loc.lng);
    if (!uniqueLocations.has(key)) {
      uniqueLocations.set(key, { lat: loc.lat, lng: loc.lng, ids: [] });
    }
    uniqueLocations.get(key)!.ids.push(loc.id);
  }

  await Promise.all(
    Array.from(uniqueLocations.values()).map(async ({ lat, lng, ids }) => {
      const weather = await getWeather(lat, lng);
      for (const id of ids) {
        results[id] = weather;
      }
    })
  );

  return results;
}
