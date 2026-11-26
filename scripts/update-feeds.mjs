import fs from 'node:fs';

// 1. NEWS SOURCES (Global & UK)
const NEWS_FEEDS = [
  { url: 'https://www.carbonbrief.org/feed/', source: 'Carbon Brief', region: 'Global' },
  { url: 'https://www.theguardian.com/uk/environment/rss', source: 'The Guardian UK', region: 'UK' },
  { url: 'https://insideclimatenews.org/feed/', source: 'Inside Climate News', region: 'Global' }
];

// 2. UK PROTEST, MARCH & ACTIVIST FEEDS
const UK_EVENT_FEEDS = [
  {
    url: 'https://extinctionrebellion.uk/feed/',
    organizer: 'Extinction Rebellion UK',
    city: 'London',
    location: 'UK-Wide / Central London (See Action Alert)',
    fallbackUrl: 'https://extinctionrebellion.uk/act-now/events/'
  }
];

// 3. CLIMATE VOICES (Substack & Public Bluesky RSS)
const VOICE_FEEDS = [
  { url: 'https://heated.world/feed', author: 'Emily Atkin', handle: 'HEATED · Substack', platform: 'Substack', region: 'Global', avatar: 'EA' },
  { url: 'https://www.talkingclimate.ca/feed', author: 'Katharine Hayhoe', handle: 'Talking Climate · Substack', platform: 'Substack', region: 'Global', avatar: 'KH' },
  { url: 'https://bsky.app/profile/hausfath.bsky.social/rss', author: 'Zeke Hausfath', handle: '@hausfath.bsky.social', platform: 'Bluesky', region: 'Global', avatar: 'ZH' },
  { url: 'https://bsky.app/profile/edhawkins.bsky.social/rss', author: 'Prof. Ed Hawkins', handle: '@edhawkins.bsky.social', platform: 'Bluesky', region: 'UK', avatar: 'EH' },
  { url: 'https://bsky.app/profile/ketanjoshi.co/rss', author: 'Ketan Joshi', handle: '@ketanjoshi.co', platform: 'Bluesky', region: 'Global', avatar: 'KJ' }
];

function parseRss(xml, limit = 4) {
  const items = [];
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of matches) {
    const block = m[1];
    const get = (tag) => {
      const r = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return r ? (r[1] || r[2] || '').replace(/<[^>]+>/g, '').trim() : '';
    };
    const rawDate = get('pubDate');
    const parsedDate = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Upcoming';
    items.push({
      title: get('title'),
      link: get('link'),
      summary: get('description').slice(0, 220) + '...',
      date: parsedDate
    });
  }
  return items.slice(0, limit);
}

function detectUkCity(text) {
  const cities = ['London', 'Edinburgh', 'Manchester', 'Bristol', 'Cardiff', 'Glasgow', 'Birmingham', 'Leeds', 'Brighton'];
  for (const c of cities) {
    if (text.toLowerCase().includes(c.toLowerCase())) return c;
  }
  return 'London';
}

