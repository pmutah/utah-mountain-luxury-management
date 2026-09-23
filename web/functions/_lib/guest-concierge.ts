import { corsJson, PROPERTIES } from './data';
import { findSurveyByToken } from './survey-store';
import { getAllReservations } from './reservations-store';
import { accessWindow, GUIDE_HOUSE_IDS, loadGuides, type GuideHouseId, type HouseGuide } from './guest-guide';
import { isAuthenticated } from './auth';
import { isMuseAuthorized } from './muse/auth';
import { kvGet, kvPut } from './kv-json';
import { sendTwilioSms } from './twilio-sms';
import { SURVEY_PHONE } from './survey-copy';
import type { AgentEnv } from './agent/types';
import type { SettingsEnv } from './kv';

export const CONCIERGE_NAME = 'Nora';
export const CONCIERGE_VOICE = 'eve';
const SESSIONS_PER_DAY = 8;
const TEXTS_PER_DAY = 6;
const MESSAGES_PER_DAY = 40;

type Usage = { day: string; sessions: number; texts: number; messages?: number };

export type ConciergeStay = {
  token: string;
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  preview: boolean;
  unlocked: boolean;
  opensOn: string;
  guide: HouseGuide;
};

type ConciergeEnv = AgentEnv & { DASHBOARD_PASSWORD?: string; XAI_API_KEY?: string };

function denverDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export async function resolveConciergeStay(
  request: Request,
  env: ConciergeEnv,
  token: string,
): Promise<{ stay: ConciergeStay } | { response: Response }> {
  const survey = await findSurveyByToken(env, token);
  if (!survey || !GUIDE_HOUSE_IDS.includes(survey.propertyId as GuideHouseId)) {
    return { response: corsJson(request, { error: 'This link is not valid.' }, 404) };
  }
  const houseId = survey.propertyId as GuideHouseId;
  const guide = (await loadGuides(env))[houseId];
  const wantsPreview = new URL(request.url).searchParams.get('preview') === '1';
  const preview = wantsPreview && (isMuseAuthorized(request, env) || isAuthenticated(request, env));
  if (!guide.enabled && !preview) {
    return { response: corsJson(request, { error: 'The guest app is off for this house.' }, 403) };
  }
  const reservation = (await getAllReservations(env)).find((item) => item.id === survey.reservationId);
  if (reservation?.status === 'cancelled') {
    return { response: corsJson(request, { error: 'This stay was cancelled.' }, 410) };
  }
  const checkIn = reservation?.checkIn ?? survey.checkIn;
  const checkOut = reservation?.checkOut ?? survey.checkOut;
  const window = accessWindow(checkIn, checkOut);
  return {
    stay: {
      token,
      guestName: survey.guestName,
      propertyName: PROPERTIES[houseId].name,
      checkIn,
      checkOut,
      preview,
      unlocked: window.open || preview,
      opensOn: window.opensOn,
      guide,
    },
  };
}

function usageKey(token: string) {
  return `concierge:${token}`;
}

async function usageToday(env: SettingsEnv, token: string): Promise<Usage> {
  const day = denverDay();
  const stored = await kvGet<Usage>(env, usageKey(token), { day, sessions: 0, texts: 0 });
  return stored.day === day ? stored : { day, sessions: 0, texts: 0 };
}

export async function conciergeSessionRoom(
  env: SettingsEnv,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const usage = await usageToday(env, token);
  if (usage.sessions >= SESSIONS_PER_DAY) {
    return { ok: false, error: `${CONCIERGE_NAME} has talked as much as she can today. Text or call us and we will help.` };
  }
  return { ok: true };
}

export async function markConciergeSession(env: SettingsEnv, token: string) {
  const usage = await usageToday(env, token);
  await kvPut(env, usageKey(token), { ...usage, sessions: usage.sessions + 1 });
}

