import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import {
  Clock,
  MapPin,
  CheckCircle,
  PlusCircle,
  LogOut,
  Utensils,
  Trash2,
  Loader2,
  User,
  Target,
  Navigation,
  Search,
  Locate,
  Info,
  Camera,
  ChefHat,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  X,
} from 'lucide-react';

import PasscodeGate from './PasscodeGate';
import UserDashboard from './UserDashboard';
import LiveRoutingMap from './LiveRoutingMap';
import PostChefPlateModal from './PostChefPlateModal';
import { geocodeStructuredAddress } from './geocoding';
import { supabase } from './supabaseClient';
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
      const diff = new Date(expiresAt) - new Date();
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Expired');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s left`);
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
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(CURRENT_USER_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [appMode, setAppMode] = useState('surplus'); // 'surplus' | 'chef'
  const [items, setItems] = useState([]);
  const [chefListings, setChefListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeView, setActiveView] = useState('explore');
  const [activeTrackingOrder, setActiveTrackingOrder] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  const [showSurplusModal, setShowSurplusModal] = useState(false);
  const [showChefModal, setShowChefModal] = useState(false);

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.006 });
  const [mapZoom, setMapZoom] = useState(13);
  const [previewCoords, setPreviewCoords] = useState(null);
  const [isLocatingUser, setIsLocatingUser] = useState(false);

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
        console.warn('GPS position warning:', err.message);
        setUserLocation((prev) => prev || { lat: 40.7128, lng: -74.006 });
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const fetchItems = async () => {
      const { data, error } = await supabase
        .from('surplus_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) setItems(data);
      setIsLoading(false);
    };

    fetchItems();

    const channel = supabase
      .channel('public:surplus_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surplus_items' }, (payload) => {
        if (payload.eventType === 'INSERT') setItems((prev) => [payload.new, ...prev]);
        else if (payload.eventType === 'UPDATE')
          setItems((prev) => prev.map((i) => (i.id === payload.new.id ? payload.new : i)));
        else if (payload.eventType === 'DELETE')
          setItems((prev) => prev.filter((i) => i.id !== payload.old.id));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    fetchChefListings();

    const chefChannel = supabase
      .channel('public:home_chef_listings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_chef_listings' }, () =>
        fetchChefListings()
      )
      .subscribe();

    return () => supabase.removeChannel(chefChannel);
  }, []);

  const fetchChefListings = async () => {
    const { data } = await supabase
      .from('home_chef_listings')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setChefListings(data);
  };

  const handleLogout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    setCurrentUser(null);
  };

  const handleClaim = async (item) => {
    const allowedMinutes = getClaimWindowMinutes(userLocation, { lat: item.lat, lng: item.lng });
    const claimExpiresAt = new Date(Date.now() + allowedMinutes * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('surplus_items')
      .update({
        isClaimed: true,
        claimedBy: currentUser.id,
        claimedByUsername: currentUser.username,
        status: 'claimed',
        claimExpiresAt: claimExpiresAt,
      })
      .eq('id', item.id);

    if (error) {
      alert('Could not claim item. Please try again.');
      return;
    }

    setActiveTrackingOrder({
      ...item,
      isClaimed: true,
      claimedBy: currentUser.id,
      claimExpiresAt,
    });
    setActiveView('tracking');
    alert(`Item reserved! You have ${allowedMinutes} minutes to complete pickup.`);
  };

  const handleOrderChefPlate = async (plate) => {
    if (plate.available_portions <= 0) {
      alert('Sorry, this dish is sold out!');
      return;
    }

    if (
      !window.confirm(
        `Order 1 portion of "${plate.title}" for $${parseFloat(plate.price).toFixed(2)} from Chef ${
          plate.chef_name
        }?`
      )
    )
      return;

    const newPortions = plate.available_portions - 1;
    const { error } = await supabase
      .from('home_chef_listings')
      .update({ available_portions: newPortions, status: newPortions === 0 ? 'sold_out' : 'available' })
      .eq('id', plate.id);

    if (error) alert('Could not place order.');
    else {
      alert(`Order reserved! Contact Chef ${plate.chef_name} at ${plate.chef_phone} for pickup.`);
      fetchChefListings();
    }
  };

  const handleDeleteItem = async (id) => {
    if (confirm('Delete this listing?')) {
      await supabase.from('surplus_items').delete().eq('id', id);
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
      setGeocodeError('Could not locate address.');
      return;
    }

    setPreviewCoords({ lat: coords.lat, lng: coords.lng });
  };

  const handlePublishListing = async () => {
    if (!previewCoords) return;

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
      imageUrl: formData.imageUrl,
      instructions: formData.instructions,
      donorPhone: formData.phone,
      expiresAt: new Date(Date.now() + 1000 * 60 * parseInt(formData.minutesToExpire)).toISOString(),
      isClaimed: false,
      status: 'available',
    };

    await supabase.from('surplus_items').insert([newItem]);
    setMapCenter({ lat: previewCoords.lat, lng: previewCoords.lng });
    setShowSurplusModal(false);
    setPreviewCoords(null);
  };

  const filteredItems = items.filter((item) => {
    if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) return false;
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

        {/* MODE SWITCHER */}
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

        {/* ACTIONS */}
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

          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold ${
              isChefTheme ? 'bg-amber-900 text-amber-200' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <User className="w-4 h-4" />
            <span>{currentUser.username}</span>
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
            <button
              onClick={() => setActiveView('dashboard')}
              className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl"
            >
              Back to Dashboard
            </button>
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
          {/* FIXED HEIGHT SIDEBAR */}
          <div className="p-5 overflow-y-auto h-full border-r border-slate-200 bg-white flex flex-col gap-4">
            <div className="space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder={isChefTheme ? 'Search dishes, chefs...' : 'Search free food, address...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs outline-none transition-colors ${
                    isChefTheme ? 'bg-amber-50/20 border-amber-200 focus:ring-2 focus:ring-amber-500' : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-emerald-500'
                  }`}
                />
              </div>

              {/* FIXED HEIGHT CATEGORY BAR TO PREVENT JUMP */}
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

            {/* LISTINGS WITH SMOOTH ANIMATION */}
            <div key={appMode} className="space-y-4 flex-1 animate-fade-in">
              {isChefTheme
                ? filteredChefItems.map((plate) => (
                    <div
                      key={plate.id}
                      className="p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {plate.image_url && (
                        <img
                          src={plate.image_url}
                          alt={plate.title}
                          className="w-full h-36 object-cover rounded-xl mb-3"
                        />
                      )}
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full flex items-center gap-1">
                          <ChefHat className="w-3 h-3 text-amber-700" /> Chef {plate.chef_name}
                        </span>
                        <span className="text-base font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-xl">
                          ${parseFloat(plate.price).toFixed(2)}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 mt-2 text-base">{plate.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" /> {plate.address}
                      </p>
                      {plate.is_cottage_permitted && (
                        <div className="mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Licensed Cottage Kitchen
                        </div>
                      )}
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-amber-100 text-xs">
                        <span className="font-bold text-amber-900 flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5" /> {plate.available_portions} left
                        </span>
                        <button
                          onClick={() => handleOrderChefPlate(plate)}
                          disabled={plate.available_portions <= 0}
                          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl disabled:bg-slate-300 transition-colors"
                        >
                          {plate.available_portions > 0 ? 'Order Plate' : 'Sold Out'}
                        </button>
                      </div>
                    </div>
                  ))
                : filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-32 object-cover rounded-xl mb-3"
                        />
                      )}
                      <div className="flex justify-between items-start">
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                          {item.category}
                        </span>
                        {item.ownerId === currentUser.id && (
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-800 mt-2 text-base">{item.title}</h3>
                      <p className="text-xs text-slate-600 flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {item.address}
                      </p>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                        <LiveCountdown expiresAt={item.expiresAt} />
                        <button
                          onClick={() => handleClaim(item)}
                          disabled={item.isClaimed}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl disabled:bg-slate-300 transition-colors"
                        >
                          {item.isClaimed ? 'Reserved' : 'Claim Item'}
                        </button>
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          {/* MAP CONTAINER */}
          <div className="md:col-span-2 h-full w-full relative">
            <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={mapZoom} className="h-full w-full">
              <RecenterMap lat={mapCenter.lat} lng={mapCenter.lng} zoom={mapZoom} />
              <TileLayer
                attribution="© OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {(isChefTheme ? filteredChefItems : filteredItems).map((loc) => (
                <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                  <Popup>
                    <div className="p-1 max-w-xs space-y-1">
                      <h4 className="font-bold text-sm text-slate-800">{loc.title}</h4>
                      <p className="text-xs text-slate-600">{loc.address}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
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
                  Photo URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-slate-50"
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
                    onClick={() => setShowSurplusModal(false)}
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
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md"
                  >
                    Confirm & Publish
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
    </div>
  );
}