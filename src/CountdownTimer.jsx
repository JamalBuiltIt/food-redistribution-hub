import React, { useState, useEffect } from 'react';

export default function CountdownTimer({ expiresAt, onExpire }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(expiresAt).getTime();
      const difference = target - now;

      if (difference <= 0) {
        clearInterval(interval);
        setTimeLeft('EXPIRED');
        if (onExpire) onExpire();
      } else {
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        
        setIsUrgent(minutes < 5); // Highlight red if under 5 minutes remaining
        setTimeLeft(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div
      className={`px-3 py-1.5 rounded-xl font-mono font-bold text-xs flex items-center gap-1.5 ${
        isUrgent
          ? 'bg-rose-100 text-rose-700 animate-pulse border border-rose-300'
          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
      }`}
    >
      <span>⏱️ Time Remaining:</span>
      <span>{timeLeft || 'Calculating...'}</span>
    </div>
  );
}