async function run() {
  const news = [];

  // Fetch News RSS
  for (const feed of NEWS_FEEDS) {
    try {
      const res = await fetch(feed.url);
      const items = parseRss(await res.text(), 4);
      items.forEach((item, idx) => {
        news.push({
          id: `${feed.source}-${idx}`,
          type: 'news',
          region: feed.region,
          source: feed.source,
          date: item.date,
          readTime: '4 min read',
          title: item.title,
          summary: item.summary,
          url: item.link
        });
      });
    } catch (e) { console.log('Skipped news:', feed.source); }
  }

  // Fetch Peer-Reviewed Climate Papers via OpenAlex
  try {
    const paperRes = await fetch('https://api.openalex.org/works?filter=concepts.id:C132651083,has_abstract:true&sort=publication_date:desc&per-page=4');
    const paperData = await paperRes.json();
    (paperData.results || []).forEach((p, idx) => {
      const journal = p.primary_location?.source?.display_name || 'Peer-Reviewed Journal';
      news.push({
        id: `paper-${idx}`,
        type: 'paper',
        region: 'Global',
        source: journal,
        journal: journal,
        date: p.publication_date || '2026',
        readTime: 'Paper + Summary',
        title: p.title,
        summary: 'Newly indexed peer-reviewed climate research paper via OpenAlex.',
        url: p.doi || 'https://openalex.org',
        aiSummary: {
          keyFinding: `Published in ${journal} (${p.publication_date}). Open the full DOI link to inspect datasets and methodology.`,
          whyItMatters: 'Adds peer-reviewed empirical evidence to current climate modeling and policy assessments.',
          confidence: `Indexed via OpenAlex · ${p.cited_by_count || 0} citations`
        }
      });
    });
  } catch (e) { console.log('Skipped OpenAlex papers'); }

  // Fetch UK Protests & Activist Updates + Static UK Campaign Directories
  const events = [];
  for (const ef of UK_EVENT_FEEDS) {
    try {
      const res = await fetch(ef.url);
      const items = parseRss(await res.text(), 3);
      items.forEach((item, idx) => {
        const city = detectUkCity(item.title + ' ' + item.summary);
        events.push({
          id: `xr-evt-${idx}`,
          title: item.title,
          organizer: ef.organizer,
          city: city,
          date: item.date,
          time: 'Check Action Alert',
          location: `${city} (See official dispatch link)`,
          type: 'Action / Rally',
          description: item.summary,
          url: item.link || ef.fallbackUrl
        });
      });
    } catch (e) { console.log('Skipped event feed:', ef.organizer); }
  }

  // Always include live directory links for major UK climate calendars
  events.push(
    {
      id: 'uk-dir-foe',
      title: 'Friends of the Earth UK: Local Action & Skillshares',
      organizer: 'Friends of the Earth UK',
      city: 'London',
      date: 'Ongoing 2026–2027',
      time: 'Various UK Dates',
      location: 'England, Wales & Northern Ireland',
      type: 'Campaign Calendar',
      description: 'Live campaigning calendar for local climate groups, devolution skillshares, and national days of action across Britain.',
      url: 'https://groups.friendsoftheearth.uk/key-dates-campaigning-calendar'
    },
    {
      id: 'uk-dir-ccc',
      title: 'Campaign against Climate Change: Upcoming UK Marches & Blocs',
      organizer: 'Campaign against Climate Change',
      city: 'London',
      date: 'Updated Weekly',
      time: 'See Schedule',
      location: 'UK-Wide & Trade Union Blocs',
      type: 'March / Rally',
      description: 'Upcoming UK climate marches, trade union climate blocs, and airport expansion protests.',
      url: 'https://www.campaigncc.org/events'
    },
    {
      id: 'uk-dir-gp',
      title: 'Greenpeace UK Greenwire: Local Group Actions & Screenings',
      organizer: 'Greenpeace UK',
      city: 'Manchester',
      date: 'Weekly Listings',
      time: 'Various Times',
      location: 'UK Regional Groups',
      type: 'Grassroots Action',
      description: 'Searchable directory of local Greenpeace actions, community screenings, and volunteer training across the UK.',
      url: 'https://greenwire.greenpeace.org.uk/s/event/acem__Event__c/Default?language=en_GB&sort=Asc'
    }
  );

  // Fetch Climate Voices (Substack & Bluesky)
  const voices = [];
  for (const v of VOICE_FEEDS) {
    try {
      const res = await fetch(v.url);
      const items = parseRss(await res.text(), 2);
      items.forEach((item, idx) => {
        voices.push({
          id: `voice-${v.author}-${idx}`,
          author: v.author,
          handle: v.handle,
          platform: v.platform,
          region: v.region,
          avatar: v.avatar,
          timestamp: item.date,
          title: item.title || `${v.author} update`,
          excerpt: item.summary,
          url: item.link
        });
      });
    } catch (e) { console.log('Skipped voice:', v.author); }
  }

  const output = {
    updatedAt: new Date().toISOString(),
    news: news.length ? news : undefined,
    events: events.length ? events : undefined,
    voices: voices.length ? voices : undefined
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log('Successfully updated data.json');
}

run();