export function conciergeInstructions(stay: ConciergeStay): string {
  const { guide } = stay;
  const first = stay.guestName.split(' ')[0] || stay.guestName;
  const codes = stay.unlocked
    ? guide.doorCode || guide.wifiPassword
      ? `Door code: ${guide.doorCode || 'not entered yet'}. Door notes: ${guide.doorNotes || 'none'}. Wi-Fi network: ${guide.wifiName || 'not entered yet'}. Wi-Fi password: ${guide.wifiPassword || 'not entered yet'}.`
      : 'No door code or Wi-Fi has been saved yet. If they ask, text Brandon. Do not invent a code.'
    : `Door code and Wi-Fi are not available yet. They appear in the app on ${stay.opensOn}. If they ask sooner, say that date. Do not invent a code.`;
  const sections = guide.sections.map((section) => `${section.title}: ${section.body}`).join('\n');
  const places = guide.places.map((place) => `${place.name}${place.area ? ` (${place.area})` : ''}: ${place.note}`).join('\n');
  return `You are ${CONCIERGE_NAME}, the guest concierge at ${stay.propertyName} for Utah Mountain Luxury. You are writing with ${first}, who is staying ${stay.checkIn} to ${stay.checkOut}.

Write like a person at the house. Warm, brief, specific. Plain sentences, no markdown headings. Usually one or two short paragraphs. Short steps are fine when they ask how something works.

You know this house, and you know Salt Lake County, Utah County, Heber, Midway, and Park City. Answer almost any practical question in that region: food, coffee, groceries, gas, gear, trails, ski conditions, events, kids, doctors, pharmacies, and drive times.

This house is in Provo Canyon. Heber and Midway are up the canyon, about 25 minutes. Park City is over the mountain or around through Heber, about 45 to 60 minutes. Provo and Orem are down the canyon, about 20 to 30 minutes. Salt Lake is about an hour. A Provo restaurant is not in Heber. If they say Hebrew, they mean Heber.

Use Google Search before you name a business, a trail, hours, weather, or road conditions. Area picks are only a starting point when they ask something general, such as where to eat tonight, with no town and no particular food. If they name a town, a dish, or the best of something, answer that exact request with a real place in that town. Say why it fits and how long the drive is from this house, including whether it is up-canyon or down-canyon. Never swap in a house pick from a different town. Do not invent a place. Offer a second option only if they ask.

When they ask about any place outside this house, name the real place. That includes restaurants, ski resorts, trails, stores, trailheads, hospitals, and anything else they would go to. Say how long the drive is from this house and which way: up the canyon, down the canyon, or over toward Park City. If they ask about more than one place, name each one. Do not paste a web address. Driving directions are added for every place you name.
${controlNotes(stay)}
Answer the question yourself whenever you can. Call message_host only when they need a person: something is broken, they want a delivery or a setup, or they ask for Brandon. Do not text Brandon for restaurants, directions, weather, or anything in these notes.

Never discuss money, rates, other guests, the owners' personal life, taxes, or any other property's business. Do not put door codes or Wi-Fi passwords in a text to Brandon.
A real emergency is 911. Then share the emergency note.

House: ${guide.headline}
Address: ${guide.address}
Check-in ${guide.checkInTime}. Checkout ${guide.checkOutTime}.
Getting there: ${guide.arrival}
Parking: ${guide.parking}
Checkout: ${guide.checkout}
House rules: ${guide.houseRules}
Emergency: ${guide.emergency}
Host phone, if they need to call: ${guide.contactPhone}

${codes}

House notes:
${sections || 'None yet.'}

Area picks:
${places || 'None yet.'}`;
}

export function conciergeSession(stay: ConciergeStay) {
  return {
    model: 'grok-voice-latest',
    voice: CONCIERGE_VOICE,
    instructions: conciergeInstructions(stay),
    turn_detection: { type: 'server_vad' },
    tools: [
      { type: 'web_search' },
      {
        type: 'function',
        name: 'control_house',
        description:
          'Turn on, turn off, or dim a connected device in this house. Use a device name from your instructions. brightness is 1 to 100 and only for dim.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Device name from the instructions, such as Living room lights.' },
            action: { type: 'string', enum: ['on', 'off', 'dim'] },
            brightness: { type: 'number', description: '1 to 100 when dimming.' },
          },
          required: ['name', 'action'],
        },
      },
      {
        type: 'function',
        name: 'message_host',
        description:
          'Text Brandon only when the guest needs a person: something broken, a delivery, a setup, or they asked for him. Never use this for restaurants, directions, weather, or house notes. Never include a door code or Wi-Fi password.',
        parameters: {
          type: 'object',
          properties: {
            note: { type: 'string', description: 'What the guest needs, in their words.' },
          },
          required: ['note'],
        },
      },
    ],
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        transport: 'binary',
        transcription: { model: 'grok-transcribe' },
      },
      output: { format: { type: 'audio/pcm', rate: 24000 }, transport: 'binary' },
    },
  };
}

