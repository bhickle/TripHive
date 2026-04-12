/**
 * scripts/enrich-affiliate-links.ts
 *
 * One-time affiliate enrichment script — matches each Discover item against
 * partner APIs, resolves the exact product/listing ID, and prints a ready-to-paste
 * update for src/app/trip/[id]/discover/page.tsx.
 *
 * SETUP
 * ─────
 * 1. Copy .env.example → .env.local and fill in the keys below
 * 2. npx ts-node scripts/enrich-affiliate-links.ts
 * 3. Paste the output into the discoverItems array
 *
 * ENV VARS NEEDED
 * ───────────────
 * VIATOR_API_KEY       — from https://partnerresources.viator.com (free, instant)
 * OPENTABLE_CLIENT_ID  — from https://platform.opentable.com (requires approval)
 * TICKETMASTER_API_KEY — from https://developer.ticketmaster.com (free, instant)
 * # Booking.com — no public search API; use their link builder at
 * #   https://www.booking.com/affiliate-program/v2/linkbuilder.html
 * # Recreation.gov — no affiliate program; link directly to the park/trail page
 */

import * as https from 'https';

// ─── Config ──────────────────────────────────────────────────────────────────

const VIATOR_API_KEY       = process.env.VIATOR_API_KEY       ?? '';
const OPENTABLE_CLIENT_ID  = process.env.OPENTABLE_CLIENT_ID  ?? '';
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY ?? '';

// Your Viator partner ID (shown in the Viator Affiliate Center dashboard)
const VIATOR_PARTNER_ID = process.env.VIATOR_PARTNER_ID ?? 'YOUR_PARTNER_ID';

// ─── Items to enrich ─────────────────────────────────────────────────────────
// Add/remove entries as the Discover catalog grows.
// Fields: id (matches discoverItems), name (search query), partner, destination

interface EnrichTarget {
  id: string;
  name: string;
  partner: 'Viator' | 'OpenTable' | 'Ticketmaster';
  destination: string; // city/region for scoping the search
  eventDate?: string;  // ISO date — required for Ticketmaster
}

const TARGETS: EnrichTarget[] = [
  // Viator experiences
  { id: 'exp_1', name: 'Northern Lights Photography Tour', partner: 'Viator',       destination: 'Reykjavik' },
  { id: 'exp_2', name: 'Golden Circle Day Trip',           partner: 'Viator',       destination: 'Reykjavik' },
  { id: 'exp_3', name: 'Whale Watching Expedition',        partner: 'Viator',       destination: 'Reykjavik' },
  { id: 'exp_4', name: 'Glacier Hiking on Sólheimajökull', partner: 'Viator',       destination: 'Iceland'   },
  { id: 'sports_1', name: 'Icelandic Horse Riding Tour',   partner: 'Viator',       destination: 'Iceland'   },
  // OpenTable dining
  { id: 'din_1', name: 'Grillið',                          partner: 'OpenTable',    destination: 'Reykjavik' },
  { id: 'din_3', name: 'Dill Restaurant',                  partner: 'OpenTable',    destination: 'Reykjavik' },
  { id: 'din_4', name: 'Fish Market',                      partner: 'OpenTable',    destination: 'Reykjavik' },
  // Ticketmaster events (time-sensitive — re-run close to trip date)
  { id: 'evt_1', name: 'Sigur Rós',                        partner: 'Ticketmaster', destination: 'Reykjavik', eventDate: '2026-09-17' },
];

// ─── Viator ───────────────────────────────────────────────────────────────────

interface ViatorProduct {
  productCode: string;
  title: string;
  bookingUrl: string;
}

