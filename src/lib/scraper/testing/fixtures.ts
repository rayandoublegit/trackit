// One TikTok creator as ScrapeCreators and as the RapidAPI TikTok scraper
// return it (same person, same videos, two response shapes), plus Instagram
// and YouTube responses shaped like docs.scrapecreators.com's examples.
// And a fetch stub that routes provider URLs to these fixtures (tests only).

const C1 = "https://p16-sign.tiktokcdn.com/obj/c1.jpeg";
const C2 = "https://p16-sign.tiktokcdn.com/obj/c2.jpeg";
const AVATAR = "https://p16-sign.tiktokcdn.com/obj/avatar.jpeg";

const user = {
  uniqueId: "luna.beauty",
  nickname: "Luna",
  avatarLarger: AVATAR,
  signature: "skincare tips for sensitive skin",
  verified: true,
  bioLink: { link: "https://luna.shop" },
};

export function tiktokStats(followers: number) {
  return { followerCount: followers, followingCount: 310, heartCount: 5_200_000, videoCount: 420 };
}

export const scProfile = (followers = 142_000) => ({ success: true, credits_remaining: 999, credits_charged: 1, user, stats: tiktokStats(followers) });
export const rapidProfile = (followers = 142_000) => ({ code: 0, msg: "success", data: { user, stats: tiktokStats(followers) } });

export const scVideos = (views = 90_000) => ({
  success: true,
  credits_charged: 1,
  aweme_list: [
    {
      aweme_id: "111",
      desc: "Morning routine #skincare #GRWM",
      create_time: 1_790_000_000,
      share_url: "https://www.tiktok.com/@luna.beauty/video/111?_r=1&u_code=xyz",
      statistics: { play_count: views, digg_count: 9000, comment_count: 120, share_count: 80, collect_count: 400 },
      video: { duration: 34_000, origin_cover: { url_list: [C1] }, dynamic_cover: { url_list: ["https://p16-sign.tiktokcdn.com/obj/anim.webp"] } },
      music: { title: "original sound" },
      anchors: [{ extra: '[{"url":"https://shop.tiktok.com/view/product/1729"}]' }],
      is_ad: false,
    },
    {
      aweme_id: "222",
      desc: "Haul",
      create_time: 1_789_000_000,
      statistics: { play_count: 5000, digg_count: 300, comment_count: 12, share_count: 3, collect_count: 9 },
      image_post_info: { images: [{}, {}] },
      video: { duration: 0, cover: { url_list: [C2] } },
      music: { title: "" },
      is_ad: false,
    },
  ],
});

export const rapidVideos = (views = 90_000) => ({
  code: 0,
  msg: "success",
  data: {
    videos: [
      {
        video_id: "111",
        title: "Morning routine #skincare #GRWM",
        create_time: 1_790_000_000,
        play_count: views,
        digg_count: 9000,
        comment_count: 120,
        share_count: 80,
        collect_count: 400,
        duration: 34,
        origin_cover: C1,
        music_info: { title: "original sound" },
        anchors: [{ extra: '[{"url":"https://shop.tiktok.com/view/product/1729"}]' }],
        is_ad: false,
      },
      {
        video_id: "222",
        title: "Haul",
        create_time: 1_789_000_000,
        play_count: 5000,
        digg_count: 300,
        comment_count: 12,
        share_count: 3,
        collect_count: 9,
        duration: 0,
        images: [{}, {}],
        cover: C2,
        music_info: { title: "" },
      },
    ],
  },
});

export const scTikTokSearch = {
  success: true,
  users: [
    { user_info: { unique_id: "Nora.D", nickname: "Nora", follower_count: 56_000 } },
    { user_info: { unique_id: "tiny.one", nickname: "Tiny", follower_count: 900 } },
  ],
};

// ── Instagram (ScrapeCreators) ─────────────────────────────────────────────────
export const igProfile = {
  success: true,
  credits_charged: 1,
  data: {
    user: {
      username: "Mia.Style",
      full_name: "Mia",
      biography: "fashion & fits",
      bio_links: [{ title: "Shop", url: "https://mia.store" }],
      external_url: "https://mia.store",
      edge_followed_by: { count: 24_555 },
      edge_follow: { count: 110 },
      edge_owner_to_timeline_media: { count: 90 },
      is_verified: false,
      profile_pic_url_hd: "https://scontent.cdninstagram.com/v/pic_hd.jpg",
      profile_pic_url: "https://scontent.cdninstagram.com/v/pic.jpg",
    },
  },
};

