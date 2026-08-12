// App.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import {
  Clock,
  MapPin,
  PlusCircle,
  LogOut,
  Utensils,
  Trash2,
  Loader2,
  User,
  Target,
  Search,
  Locate,
  ChefHat,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  X,
  MessageSquare,
  Heart,
  Bell,
  Users,
} from 'lucide-react';

import PasscodeGate from './PasscodeGate';
import UserDashboard from './UserDashboard';
import LiveRoutingMap from './LiveRoutingMap';
import PostChefPlateModal from './PostChefPlateModal';
import OrderChatModal from './OrderChatModal';
import UserProfileModal from './UserProfileModal';
import NotificationsModal from './NotificationsModal';
import { geocodeStructuredAddress } from './geocoding';
import { supabase } from './supabaseClient';
import { requestPushPermission, sendBrowserPushNotification } from './notifications';
import './leafletFix';

const CURRENT_USER_KEY = 'surplus_hub_current_user';

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getClaimWindowMinutes(userCoords, itemCoords) {
  if (!userCoords || !itemCoords) return 20;
  const distKm = calculateHaversineDistance(
    userCoords.lat,
    userCoords.lng,
    itemCoords.lat,
    itemCoords.lng
  );
  const minutes = Math.ceil(15 + distKm * 3);
  return Math.min(Math.max(minutes, 15), 60);
}

function RecenterMap({ lat, lng, zoom = 15 }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], zoom);
    }
  }, [lat, lng, zoom, map]);
  return null;
}

function DraggableMarker({ position, onDragEnd }) {
  const markerRef = useRef(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onDragEnd(latLng.lat, latLng.lng);
        }
      },
    }),
    [onDragEnd]
  );

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={[position.lat, position.lng]}
      ref={markerRef}
    >
      <Popup minWidth={120}>
        <span className="text-xs font-semibold text-slate-700">
          📍 Drag pin to exact pickup entrance!
        </span>
      </Popup>
    </Marker>
  );
}

function LiveCountdown({ expiresAt }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Expired');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs < 10 ? '0' : ''}${secs}s left`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (isExpired) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-500">
        <Clock className="w-3.5 h-3.5" /> Expired
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
      <Clock className="w-3.5 h-3.5 animate-pulse text-amber-500" /> {timeLeft}
    </span>
  );
}

