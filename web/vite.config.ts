import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { devMarketOverview } from './dev/market-overview';
import { devPublicCalendar } from './dev/quote-calendar';
import { devAcceptRequest, devBookingRequests, devDeclineRequest } from './dev/request-inbox';
import { devOwnerLinks, devOwnerMint, devOwnerPortal } from './dev/owner-portal';
import { devCompSaved, devCompSnapshots, devSaveCompAsks } from './dev/saved-comps';
import { devApproveRate, devApprovedRates, devClearApprovedRate } from './dev/approved-rates';
import { devRequestStatus } from './dev/request-status';
import { devExpenseArchive, devPurgeExpense, devRestoreExpense } from './dev/expense-archive';
import { devSendStayMessage, devStayMessages } from './dev/stay-message';
import { devSaveShadowDay, devShadowDays } from './dev/shadow-days';
import { devCleanJobs, devCleanLinks, devCleanProgressHost, devMintCleanLink, devSaveCleanProgress } from './dev/clean-link';
import { devPushPlan } from './dev/push-plan';
import { devCleanPhotos, devCleanPhotoTurns, devDeleteCleanPhoto, devUploadCleanPhoto } from './dev/clean-photos';
import { devPublicConditions } from './dev/public-conditions';
import { devCanyonCam } from './dev/canyon-cams';

/** Local stay phone only. This token is not a booking, and the route is not deployed. */
function localStayPreview(): Plugin {
  const token = '/api/stay-guide/local-guide-preview';
  const guide = {
    enabled: true,
    guestName: 'Preview',
    propertyId: 'ranch',
    propertyName: 'The Ranch House',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    preferencesDone: true,
    storageReads: 'paused',
    nightBeforeFree: null,
    checkoutNightFree: null,
    access: {
      phase: 'before',
      opensOn: '2026-11-30',
      preview: false,
      unlocked: false,
      wifiName: null,
      wifiPassword: null,
      doorCode: null,
      doorNotes: null,
    },
    guide: {
      headline: 'The Ranch House',
      address: '270 East Center Street, Lindon, Utah 84042',
      checkInTime: '4:00 PM',
      checkOutTime: '11:00 AM',
      parking: 'Park in the driveway.',
      arrival: 'The house is in Lindon.',
      checkout: 'Start the dishwasher.',
      houseRules: 'No smoking indoors.',
      contactPhone: '000-000-0000',
      contactEmail: 'stay@example.com',
      emergency: 'Call 911 first.',
      sections: [],
      videos: [],
      places: [],
    },
  };
  return {
    name: 'local-stay-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === `${token}/thread` || path === `${token}/chat`) {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ messages: [] }));
          return;
        }
        if (path === '/api/stay-preferences/local-river-preview') {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              propertyId: 'river',
              variant: 'vip',
              guestName: 'Preview',
              propertyName: 'The River House',
              checkIn: '2026-12-01',
              checkOut: '2026-12-04',
              answers: {},
            }),
          );
          return;
        }
        if (path === '/api/stay-preferences/local-guide-preview') {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              propertyId: 'ranch',
              answers: {
                tripWhy: ['Family / reunion', 'The river'],
                topAmenities: ['Hot tub', 'Sauna', 'Fire pit'],
                evenings: 'Hot tub',
                arrivalWindow: '5:00 PM',
                earlyLate: '11:00 AM',
                allergies: 'Nuts',
                coffeeStyle: 'Drip',
                dogs: '2 large dogs',
                cell: '000-000-0000',
                codeRecipients: 'a second phone',
              },
            }),
          );
          return;
        }
        if (path !== token) return next();
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(guide));
      });
    },
  };
}

function marketOverviewDev(): Plugin {
  return {
    name: 'market-overview-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/api/market/overview') return next();
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const house = parsed.searchParams.get('house');
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(devMarketOverview(house, parsed.searchParams.get('live') === '1')));
      });
    },
  };
}

function quoteCalendarDev(): Plugin {
  return {
    name: 'quote-calendar-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/api/book/availability') return next();
        void devPublicCalendar()
          .then((calendar) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(calendar));
          })
          .catch(() => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                storageReads: 'paused',
                nights: null,
                closed: null,
                pace: { ranch: 'unknown', lindon: 'unknown', river: 'unknown' },
              }),
            );
          });
      });
    },
  };
}

