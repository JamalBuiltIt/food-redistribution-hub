import React, { useState } from 'react';
import { UserPlus, LogIn, KeyRound, User, AlertCircle } from 'lucide-react';

const ACCOUNTS_KEY = 'surplus_hub_accounts';
const CURRENT_USER_KEY = 'surplus_hub_current_user';

export default function PasscodeGate({ onAuthenticated }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const getAccounts = () => {
    const saved = localStorage.getItem(ACCOUNTS_KEY);
    return saved ? JSON.parse(saved) : [];
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter an account name.');
      return;
    }
    if (pin.length < 5) {
      setError('PIN must be at least 5 digits long.');
      return;
    }

    const accounts = getAccounts();
    if (accounts.some((acc) => acc.username.toLowerCase() === username.trim().toLowerCase())) {
      setError('An account with this name already exists.');
      return;
    }

    const newAccount = {
      id: `user_${Date.now()}`,
      username: username.trim(),
      pin: pin,
      createdAt: new Date().toISOString(),
    };

    accounts.push(newAccount);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newAccount));
    onAuthenticated(newAccount);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const accounts = getAccounts();
    const account = accounts.find(
      (acc) => acc.username.toLowerCase() === username.trim().toLowerCase() && acc.pin === pin
    );

    if (account) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
      onAuthenticated(account);
    } else {
      setError('Invalid account name or PIN.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-slate-100">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-4 bg-emerald-50 rounded-full text-emerald-600 mb-3">
            {isRegistering ? <UserPlus className="w-8 h-8" /> : <LogIn className="w-8 h-8" />}
          </div>
          <h2 className="text-2xl font-bold text-slate-800">
            {isRegistering ? 'Create Profile' : 'Hub Sign In'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isRegistering
              ? 'Create a quick profile to post & manage your pickups'
              : 'Enter your profile details & 5+ digit PIN'}
          </p>
        </div>

        <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Account / Org Name
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="e.g., Downtown Bakery"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Account PIN (5+ Digits)
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
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
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm"
          >
            {isRegistering ? 'Create Profile & Enter' : 'Sign In'}
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
            {isRegistering ? 'Already have a profile? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}