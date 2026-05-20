import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { niche, platform } = await request.json();

  const mockCreators = [
    {
      username: "fashionwithemma",
      displayName: "Emma Laurent",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=emma",
      followersCount: 245000,
      engagementRate: 4.2,
      avgViews: 18000,
      platform: platform,
      bio: "Fashion and lifestyle content creator. Passionate about sustainable style and beauty.",
      niche: niche,
      videoThumbnails: [
        { views: Math.floor(18000 * 0.8), thumbnail: null },
        { views: Math.floor(18000 * 1.2), thumbnail: null },
        { views: Math.floor(18000 * 0.9), thumbnail: null },
      ],
    },
    {
      username: "fitnessbysarah",
      displayName: "Sarah Martin",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=sarah",
      followersCount: 89000,
      engagementRate: 6.8,
      avgViews: 12000,
      platform: platform,
      bio: "Fitness coach sharing daily workouts and nutrition tips for busy people.",
      niche: niche,
      videoThumbnails: [
        { views: Math.floor(12000 * 0.8), thumbnail: null },
        { views: Math.floor(12000 * 1.2), thumbnail: null },
        { views: Math.floor(12000 * 0.9), thumbnail: null },
      ],
    },
    {
      username: "techreviewspro",
      displayName: "Marc Dubois",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=marc",
      followersCount: 520000,
      engagementRate: 3.1,
      avgViews: 45000,
      platform: platform,
      bio: "Honest tech reviews. No sponsored content without full disclosure.",
      niche: niche,
      videoThumbnails: [
        { views: Math.floor(45000 * 0.8), thumbnail: null },
        { views: Math.floor(45000 * 1.2), thumbnail: null },
        { views: Math.floor(45000 * 0.9), thumbnail: null },
      ],
    },
    {
      username: "beautybyjulie",
      displayName: "Julie Chen",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=julie",
      followersCount: 167000,
      engagementRate: 5.4,
      avgViews: 22000,
      platform: platform,
      bio: "Beauty tips, skincare routines and honest product reviews.",
      niche: niche,
      videoThumbnails: [
        { views: Math.floor(22000 * 0.8), thumbnail: null },
        { views: Math.floor(22000 * 1.2), thumbnail: null },
        { views: Math.floor(22000 * 0.9), thumbnail: null },
      ],
    },
    {
      username: "foodieparadise",
      displayName: "Thomas Bernard",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=thomas",
      followersCount: 98000,
      engagementRate: 7.2,
      avgViews: 9500,
      platform: platform,
      bio: "Food lover exploring restaurants and sharing easy recipes at home.",
      niche: niche,
      videoThumbnails: [
        { views: Math.floor(9500 * 0.8), thumbnail: null },
        { views: Math.floor(9500 * 1.2), thumbnail: null },
        { views: Math.floor(9500 * 0.9), thumbnail: null },
      ],
    },
    {
      username: "travelwithleo",
      displayName: "Leo Moreau",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=leo",
      followersCount: 312000,
      engagementRate: 4.9,
      avgViews: 31000,
      platform: platform,
      bio: "Budget travel tips and hidden destinations around the world.",
      niche: niche,
      videoThumbnails: [
        { views: Math.floor(31000 * 0.8), thumbnail: null },
        { views: Math.floor(31000 * 1.2), thumbnail: null },
        { views: Math.floor(31000 * 0.9), thumbnail: null },
      ],
    },
  ];

  await new Promise(resolve => setTimeout(resolve, 1500));

  return NextResponse.json({ creators: mockCreators });
}
