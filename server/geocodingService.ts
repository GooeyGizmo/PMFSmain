// Geocoding service using OpenStreetMap Nominatim (free, no API key needed)
// Rate limited to 1 request per second per Nominatim usage policy

interface GeocodingResult {
  lat: number;
  lng: number;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

class GeocodingService {
  private lastRequestTime: number = 0;
  private readonly MIN_DELAY_MS = 1100; // Nominatim requires 1 req/sec

  private async rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_DELAY_MS) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY_MS - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
    return fetch(url, {
      headers: {
        'User-Agent': 'PrairieMobileFuelServices/1.0 (levi.ernst@prairiemobilefuel.ca)'
      }
    });
  }

  async geocodeAddress(address: string, city: string): Promise<GeocodingResult | null> {
    try {
      const fullAddress = `${address}, ${city}, Canada`;
      const encodedAddress = encodeURIComponent(fullAddress);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;
      
      const response = await this.rateLimitedFetch(url);
      
      if (!response.ok) {
        console.error('Geocoding API error:', response.status);
        return null;
      }
      
      const data: NominatimResponse[] = await response.json();
      
      if (data.length === 0) {
        console.warn(`No geocoding results for: ${fullAddress}`);
        return null;
      }
      
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  async geocodeAddressBatch(addresses: Array<{ id: string; address: string; city: string }>): Promise<Map<string, GeocodingResult>> {
    const results = new Map<string, GeocodingResult>();
    
    for (const item of addresses) {
      const coords = await this.geocodeAddress(item.address, item.city);
      if (coords) {
        results.set(item.id, coords);
      }
    }
    
    return results;
  }
}

export const geocodingService = new GeocodingService();