function controlNotes(stay: ConciergeStay): string {
  const names = (stay.guide.controls ?? []).map((item) => item.name).filter(Boolean);
  if (!names.length) {
    return 'No lights or devices are connected for guests. If they ask to change a light or anything in the house, call message_host. Do not claim you did it.';
  }
  if (!stay.unlocked) {
    return `Connected devices, available starting ${stay.opensOn}: ${names.join(', ')}. Before that date, do not call control_house. Tell them the devices open with the door code.`;
  }
  return `You can run these devices with control_house: ${names.join(', ')}. Actions are on, off, and dim. Confirm what you changed in one short sentence.`;
}

export async function controlHouse(
  env: SettingsEnv & { HOME_ASSISTANT_URL?: string; HOME_ASSISTANT_TOKEN?: string },
  stay: ConciergeStay,
  request: { name?: string; action?: string; brightness?: number },
): Promise<{ ok: boolean; tellGuest: string }> {
  if (!stay.unlocked) {
    return { ok: false, tellGuest: `The house controls open on ${stay.opensOn}, with the door code.` };
  }
  const name = (request.name ?? '').trim().toLowerCase();
  const device = (stay.guide.controls ?? []).find((item) => item.name.trim().toLowerCase() === name);
  if (!device || !safeEntity(device.entityId) || device.kind !== 'light') {
    return { ok: false, tellGuest: 'That device is not one I can run. I can text Brandon.' };
  }
  const action = request.action === 'off' ? 'off' : request.action === 'dim' ? 'dim' : request.action === 'on' ? 'on' : '';
  if (!action) return { ok: false, tellGuest: 'I did not catch whether to turn it on, off, or dim it.' };
  const base = env.HOME_ASSISTANT_URL?.trim().replace(/\/$/, '');
  const token = env.HOME_ASSISTANT_TOKEN?.trim();
  if (!base || !token) {
    return { ok: false, tellGuest: 'The lights are not connected yet. I can text Brandon.' };
  }
  const service = action === 'off' ? 'turn_off' : 'turn_on';
  const body: { entity_id: string; brightness_pct?: number } = { entity_id: device.entityId };
  if (action === 'dim') body.brightness_pct = clampBrightness(request.brightness);
  const response = await fetch(`${base}/api/services/light/${service}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, tellGuest: `I could not reach the ${device.name}. I can text Brandon.` };
  if (action === 'off') return { ok: true, tellGuest: `${device.name} is off.` };
  if (action === 'dim') return { ok: true, tellGuest: `${device.name} is at ${body.brightness_pct} percent.` };
  return { ok: true, tellGuest: `${device.name} is on.` };
}

function safeEntity(id: string) {
  return /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(id);
}

function clampBrightness(value: number | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 40;
  return Math.max(1, Math.min(100, Math.round(n)));
}

export type StayThreadMessage = {
  id: string;
  from: 'guest' | 'host';
  text: string;
  at: string;
};

function threadKey(token: string) {
  return `stayThread:${token}`;
}

export async function loadStayThread(env: SettingsEnv, token: string): Promise<StayThreadMessage[]> {
  const rows = await kvGet<StayThreadMessage[]>(env, threadKey(token), []);
  return Array.isArray(rows) ? rows : [];
}

export async function appendStayThread(
  env: SettingsEnv,
  token: string,
  from: StayThreadMessage['from'],
  text: string,
): Promise<StayThreadMessage> {
  const rows = await loadStayThread(env, token);
  const message: StayThreadMessage = {
    id: crypto.randomUUID(),
    from,
    text: text.replace(/\s+/g, ' ').trim().slice(0, 500),
    at: new Date().toISOString(),
  };
  await kvPut(env, threadKey(token), [...rows, message].slice(-40));
  return message;
}

export async function textHost(
  env: SettingsEnv,
  stay: ConciergeStay,
  note: string,
  origin: string,
): Promise<{ sent: boolean; tellGuest: string }> {
  const usage = await usageToday(env, stay.token);
  if (usage.texts >= TEXTS_PER_DAY) {
    return {
      sent: false,
      tellGuest: `I've already texted Brandon several times today. Please call ${stay.guide.contactPhone}.`,
    };
  }
  const clean = scrubSecrets(stay, note).replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!clean) {
    return { sent: false, tellGuest: `I didn't catch what to tell Brandon. Please call ${stay.guide.contactPhone}.` };
  }
  await appendStayThread(env, stay.token, 'guest', clean);
  const link = `${origin}/stay/${stay.token}/host`;
  const body = `${CONCIERGE_NAME} — ${stay.propertyName.replace(/^The /, '')} — ${stay.guestName}\n${stay.checkIn} to ${stay.checkOut}\nThey need: ${clean}\nReply: ${link}`;
  const sent = await sendTwilioSms(env, SURVEY_PHONE, body);
  if (sent.error) {
    return {
      sent: false,
      tellGuest: `I saved this for Brandon, and the text did not go through. Please call ${stay.guide.contactPhone}.`,
    };
  }
  await kvPut(env, usageKey(stay.token), { ...usage, texts: usage.texts + 1 });
  return { sent: true, tellGuest: 'I texted Brandon. His reply will show up here.' };
}

