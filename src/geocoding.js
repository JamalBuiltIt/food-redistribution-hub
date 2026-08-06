/**
 * Converts address inputs into exact lat/lng coordinates using free OSM Nominatim search.
 */
export async function geocodeStructuredAddress({ street, city, state, zip }) {
  const fullAddress = `${street ? street + ', ' : ''}${city}, ${state} ${zip}`.trim();

  try {
    // 1. Try free-form query search first (far better for business names and precise street numbers)
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      fullAddress
    )}&limit=1&addressdetails=1`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'FoodSurplusRedistributionHub/1.0',
      },
    });

    if (!response.ok) throw new Error('Geocoding service unavailable');

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        formattedAddress: fullAddress,
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}