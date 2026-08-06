import { useEffect } from 'react';
import { supabase } from './supabaseClient';

export function useLiveLocation(orderId, userId, isTrackingActive, onLocationUpdate) {
  useEffect(() => {
    if (!isTrackingActive || !orderId) return;

    // Join a dynamic channel specific to this order pickup
    const channel = supabase.channel(`tracking:${orderId}`);

    // Listen for live location pings from the other user
    channel
      .on('broadcast', { event: 'location_ping' }, (payload) => {
        if (payload.senderId !== userId) {
          onLocationUpdate(payload.location);
        }
      })
      .subscribe();

    // Broadcast current browser GPS position continuously
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        channel.send({
          type: 'broadcast',
          event: 'location_ping',
          payload: {
            senderId: userId,
            location: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
          },
        });
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      supabase.removeChannel(channel);
    };
  }, [orderId, userId, isTrackingActive]);
}