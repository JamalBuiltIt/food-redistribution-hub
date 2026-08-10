function CountdownBadge({ targetTime }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const diff = new Date(targetTime).getTime() - Date.now();
      
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      
      setTimeLeft(`${mins}m ${secs < 10 ? '0' : ''}${secs}s remaining`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000); // Live tick every second

    return () => clearInterval(interval);
  }, [targetTime]);

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-semibold">
      <Clock className="w-3.5 h-3.5 animate-pulse" />
      {timeLeft}
    </span>
  );
}