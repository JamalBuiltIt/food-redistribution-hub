import React, { useState, useEffect } from 'react';
import {
  X,
  Heart,
  CheckCircle2,
  MapPin,
  Utensils,
  ChefHat,
  Award,
  MessageSquare,
  Calendar,
  Star,
  Shield,
  Leaf,
  Edit3,
  Share2,
  Check,
  Camera,
  Save,
  Loader2,
  Sparkles,
  Coffee,
  HeartHandshake
} from 'lucide-react';
import { supabase } from './supabaseClient';

export default function UserProfileModal({
  targetUsername,
  currentUser,
  isSubscribed,
  onToggleSubscribe,
  onOpenChat,
  onClose,
  isChefTheme = false,
  onProfileUpdated,
}) {
  const [profileData, setProfileData] = useState(null);
  const [userListings, setUserListings] = useState([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('listings');
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: '',
    bio: '',
    location: '',
    favorite_cuisine: '',
    avatar_url: '',
  });

  useEffect(() => {
    fetchUserProfile();
  }, [targetUsername]);

  const fetchUserProfile = async () => {
    setIsLoading(true);
    setImageError(false);

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', targetUsername)
      .maybeSingle();

    const activeProfile = profile || {
      username: targetUsername,
      display_name: targetUsername,
      bio: "Passionate community food rescuer and home chef enthusiast. Let's eliminate waste together!",
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUsername}&backgroundColor=e2e8f0`,
      location: 'Metro Area, Local Hub',
      joined_date: 'January 2024',
      rating: 4.95,
      total_impact: 184,
      badge: 'Master Rescuer',
      favorite_cuisine: 'Mediterranean & Artisan Baking',
      is_verified: true,
    };

    setProfileData(activeProfile);
    setEditForm({
      display_name: activeProfile.display_name || '',
      bio: activeProfile.bio || '',
      location: activeProfile.location || '',
      favorite_cuisine: activeProfile.favorite_cuisine || '',
      avatar_url: activeProfile.avatar_url || '',
    });

    const { count } = await supabase
      .from('donor_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('donor_username', targetUsername);

    setSubscriberCount(count || 0);

    const { data: surplus } = await supabase
      .from('surplus_items')
      .select('*')
      .eq('donor', targetUsername)
      .eq('status', 'available');

    const { data: chefItems } = await supabase
      .from('home_chef_listings')
      .select('*')
      .eq('chef_name', targetUsername)
      .gt('available_portions', 0);

    setUserListings([...(surplus || []), ...(chefItems || [])]);
    setIsLoading(false);
  };

  // Industry Standard File Upload Handler for Avatars
  const handleAvatarFileChange = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingAvatar(true);
      const fileExt = file.name.split('.').pop();
      // FIXED: Use a clean filename without duplicating the bucket name in the path
      const fileName = `${targetUsername}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setEditForm((prev) => ({ ...prev, avatar_url: publicUrlData.publicUrl }));
    } catch (err) {
      console.error('Avatar upload failed:', err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const updates = {
        username: targetUsername,
        display_name: editForm.display_name,
        bio: editForm.bio,
        location: editForm.location,
        favorite_cuisine: editForm.favorite_cuisine,
        avatar_url: editForm.avatar_url,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'username' });

      if (error) throw error;

      setProfileData((prev) => ({ ...prev, ...updates }));
      setIsEditing(false);
      if (onProfileUpdated) onProfileUpdated(updates);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubscribeClick = () => {
    if (onToggleSubscribe) onToggleSubscribe(targetUsername);
    setSubscriberCount((prev) => (isSubscribed ? prev - 1 : prev + 1));
  };

  const handleCopyProfileLink = () => {
    navigator.clipboard.writeText(`@${targetUsername}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Stock photo fallback generator for listings lacking photos
  const getListingStockPhoto = (item) => {
    if (item.imageUrl || item.image_url) return item.imageUrl || item.image_url;
    const title = (item.title || '').toLowerCase();
    if (title.includes('bread') || title.includes('bakery')) {
      return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80';
    } else if (title.includes('salad') || title.includes('veg') || title.includes('produce')) {
      return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=300&q=80';
    } else if (title.includes('soup') || title.includes('curry') || title.includes('hot')) {
      return 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=300&q=80';
    }
    return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=300&q=80';
  };

  const avatarSource = !imageError && (isEditing ? editForm.avatar_url : profileData?.avatar_url)
    ? (isEditing ? editForm.avatar_url : profileData?.avatar_url)
    : `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUsername}&backgroundColor=e2e8f0`;

  const isSelf = currentUser && currentUser.username === targetUsername;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 z-[99999] font-sans">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-slate-200">
        
        {/* HEADER / COVER BANNER */}
        <div className={`h-32 relative shrink-0 bg-gradient-to-br ${
          isChefTheme 
            ? 'from-amber-600 via-amber-800 to-amber-950' 
            : 'from-emerald-600 via-teal-700 to-slate-900'
        }`}>
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              onClick={handleCopyProfileLink}
              className="p-2 bg-black/30 hover:bg-black/50 text-white rounded-full transition-all"
              title="Copy Profile Handle"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-black/30 hover:bg-black/50 text-white rounded-full transition-all"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY CONTAINER */}
        <div className="px-6 pb-6 pt-4 overflow-y-auto flex-1 bg-white">
          
          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs font-bold text-slate-500">Loading profile data...</p>
            </div>
          ) : isEditing ? (
            /* EDIT PROFILE FORM */
            <form onSubmit={handleSaveProfile} className="space-y-4 pt-1">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">Edit Profile Settings</h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>

              {/* AVATAR UPLOAD SECTION */}
              <div className="flex items-center gap-4 py-2">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 ring-2 ring-slate-200 shrink-0">
                  <img src={avatarSource} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Profile Photo</label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all border border-slate-200">
                    {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    {uploadingAvatar ? 'Uploading...' : 'Upload Image'}
                    <input type="file" accept="image/*" onChange={handleAvatarFileChange} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Location / Community</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Favorite Cuisine / Specialty</label>
                <input
                  type="text"
                  value={editForm.favorite_cuisine}
                  onChange={(e) => setEditForm({ ...editForm, favorite_cuisine: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bio / Mission Statement</label>
                <textarea
                  rows="3"
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving || uploadingAvatar}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs shadow-md transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Profile Changes
              </button>
            </form>
          ) : (
            /* STANDARD PROFILE VIEW */
            <>
              {/* AVATAR & ACTIONS HEADER */}
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full p-1 bg-white shadow-md ring-2 ring-slate-100">
                    <img
                      src={avatarSource}
                      alt={targetUsername}
                      onError={() => setImageError(true)}
                      className="w-full h-full rounded-full object-cover bg-slate-100"
                    />
                  </div>
                  {profileData?.is_verified && (
                    <div className="absolute bottom-0 right-0 p-1 bg-blue-500 text-white rounded-full ring-2 ring-white" title="Verified Community Member">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* ACTION BUTTONS */}
                {currentUser && (
                  <div className="flex items-center gap-2">
                    {isSelf ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-bold text-xs flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                      </button>
                    ) : (
                      <>
                        {onOpenChat && (
                          <button
                            onClick={() => onOpenChat(targetUsername)}
                            className="p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                            title="Send Direct Message"
                          >
                            <MessageSquare className="w-4 h-4 text-slate-700" />
                          </button>
                        )}
                        <button
                          onClick={handleSubscribeClick}
                          className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                            isSubscribed
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                              : isChefTheme
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isSubscribed ? 'fill-rose-500 text-rose-500' : ''}`} />
                          {isSubscribed ? 'Following' : 'Follow'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* USER INFO BLOCK */}
              <div className="pt-3">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {profileData?.display_name}
                </h2>
                <p className="text-xs text-slate-500 font-semibold">@{targetUsername}</p>

                <p className="text-xs text-slate-700 mt-2.5 leading-relaxed font-normal">
                  {profileData?.bio}
                </p>

                {/* UNIQUE CUSTOMIZATION PILLS */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {profileData?.favorite_cuisine && (
                    <span className="flex items-center gap-1 bg-amber-50 text-amber-800 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-amber-200/60">
                      <Coffee className="w-3 h-3" /> {profileData.favorite_cuisine}
                    </span>
                  )}
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-emerald-200/60">
                    <HeartHandshake className="w-3 h-3" /> Zero Waste Advocate
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> {profileData?.location}
                  </span>
                  <span className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> Joined {profileData?.joined_date}
                  </span>
                </div>

                {/* REPUTATION METRICS */}
                <div className="grid grid-cols-3 gap-2 my-4 p-2 bg-slate-50 rounded-2xl border border-slate-200 text-center divide-x divide-slate-200">
                  <div className="py-1">
                    <span className="text-base font-black text-slate-900">{subscriberCount}</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Followers</p>
                  </div>
                  <div className="py-1">
                    <span className="flex items-center justify-center gap-1 text-base font-black text-slate-900">
                      {profileData?.rating} <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    </span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rating</p>
                  </div>
                  <div className="py-1">
                    <span className="text-base font-black text-slate-900">{profileData?.total_impact}</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Impact kg</p>
                  </div>
                </div>

                {/* TABS NAVIGATION */}
                <div className="flex border-b border-slate-200 mb-3">
                  <button
                    onClick={() => setActiveTab('listings')}
                    className={`flex-1 pb-2.5 text-xs font-bold transition-all ${
                      activeTab === 'listings' 
                        ? `${isChefTheme ? 'text-amber-700 border-amber-600' : 'text-emerald-600 border-emerald-600'} border-b-2` 
                        : 'text-slate-400'
                    }`}
                  >
                    Listings ({userListings.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('about')}
                    className={`flex-1 pb-2.5 text-xs font-bold transition-all ${
                      activeTab === 'about' 
                        ? `${isChefTheme ? 'text-amber-700 border-amber-600' : 'text-emerald-600 border-emerald-600'} border-b-2` 
                        : 'text-slate-400'
                    }`}
                  >
                    Badges & Perks
                  </button>
                </div>

                {/* TAB CONTENT: LISTINGS WITH STOCK PHOTOS */}
                {activeTab === 'listings' && (
                  <div className="space-y-2.5 min-h-[140px]">
                    {userListings.length === 0 ? (
                      <div className="text-center py-8">
                        <Leaf className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-700">No active postings right now</p>
                      </div>
                    ) : (
                      userListings.map((item) => (
                        <div key={item.id} className="p-2.5 bg-white border border-slate-200 rounded-xl flex gap-3 items-center shadow-sm">
                          <img 
                            src={getListingStockPhoto(item)} 
                            className="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-100 shrink-0" 
                            alt={item.title}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <h4 className="font-bold text-xs text-slate-900 truncate pr-2">{item.title}</h4>
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${item.price ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                                {item.price ? `$${parseFloat(item.price).toFixed(2)}` : 'FREE'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.address || 'Local community pickup'}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB CONTENT: ABOUT & BADGES */}
                {activeTab === 'about' && (
                  <div className="space-y-2.5 min-h-[140px]">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                        <Award className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-amber-900">{profileData?.badge}</p>
                        <p className="text-[10px] text-amber-700">Verified community top contributor</p>
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                        <Shield className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-blue-900">Community Trust Badge</p>
                        <p className="text-[10px] text-blue-700">100% completed pickups with high ratings</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}