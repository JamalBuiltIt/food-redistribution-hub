// Calculate straight-line distance between two points in kilometers
export function getHaversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Calculate allocated minutes based on distance
export function calculatePickupTimeMinutes(userCoords, destCoords) {
  if (!userCoords || !destCoords) return 20; // Default 20 mins fallback

  const distKm = getHaversineDistance(
    userCoords.lat,
    userCoords.lng,
    destCoords.lat,
    destCoords.lng
  );

  const baseBufferMinutes = 15; // Minimum time given for any order
  const minutesPerKm = 3;       // Estimated speed allowance (driving/biking)

  const calculatedMinutes = Math.ceil(baseBufferMinutes + distKm * minutesPerKm);

  // Cap between a min of 15 mins and max of 60 mins
  return Math.min(Math.max(calculatedMinutes, 15), 60);
}