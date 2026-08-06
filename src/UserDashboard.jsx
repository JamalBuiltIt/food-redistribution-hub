import React, { useState, useEffect } from 'react';
import { MapPin, Phone, CheckCircle, Clock, Navigation, User, ChevronRight, XCircle, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function UserDashboard({ currentUser, onSelectOrderForTracking }) {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'history' | 'profile'
  const [claimedOrders, setClaimedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Tick every second so timers update live
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchUserOrders();
  }, [currentUser]);

  const fetchUserOrders = async () => {
    const { data, error } = await supabase
      .from('surplus_items')
      .select('*')
      .eq('claimedBy', currentUser.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setClaimedOrders(data);
      // Auto-release any orders that expired while offline
      data.forEach((order) => {
        if (
          order.status === 'claimed' &&
          order.claimExpiresAt &&
          new Date(order.claimExpiresAt).getTime() <= Date.now()
        ) {
          releaseExpiredOrder(order.id);
        }
      });
    }
    setIsLoading(false);
  };

  // Reset expired claim back to public available pool
  const releaseExpiredOrder = async (orderId) => {
    await supabase
      .from('surplus_items')
      .update({
        isClaimed: false,
        claimedBy: null,
        claimedByUsername: null,
        status: 'available',
        claimExpiresAt: null,
      })
      .eq('id', orderId);
  };

  const handleCompletePickup = async (orderId) => {
    const { error } = await supabase
      .from('surplus_items')
      .update({ status: 'completed' })
      .eq('id', orderId);

    if (!error) {
      setClaimedOrders((prev) =>
        prev.map((item) => (item.id === orderId ? { ...item, status: 'completed' } : item))
      );
    }
  };

  const handleCancelPickup = async (orderId) => {
    const confirmCancel = window.confirm(
      'Are you sure you want to cancel this pickup? It will be made available to other users on the map.'
    );
    if (!confirmCancel) return;

    setCancellingId(orderId);

    const { error } = await supabase
      .from('surplus_items')
      .update({
        isClaimed: false,
        claimedBy: null,
        claimedByUsername: null,
        status: 'available',
        claimExpiresAt: null,
      })
      .eq('id', orderId);

    if (error) {
      console.error('Error cancelling pickup:', error.message);
      alert('Failed to cancel pickup. Please try again.');
    } else {
      setClaimedOrders((prev) => prev.filter((order) => order.id !== orderId));
    }

    setCancellingId(null);
  };

  // ⚡ FILTER: Exclude completed orders, claim-expired orders AND post-expired orders
  const activeOrders = claimedOrders.filter((order) => {
    const isCompleted = order.status === 'completed';
    const isClaimExpired = order.claimExpiresAt && new Date(order.claimExpiresAt).getTime() <= now;
    const isPostExpired = order.expiresAt && new Date(order.expiresAt).getTime() <= now;

    return !isCompleted && !isClaimExpired && !isPostExpired;
  });

  const pastOrders = claimedOrders.filter((o) => o.status === 'completed');

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-3xl shadow-sm border border-slate-200 mt-6">
      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-100 mb-6 gap-6">
        <button
          onClick={() => setActiveTab('active')}
          className={`pb-3 text-sm font-bold transition-colors ${
            activeTab === 'active'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Active Pickups ({activeOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-bold transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Completed History ({pastOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 text-sm font-bold transition-colors ${
            activeTab === 'profile'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          My Profile
        </button>
      </div>

      {/* ACTIVE PICKUPS TAB */}
      {activeTab === 'active' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-8 text-slate-400 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> Loading your active claims...
            </div>
          ) : activeOrders.length === 0 ? (
            <p className="text-slate-400 text-xs py-8 text-center">You have no active claims right now.</p>
          ) : (
            activeOrders.map((order) => {
              const diff = new Date(order.claimExpiresAt).getTime() - now;
              const minsLeft = Math.max(0, Math.floor(diff / 60000));
              const secsLeft = Math.max(0, Math.floor((diff % 60000) / 1000));

              return (
                <div
                  key={order.id}
                  className="p-5 border border-slate-200 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                        {order.category}
                      </span>
                      {order.claimExpiresAt && (
                        <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                          {minsLeft}m {secsLeft < 10 ? '0' : ''}{secsLeft}s
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-slate-800 text-lg">{order.title}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {order.address}
                    </p>

                    {/* Donor Contact Card */}
                    <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-700 bg-white p-2 rounded-xl border border-slate-200">
                      <User className="w-4 h-4 text-emerald-600" />
                      <span>Donor: {order.donor}</span>
                      {order.donorPhone && (
                        <a
                          href={`tel:${order.donorPhone}`}
                          className="flex items-center gap-1 ml-auto text-emerald-600 hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" /> {order.donorPhone}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <button
                      onClick={() => onSelectOrderForTracking(order)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm"
                    >
                      <Navigation className="w-4 h-4" /> Live Tracking Map
                    </button>
                    <button
                      onClick={() => handleCompletePickup(order.id)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl"
                    >
                      <CheckCircle className="w-4 h-4" /> Mark Picked Up
                    </button>
                    <button
                      onClick={() => handleCancelPickup(order.id)}
                      disabled={cancellingId === order.id}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-xl transition-colors disabled:opacity-50"
                    >
                      {cancellingId === order.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {pastOrders.length === 0 ? (
            <p className="text-slate-400 text-xs py-8 text-center">No completed pickups yet.</p>
          ) : (
            pastOrders.map((order) => (
              <div
                key={order.id}
                className="p-4 border border-slate-100 rounded-xl flex justify-between items-center bg-white"
              >
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{order.title}</h4>
                  <p className="text-xs text-slate-400">
                    Donor: {order.donor} • {order.address}
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Completed
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <div className="space-y-4 max-w-md">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-800 text-sm">Account Overview</h4>
            <p className="text-xs text-slate-600">
              <strong>Username:</strong> {currentUser.username}
            </p>
            <p className="text-xs text-slate-600">
              <strong>User ID:</strong> {currentUser.id}
            </p>
            <p className="text-xs text-slate-600">
              <strong>Total Food Rescued:</strong> {pastOrders.length} orders
            </p>
          </div>
        </div>
      )}
    </div>
  );
}