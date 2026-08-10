import React, { useState } from 'react';
import { UserPlus, LogIn, KeyRound, User, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

const CURRENT_USER_KEY = 'surplus_hub_current_user';

export default function PasscodeGate({ onAuthenticated }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter an account name.');
      return;
    }
    if (pin.length < 5) {
      setError('PIN must be at least 5 digits long.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Check if username already exists in Supabase
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', username.trim())
        .maybeSingle();

      if (existingUser) {
        setError('An account with this name already exists.');
        setIsLoading(false);
        return;
      }

      // 2. Create new user profile in Supabase
      const newUser = {
        username: username.trim(),
        pin: pin,
      };

      const { error: insertError } = await supabase
        .from('profiles')
        .insert([newUser]);

      if (insertError) throw insertError;

      // 3. Save session locally & authenticate
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
      onAuthenticated(newUser);
    } catch (err) {
      console.error(err);
      setError('Failed to create profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !pin) {
      setError('Please enter both account name and PIN.');
      return;
    }

    setIsLoading(true);

    try {
      // Fetch user matching username and PIN from Supabase
      const { data: user, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', username.trim())
        .eq('pin', pin)
        .maybeSingle();

      if (fetchError || !user) {
        setError('Invalid account name or PIN.');
        setIsLoading(false);
        return;
      }

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      onAuthenticated(user);
    } catch (err) {
      console.error(err);
      setError('Failed to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-emerald-50 rounded-2xl text-emerald-600 mb-3">
            {isRegistering ? <UserPlus className="w-8 h-8" /> : <LogIn className="w-8 h-8" />}
          </div>
          <h2 className="text-2xl font-bold text-slate-800">
            {isRegistering ? 'Create Profile' : 'Welcome Back'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isRegistering
              ? 'Enter a username and PIN to create your account'
              : 'Enter your account details to continue'}
          </p>
        </div>

        <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Account Name
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="e.g. JohnDoe"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              {isRegistering ? 'Create Security PIN (5+ digits)' : 'Security PIN'}
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                placeholder="•••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-lg tracking-widest"
                maxLength={10}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isRegistering ? (
              'Create Profile & Enter'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-slate-100">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            {isRegistering ? 'Already have a profile? Sign In' : "Don't have a profile? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}