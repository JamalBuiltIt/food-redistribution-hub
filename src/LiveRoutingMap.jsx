import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default marker icon paths
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper: Realtime Claim Timer badge inside header
function DynamicClaimTimer({ claimExpiresAt }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!claimExpiresAt) return;

    const interval = setInterval(() => {
      const diff = new Date(claimExpiresAt) - new Date();
      if (diff <= 0) {
        clearInterval(interval);
        setTimeLeft('EXPIRED');
        setIsUrgent(true);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setIsUrgent(mins < 5);
        setTimeLeft(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [claimExpiresAt]);

  if (!claimExpiresAt) return null;

  return (
    <span
      className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-1.5 shadow-sm border ${
        isUrgent
          ? 'bg-rose-100 text-rose-700 animate-pulse border-rose-300'
          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
      }`}
    >
      <span>⏱️ Window:</span>
      <span>{timeLeft || 'Calculating...'}</span>
    </span>
  );
}

// ⚡ Fixes Leaflet tile render freeze on tab switch & auto-fits bounds
function MapController({ userCoords, destinationCoords }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    if (userCoords?.lat && destinationCoords?.lat) {
      const bounds = L.latLngBounds(
        [userCoords.lat, userCoords.lng],
        [destinationCoords.lat, destinationCoords.lng]
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    return () => clearTimeout(timer);
  }, [map, userCoords?.lat, userCoords?.lng, destinationCoords?.lat, destinationCoords?.lng]);

  return null;
}

export default function LiveRoutingMap({
  userCoords,
  destinationCoords,
  orderTitle,
  claimExpiresAt,
}) {
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState(false);

  const hasValidUser =
    userCoords && typeof userCoords.lat === 'number' && !isNaN(userCoords.lat);
  const hasValidDest =
    destinationCoords && typeof destinationCoords.lat === 'number' && !isNaN(destinationCoords.lat);

  // Fetch driving route with a fast 3-second timeout fallback
  useEffect(() => {
    if (!hasValidUser || !hasValidDest) return;

    let isMounted = true;
    setIsLoadingRoute(true);
    setRouteError(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const url = `https://router.project-osrm.org/route/v1/driving/${userCoords.lng},${userCoords.lat};${destinationCoords.lng},${destinationCoords.lat}?overview=full&geometries=geojson`;

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Routing service returned error');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.routes && data.routes.length > 0) {
          const leafletCoords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [
            lat,
            lng,
          ]);
          setRouteCoordinates(leafletCoords);
        } else {
          setRouteError(true);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Driving directions unavailable, using direct path:', err.message);
        setRouteError(true);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (isMounted) setIsLoadingRoute(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [userCoords?.lat, userCoords?.lng, destinationCoords?.lat, destinationCoords?.lng]);

  const initialCenter = hasValidUser
    ? userCoords
    : hasValidDest
    ? destinationCoords
    : { lat: 40.7128, lng: -74.006 };

  const fallbackLine =
    hasValidUser && hasValidDest
      ? [
          [userCoords.lat, userCoords.lng],
          [destinationCoords.lat, destinationCoords.lng],
        ]
      : [];

  const activePolyline = routeCoordinates.length > 0 ? routeCoordinates : fallbackLine;

  return (
    <div className="w-full h-full min-h-[450px] relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
      {/* Top Banner Overlay */}
      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl shadow-md z-[1000] border border-slate-200 flex items-center gap-2 max-w-[90%] flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
        <span className="text-xs font-bold text-slate-800 truncate">
          Navigating to: {orderTitle || 'Pickup Location'}
        </span>

        {claimExpiresAt && <DynamicClaimTimer claimExpiresAt={claimExpiresAt} />}

        {isLoadingRoute && (
          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
            Calculating...
          </span>
        )}
        {routeError && (
          <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md shrink-0">
            Direct path
          </span>
        )}
      </div>

      {!hasValidUser && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <p className="text-xs font-semibold text-slate-600 bg-white px-4 py-2 rounded-xl shadow border border-slate-200">
            📍 Acquiring GPS position... Please allow location access in your browser.
          </p>
        </div>
      )}

      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={14}
        className="h-full w-full min-h-[450px]"
      >
        <TileLayer
          attribution='© OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {hasValidUser && (
          <Marker position={[userCoords.lat, userCoords.lng]}>
            <Popup>📍 Your Current Location</Popup>
          </Marker>
        )}

        {hasValidDest && (
          <Marker position={[destinationCoords.lat, destinationCoords.lng]}>
            <Popup>🏁 Pickup: {orderTitle}</Popup>
          </Marker>
        )}

        {activePolyline.length > 0 && (
          <Polyline
            positions={activePolyline}
            pathOptions={{
              color: '#059669',
              weight: 6,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        <MapController userCoords={userCoords} destinationCoords={destinationCoords} />
      </MapContainer>
    </div>
  );
}