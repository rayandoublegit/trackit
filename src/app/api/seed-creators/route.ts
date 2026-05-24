import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NICHE_HASHTAGS: Record<string, string[]> = {
  fitness: ["fitness","fitnessmotivation","fitnesscoach","gym","gymlife","workout","workoutroutine","personaltrainer","bodybuilding","weightloss","abs","cardio","crossfit","homeworkout","fitfam","gains","legday","musclebuilding","hiit","strengthtraining"],
  beauty: ["beauty","beautytips","skincare","skincareroutine","makeup","makeupartist","grwm","glowup","selfcare","beautyhacks","beautyroutine","skincarehacks","antiaging","clearskin","acne","beautyblogger","beautyinfluencer","makeuptransformation","naturalmakeup","kbeauty"],
  fashion: ["fashion","fashionista","ootd","streetstyle","outfitoftheday","styletips","fashionblogger","fashionweek","outfitinspo","mensfashion","womensfashion","fashionhacks","wardrobeadvice","stylecoach","fashionadvice","fashioninfluencer","luxuryfashion","thriftedstyle","vintageoutfit","casualoutfit"],
  food: ["food","foodie","foodtok","recipe","easyrecipes","healthyfood","mealprep","homecooking","cookingtips","cheflife","foodblogger","yummyfood","veganfood","quickmeals","foodhacks","dinnerideas","lunchideas","breakfastideas","snackideas","cookingforbeginners"],
  travel: ["travel","traveltok","traveltips","wanderlust","solotravel","budgettravel","luxurytravel","travelhacks","digitalnomad","travelcouple","explore","adventure","travelguide","travelblogger","hiddengems","traveladvice","cityguide","roadtrip","backpacking","travellife"],
  pets: ["petsoftiktok","dogsoftiktok","catsoftiktok","petlife","doglover","catlover","petcare","puppy","kitten","animalsoftiktok","dogtraining","catbehavior","petadvice","funnypets","petcoach","exoticpets","petnutrition","pettricks","adoptdontshop","rescuedog"],
  gaming: ["gaming","gamingtok","gamer","gameplay","videogames","streamer","esports","twitch","gamingsetup","pcgaming","consolegaming","mobilegaming","gamingcommunity","gamertips","retrogaming","rpggaming","fpsmaster","fortniteclips","minecraftbuilds","gamingadvice"],
  tech: ["tech","techtok","technology","gadgets","iphone","android","programming","coding","developer","ai","artificialintelligence","testreview","techhacks","startups","softwareengineering","machinelearning","cybersecurity","techadvisor","gadgetreview","techunboxing"],
  lifestyle: ["lifestyle","dailyroutine","morningroutine","productivitytips","selfimprovement","mindset","motivation","wellness","wellbeing","worklifebalance","mentalhealth","positivevibes","personaldevelopment","habitbuilding","minimalism","slowliving","lifestyleblogger","adulting","lifehacks","lifetips"],
  makeup: ["makeuptutorial","makeupartist","makeuplook","makeuphacks","eyemakeup","lipstick","foundation","contouring","highlight","glammakeup","naturalmakeup","makeupforbeginners","makeupadvice","makeuplife","makeupinfluencer","makeupblogger","makeuptransformation","crueltyfreebeauty","drugstoremakeup","highendmakeup"],
  skincare: ["skincare","skincareroutine","skintok","skincarejunkie","glowskin","clearskin","acneskincare","antiagingskincare","moisturizer","vitaminc","retinol","sunscreen","facemask","skincareadvice","skincarecoach","naturalskincare","koreanskincare","dermatologist","skincarescience","skincarehaul"],
  workout: ["workoutroutine","homeworkout","gymworkout","fullbodyworkout","legday","chestworkout","armworkout","coreexercise","hiitworkout","strengthtraining","cardioworkout","workoutmotivation","workouttips","workoutcoach","beginner workout","workouthacks","bodyweighttraining","resistanceband","dumbbellworkout","noequipmentworkout"],
  cooking: ["cookingtips","homecooking","easyrecipes","quickrecipes","healthyrecipes","mealprep","mealprepideas","veganrecipes","vegetarianrecipes","cookingcoach","cookingadvice","cookingforbeginners","cookingvideos","homechef","budgetmeals","familycooking","cookinglife","chefathome","cookingwithkids","onepotmeal"],
  dance: ["dance","dancechallenge","choreography","dancetutorial","hiphop","ballet","contemporary","dancemoves","dancecoach","dancerlife","dancevideo","learntocomedy","danceadvice","freestyle","breakdance","salsa","latindance","kpopdance","dancecommunity","dancelife"],
  comedy: ["comedy","funny","funnyvideos","comedian","comedyskit","humor","relatable","dailyhumor","standupcomedy","parody","impersonation","pranks","funnymoments","viralcomedy","adultcomedy","comedycouple","officialcomedy","comedyblogger","laughing","comedylife"],
  music: ["music","musictok","musician","singer","singing","guitar","piano","producer","songwriting","newmusic","covermusic","originalmusic","musicproducer","beatmaker","musicadvice","musiccoach","musicinfluencer","indiemusic","popmusic","rnbmusic"],
  art: ["art","arttok","artist","drawing","painting","digitalart","illustration","artprocess","arttutorial","artadvice","artcoach","creativeart","modernart","abstractart","portraitart","fanart","conceptart","artcommunity","artinfluencer","artblogger"],
  photography: ["photography","photographer","photooftheday","photoshoot","portrait","landscape","streetphotography","photographytips","photographyhacks","learnphotography","camera","lightroom","adobephotoshop","photographyadvice","photographycoach","photographyinfluencer","mobilephotography","goldenhour","photographylife","photographytutorial"],
  yoga: ["yoga","yogatiktok","yogatips","yogaroutine","morningyoga","eveningyoga","yogapose","meditation","mindfulness","stretching","flexibility","yogaforbeginners","yogacoach","yogainstructor","yogacommunity","yogaadvice","yogalife","breathwork","pilates","yogaflow"],
  nutrition: ["nutrition","nutritiontips","healthyeating","cleaneating","mealplan","calorie","macros","proteinintake","nutritionist","dietitian","weightlossnutrition","nutritionadvice","nutritioncoach","nutritioninfluencer","foodscience","healthylifestyle","antiflammatoryfoods","guthealth","nutritionlife","dietadvice"],
  hair: ["hairtok","hairtips","haircare","hairstyle","naturalhair","curlyhair","curlygirl","hairtransformation","hairdye","haircolor","hairadvice","haircoach","hairinfluencer","hairblogger","hairgoals","hairstylist","haircolorist","naturalhaircommunity","hairhacks","blackhair"],
  nails: ["nailstok","nailart","naildesign","nailcare","manicure","gelnails","acrylicnails","nailtech","nailtips","nailadvice","nailinfluencer","nailblogger","nailgoals","nailinspo","naillife","nailsofinstagram","nailaesthetic","frenchnails","springnails","nailhacks"],
  streetwear: ["streetwear","streetweartok","hypebeast","sneakerhead","streetstyle","urbanfashion","supremeclothing","offwhite","streetwearinfluencer","streetwearblogger","streetwearlife","mensstreetwear","womensstreetwear","hypefit","streetwearadvice","limitededition","streetwearcoach","drip","fit","outfitcheck"],
  sneakers: ["sneakers","sneakerhead","sneakercommunity","kicks","jordans","yeezy","nikesneakers","adidasoriginals","newbalance","sneakerinfluencer","sneakerblogger","sneakerlife","sneakerculture","sneakerreview","sneakerunboxing","sneakercollection","sneakeradvice","sneakercoach","raredunks","airforce1"],
  watches: ["watches","watchcollector","watchcommunity","luxurywatches","rolex","omega","watchinfluencer","watchblogger","watchlife","watchculture","watchreview","watchunboxing","watchcollection","horology","watchfam","watchoftheday","watchadvice","watchcoach","patekphilippe","audemarspiguet"],
  jewelry: ["jewelry","jewelrytok","jewelrydesigner","goldenjewelry","silverjewelry","handmadejewelry","jewelryinfluencer","jewelryblogger","jewelrylife","jewelryculture","jewelryreview","jewelrycollection","fashionjewelry","finejewelry","jewelrylovers","jewelryadvice","jewelrycoach","necklace","bracelet","earrings"],
  supplements: ["supplements","supplementtips","proteinpowder","preworkout","creatine","vitamins","omega3","supplementreview","musclegain","bodybuilding","fitnesssupplements","gymlife","fitnessnutrition","supplementstack","supplementadvice","supplementcoach","supplementinfluencer","supplementblogger","supplementlife","preandpost"],
  protein: ["proteinpowder","proteinshake","proteinrecipes","highprotein","highproteindiet","proteininfluencer","proteinblogger","proteinlife","musclebuilding","bodybuilding","fitnessfood","gymfood","proteinmeal","proteinsnack","proteintips","proteinadvice","proteincoach","wheyprotein","plantbasedprotein","proteinhacks"],
  weightloss: ["weightloss","weightlossjourney","weightlosstransformation","weightlossmotivation","losingweight","fatburn","weightlossinfluencer","weightlossblogger","weightlossrecipes","calorieficult","healthyweightloss","weightlossstory","weightlosssuccess","weightlossdiet","weightlossworkout","weightlosstips","weightlossadvice","weightlosscoach","bodytransformation","slimmingworld"],
  bodybuilding: ["bodybuilding","bodybuilder","musclebuilding","musclegain","bulking","cutting","natty","bodybuildinginfluencer","bodybuildingblogger","bodybuildinglife","bodybuildingmotivation","npc","ifbb","bodybuildingtransformation","bodybuildingdiet","bodybuildingadvice","bodybuildingcoach","bodybuildingworkout","bodybuildingposes","classicphysique"],
};

