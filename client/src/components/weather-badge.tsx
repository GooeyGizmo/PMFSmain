import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain,
  CloudLightning, Snowflake, Wind, Droplets, Thermometer
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface WeatherData {
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

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'sun': Sun,
  'cloud-sun': CloudSun,
  'cloud': Cloud,
  'cloud-fog': CloudFog,
  'cloud-drizzle': CloudDrizzle,
  'cloud-rain': CloudRain,
  'cloud-lightning': CloudLightning,
  'snowflake': Snowflake,
};

function getWeatherColor(code: number): string {
  if (code === 0 || code === 1) return 'text-amber-500';
  if (code === 2) return 'text-blue-400';
  if (code === 3) return 'text-slate-400';
  if (code >= 45 && code <= 48) return 'text-slate-400';
  if (code >= 51 && code <= 67) return 'text-blue-500';
  if (code >= 71 && code <= 86) return 'text-sky-300';
  if (code >= 95) return 'text-purple-500';
  return 'text-slate-400';
}

function getWeatherBgColor(code: number): string {
  if (code === 0 || code === 1) return 'bg-amber-500/10';
  if (code === 2) return 'bg-blue-400/10';
  if (code === 3) return 'bg-slate-400/10';
  if (code >= 45 && code <= 48) return 'bg-slate-400/10';
  if (code >= 51 && code <= 67) return 'bg-blue-500/10';
  if (code >= 71 && code <= 86) return 'bg-sky-300/10';
  if (code >= 95) return 'bg-purple-500/10';
  return 'bg-slate-400/10';
}

export function useWeather(lat: number | null, lng: number | null) {
  return useQuery<WeatherData>({
    queryKey: ['weather', lat?.toFixed(2), lng?.toFixed(2)],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/weather?lat=${lat}&lng=${lng}`);
      return res.json();
    },
    enabled: lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useWeatherBatch(locations: { lat: number; lng: number; id: string }[]) {
  const validLocations = locations.filter(l => !isNaN(l.lat) && !isNaN(l.lng));
  const locationKey = validLocations.map(l => `${l.id}:${l.lat.toFixed(2)},${l.lng.toFixed(2)}`).join('|');

  return useQuery<Record<string, WeatherData | null>>({
    queryKey: ['weather-batch', locationKey],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/weather/batch', { locations: validLocations });
      return res.json();
    },
    enabled: validLocations.length > 0,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

interface WeatherBadgeProps {
  lat: number | null;
  lng: number | null;
  variant?: 'compact' | 'inline' | 'detailed';
  className?: string;
}

export function WeatherBadge({ lat, lng, variant = 'compact', className = '' }: WeatherBadgeProps) {
  const { data: weather, isLoading } = useWeather(lat, lng);

  if (!lat || !lng || isLoading || !weather) return null;

  const IconComponent = ICON_MAP[weather.icon] || Cloud;
  const colorClass = getWeatherColor(weather.weatherCode);
  const bgClass = getWeatherBgColor(weather.weatherCode);

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-1 text-xs ${className}`} data-testid="weather-badge-compact">
              <IconComponent className={`w-3.5 h-3.5 ${colorClass}`} />
              <span className="font-medium">{Math.round(weather.temperature)}°</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px]">
            <div className="text-xs space-y-1">
              <div className="font-medium">{weather.description}</div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Feels {Math.round(weather.feelsLike)}°</span>
                <span>·</span>
                <span>{weather.humidity}% humidity</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Wind {Math.round(weather.windSpeed)} km/h</span>
                {weather.windGusts > weather.windSpeed * 1.5 && (
                  <span>Gusts {Math.round(weather.windGusts)}</span>
                )}
              </div>
              {weather.precipitation > 0 && (
                <div className="text-muted-foreground">
                  Precipitation: {weather.precipitation} mm
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${bgClass} ${className}`} data-testid="weather-badge-inline">
        <IconComponent className={`w-3.5 h-3.5 ${colorClass}`} />
        <span className="font-medium">{Math.round(weather.temperature)}°C</span>
        <span className="text-muted-foreground">{weather.description}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${bgClass} ${className}`} data-testid="weather-badge-detailed">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgClass}`}>
        <IconComponent className={`w-6 h-6 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{Math.round(weather.temperature)}°C</span>
          <span className="text-sm text-muted-foreground">{weather.description}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span className="flex items-center gap-1">
            <Thermometer className="w-3 h-3" />
            Feels {Math.round(weather.feelsLike)}°
          </span>
          <span className="flex items-center gap-1">
            <Droplets className="w-3 h-3" />
            {weather.humidity}%
          </span>
          <span className="flex items-center gap-1">
            <Wind className="w-3 h-3" />
            {Math.round(weather.windSpeed)} km/h
          </span>
        </div>
      </div>
    </div>
  );
}

interface WeatherFromDataProps {
  weather: WeatherData | null | undefined;
  variant?: 'compact' | 'inline' | 'detailed';
  className?: string;
}

export function WeatherFromData({ weather, variant = 'compact', className = '' }: WeatherFromDataProps) {
  if (!weather) return null;

  const IconComponent = ICON_MAP[weather.icon] || Cloud;
  const colorClass = getWeatherColor(weather.weatherCode);
  const bgClass = getWeatherBgColor(weather.weatherCode);

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-1 text-xs ${className}`} data-testid="weather-data-compact">
              <IconComponent className={`w-3.5 h-3.5 ${colorClass}`} />
              <span className="font-medium">{Math.round(weather.temperature)}°</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px]">
            <div className="text-xs space-y-1">
              <div className="font-medium">{weather.description}</div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Feels {Math.round(weather.feelsLike)}°</span>
                <span>·</span>
                <span>{weather.humidity}% humidity</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Wind {Math.round(weather.windSpeed)} km/h</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${bgClass} ${className}`} data-testid="weather-data-inline">
        <IconComponent className={`w-3.5 h-3.5 ${colorClass}`} />
        <span className="font-medium">{Math.round(weather.temperature)}°C</span>
        <span className="text-muted-foreground">{weather.description}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${bgClass} ${className}`} data-testid="weather-data-detailed">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgClass}`}>
        <IconComponent className={`w-6 h-6 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{Math.round(weather.temperature)}°C</span>
          <span className="text-sm text-muted-foreground">{weather.description}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span className="flex items-center gap-1">
            <Thermometer className="w-3 h-3" />
            Feels {Math.round(weather.feelsLike)}°
          </span>
          <span className="flex items-center gap-1">
            <Droplets className="w-3 h-3" />
            {weather.humidity}%
          </span>
          <span className="flex items-center gap-1">
            <Wind className="w-3 h-3" />
            {Math.round(weather.windSpeed)} km/h
          </span>
        </div>
      </div>
    </div>
  );
}
