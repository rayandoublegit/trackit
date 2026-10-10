// The Instagram creator of fixtures.ts (mia.style) as the RapidAPI "Instagram
// Scraper Stable API" returns it: trimmed from real answers of
// /ig_get_fb_profile.php, /get_ig_user_posts.php, /get_ig_user_reels.php and
// /search_ig.php (same field names and nesting, fewer fields), plus the error
// bodies it sends. Tests only.

const PIC = "https://scontent.cdninstagram.com/v/pic.jpg";
const PIC_HD = "https://scontent.cdninstagram.com/v/pic_hd.jpg";

/** /ig_get_fb_profile.php: a flat user object. */
export const rapidIgProfile = (over: Record<string, unknown> = {}) => ({
  pk: "59042353222",
  id: "59042353222",
  username: "mia.style",
  full_name: "Mia",
  biography: "fashion & fits",
  bio_links: [{ image_url: "", link_type: "external", lynx_url: "https://l.instagram.com/?u=https%3A%2F%2Fmia.store", url: "https://mia.store" }],
  external_url: "https://mia.store",
  external_lynx_url: "https://l.instagram.com/?u=https%3A%2F%2Fmia.store",
  follower_count: 24_555,
  following_count: 110,
  media_count: 90,
  total_clips_count: 41,
  is_verified: false,
  is_private: false,
  is_business: false,
  account_type: 3,
  category: "",
  city_name: "",
  profile_pic_url: PIC,
  hd_profile_pic_url_info: { url: PIC_HD },
  email_from_biography: [],
  phone_from_biography: [],
  ...over,
});

/** /get_ig_user_posts.php: posts[].node, no view count on posts. */
export const rapidIgPosts = {
  posts: [
    {
      node: {
        code: "DKSMEpKRd6h",
        pk: "3644028144127958689",
        id: "3644028144127958689_59042353222",
        taken_at: 1_748_622_051,
        caption: { text: "5 fits for fall #ootd with @nora.d" },
        media_type: 2,
        product_type: "clips",
        like_count: 29,
        comment_count: 7,
        view_count: null,
        display_uri: "https://scontent.cdninstagram.com/v/reel.jpg",
        image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/v/reel_full.jpg" }] },
        is_paid_partnership: false,
        sponsor_tags: null,
        product_tags: { in: [{ product: { external_url: "https://mia.store/p/coat" } }] },
        user: { pk: "59042353222", username: "mia.style" },
        coauthor_producers: [{ pk: "1", username: "lea.looks", full_name: "Léa" }],
        usertags: { in: [{ user: { pk: "2", username: "zara", full_name: "ZARA" } }, { user: { pk: "3", username: "sam.fits", full_name: "Sam" } }] },
      },
    },
    {
      node: {
        code: "CAROUSEL1",
        pk: "36",
        id: "36_59",
        taken_at: 1_748_000_000,
        caption: { text: "Weekend" },
        media_type: 8,
        product_type: "carousel_container",
        like_count: 50,
        comment_count: 2,
        view_count: null,
        display_uri: null,
        image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/v/car.jpg" }] },
        carousel_media: [{ media_type: 1, image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/v/car.jpg" }] } }],
        is_paid_partnership: true,
        user: { pk: "59042353222", username: "mia.style" },
        coauthor_producers: [],
        usertags: null,
      },
    },
  ],
  pagination_token: "AQHT…",
};

/** /get_ig_user_reels.php: reels[].node.media, with play counts (no caption, no date). */
export const rapidIgReels = {
  reels: [
    { node: { media: { code: "DKSMEpKRd6h", pk: "3644028144127958689", media_type: 2, product_type: "clips", play_count: 2647, like_count: 29, comment_count: 7 } }, __typename: "XDTClipsItem" },
    // An older pinned reel: not among the latest posts, so not stored.
    { node: { media: { code: "PINNEDOLD", pk: "1", media_type: 2, product_type: "clips", play_count: 9_000_000, like_count: 1, comment_count: 1 } } },
  ],
  pagination_token: "QVFE…",
};

/** /search_ig.php: about 5 accounts; the follower count only as text, often missing. */
export const rapidIgSearch = {
  see_more: null,
  hashtags: [],
  places: [],
  users: [
    { position: 0, user: { username: "mia.style", full_name: "Mia", is_verified: false, pk: "59042353222", profile_pic_url: PIC, search_social_context: "24.5K followers" } },
    { position: 1, user: { username: "new.ig", full_name: "New", pk: "7", profile_pic_url: PIC, search_social_context: "80K followers" } },
    { position: 2, user: { username: "no.count", full_name: "Unknown", pk: "8", search_social_context: null } },
    { position: 3, user: { username: "friend.ctx", full_name: "Friend", pk: "9", search_social_context: "Followed by nora.d + 3 more" } },
  ],
  rank_token: "x",
};

export const rapidIgErrors = {
  notFound: { error: "Invalid or missing username or user does not exist on Instagram" },
  busy: { error: "Please try again later. You wont be charged for this request." },
  dataNotFound: { error: "data not found. Please try again later." },
  upstream429: { error: "Media data not found. Received 429 Too Many Requests." },
  similarMissing: { error: "User similar accounts data not found or user profile is private or does not exist on Instagram" },
  endpoint: { message: "Endpoint '/ig_get_fb_profile_v3.php' does not exist" },
  quota: { message: "You have exceeded the MONTHLY quota for Requests on your current plan, BASIC. Upgrade your plan at https://rapidapi.com/x" },
};

export const RAPID_IG_ENV = { RAPIDAPI_INSTAGRAM_KEY: "test-ig-key" };
