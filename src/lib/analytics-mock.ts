/** Rich analytics payload for local development only. */

export type AnalyticsPayload = {
  hasData: boolean;
  shopifyConnected: boolean;
  totalRevenue: number;
  totalCommissions: number;
  totalSent: number;
  responseRate: number;
  converted: number;
  creators: {
    full_name: string;
    handle: string;
    username: string;
    platform: string;
    total_sales: number;
    total_earned: number;
    balance: number;
  }[];
  campaigns: {
    id: string;
    name: string;
    platform: string;
    status: string;
    created_at: string;
  }[];
  salesCount: number;
};

export function isLocalhostRequest(request: Request): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  return host.startsWith("localhost:") || host === "localhost" || host.startsWith("127.0.0.1");
}

export function getLocalhostAnalyticsMock(): AnalyticsPayload {
  const creators = [
    {
      full_name: "Maya Chen",
      handle: "@mayachen",
      username: "mayachen",
      platform: "TikTok",
      total_sales: 2420,
      total_earned: 363,
      balance: 120,
    },
    {
      full_name: "Jordan Blake",
      handle: "@jblakefit",
      username: "jblakefit",
      platform: "Instagram",
      total_sales: 1450,
      total_earned: 217.5,
      balance: 0,
    },
    {
      full_name: "Sofia Ruiz",
      handle: "@sofiaruiz",
      username: "sofiaruiz",
      platform: "TikTok",
      total_sales: 890,
      total_earned: 133.5,
      balance: 45,
    },
    {
      full_name: "Alex Kim",
      handle: "@alexkimstyle",
      username: "alexkimstyle",
      platform: "YouTube",
      total_sales: 380,
      total_earned: 57,
      balance: 0,
    },
    {
      full_name: "Emma Laurent",
      handle: "@emma_l",
      username: "emma_l",
      platform: "TikTok",
      total_sales: 180,
      total_earned: 27,
      balance: 0,
    },
  ];

  const totalRevenue = creators.reduce((s, c) => s + c.total_sales, 0);
  const totalCommissions = creators.reduce((s, c) => s + c.total_earned, 0);

  return {
    hasData: true,
    shopifyConnected: true,
    totalRevenue,
    totalCommissions,
    totalSent: 48,
    responseRate: 31,
    converted: 8,
    salesCount: 34,
    creators,
    campaigns: [
      {
        id: "mock-camp-1",
        name: "Spring UGC Push",
        platform: "TikTok",
        status: "Active",
        created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
      },
      {
        id: "mock-camp-2",
        name: "Instagram Reels — Skincare",
        platform: "Instagram",
        status: "Active",
        created_at: new Date(Date.now() - 32 * 86400000).toISOString(),
      },
      {
        id: "mock-camp-3",
        name: "Holiday Gift Guide",
        platform: "TikTok",
        status: "Completed",
        created_at: new Date(Date.now() - 75 * 86400000).toISOString(),
      },
    ],
  };
}
