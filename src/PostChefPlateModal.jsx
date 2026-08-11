import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import {
  X,
  ChefHat,
  DollarSign,
  Utensils,
  MapPin,
  Phone,
  Camera,
  Info,
  ShieldCheck,
  Target,
  Loader2,
} from 'lucide-react';
import { geocodeStructuredAddress } from './geocoding';
import { supabase } from './supabaseClient';

function RecenterMap({ lat, lng, zoom = 16 }) {
  const map = useMap();
  React.useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], zoom);
    }
  }, [lat, lng, zoom, map]);
  return null;
}

export default function PostChefPlateModal({ currentUser, onClose, onPublished }) {
  const [formData, setFormData] = useState({
    title: '',
    chefName: currentUser?.username || '',
    chefPhone: '',
    price: '',
    portions: '5',
    category: 'Comfort Food',
    street: '',
    city: '',
    state: '',
    zip: '',
    imageUrl: '',
    description: '',
    isCottagePermitted: true,
  });

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [previewCoords, setPreviewCoords] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    try {
      setUploading(true);
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      // 1. Upload to Supabase Storage bucket 'surplus-images'
      const { error: uploadError } = await supabase.storage
        .from('surplus-images')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // 2. Retrieve Public URL
      const { data } = supabase.storage
        .from('surplus-images')
        .getPublicUrl(filePath);

      setFormData((prev) => ({ ...prev, imageUrl: data.publicUrl }));
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error uploading image: ' + error.message);
    } finally {
      setUploading(false);
    }
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

    if (!coords && (formData.city || formData.zip)) {
      coords = await geocodeStructuredAddress({
        street: '',
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
      });
    }

    setIsGeocoding(false);

    if (!coords) {
      setGeocodeError('Could not locate address. Please check your street, city, or ZIP.');
      return;
    }

    setPreviewCoords({ lat: coords.lat, lng: coords.lng });
  };

  const handlePublish = async () => {
    if (!previewCoords) return;
    setIsSubmitting(true);

    const fullAddress = `${formData.street ? formData.street + ', ' : ''}${formData.city}, ${
      formData.state
    } ${formData.zip}`;

    const newListing = {
      title: formData.title,
      chef_name: formData.chefName,
      chef_id: currentUser.id,
      chef_phone: formData.chefPhone,
      price: parseFloat(formData.price) || 0,
      available_portions: parseInt(formData.portions, 10) || 1,
      category: formData.category,
      address: fullAddress,
      lat: previewCoords.lat,
      lng: previewCoords.lng,
      image_url: formData.imageUrl,
      description: formData.description,
      is_cottage_permitted: formData.isCottagePermitted,
      status: 'available',
    };

    const { error } = await supabase.from('home_chef_listings').insert([newListing]);

    setIsSubmitting(false);

    if (error) {
      console.error('Error inserting chef listing:', error);
      alert('Failed to publish chef plate. Make sure the database table exists.');
      return;
    }

    if (onPublished) onPublished();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto border border-amber-100">
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500 text-amber-950 rounded-xl">
              <ChefHat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">List Homemade Dish</h2>
              <p className="text-xs text-amber-700 font-medium">Home Chef Marketplace ($)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleVerifyLocation} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Dish Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Authentic Homemade Lasagna Bolognese"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Price ($ / plate)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  required
                  placeholder="12.50"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Portions Available
              </label>
              <input
                type="number"
                min="1"
                required
                placeholder="5"
                value={formData.portions}
                onChange={(e) => setFormData({ ...formData, portions: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Chef / Kitchen Name
              </label>
              <input
                type="text"
                required
                value={formData.chefName}
                onChange={(e) => setFormData({ ...formData, chefName: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none bg-white text-sm"
              >
                <option value="Comfort Food">Comfort Food</option>
                <option value="Italian">Italian</option>
                <option value="Asian">Asian</option>
                <option value="Mexican">Mexican</option>
                <option value="Bakery & Desserts">Bakery & Desserts</option>
                <option value="Vegan / Vegetarian">Vegan / Vegetarian</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Contact Phone (for pickup coordination)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="tel"
                required
                placeholder="(555) 234-5678"
                value={formData.chefPhone}
                onChange={(e) => setFormData({ ...formData, chefPhone: e.target.value })}
                className="w-full pl-8 pr-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Street Address
            </label>
            <input
              type="text"
              required
              placeholder="e.g., 742 Evergreen Terrace"
              value={formData.street}
              onChange={(e) => setFormData({ ...formData, street: e.target.value })}
              className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                City
              </label>
              <input
                type="text"
                required
                placeholder="Springfield"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                State
              </label>
              <input
                type="text"
                required
                placeholder="OR"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                ZIP
              </label>
              <input
                type="text"
                required
                placeholder="97477"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
              />
            </div>
          </div>

          {/* Native Image Upload Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
              <Camera className="w-3.5 h-3.5 text-slate-400" /> Dish Photo
            </label>
            <div className="flex items-center gap-3">
              <label className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-xl cursor-pointer bg-amber-50/20 hover:bg-amber-50/40 transition-all text-xs font-semibold text-slate-600">
                {uploading ? (
                  <span className="flex items-center gap-2 text-amber-700">
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading image...
                  </span>
                ) : formData.imageUrl ? (
                  <span className="text-emerald-700 font-bold">✓ Image Uploaded Successfully</span>
                ) : (
                  <span>Click to browse or drop a photo file</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {formData.imageUrl && (
              <div className="mt-2 relative w-20 h-20 rounded-xl overflow-hidden border border-amber-200 shadow-sm">
                <img src={formData.imageUrl} alt="Upload Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400" /> Description & Ingredients
            </label>
            <textarea
              rows="2"
              placeholder="Fresh pasta made daily. Contains dairy and gluten."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-amber-50/20"
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <input
              type="checkbox"
              id="cottagePermit"
              checked={formData.isCottagePermitted}
              onChange={(e) => setFormData({ ...formData, isCottagePermitted: e.target.checked })}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="cottagePermit" className="text-xs text-amber-900 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-amber-600" /> Certified Cottage Food / Permitted Home Kitchen
            </label>
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
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isGeocoding}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-extrabold rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
              >
                {isGeocoding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying Address...
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
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-amber-600" /> Confirm Kitchen Location
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
                <Marker position={[previewCoords.lat, previewCoords.lng]}>
                  <Popup>📍 {formData.title}</Popup>
                </Marker>
              </MapContainer>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPreviewCoords(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
              >
                Edit Details
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-amber-950 rounded-xl text-sm font-extrabold shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Publishing...
                  </>
                ) : (
                  'Publish Dish'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}