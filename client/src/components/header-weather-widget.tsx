import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useWeather } from '@/components/weather-badge';
import {
  Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain,
  CloudLightning, Snowflake, MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface UserAddress {
  id: string;
  label: string;
  address: string;
  city: string;
  isDefault: boolean;
  latitude: string | null;
  longitude: string | null;
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

const FALLBACK_LAT = 52.1332;
const FALLBACK_LNG = -106.6700;
const FALLBACK_CITY = 'Saskatoon';

const DISPLAY_CYCLE_MS = 6000;

export function HeaderWeatherWidget({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const [displayIndex, setDisplayIndex] = useState(0);

  const { data: addressData } = useQuery<{ addresses: UserAddress[] }>({
    queryKey: ['/api/addresses'],
    enabled: !!user,
  });

  const defaultAddr = addressData?.addresses?.find(a => a.isDefault) || addressData?.addresses?.[0];
  const addrLat = defaultAddr?.latitude ? parseFloat(defaultAddr.latitude) : null;
  const addrLng = defaultAddr?.longitude ? parseFloat(defaultAddr.longitude) : null;

  const lat = addrLat ?? FALLBACK_LAT;
  const lng = addrLng ?? FALLBACK_LNG;
  const userCity = defaultAddr?.city || user?.defaultCity || FALLBACK_CITY;

  const { data: weather } = useWeather(lat, lng);

  const displayItems = weather ? [
    { key: 'temp', value: `${Math.round(weather.temperature)}°C`, label: weather.description },
    { key: 'feels', value: `${Math.round(weather.feelsLike)}°`, label: 'Feels like' },
    { key: 'wind', value: `${Math.round(weather.windSpeed)} km/h`, label: 'Wind' },
    { key: 'humidity', value: `${weather.humidity}%`, label: 'Humidity' },
  ] : [];

  useEffect(() => {
    if (displayItems.length === 0) return;
    const interval = setInterval(() => {
      setDisplayIndex(prev => (prev + 1) % displayItems.length);
    }, DISPLAY_CYCLE_MS);
    return () => clearInterval(interval);
  }, [displayItems.length]);

  if (!weather) return null;

  const IconComponent = ICON_MAP[weather.icon] || Cloud;
  const colorClass = getWeatherColor(weather.weatherCode);
  const currentItem = displayItems[displayIndex];

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="header-weather-widget">
      <div className="flex items-center gap-1.5">
        <IconComponent className={`w-5 h-5 ${colorClass}`} />
        <span className="text-lg font-bold" data-testid="weather-temperature">{Math.round(weather.temperature)}°</span>
      </div>
      <div className="flex flex-col items-start min-w-0">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentItem?.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="text-xs text-muted-foreground leading-tight truncate"
            data-testid="weather-detail"
          >
            {currentItem?.key === 'temp' ? currentItem.label : `${currentItem?.label}: ${currentItem?.value}`}
          </motion.span>
        </AnimatePresence>
        {userCity && (
          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 leading-tight" data-testid="weather-location">
            <MapPin className="w-2.5 h-2.5" />
            {userCity}
          </span>
        )}
      </div>
    </div>
  );
}