const NICHES = Object.keys(NICHE_HASHTAGS);

async function waitForRun(runId: string): Promise<void> {
  let status = "RUNNING";
  let attempts = 0;
  while ((status === "RUNNING" || status === "READY") && attempts < 40) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`);
    const data = await res.json();
    status = data.data?.status;
    attempts++;
  }
}

async function searchByHashtag(hashtag: string): Promise<string[]> {
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/runs?token=${APIFY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hashtags: [hashtag],
          resultsPerPage: 100,
          maxItems: 100,
        }),
      }
    );
    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return [];

    await waitForRun(runId);

    const dataRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_KEY}&limit=100`
    );
    const items = await dataRes.json();
    if (!Array.isArray(items)) return [];

    return [...new Set(items.map((i: any) => i.authorMeta?.name).filter(Boolean))];
  } catch {
    return [];
  }
}

async function scrapeProfileBatch(usernames: string[]): Promise<any[]> {
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/xtdata~tiktok-user-information-scraper/runs?token=${APIFY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames }),
      }
    );
    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return [];

    await waitForRun(runId);

    const dataRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_KEY}&limit=100`
    );
    const items = await dataRes.json();
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function seedNiche(niche: string): Promise<number> {
  const hashtags = NICHE_HASHTAGS[niche] || [niche];
  const allUsernames = new Set<string>();

  // Search each hashtag sequentially, collect unique authors
  for (const hashtag of hashtags) {
    const usernames = await searchByHashtag(hashtag);
    usernames.forEach(u => allUsernames.add(u));
    console.log(`  #${hashtag}: ${usernames.length} creators, total: ${allUsernames.size}`);
    // Stop early if we have enough
    if (allUsernames.size >= 100) break;
  }

  if (allUsernames.size === 0) return 0;

  // Batch profile scrape 30 at a time
  const usernameList = Array.from(allUsernames);
  const profiles: any[] = [];
  for (let i = 0; i < usernameList.length; i += 30) {
    const batch = usernameList.slice(i, i + 30);
    const result = await scrapeProfileBatch(batch);
    profiles.push(...result);
    console.log(`  Scraped batch ${i/30 + 1}: ${result.length} profiles`);
  }

  if (profiles.length === 0) return 0;

  const upserts = profiles
    .filter(p => p.unique_id && p.follower_count)
    .map(p => {
      const followers = Number(p.follower_count || 0);
      const hearts = Number(p.total_favorited || p.favoriting_count || 0);
      const videos = Number(p.aweme_count || 1);
      const engRate = followers > 0
        ? parseFloat(((hearts / Math.max(videos, 1) / followers) * 100).toFixed(2))
        : 0;
      const avatarUrls = p.avatar_thumb?.url_list || p.avatar_medium?.url_list || [];

      return {
        username: p.unique_id,
        display_name: p.nickname || p.unique_id,
        avatar_url: avatarUrls[0] || "",
        platform: "TikTok",
        followers,
        engagement_rate: Math.min(engRate, 99.99),
        avg_views: Math.floor(followers * 0.08),
        bio: p.signature || "",
        niches: [niche.toLowerCase()],
        video_thumbnails: [],
        last_scraped_at: new Date().toISOString(),
      };
    });

  if (upserts.length > 0) {
    await supabaseAdmin
      .from("creators_index")
      .upsert(upserts, { onConflict: "username" });
  }

  return upserts.length;
}

export async function POST(request: Request) {
  const { secret, niche } = await request.json();
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (niche) {
    const count = await seedNiche(niche);
    return NextResponse.json({ niche, count });
  }

  const results: Record<string, number> = {};
  for (const n of NICHES) {
    try {
      results[n] = await seedNiche(n);
    } catch (e) {
      results[n] = -1;
    }
  }
  return NextResponse.json({ results });
}