export const igPosts = {
  success: true,
  credits_charged: 1,
  items: [
    {
      id: "3644028144127958689_59042353222",
      code: "DKSMEpKRd6h",
      media_type: 2,
      product_type: "clips",
      taken_at: 1_748_622_051,
      caption: { text: "5 fits for fall #ootd" },
      play_count: 2647,
      comment_count: 7,
      like_count: 29,
      display_uri: "https://scontent.cdninstagram.com/v/reel.jpg",
      video_duration: 72.1,
      is_paid_partnership: false,
      product_tags: { in: [{ product: { external_url: "https://mia.store/p/coat" } }] },
    },
    {
      id: "36_59",
      code: "CAROUSEL1",
      media_type: 8,
      taken_at: 1_748_000_000,
      caption: { text: "Weekend" },
      like_count: 50,
      comment_count: 2,
      image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/v/car.jpg" }] },
      is_paid_partnership: true,
    },
  ],
};

export const igSearch = {
  success: true,
  profiles: [
    { username: "mia.style", full_name: "Mia", follower_count: 24_555, profile_pic_url: "https://scontent.cdninstagram.com/a.jpg" },
    { username: "new.ig", full_name: "New", follower_count: 80_000 },
    { username: "no.count", full_name: "Unknown", follower_count: null },
  ],
};

// ── YouTube (ScrapeCreators) ───────────────────────────────────────────────────
export const ytChannel = {
  success: true,
  credits_charged: 1,
  channelId: "UCxcTeAKWJca6XyJ37_ZoKIQ",
  channel: "http://www.youtube.com/@ThePatMcAfeeShow",
  name: "The Pat McAfee Show",
  avatar: { image: { sources: [{ url: "https://yt3.googleusercontent.com/small" }, { url: "https://yt3.googleusercontent.com/big" }] } },
  description: "Live Mon-Fri",
  subscriberCount: 2_750_000,
  videoCountText: "9,221 videos",
  store: "https://store.patmcafeeshow.com",
  links: ["https://store.patmcafeeshow.com"],
};

export const ytVideos = {
  success: true,
  credits_charged: 1,
  videos: [
    {
      type: "video",
      id: "5EWaxmWgQMI",
      url: "https://www.youtube.com/watch?v=5EWaxmWgQMI",
      title: "Russell Wilson interview #nfl",
      description: "Full show",
      thumbnail: "https://i.ytimg.com/vi/5EWaxmWgQMI/hqdefault.jpg",
      viewCountInt: 110_447,
      publishedTime: "2025-01-23T22:48:53.914Z",
      lengthSeconds: 2245,
      badges: [],
    },
  ],
};

export const ytShorts = {
  success: true,
  credits_charged: 1,
  shorts: [
    {
      type: "short",
      id: "VREVC0wXPfs",
      title: "Idea validation formula",
      thumbnail: "https://img.youtube.com/vi/VREVC0wXPfs/maxresdefault.jpg",
      viewCountInt: 17_066,
      likeCountInt: 495,
      commentCountInt: 2,
      publishDate: "2026-04-22T10:44:35-07:00",
      durationMs: 37_000,
    },
  ],
};

export const ytSearch = {
  success: true,
  channels: [
    { id: "UC1", title: "Run Club", handle: "@RunClub", subscriberCountText: "1.2M subscribers", thumbnail: "https://yt3.ggpht.com/a" },
    { id: "UC2", title: "Id only", handle: "channel/UCoRR6OLuIZ2-5VxtnQIaN2w", subscriberCount: 5000 },
  ],
  videos: [],
};

// ── fetch stub ─────────────────────────────────────────────────────────────────
export type Route = (url: URL, body?: string) => { status?: number; body: unknown } | undefined;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fetch that answers provider URLs through `route`, images with a tiny JPEG, and records every call. */
export function fakeFetch(route: Route) {
  const calls: string[] = [];
  /** Request bodies, in call order ("" for GET): the RapidAPI Instagram endpoints take form posts. */
  const bodies: string[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    bodies.push(typeof init?.body === "string" ? init.body : "");
    if (/tiktokcdn|cdninstagram|ytimg|googleusercontent|ggpht/.test(url.hostname)) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    const hit = route(url, bodies[bodies.length - 1]);
    if (!hit) return json(500, { error: `no fixture for ${url.pathname}` });
    return json(hit.status ?? 200, hit.body);
  };
  return { fn: fn as unknown as typeof fetch, calls, bodies };
}

export const PROVIDER_ENV = {
  SCRAPECREATORS_API_KEY: "test-sc-key",
  RAPIDAPI_KEY: "test-rapid-key",
  RAPIDAPI_HOST: "tiktok-scraper7.p.rapidapi.com",
  RAPIDAPI_ALLOWED_HOSTS: "tiktok-scraper7.p.rapidapi.com",
};

export const isApiCall = (href: string) => /scrapecreators\.com|rapidapi\.com/.test(href);
export type AnyJson = any;