function scrubSecrets(stay: ConciergeStay, note: string) {
  let clean = note;
  for (const secret of [stay.guide.doorCode, stay.guide.wifiPassword]) {
    const value = secret?.trim();
    if (value && value.length >= 3) clean = clean.split(value).join('[removed]');
  }
  return clean;
}

export type ConciergeChatMessage = {
  id: string;
  from: 'guest' | 'nora';
  text: string;
  at: string;
};

function chatKey(token: string) {
  return `conciergeChat:${token}`;
}

export async function loadConciergeChat(env: SettingsEnv, token: string): Promise<ConciergeChatMessage[]> {
  const rows = await kvGet<ConciergeChatMessage[]>(env, chatKey(token), []);
  return Array.isArray(rows) ? rows : [];
}

export async function askNora(
  env: ConciergeEnv & { HOME_ASSISTANT_URL?: string; HOME_ASSISTANT_TOKEN?: string },
  stay: ConciergeStay,
  text: string,
  origin: string,
): Promise<{ reply: string; messages: ConciergeChatMessage[] } | { error: string; status: number }> {
  const question = text.replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!question) return { error: 'Type a question for Nora.', status: 400 };
  const usage = await usageToday(env, stay.token);
  const sentToday = usage.messages ?? 0;
  if (sentToday >= MESSAGES_PER_DAY) {
    return {
      error: `${CONCIERGE_NAME} has answered as much as she can today. Text or call us and we will help.`,
      status: 429,
    };
  }
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { error: 'Nora is not available right now. Text or call us and we will help.', status: 503 };

  const prior = await loadConciergeChat(env, stay.token);
  const contents: GeminiContent[] = prior.slice(-12).map((message) => ({
    role: message.from === 'guest' ? 'user' : 'model',
    parts: [{ text: message.text }],
  }));
  contents.push({ role: 'user', parts: [{ text: question }] });

  let reply = '';
  try {
    reply = await runNora(key, stay, contents, async (name, args) => {
      if (name === 'message_host') {
        const result = await textHost(env, stay, String(args.note ?? question), origin);
        return { tellGuest: result.tellGuest, sent: result.sent };
      }
      if (name === 'control_house') {
        const result = await controlHouse(env, stay, {
          name: typeof args.name === 'string' ? args.name : '',
          action: typeof args.action === 'string' ? args.action : '',
          brightness: typeof args.brightness === 'number' ? args.brightness : undefined,
        });
        return result;
      }
      return { tellGuest: 'That is not something I can do from here.' };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    return {
      error: message.startsWith('Nora') ? message : 'Nora could not answer just now. Text or call us and we will help.',
      status: 502,
    };
  }

  const guestMessage: ConciergeChatMessage = {
    id: crypto.randomUUID(),
    from: 'guest',
    text: question,
    at: new Date().toISOString(),
  };
  const marenMessage: ConciergeChatMessage = {
    id: crypto.randomUUID(),
    from: 'nora',
    text: reply.slice(0, 2000),
    at: new Date().toISOString(),
  };
  const messages = [...prior, guestMessage, marenMessage].slice(-40);
  try {
    await kvPut(env, chatKey(stay.token), messages);
    const latest = await usageToday(env, stay.token);
    await kvPut(env, usageKey(stay.token), { ...latest, messages: (latest.messages ?? 0) + 1 });
  } catch {
    // The daily save limit can be full. Nora still answers this question.
  }
  return { reply: marenMessage.text, messages };
}

type GeminiContent = { role: 'user' | 'model'; parts: Array<Record<string, unknown>> };

const SEARCH_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const;

const MAREN_FUNCTIONS = {
  functionDeclarations: [
    {
      name: 'control_house',
      description:
        'Turn on, turn off, or dim a connected device in this house. Use a device name from the instructions. brightness is 1 to 100 and only for dim.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Device name from the instructions, such as Living room lights.' },
          action: { type: 'string', enum: ['on', 'off', 'dim'] },
          brightness: { type: 'number', description: '1 to 100 when dimming.' },
        },
        required: ['name', 'action'],
      },
    },
    {
      name: 'message_host',
      description:
        'Text Brandon only when the guest needs a person: something broken, a delivery, a setup, or they asked for him. Never use this for restaurants, directions, weather, or house notes. Never include a door code or Wi-Fi password.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'What the guest needs, in their words.' },
        },
        required: ['note'],
      },
    },
  ],
};

