export const INITIAL_FOOD_ITEMS = [
  {
    id: "1",
    title: "10 Fresh Artisan Sourdough Loaves",
    donor: "Golden Grain Bakery",
    category: "Bakery",
    lat: 40.7128,
    lng: -74.006,
    expiresAt: new Date(Date.now() + 1000 * 60 * 45).toISOString(), // 45 mins from now
    isClaimed: false,
    claimedBy: null,
  },
  {
    id: "2",
    title: "Trays of Catering Pasta & Salad",
    donor: "Downtown Event Hall",
    category: "Prepared Meals",
    lat: 40.715,
    lng: -74.009,
    expiresAt: new Date(Date.now() + 1000 * 60 * 120).toISOString(), // 2 hours from now
    isClaimed: false,
    claimedBy: null,
  },
];