async function searchViator(name: string, destination: string): Promise<ViatorProduct | null> {
  if (!VIATOR_API_KEY) {
    console.warn('  [Viator] No API key — skipping');
    return null;
  }

  // POST /partner/products/search
  // Docs: https://developer.viator.com/partner-api/explorer#!/Products/post_1_0_products_search
  const body = JSON.stringify({
    filtering: {
      destination: destination,
      searchTerm: name,
    },
    sorting: { sort: 'RELEVANCE', order: 'DESC' },
    pagination: { start: 1, count: 1 },
    currency: 'USD',
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.viator.com',
        path: '/partner/products/search',
        method: 'POST',
        headers: {
          'exp-api-key': VIATOR_API_KEY,
          'Accept-Language': 'en-US',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const product = json.products?.[0];
            if (!product) { resolve(null); return; }
            resolve({
              productCode: product.productCode,
              title: product.title,
              bookingUrl: `https://www.viator.com/tours/${destination.replace(/\s/g, '-')}/${product.productCode}?pid=P${VIATOR_PARTNER_ID}&mcid=42383&medium=link`,
            });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ─── OpenTable ────────────────────────────────────────────────────────────────

interface OpenTableRestaurant {
  rid: number;
  name: string;
  bookingUrl: string;
}

async function searchOpenTable(name: string, city: string): Promise<OpenTableRestaurant | null> {
  if (!OPENTABLE_CLIENT_ID) {
    console.warn('  [OpenTable] No client ID — skipping');
    return null;
  }

  // GET /v2/restaurant/search
  // Docs: https://platform.opentable.com/documentation
  const params = new URLSearchParams({ name, city, country: 'IS' });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'platform.opentable.com',
        path: `/v2/restaurant/search?${params.toString()}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${OPENTABLE_CLIENT_ID}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const restaurant = json.restaurants?.[0];
            if (!restaurant) { resolve(null); return; }
            resolve({
              rid: restaurant.rid,
              name: restaurant.name,
              bookingUrl: `https://www.opentable.com/restref/client/?rid=${restaurant.rid}&ref=triphive&utm_source=triphive&utm_medium=referral`,
            });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

// ─── Ticketmaster ─────────────────────────────────────────────────────────────

interface TicketmasterEvent {
  id: string;
  name: string;
  bookingUrl: string;
}

async function searchTicketmaster(name: string, city: string, eventDate?: string): Promise<TicketmasterEvent | null> {
  if (!TICKETMASTER_API_KEY) {
    console.warn('  [Ticketmaster] No API key — skipping');
    return null;
  }

  // GET /discovery/v2/events.json
  // Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
  const params = new URLSearchParams({
    apikey: TICKETMASTER_API_KEY,
    keyword: name,
    city,
    countryCode: 'IS',
    size: '1',
    ...(eventDate ? { startDateTime: `${eventDate}T00:00:00Z`, endDateTime: `${eventDate}T23:59:59Z` } : {}),
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'app.ticketmaster.com',
        path: `/discovery/v2/events.json?${params.toString()}`,
        method: 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const event = json._embedded?.events?.[0];
            if (!event) { resolve(null); return; }
            resolve({
              id: event.id,
              name: event.name,
              bookingUrl: `${event.url}?utm_source=triphive&utm_medium=referral&utm_campaign=discover`,
            });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('triphive affiliate enrichment script\n');

  const results: Array<{ id: string; affiliateProductId: string; affiliateDeepUrl: string }> = [];

  for (const target of TARGETS) {
    console.log(`Searching: ${target.name} (${target.partner})`);

    let productId: string | null = null;
    let deepUrl: string | null = null;

    if (target.partner === 'Viator') {
      const result = await searchViator(target.name, target.destination);
      if (result) {
        productId = result.productCode;
        deepUrl   = result.bookingUrl;
        console.log(`  ✓ ${result.title} → ${result.productCode}`);
      } else {
        console.log('  ✗ No match found');
      }
    } else if (target.partner === 'OpenTable') {
      const result = await searchOpenTable(target.name, target.destination);
      if (result) {
        productId = String(result.rid);
        deepUrl   = result.bookingUrl;
        console.log(`  ✓ ${result.name} → rid=${result.rid}`);
      } else {
        console.log('  ✗ No match found');
      }
    } else if (target.partner === 'Ticketmaster') {
      const result = await searchTicketmaster(target.name, target.destination, target.eventDate);
      if (result) {
        productId = result.id;
        deepUrl   = result.bookingUrl;
        console.log(`  ✓ ${result.name} → id=${result.id}`);
      } else {
        console.log('  ✗ No match found');
      }
    }

    if (productId && deepUrl) {
      results.push({ id: target.id, affiliateProductId: productId, affiliateDeepUrl: deepUrl });
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────');
  console.log('Paste these fields into discoverItems in discover/page.tsx:');
  console.log('─────────────────────────────────────────────\n');

  for (const r of results) {
    console.log(`  // ${r.id}`);
    console.log(`  affiliateProductId: '${r.affiliateProductId}',`);
    console.log(`  affiliateDeepUrl: '${r.affiliateDeepUrl}',`);
    console.log('');
  }

  if (results.length === 0) {
    console.log('  No results — check API keys and try again.');
  }
}

main().catch(console.error);