function lastGuestText(contents: GeminiContent[]) {
  for (let i = contents.length - 1; i >= 0; i -= 1) {
    if (contents[i].role !== 'user') continue;
    const text = contents[i].parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join(' ').trim();
    if (text) return text;
  }
  return '';
}

function needsHouseAction(text: string) {
  return /\b(lights?|lamp|dimmer|\bdim\b|thermostat|text brandon|tell brandon|call brandon|broken|leak|no heat|no hot water|locked out)\b/i.test(text);
}

async function runNora(
  apiKey: string,
  stay: ConciergeStay,
  contents: GeminiContent[],
  runTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  const question = lastGuestText(contents);
  const answer = await groundedReply(apiKey, stay, contents, question);
  if (!needsHouseAction(question)) return answer;
  try {
    return await houseActionReply(apiKey, stay, contents, answer, runTool);
  } catch {
    return answer;
  }
}

function isHouseOnly(question: string) {
  if (/\b(where|near|nearby|closest|directions|drive to|resort|restaurant|ski|trail|hike|store|shop|town|city|hospital|temple|mountain|heber|midway|park city|provo|orem|salt lake|downtown)\b/i.test(question)) {
    return false;
  }
  return /\b(checkout|check-out|check in|check-in|wi-?fi|password|door|code|lights?|lamp|thermostat|towel|dishwasher|trash|fireplace|oven|washer|dryer|hot water|heater|garage|parking|your name|who are you|house rules)\b/i.test(question);
}

function isSmallTalk(question: string) {
  return /^(hi|hey|hello|thanks|thank you|ok|okay|how are you|good morning|good night)\b/i.test(question.trim());
}

function asksAboutAPlace(question: string) {
  if (isHouseOnly(question) || isSmallTalk(question)) return false;
  if (/\b(weather|forecast)\b/i.test(question) && !/\b(road|canyon|drive|resort|mountain)\b/i.test(question)) return false;
  return true;
}

function housePoint(stay: ConciergeStay) {
  if (stay.propertyName.includes('River')) return { latitude: 40.3538, longitude: -111.5726 };
  if (stay.propertyName.includes('Lindon')) return { latitude: 40.3396, longitude: -111.7204 };
  return { latitude: 40.3433, longitude: -111.7168 };
}