/** Local preview of the host request inbox. The deployed route reads the saved rows. */
function requestInboxDev(): Plugin {
  return {
    name: 'request-inbox-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (path !== '/api/book/requests' && path !== '/api/book/accept' && path !== '/api/book/decline') {
          next();
          return;
        }
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (path === '/api/book/requests') {
          res.statusCode = 200;
          res.end(JSON.stringify(devBookingRequests()));
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          let parsed: { id?: string; payout?: unknown; reason?: unknown };
          try {
            parsed = JSON.parse(body || '{}') as typeof parsed;
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
            return;
          }
          const result = path === '/api/book/decline' ? devDeclineRequest(parsed) : devAcceptRequest(parsed);
          res.statusCode = result.status;
          res.end(JSON.stringify(result));
        });
      });
    },
  };
}

/** Local preview of Todd's portal and the host link card. The deployed routes read the saved links. */
function ownerPortalDev(): Plugin {
  return {
    name: 'owner-portal-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const path = url.pathname;
        if (path !== '/api/owner/links' && !/^\/api\/owner\/[a-f0-9]{32}$/.test(path)) return next();
        res.statusCode = path === '/api/owner/links' && req.method === 'POST' ? 201 : 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (path === '/api/owner/links') {
          res.end(JSON.stringify(req.method === 'POST' ? devOwnerMint() : devOwnerLinks()));
          return;
        }
        const token = path.slice('/api/owner/'.length);
        if (token !== '0123456789abcdef0123456789abcdef') res.statusCode = 404;
        res.end(JSON.stringify(devOwnerPortal(url.searchParams.get('period'), token)));
      });
    },
  };
}

/** Local preview of the stay message sender. The deployed route reads the real stay behind the token. */
function stayMessageDev(): Plugin {
  return {
    name: 'stay-message-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        if (!url.pathname.endsWith('/stay-message')) return next();
        const match = url.pathname.match(/^\/api\/stay-guide\/([^/]+)\/stay-message$/);
        if (!match) return next();
        const token = decodeURIComponent(match[1]!);
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (req.method === 'GET') {
          res.statusCode = 200;
          res.end(JSON.stringify(devStayMessages(token)));
          return;
        }
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          let parsed: { id?: unknown; to?: unknown };
          try {
            parsed = JSON.parse(body || '{}') as typeof parsed;
          } catch {
            parsed = {};
          }
          const out = devSendStayMessage(
            token,
            typeof parsed.id === 'string' ? parsed.id : '',
            typeof parsed.to === 'string' ? parsed.to : '',
          );
          res.statusCode = out.status;
          res.end(JSON.stringify('error' in out ? { error: out.error, refused: out.refused } : out));
        });
      });
    },
  };
}

/** Local preview of the expense archive. The deployed route reads the real archive from KV. */
function expenseArchiveDev(): Plugin {
  return {
    name: 'expense-archive-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        if (url.pathname !== '/api/expenses/archive') return next();
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (req.method === 'GET') {
          res.statusCode = 200;
          res.end(JSON.stringify(devExpenseArchive()));
          return;
        }
        if (req.method !== 'POST' && req.method !== 'DELETE') return next();
        const out =
          req.method === 'DELETE'
            ? devPurgeExpense(url.searchParams.get('purge') ?? '')
            : devRestoreExpense(url.searchParams.get('restore') ?? '');
        res.statusCode = out.status;
        res.end(JSON.stringify('error' in out ? { error: out.error } : out));
      });
    },
  };
}

/** Local preview of the guest's request page. The deployed route reads the saved request by token. */
function requestStatusDev(): Plugin {
  return {
    name: 'request-status-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        if (!url.pathname.startsWith('/api/book/request/')) return next();
        const token = url.pathname.slice('/api/book/request/'.length);
        res.setHeader('content-type', 'application/json; charset=utf-8');
        const body = devRequestStatus(token);
        if (!body) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'This link is not valid.' }));
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify(body));
      });
    },
  };
}

/** Local preview of the approved-rate sheet. The deployed route reads the real sheet from KV. */
function approvedRatesDev(): Plugin {
  return {
    name: 'approved-rates-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        if (url.pathname !== '/api/pricing/approved-rates') return next();
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (req.method === 'GET') {
          res.statusCode = 200;
          res.end(JSON.stringify(devApprovedRates(url.searchParams.get('house') ?? undefined)));
          return;
        }
        if (req.method === 'DELETE') {
          const out = devClearApprovedRate(url.searchParams.get('house'), url.searchParams.get('date'));
          res.statusCode = out.status;
          res.end(JSON.stringify('error' in out ? { error: out.error } : out));
          return;
        }
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          let parsed: { house?: unknown; date?: unknown; guest?: unknown };
          try {
            parsed = JSON.parse(body || '{}') as typeof parsed;
          } catch {
            parsed = {};
          }
          const out = devApproveRate(parsed);
          res.statusCode = out.status;
          res.end(JSON.stringify('error' in out ? { error: out.error } : out));
        });
      });
    },
  };
}

