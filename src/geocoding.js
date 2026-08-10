export async function geocodeStructuredAddress({ street, city, state, zip }) {
  try {
    // 1. First attempt: Freeform query string (Most reliable with OpenStreetMap)
    const query = [street, city, state, zip].filter(Boolean).join(', ');
    
    let response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: {
          'User-Agent': 'SurplusShareApp/1.0 (contact@surplusshare.com)', // Required by Nominatim
        },
      }
    );

    let data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }

    // 2. Second attempt: Fallback to City + State + ZIP if exact street isn't found
    const fallbackQuery = [city, state, zip].filter(Boolean).join(', ');
    response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`,
      {
        headers: {
          'User-Agent': 'SurplusShareApp/1.0 (contact@surplusshare.com)',
        },
      }
    );

    data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}