async function groundedReply(apiKey: string, stay: ConciergeStay, seed: GeminiContent[], question: string) {
  let lastError = 'Nora could not look that up just now. Text or call us and we will help.';
  const contents = seed.map((item) => ({ role: item.role, parts: item.parts.map((part) => ({ ...part })) }));
  const local = asksAboutAPlace(question);
  if (local) {
    const last = contents[contents.length - 1];
    if (last?.role === 'user') {
      const asked = last.parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join(' ').trim();
      last.parts = [{
        text: `${asked}\n\nLook up the place they asked about. Name each real place, not a substitute from another town. Do not include a web address. Heber and Midway are up Provo Canyon. Provo and Orem are down-canyon. Do not recommend a Provo place for Heber.`,
      }];
    }
  }
  if (local) {
    try {
      const json = await generateNora(apiKey, 'gemini-2.5-flash', stay, contents, [{ googleMaps: {} }], housePoint(stay));
      const text = replyText(json);
      if (text && !wrongTown(question, text)) {
        const linked = attachDirections(text, json, stay, question);
        if (MAPS_URL.test(linked)) return linked;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  for (const model of SEARCH_MODELS) {
    try {
      const json = await generateNora(apiKey, model, stay, contents, [{ google_search: {} }]);
      const text = replyText(json);
      const searched = Boolean(json.candidates?.[0]?.groundingMetadata?.groundingChunks?.length);
      if (!text) continue;
      if (!local || searched) {
        if (wrongTown(question, text)) continue;
        return local ? attachDirections(text, json, stay, question) : text;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
      if (!/busy|high demand|429|503|unavailable/i.test(lastError)) break;
    }
  }
  throw new Error(lastError.startsWith('Nora') ? lastError : 'Nora could not look that up just now. Text or call us and we will help.');
}

function wrongTown(question: string, text: string) {
  return /\bheber\b/i.test(question) && /\bslackwater\b/i.test(text);
}

const MAPS_URL = /https:\/\/(?:maps\.google\.com|www\.google\.com\/maps)\S*/i;

function placesFromGrounding(json: Awaited<ReturnType<typeof generateNora>>) {
  const chunks = json.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const places: Array<{ title: string; placeId?: string }> = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const maps = chunk?.maps;
    const uri = maps?.uri?.trim() ?? '';
    if (!MAPS_URL.test(uri)) continue;
    const title = (maps?.title ?? '').replace(/\s+-\s+Google Maps$/i, '').trim();
    if (!title || /^review of/i.test(title)) continue;
    const placeId = maps?.placeId?.replace(/^places\//, '');
    const key = placeId || title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ title, placeId });
  }
  return places;
}

function attachDirections(
  text: string,
  json: Awaited<ReturnType<typeof generateNora>>,
  stay: ConciergeStay,
  question: string,
) {
  const stripped = text
    .replace(/\n*(?:Open .+ in Google Maps|Directions to .+)\nhttps:\/\/\S+/g, '')
    .replace(MAPS_URL, '')
    .trim();
  const grounded = placesFromGrounding(json).filter((place) => mentionsPlace(stripped, place.title));
  const chosen = (grounded.length ? grounded : placesFromGrounding(json).slice(0, 1)).slice(0, 8);
  const names = chosen.length ? chosen.map((place) => place.title) : placeNames(stripped, stay, question);
  const links = (chosen.length ? chosen : names.map((title) => ({ title }))).slice(0, 8);
  if (!links.length) {
    const fallback = destinationFromQuestion(question);
    if (!fallback) return stripped;
    links.push({ title: fallback });
  }
  const block = links
    .map((place) => {
      const title = place.title.replace(/\s+/g, ' ').replace(/[.,]+$/g, '').trim();
      return `Directions to ${title}\n${directionsUrl(stay, title, place.placeId)}`;
    })
    .join('\n\n');
  return `${stripped}\n\n${block}`;
}

function mentionsPlace(text: string, title: string) {
  const name = title.toLowerCase();
  const body = text.toLowerCase();
  if (body.includes(name)) return true;
  const head = name.split(/\s+/).slice(0, 2).join(' ');
  return head.length > 3 && body.includes(head);
}

function placeNames(text: string, stay: ConciergeStay, question: string) {
  const found = [...text.matchAll(/\b([A-Z][\p{L}\d'’&-]+(?:[ \t]+[A-Z\d][\p{L}\d'’&-]+){0,4})\b/gu)].map((match) => match[1].trim());
  const ban = new Set(['Nora', 'Google', 'Google Maps', 'Salt Lake', 'Utah', 'The River House', 'River House', stay.propertyName]);
  const generic = /^(I|We|The|A|An|It|This|That|They|Many|For|Open|Directions|Checkout|Check|House|Park|City|Lake|Best|From|With|About|Drive|Canyon|Minutes|There|Here|Good|Near|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;
  const waypoint = /^(Heber|Midway|Provo|Orem|Lehi|Lindon|Draper|Sandy)$/i;
  const names = [...new Set(found.filter((name) => {
    if (ban.has(name) || generic.test(name)) return false;
    if (waypoint.test(name) && !question.toLowerCase().includes(name.toLowerCase())) return false;
    if (isRouteOnly(text, name)) return false;
    return name.includes(' ') || name.length >= 4;
  }))];
  return names.filter((name) => !names.some((other) => other !== name && other.startsWith(`${name} `))).slice(0, 8);
}

function isRouteOnly(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentions = text.match(new RegExp(`\\b${escaped}\\b`, 'gi'))?.length ?? 0;
  if (mentions !== 1) return false;
  return new RegExp(`(?:through|towards|toward|via|past|up the|down the)\\s+${escaped}\\b`, 'i').test(text);
}

function destinationFromQuestion(question: string) {
  const cleaned = question
    .replace(/\b(what|whats|what's|where|is|are|the|best|good|a|an|some|any|near|nearby|around|here|there|closest|close|to|for|in|me|us|we|i|can|you|please|tell|about|how|do|get|drive|from|this|house|should|which)\b/gi, ' ')
    .replace(/[?!.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 3) return null;
  return `${cleaned} Utah`;
}

function directionsUrl(stay: ConciergeStay, title: string, placeId?: string) {
  const origin = housePoint(stay);
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: title,
    travelmode: 'driving',
  });
  if (placeId && /^[A-Za-z0-9_-]+$/.test(placeId)) params.set('destination_place_id', placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

async function houseActionReply(
  apiKey: string,
  stay: ConciergeStay,
  seed: GeminiContent[],
  draft: string,
  runTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  const contents = seed.map((item) => ({ role: item.role, parts: item.parts.map((part) => ({ ...part })) }));
  contents.push({ role: 'model', parts: [{ text: draft }] });
  contents.push({
    role: 'user',
    parts: [{ text: 'If they need a light changed or Brandon, use the tools. Otherwise repeat your answer.' }],
  });
  for (let round = 0; round < 3; round += 1) {
    const json = await generateNora(apiKey, 'gemini-2.5-flash', stay, contents, [MAREN_FUNCTIONS]);
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((part) => part.functionCall?.name);
    const text = parts.map((part) => part.text?.trim() ?? '').filter(Boolean).join('\n\n');
    if (!calls.length) {
      const spoken = text || draft;
      return MAPS_URL.test(spoken) ? spoken : draft;
    }
    contents.push({ role: 'model', parts });
    const responses = [];
    for (const part of calls) {
      const name = part.functionCall?.name ?? '';
      const args = part.functionCall?.args ?? {};
      responses.push({ functionResponse: { name, response: await runTool(name, args) } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return draft;
}

async function generateNora(
  apiKey: string,
  model: string,
  stay: ConciergeStay,
  contents: GeminiContent[],
  tools: unknown[],
  point?: { latitude: number; longitude: number },
) {
  const payload: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: conciergeInstructions(stay) }] },
    contents,
    tools,
    generationConfig: { temperature: 0.3 },
  };
  if (point) payload.toolConfig = { retrievalConfig: { latLng: point } };
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const body = await response.text();
  if (!response.ok) throw new Error(geminiError(response.status, body));
  return JSON.parse(body) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ maps?: { uri?: string; title?: string; placeId?: string } }>;
      };
    }>;
  };
}

function replyText(json: Awaited<ReturnType<typeof generateNora>>) {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text?.trim() ?? '').filter(Boolean).join('\n\n');
}

function geminiError(status: number, body: string) {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    const detail = json.error?.message?.trim();
    if (detail) {
      if (status === 429 || status === 503 || /high demand|overloaded|unavailable/i.test(detail)) {
        return 'Nora is busy right now. Wait a moment and try again.';
      }
      return detail;
    }
  } catch {
    // ignore
  }
  if (status === 429 || status === 503) return 'Nora is busy right now. Wait a moment and try again.';
  return 'Nora could not answer just now. Text or call us and we will help.';
}