/** Local preview of the saved comp cards. The deployed routes read the real comp set. */
function savedCompsDev(): Plugin {
  return {
    name: 'saved-comps-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        const isCompSet = path === '/api/pricing/comp-set';
        const isSnapshots = path === '/api/pricing/snapshots';
        if (!isCompSet && !isSnapshots) return next();
        if (!isCompSet && req.method !== 'POST') {
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.statusCode = 200;
          res.end(JSON.stringify(devCompSnapshots()));
          return;
        }
        if (isCompSet && req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          let parsed: Record<string, unknown>;
          try {
            parsed = (JSON.parse(body || '{}') ?? {}) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          res.setHeader('content-type', 'application/json; charset=utf-8');
          if (isCompSet) {
            res.statusCode = 201;
            res.end(JSON.stringify(devCompSaved(parsed as { label?: string })));
            return;
          }
          const saved = devSaveCompAsks(parsed);
          if ('error' in saved) {
            res.statusCode = saved.status;
            res.end(JSON.stringify({ error: saved.error }));
            return;
          }
          res.statusCode = saved.status;
          res.end(JSON.stringify({ ok: saved.ok, saved: saved.saved, compId: saved.compId }));
        });
      });
    },
  };
}

/** Local preview of the durable shadow clock. The deployed route keeps the days in KV. */
function shadowDaysDev(): Plugin {
  return {
    name: 'shadow-days-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/api/pricing/shadow-days') return next();
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (req.method !== 'POST') {
          res.statusCode = 200;
          res.end(JSON.stringify(devShadowDays()));
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          let parsed: { date?: string; digest?: string };
          try {
            parsed = JSON.parse(body || '{}') as { date?: string; digest?: string };
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
            return;
          }
          const result = devSaveShadowDay(parsed);
          res.statusCode = 'status' in result ? (result.status ?? 200) : 200;
          res.end(JSON.stringify(result));
        });
      });
    },
  };
}

/** Local preview of the cleaner link. The deployed route builds jobs from the saved bookings. */
function cleanLinkDev(): Plugin {
  return {
    name: 'clean-link-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const path = parsed.pathname;
        if (/^\/api\/clean\/[a-f0-9]{32}\/photos$/.test(path)) {
          res.setHeader('content-type', 'application/json; charset=utf-8');
          if (req.method === 'DELETE') {
            res.statusCode = 200;
            res.end(JSON.stringify(devDeleteCleanPhoto(parsed.searchParams.get('house'), parsed.searchParams.get('checkout'), parsed.searchParams.get('path'))));
            return;
          }
          if (req.method === 'POST') {
            let raw = '';
            req.on('data', (chunk) => {
              raw += chunk;
            });
            req.on('end', () => {
              let parsedBody: { house?: string; checkout?: string; contentType?: string; base64?: string } = {};
              try {
                parsedBody = JSON.parse(raw || '{}') as typeof parsedBody;
              } catch {
                parsedBody = {};
              }
              const result = devUploadCleanPhoto(parsedBody);
              res.statusCode = 'status' in result ? (result.status ?? 200) : 200;
              res.end(JSON.stringify(result));
            });
            return;
          }
          res.statusCode = 200;
          res.end(JSON.stringify(devCleanPhotos(parsed.searchParams.get('house'), parsed.searchParams.get('checkout'))));
          return;
        }
        if (path === '/api/clean/photos') {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(devCleanPhotoTurns()));
          return;
        }
        if (path === '/api/clean/photo') {
          res.statusCode = 200;
          res.setHeader('content-type', 'image/svg+xml');
          res.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#d4b56a"/></svg>');
          return;
        }
        if (path === '/api/clean/progress') {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(devCleanProgressHost()));
          return;
        }
        if (path !== '/api/clean/links' && !/^\/api\/clean\/[a-f0-9]{32}$/.test(path)) return next();
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (path === '/api/clean/links') {
          if (req.method === 'DELETE') {
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              let parsedBody: { label?: string };
              try {
                parsedBody = JSON.parse(body || '{}') as { label?: string };
              } catch {
                parsedBody = {};
              }
              res.statusCode = 201;
              res.end(JSON.stringify(devMintCleanLink(parsedBody)));
            });
            return;
          }
          res.statusCode = 200;
          res.end(JSON.stringify(devCleanLinks()));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            let parsedBody: { house?: string; checkout?: string; done?: unknown };
            try {
              parsedBody = JSON.parse(body || '{}') as { house?: string; checkout?: string; done?: unknown };
            } catch {
              parsedBody = {};
            }
            const result = devSaveCleanProgress(parsedBody);
            res.statusCode = 'status' in result ? (result.status ?? 200) : 200;
            res.end(JSON.stringify(result));
          });
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify(devCleanJobs(parsed.searchParams.get('lang'))));
      });
    },
  };
}