export default function App() {
  // ==========================================
  // 1. ALL STATE DECLARATIONS AT THE TOP
  // ==========================================
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(CURRENT_USER_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [userProfiles, setUserProfiles] = useState({});
  const [activeToast, setActiveToast] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [userSearchResults, setUserSearchResults] = useState([]); 

  const [appMode, setAppMode] = useState('surplus'); // 'surplus' | 'chef'
  const [items, setItems] = useState([]);
  const [chefListings, setChefListings] = useState([]);
  const [subscribedDonors, setSubscribedDonors] = useState([]);
  const [viewingProfileUser, setViewingProfileUser] = useState(null);

  const [activeView, setActiveView] = useState('explore');
  const [activeTrackingOrder, setActiveTrackingOrder] = useState(null);
  const [activeChatOrder, setActiveChatOrder] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  const [showSurplusModal, setShowSurplusModal] = useState(false);
  const [showChefModal, setShowChefModal] = useState(false);

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.006 });
  const [mapZoom, setMapZoom] = useState(13);
  const [previewCoords, setPreviewCoords] = useState(null);
  const [isLocatingUser, setIsLocatingUser] = useState(false);

  // SEARCH STATES
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [hideClaimed, setHideClaimed] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    category: 'Bakery',
    street: '',
    city: '',
    state: '',
    zip: '',
    minutesToExpire: '60',
    imageUrl: '',
    instructions: '',
    phone: '',
  });

  // Image file upload state
  const [imageFile, setImageFile] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // ==========================================
  // 2. ALL EFFECTS SAFELY BELOW STATE
  // ==========================================
  useEffect(() => {
    const syncUserProfile = async () => {
      if (!currentUser?.username) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', currentUser.username)
        .maybeSingle();

      if (profile) {
        const mergedUser = {
          ...currentUser,
          ...profile,
        };
        setCurrentUser(mergedUser);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(mergedUser));
      }
    };

    syncUserProfile();
  }, [currentUser?.username]);

  // Dynamic User Search Effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setUserSearchResults([]);
      return;
    }

    const fetchSearchedUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${searchQuery}%`) 
        .limit(4);

      if (!error && data) {
        setUserSearchResults(data.filter((u) => u.username !== currentUser?.username));
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchSearchedUsers();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, currentUser?.username]);

  // Fetch initial unread count & listen for new notifications
  useEffect(() => {
    if (!currentUser?.username) return;

    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.username)
        .eq('is_read', false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }
    };

    fetchUnreadCount();

    const notifChannel = supabase
      .channel(`notifications_${currentUser.username.replace(/[^a-zA-Z0-9]/g, '')}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.username}`,
        },
        (payload) => {
          const notif = payload.new;
          sendBrowserPushNotification(notif.title, notif.body);
          setActiveToast(notif);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [currentUser?.username]);

  const handleProfileUpdated = (updatedFields) => {
    const updatedUser = {
      ...currentUser,
      ...updatedFields,
      avatar_url: updatedFields.avatar_url || currentUser.avatar_url,
      display_name: updatedFields.display_name || currentUser.display_name,
    };
    setCurrentUser(updatedUser);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
  };

  const fetchProfilesForUsernames = async (usernames) => {
    if (!usernames || usernames.length === 0) return;
    const uniqueNames = [...new Set(usernames)].filter((n) => n && !userProfiles[n]);
    if (uniqueNames.length === 0) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('username', uniqueNames);

    if (data && data.length > 0) {
      setUserProfiles((prev) => {
        const next = { ...prev };
        data.forEach((p) => {
          next[p.username] = p;
        });
        return next;
      });
    }
  };

  useEffect(() => {
    const usernames = [
      ...items.map((i) => i.donor),
      ...chefListings.map((c) => c.chef_name),
    ];
    fetchProfilesForUsernames(usernames);
  }, [items, chefListings]);

  useEffect(() => {
    if (currentUser) {
      requestPushPermission();
      fetchUserSubscriptions();
    }
  }, [currentUser]);

  const fetchUserSubscriptions = async () => {
    if (!currentUser) return;
    const { data } = await supabase
      .from('donor_subscriptions')
      .select('donor_username')
      .eq('subscriber_id', String(currentUser.id));

    if (data) {
      setSubscribedDonors(data.map((s) => s.donor_username));
    }
  };

  const handleToggleSubscribe = async (donorUsername) => {
    if (!currentUser) return;

    const isSubscribed = subscribedDonors.includes(donorUsername);

    if (isSubscribed) {
      await supabase
        .from('donor_subscriptions')
        .delete()
        .eq('subscriber_id', String(currentUser.id))
        .eq('donor_username', donorUsername);

      setSubscribedDonors((prev) => prev.filter((name) => name !== donorUsername));
      sendBrowserPushNotification('Unsubscribed', `Unsubscribed from @${donorUsername}.`);
    } else {
      await supabase.from('donor_subscriptions').insert([
        {
          subscriber_id: String(currentUser.id),
          donor_username: donorUsername,
        },
      ]);

      setSubscribedDonors((prev) => [...prev, donorUsername]);
      sendBrowserPushNotification(
        'Subscribed!',
        `You'll now receive push notifications when @${donorUsername} posts.`
      );
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.warn('GPS warning:', err.message);
        setUserLocation((prev) => prev || { lat: 40.7128, lng: -74.006 });
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const fetchItems = async () => {
      let { data, error } = await supabase
        .from('surplus_items')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        const fallback = await supabase.from('surplus_items').select('*');
        data = fallback.data;
      }

      if (data) setItems(data);
    };

    fetchItems();

    const itemsChannel = supabase
      .channel('public:surplus_items')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'surplus_items' },
        () => {
          fetchItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
    };
  }, []);

  useEffect(() => {
    fetchChefListings();

    // Add this inside your main useEffect in App.jsx
    const chefChannel = supabase
      .channel('public:home_chef_listings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_chef_listings' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setChefListings((prev) => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setChefListings((prev) => prev.map(item => item.id === payload.new.id ? payload.new : item));
        } else if (payload.eventType === 'DELETE') {
          setChefListings((prev) => prev.filter(item => item.id !== payload.old.id));
        }
      })
      .subscribe();

    // Make sure to add supabase.removeChannel(chefChannel) to your cleanup return function!

    return () => supabase.removeChannel(chefChannel);
  }, []);

  const fetchChefListings = async () => {
    const { data } = await supabase
      .from('home_chef_listings')
      .select('*')
      .order('id', { ascending: false });

    if (data) setChefListings(data);
  };

  const handleLogout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    setCurrentUser(null);
  };

  const handleClaim = async (item) => {
    try {
      if (!item || !item.id) return;

      const allowedMinutes = getClaimWindowMinutes(userLocation, { lat: item.lat, lng: item.lng });
      const claimExpiresAt = new Date(Date.now() + allowedMinutes * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('surplus_items')
        .update({
          isClaimed: true,
          claimedBy: String(currentUser.id),
          claimedByUsername: currentUser.username,
          status: 'claimed',
          claimExpiresAt,
        })
        .eq('id', item.id);

      if (error) return;

      await supabase.from('notifications').insert([
        {
          user_id: item.donor,
          type: 'ITEM_CLAIMED',
          title: '📦 Item Reserved!',
          body: `${currentUser.username} reserved your item "${item.title}".`,
          is_read: false,
        },
      ]);

      const updatedItem = {
        ...item,
        isClaimed: true,
        claimedBy: currentUser.id,
        claimExpiresAt,
      };

      setActiveTrackingOrder(updatedItem);
      setActiveView('tracking');
      sendBrowserPushNotification('Item Reserved', `Pickup window set for ${allowedMinutes} minutes.`);
    } catch (err) {
      console.error('Claim error:', err);
    }
  };

  const handleOrderChefPlate = async (plate) => {
    if (plate.available_portions <= 0) return;

    const newPortions = plate.available_portions - 1;
    const { error } = await supabase
      .from('home_chef_listings')
      .update({ available_portions: newPortions, status: newPortions === 0 ? 'sold_out' : 'available' })
      .eq('id', plate.id);

    if (!error) {
      await supabase.from('notifications').insert([
        {
          user_id: plate.chef_name,
          type: 'CHEF_ORDER',
          title: '🛒 New Order!',
          body: `${currentUser.username} ordered a portion of "${plate.title}".`,
          is_read: false,
        },
      ]);

      sendBrowserPushNotification('Order Placed', `Directions set to Chef ${plate.chef_name}'s kitchen.`);
      fetchChefListings();

      // Set plate as active tracking order with chef as donor for chat
      const orderedPlate = {
        ...plate,
        isClaimed: true,
        claimedBy: currentUser.id,
        donor: plate.chef_name,
      };

      setActiveTrackingOrder(orderedPlate);
      setActiveView('tracking');
    }
  };

  const handleDeleteSurplus = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this listing?')) return;
    
    const { error } = await supabase.from('surplus_items').delete().eq('id', itemId);

    if (!error) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      sendBrowserPushNotification('Deleted', 'Listing removed successfully.');
    } else {
      alert(`Failed to delete: ${error.message}`);
    }
  };

  const handleDeleteChefPlate = async (plateId) => {
    if (!window.confirm('Are you sure you want to delete this kitchen dish?')) return;
    
    const { error } = await supabase.from('home_chef_listings').delete().eq('id', plateId);

    if (!error) {
      setChefListings((prev) => prev.filter((p) => p.id !== plateId));
      sendBrowserPushNotification('Deleted', 'Dish removed successfully.');
    } else {
      alert(`Failed to delete: ${error.message}`);
    }
  };

  const handleLocateUser = () => {
    if (!navigator.geolocation) return;
    setIsLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMapZoom(15);
        setIsLocatingUser(false);
      },
      () => setIsLocatingUser(false)
    );
  };

  const handleVerifyLocation = async (e) => {
    e.preventDefault();
    setGeocodeError('');
    setIsGeocoding(true);

    let coords = await geocodeStructuredAddress({
      street: formData.street,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
    });

    setIsGeocoding(false);

    if (!coords) {
      const fallbackCoords = userLocation || mapCenter;
      setPreviewCoords(fallbackCoords);
      setGeocodeError('Exact street address not found on map. Drag marker pin to exact pickup spot.');
      return;
    }

    setPreviewCoords({ lat: coords.lat, lng: coords.lng });
  };

  const handlePublishListing = async () => {
    if (!previewCoords) return;

    setIsUploadingImage(true);
    let finalImageUrl = formData.imageUrl;

    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('surplus-images')
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error('Storage upload error:', uploadError.message);
        alert(`Image upload failed: ${uploadError.message}`);
      } else {
        const { data: publicUrlData } = supabase.storage
          .from('surplus-images')
          .getPublicUrl(fileName);
        if (publicUrlData?.publicUrl) {
          finalImageUrl = publicUrlData.publicUrl;
        }
      }
    }
    setIsUploadingImage(false);

    const fullAddress = `${formData.street ? formData.street + ', ' : ''}${formData.city}, ${
      formData.state
    } ${formData.zip}`;

    const newItem = {
      title: formData.title,
      donor: currentUser.username,
      ownerId: currentUser.id,
      category: formData.category,
      address: fullAddress,
      lat: previewCoords.lat,
      lng: previewCoords.lng,
      imageUrl: finalImageUrl,
      instructions: formData.instructions,
      donorPhone: formData.phone,
      expiresAt: new Date(Date.now() + 1000 * 60 * parseInt(formData.minutesToExpire)).toISOString(),
      isClaimed: false,
      status: 'available',
    };

    const { error } = await supabase.from('surplus_items').insert([newItem]);

    if (!error) {
      setMapCenter({ lat: previewCoords.lat, lng: previewCoords.lng });
      setShowSurplusModal(false);
      setPreviewCoords(null);
      setImageFile(null);
      setFormData({
        title: '',
        category: 'Bakery',
        street: '',
        city: '',
        state: '',
        zip: '',
        minutesToExpire: '60',
        imageUrl: '',
        instructions: '',
        phone: '',
      });

      const { data: subscribers } = await supabase
        .from('donor_subscriptions')
        .select('subscriber_id')
        .eq('donor_username', currentUser.username);

      if (subscribers && subscribers.length > 0) {
        const notificationsToInsert = subscribers.map((sub) => ({
          user_id: sub.subscriber_id,
          type: 'NEW_POST',
          title: `✨ First Dibs from @${currentUser.username}!`,
          body: `New listing: "${formData.title}" was just posted!`,
          is_read: false,
        }));

        await supabase.from('notifications').insert(notificationsToInsert);
      }
    } else {
      console.error('Database insert error:', error.message);
      alert(`Failed to publish listing: ${error.message}`);
    }
  };

  const filteredItems = items.filter((item) => {
    const expiry = item.expiresAt || item.expires_at;
    if (expiry && new Date(expiry).getTime() <= Date.now()) return false;
    const matchesSearch =
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.address?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory && (hideClaimed ? !item.isClaimed : true);
  });

  const filteredChefItems = chefListings.filter(
    (p) =>
      p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.chef_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isChefTheme = appMode === 'chef';

  if (!currentUser) return <PasscodeGate onAuthenticated={(user) => setCurrentUser(user)} />;

  return (
    <div
      className={`h-screen w-screen flex flex-col font-sans overflow-hidden transition-colors duration-300 ${
        isChefTheme ? 'bg-amber-50/30' : 'bg-slate-50'
      }`}
    >
      {/* HEADER */}
      <header
        className={`px-6 py-3.5 flex flex-wrap justify-between items-center gap-4 shrink-0 shadow-sm z-10 border-b transition-colors duration-300 ${
          isChefTheme ? 'bg-amber-950 text-white border-amber-900' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveView('explore')}>
          <div
            className={`p-2.5 rounded-2xl shadow-md transition-colors duration-300 ${
              isChefTheme ? 'bg-amber-500 text-amber-950' : 'bg-emerald-600 text-white'
            }`}
          >
            {isChefTheme ? <ChefHat className="w-6 h-6" /> : <Utensils className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight leading-none">
              {isChefTheme ? 'Local Kitchens' : 'SurplusShare Hub'}
            </h1>
            <span
              className={`text-[11px] font-bold mt-1 flex items-center gap-1 transition-colors duration-300 ${
                isChefTheme ? 'text-amber-300' : 'text-emerald-600'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              {isChefTheme ? 'Homemade Meal Marketplace' : 'Free Surplus Rescue'}
            </span>
          </div>
        </div>

        <div
          className={`p-1 rounded-2xl flex items-center border transition-colors duration-300 ${
            isChefTheme ? 'bg-amber-900/80 border-amber-800' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <button
            onClick={() => setAppMode('surplus')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
              appMode === 'surplus'
                ? 'bg-emerald-600 text-white shadow-md'
                : isChefTheme
                ? 'text-amber-200 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-4 h-4" /> Free Surplus
          </button>
          <button
            onClick={() => setAppMode('chef')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
              appMode === 'chef'
                ? 'bg-amber-500 text-amber-950 shadow-md'
                : isChefTheme
                ? 'text-amber-200 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ChefHat className="w-4 h-4" /> Home Chefs ($)
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleLocateUser}
            disabled={isLocatingUser}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              isChefTheme ? 'bg-amber-900 text-amber-200 hover:bg-amber-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {isLocatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Locate className="w-4 h-4" />}
            <span className="hidden sm:inline">Near Me</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowNotificationsModal(true)}
              className={`p-2.5 rounded-xl border transition-all hover:scale-105 relative flex items-center justify-center ${
                isChefTheme
                  ? 'bg-amber-900/60 border-amber-800 text-amber-200 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900'
              }`}
              title="Open Notifications & Messages"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black text-[10px] px-1.5 py-0.5 rounded-full shadow-md animate-pulse border-2 border-white dark:border-slate-900">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setViewingProfileUser(currentUser.username)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border transition-all hover:scale-105 ${
              isChefTheme
                ? 'bg-amber-900/60 border-amber-800 text-amber-100'
                : 'bg-slate-100 border-slate-200 text-slate-800'
            }`}
          >
            <img
              src={currentUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`}
              alt={currentUser.username}
              className="w-6 h-6 rounded-full bg-slate-300 object-cover"
            />
            <span className="text-xs font-bold">{currentUser.display_name || currentUser.username}</span>
          </button>

          <button
            onClick={() => {
              if (isChefTheme) setShowChefModal(true);
              else setShowSurplusModal(true);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold shadow-md transition-all ${
              isChefTheme
                ? 'bg-amber-500 hover:bg-amber-400 text-amber-950'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            {isChefTheme ? 'Sell Meal Plate' : 'Post Free Surplus'}
          </button>

          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* VIEWS */}
      {activeView === 'dashboard' && (
        <UserDashboard
          currentUser={currentUser}
          appMode={appMode} // 👈 Added
          onSelectOrderForTracking={(order) => {
            setActiveTrackingOrder(order);
            setActiveView('tracking');
          }}
        />
      )}

      {activeView === 'tracking' && activeTrackingOrder && (
        <div className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0">
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Navigating to {activeTrackingOrder.title}</h2>
              <p className="text-xs text-slate-500">{activeTrackingOrder.address}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveChatOrder(activeTrackingOrder)}
                className={`flex items-center gap-1.5 px-4 py-2 text-white font-semibold text-xs rounded-xl transition-colors ${
                  isChefTheme ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <MessageSquare className="w-4 h-4" /> {isChefTheme ? 'Chat with Chef' : 'Chat with Donor'}
              </button>
              <button
                onClick={() => setActiveView('explore')}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Back to Map
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <LiveRoutingMap
              userCoords={userLocation || { lat: activeTrackingOrder.lat - 0.003, lng: activeTrackingOrder.lng - 0.003 }}
              destinationCoords={{ lat: activeTrackingOrder.lat, lng: activeTrackingOrder.lng }}
              orderTitle={activeTrackingOrder.title}
            />
          </div>
        </div>
      )}

      {activeView === 'explore' && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden">
          <div className="p-5 overflow-y-auto h-full border-r border-slate-200 bg-white flex flex-col gap-4">
            <div className="space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder={isChefTheme ? 'Search dishes, chefs...' : 'Search food, people, or address...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs outline-none transition-colors ${
                    isChefTheme
                      ? 'bg-amber-50/20 border-amber-200 focus:ring-2 focus:ring-amber-500'
                      : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500'
                  }`}
                />
              </div>

              <div className="h-8 flex items-center">
                {!isChefTheme ? (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 w-full">
                    {['All', 'Bakery', 'Prepared Meals', 'Produce', 'Groceries'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors shrink-0 ${
                          selectedCategory === cat
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600" /> Kitchen Listings Available Now
                  </span>
                )}
              </div>
            </div>

            <div key={appMode} className="space-y-4 flex-1 animate-fade-in pb-10">
              
              {/* DYNAMIC USER SEARCH RESULTS */}
              {searchQuery && userSearchResults.length > 0 && (
                <div className="mb-6 pb-6 border-b border-slate-100">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" /> People matching "{searchQuery}"
                  </h3>
                  <div className="flex flex-col gap-2">
                    {userSearchResults.map((user) => (
                      <button
                        key={user.username}
                        onClick={() => setViewingProfileUser(user.username)}
                        className={`flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200 transition-all text-left ${
                          isChefTheme ? 'hover:border-amber-300 hover:shadow-md' : 'hover:border-emerald-300 hover:shadow-md'
                        }`}
                      >
                        <img
                          src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                          alt={user.username}
                          className="w-10 h-10 rounded-full bg-slate-100 object-cover"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-800">{user.display_name || user.username}</div>
                          <div className="text-[11px] font-semibold text-slate-500">@{user.username}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isChefTheme
                ? filteredChefItems.map((plate) => {
                    const chefProf = userProfiles[plate.chef_name];
                    const chefAvatar = chefProf?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${plate.chef_name}`;
                    const chefDisplayName = chefProf?.display_name || plate.chef_name;

                    return (
                      <div
                        key={plate.id}
                        className="p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm hover:shadow-md transition-shadow"
                      >
                        {plate.image_url && (
                          <div className="relative w-full h-56 overflow-hidden rounded-xl mb-3 bg-slate-100 group">
                            <img
                              src={plate.image_url}
                              alt={plate.title}
                              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/30 to-transparent opacity-75 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none" />
                          </div>
                        )}
                        <div className="flex justify-between items-start">
                          <button
                            onClick={() => setViewingProfileUser(plate.chef_name)}
                            className="text-[10px] font-extrabold px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl flex items-center gap-1.5 transition-colors"
                          >
                            <img
                              src={chefAvatar}
                              className="w-4 h-4 rounded-full object-cover bg-white"
                              alt=""
                            />
                            <span>Chef {chefDisplayName}</span>
                          </button>
                          <span className="text-base font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-xl">
                            ${parseFloat(plate.price).toFixed(2)}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 mt-2 text-base">{plate.title}</h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" /> {plate.address}
                        </p>

                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-amber-100 text-xs">
                          <span className="font-bold text-amber-900 flex items-center gap-1">
                            <ShoppingBag className="w-3.5 h-3.5" /> {plate.available_portions} left
                          </span>
                          <div className="flex items-center gap-2">
                            {plate.chef_name === currentUser.username && (
                              <button
                                onClick={() => handleDeleteChefPlate(plate.id)}
                                className="p-2 bg-amber-100 hover:bg-rose-100 hover:text-rose-600 text-amber-900 rounded-xl transition-colors border border-amber-200"
                                title="Delete Dish"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setActiveChatOrder({ ...plate, donor: plate.chef_name })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl transition-colors border border-amber-200"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Chat
                            </button>
                            <button
                              onClick={() => handleOrderChefPlate(plate)}
                              disabled={plate.available_portions <= 0}
                              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl disabled:bg-slate-300 transition-colors"
                            >
                              {plate.available_portions > 0 ? 'Order Plate' : 'Sold Out'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : filteredItems.map((item) => {
                    const donorProf = userProfiles[item.donor];
                    const donorAvatar = donorProf?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.donor}`;
                    const donorDisplayName = donorProf?.display_name || item.donor;

                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-2xl border bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                      >
                        {item.imageUrl && (
                          <div className="relative w-full h-56 overflow-hidden rounded-xl mb-3 bg-slate-100 group">
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/30 to-transparent opacity-75 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none" />
                          </div>
                        )}
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            {item.category}
                          </span>

                          {item.donor && (
                            <button
                              onClick={() => setViewingProfileUser(item.donor)}
                              className="text-[11px] font-bold text-slate-600 hover:text-emerald-600 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100"
                            >
                              <img
                                src={donorAvatar}
                                className="w-4 h-4 rounded-full object-cover bg-white"
                                alt=""
                              />
                              {donorDisplayName}
                            </button>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-800 mt-2 text-base">{item.title}</h3>
                        <p className="text-xs text-slate-600 flex items-center gap-1 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {item.address}
                        </p>

                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                          <LiveCountdown expiresAt={item.claimExpiresAt || item.expiresAt || item.expires_at} />

                          <div className="flex items-center gap-2">
                            {(item.donor === currentUser.username || item.ownerId === currentUser.id) && (
                              <button
                                onClick={() => handleDeleteSurplus(item.id)}
                                className="p-2 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-600 rounded-xl transition-colors border border-slate-200"
                                title="Delete Listing"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {item.isClaimed && (
                              <button
                                onClick={() => setActiveChatOrder(item)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition-colors border border-emerald-200"
                              >
                                <MessageSquare className="w-3.5 h-3.5" /> Chat
                              </button>
                            )}
                            <button
                              onClick={() => handleClaim(item)}
                              disabled={item.isClaimed}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl disabled:bg-slate-300 transition-colors"
                            >
                              {item.isClaimed ? 'Reserved' : 'Claim Item'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* MAP CONTAINER */}
          <div className="md:col-span-2 h-full w-full relative z-0">
            <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={mapZoom} className="h-full w-full">
              <RecenterMap lat={mapCenter.lat} lng={mapCenter.lng} zoom={mapZoom} />
              <TileLayer
                attribution="© OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {(isChefTheme ? filteredChefItems : filteredItems).map((loc) => {
                // Determine who the user is based on the active mode
                const personUsername = isChefTheme ? loc.chef_name : loc.donor;
                const personProf = userProfiles[personUsername];
                const avatar = personProf?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${personUsername}`;
                const displayName = personProf?.display_name || personUsername;

                return (
                  <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                    <Popup className="custom-popup">
                      <div className="p-1 max-w-[200px] space-y-3">
                        
                        <div className="flex items-start gap-3">
                          {/* CLICKABLE PROFILE PICTURE IN MAP POPUP */}
                          <img
                            src={avatar}
                            alt={personUsername}
                            onClick={() => setViewingProfileUser(personUsername)}
                            className={`w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity border-2 shadow-sm shrink-0 ${
                              isChefTheme ? 'border-amber-200' : 'border-emerald-200'
                            }`}
                            title={`View ${displayName}'s profile`}
                          />
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-slate-800 leading-tight truncate">{loc.title}</h4>
                            <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5 line-clamp-2">
                              {loc.address}
                            </p>
                          </div>
                        </div>

                        {/* VIEW PROFILE BUTTON */}
                        <button
                          onClick={() => setViewingProfileUser(personUsername)}
                          className={`w-full py-1.5 text-xs font-bold rounded-lg transition-colors ${
                            isChefTheme 
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' 
                              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          }`}
                        >
                          View {displayName}
                        </button>

                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS MODAL */}
      {showNotificationsModal && (
        <NotificationsModal
          currentUser={currentUser}
          appMode={appMode} // 👈 Passes mode so colors match
          onClose={() => {
            setShowNotificationsModal(false);
            supabase
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', currentUser.username)
              .eq('is_read', false)
              .then(({ count }) => {
                if (count !== null) setUnreadCount(count);
              });
          }}
          onOpenChat={(chatOrder) => setActiveChatOrder(chatOrder)}
        />
      )}

      {/* USER PROFILE MODAL */}
      {viewingProfileUser && (
        <UserProfileModal
          targetUsername={viewingProfileUser}
          currentUser={currentUser}
          isChefTheme={isChefTheme}
          isSubscribed={subscribedDonors.includes(viewingProfileUser)}
          onToggleSubscribe={handleToggleSubscribe}
          onOpenChat={(targetUsername) => {
            setViewingProfileUser(null);
            setActiveChatOrder({
              id: `dm_${[currentUser.username, targetUsername].sort().join('_')}`,
              title: `Direct Message with @${targetUsername}`,
              donor: targetUsername,
              isDirectDm: true,
            });
          }}
          onClose={() => setViewingProfileUser(null)}
          onProfileUpdated={handleProfileUpdated}
        />
      )}

      {/* SURPLUS POSTING MODAL */}
      {showSurplusModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100">
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-600 text-white rounded-xl">
                  <Utensils className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Post Free Surplus Food</h2>
                  <p className="text-xs text-slate-500 font-medium">Community Surplus Rescue</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSurplusModal(false);
                  setPreviewCoords(null);
                  setImageFile(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyLocation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Item / Food Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Fresh Sourdough Bread Loaves"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                  >
                    <option value="Bakery">Bakery</option>
                    <option value="Prepared Meals">Prepared Meals</option>
                    <option value="Produce">Produce</option>
                    <option value="Groceries">Groceries</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Available For
                  </label>
                  <select
                    value={formData.minutesToExpire}
                    onChange={(e) => setFormData({ ...formData, minutesToExpire: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                  >
                    <option value="30">30 Minutes</option>
                    <option value="60">1 Hour</option>
                    <option value="120">2 Hours</option>
                    <option value="240">4 Hours</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 123 Main Street"
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">City</label>
                  <input
                    type="text"
                    required
                    placeholder="New York"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">State</label>
                  <input
                    type="text"
                    required
                    placeholder="NY"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">ZIP</label>
                  <input
                    type="text"
                    required
                    placeholder="10001"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Item Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files[0])}
                  className="w-full px-3 py-1.5 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50 file:mr-4 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Pickup Instructions
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g., Box is located on the porch."
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50"
                />
              </div>

              {geocodeError && (
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                  {geocodeError}
                </div>
              )}

              {!previewCoords && (
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSurplusModal(false);
                      setImageFile(null);
                    }}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGeocoding}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
                  >
                    {isGeocoding ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                      </>
                    ) : (
                      <>
                        <Target className="w-4 h-4" /> Locate & Review
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>

            {previewCoords && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-emerald-600" /> Adjust Marker Location
                  </span>
                </div>

                <div className="h-44 w-full rounded-xl overflow-hidden border border-slate-200 mb-4">
                  <MapContainer
                    center={[previewCoords.lat, previewCoords.lng]}
                    zoom={16}
                    className="h-full w-full"
                  >
                    <RecenterMap lat={previewCoords.lat} lng={previewCoords.lng} zoom={16} />
                    <TileLayer
                      attribution="© OpenStreetMap"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <DraggableMarker
                      position={previewCoords}
                      onDragEnd={(lat, lng) => setPreviewCoords({ lat, lng })}
                    />
                  </MapContainer>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setPreviewCoords(null)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
                  >
                    Edit Address
                  </button>
                  <button
                    type="button"
                    onClick={handlePublishListing}
                    disabled={isUploadingImage}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md rounded-xl disabled:opacity-50"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Uploading Photo...
                      </>
                    ) : (
                      'Confirm & Publish'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HOME CHEF MODAL */}
      {showChefModal && (
        <PostChefPlateModal
          currentUser={currentUser}
          onClose={() => setShowChefModal(false)}
          onPublished={fetchChefListings}
        />
      )}

      {/* DIRECT MESSAGE CHAT MODAL */}
      {activeChatOrder && (
        <OrderChatModal
          order={activeChatOrder}
          currentUser={currentUser}
          onClose={() => setActiveChatOrder(null)}
        />
      )}

      {/* IN-APP FLOATING TOAST NOTIFICATION POPUP */}
      {/* IN-APP FLOATING TOAST NOTIFICATION POPUP */}
      {/* IN-APP FLOATING TOAST NOTIFICATION POPUP */}
      {activeToast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white p-4 rounded-3xl shadow-2xl z-[999999] max-w-sm w-full border border-slate-700 flex flex-col gap-2 animate-bounce-in">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isChefTheme ? 'bg-amber-500' : 'bg-emerald-500'} animate-ping`}></span>
              <h4 className={`font-bold text-xs ${isChefTheme ? 'text-amber-400' : 'text-emerald-400'} uppercase tracking-wider`}>
                {activeToast.title}
              </h4>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded-xl"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-300 font-medium">{activeToast.body}</p>

          <div className="flex justify-end gap-2 mt-1">
            {(activeToast.type === 'DIRECT_MESSAGE' || activeToast.type === 'NEW_MESSAGE' || activeToast.type === 'ITEM_MESSAGE') && (
              <button
                onClick={() => {
                  const senderUsername = 
                    activeToast.sender || 
                    (activeToast.title && activeToast.title.match(/@([\w_.-]+)/)?.[1]) || 
                    (activeToast.body && activeToast.body.split(' ')[0]);

                  if (senderUsername) {
                    setActiveChatOrder({
                      id: activeToast.order_id || `dm_${[currentUser.username, senderUsername].sort().join('_')}`,
                      title: activeToast.type === 'ITEM_MESSAGE' ? (activeToast.title || 'Item Chat') : `Direct Message with @${senderUsername}`,
                      donor: senderUsername,
                      isDirectDm: activeToast.type !== 'ITEM_MESSAGE',
                    });
                  }
                  setActiveToast(null);
                }}
                className={`px-3.5 py-1.5 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 ${
                  isChefTheme ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Open Chat
              </button>
            )}
            <button
              onClick={() => setActiveToast(null)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}