/** Local preview of the rate push plan. The deployed route reads the board and saved shadow days. */
function pushPlanDev(): Plugin {
  return {
    name: 'push-plan-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        if (parsed.pathname !== '/api/pricing/push-plan') return next();
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(devPushPlan(parsed.searchParams.get('open') !== '0')));
      });
    },
  };
}

/** Local preview of live NWS & USGS conditions before /api/public/conditions is deployed. */
function publicConditionsDev(): Plugin {
  let cached: { expiresAt: number; body: string } | null = null;
  return {
    name: 'public-conditions-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        if (parsed.pathname !== '/api/public/conditions') return next();
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(cached.body);
          return;
        }
        void devPublicConditions()
          .then((payload) => {
            const body = JSON.stringify(payload);
            if (payload.ok || payload.river.ok) {
              cached = { expiresAt: now + 300_000, body };
            }
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(body);
          })
          .catch(() => {
            res.statusCode = 502;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, sends: false }));
          });
      });
    },
  };
}

/** Live UDOT road-camera frames on a house page, without a Functions runtime. */
function canyonCamsDev(): Plugin {
  return {
    name: 'canyon-cams-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        if (parsed.pathname !== '/api/public/cam') return next();
        void devCanyonCam(parsed.searchParams.get('key') ?? '')
          .then((frame) => {
            res.statusCode = frame?.status ?? 404;
            res.setHeader('content-type', frame?.type ?? 'application/json');
            res.setHeader('cache-control', 'no-store');
            res.end(frame?.body ?? JSON.stringify({ ok: false, reason: 'unknown camera' }));
          })
          .catch(() => {
            res.statusCode = 502;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: false }));
          });
      });
    },
  };
}

/** Hosted Cloudflare Pages app — same APIs and data as production. */
const PAGES_ORIGIN = 'https://wilhite-portfolio.pages.dev';

export default defineConfig({
  appType: 'spa',
  plugins: [localStayPreview(), marketOverviewDev(), quoteCalendarDev(), requestInboxDev(), ownerPortalDev(), savedCompsDev(), approvedRatesDev(), requestStatusDev(), expenseArchiveDev(), stayMessageDev(), shadowDaysDev(), cleanLinkDev(), pushPlanDev(), publicConditionsDev(), canyonCamsDev(), react(), tailwindcss()],
  server: {
    port: 5173,
    watch: {
      ignored: ['**/public/houses/**'],
    },
    proxy: {
      /*
       * Dev reads production. That is deliberate — the dev server has no KV binding, so it cannot
       * answer a real request itself — but it is also a trap: every page reload spends production's
       * KV reads, and the dashboard reads four keys per request. On 2026-11-07 the live store hit its
       * daily read limit, and hours of local page loads against this proxy were part of the cause.
       *
       * Set VITE_LOCAL_API=1 to point the proxy somewhere else, or leave the app on its fixtures.
       */
      '/api': {
        target: process.env.VITE_LOCAL_API || PAGES_ORIGIN,
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: '',
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes) => {
            // Say out loud that this response came from production, so nobody mistakes it for local.
            proxyRes.headers['x-uml-proxied-from'] = 'production';
            const cookies = proxyRes.headers['set-cookie'];
            if (!cookies) return;
            proxyRes.headers['set-cookie'] = cookies.map((cookie) =>
              cookie
                .replace(/;\s*Secure/gi, '')
                .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax'),
            );
          });
        },
      },
      '/health': {
        target: PAGES_ORIGIN,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
