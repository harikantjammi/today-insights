import Anthropic from '@anthropic-ai/sdk';
import { Client, Databases, Functions, ID, Query } from 'node-appwrite';

const anthropic = new Anthropic();

function trimForSummarization({ astronomy, calendar, panchang }) {
  const astro = astronomy?.astronomy?.astro;
  const trimmedAstronomy = astro
    ? {
        sunrise: astro.sunrise,
        sunset: astro.sunset,
        moonrise: astro.moonrise,
        moonset: astro.moonset,
        moon_phase: astro.moon_phase,
        moon_illumination: astro.moon_illumination,
      }
    : astronomy;

  const pd = panchang?.data?.panchang?.data;
  const trimmedPanchang = pd
    ? {
        vaara: pd.vaara,
        nakshatra: pd.nakshatra?.map(({ name, lord, start, end }) => ({
          name,
          lord: { name: lord?.name, vedic_name: lord?.vedic_name },
          start,
          end,
        })),
        tithi: pd.tithi?.map(({ name, paksha, start, end }) => ({ name, paksha, start, end })),
        karana: pd.karana?.map(({ name, start, end }) => ({ name, start, end })),
        yoga: pd.yoga?.map(({ name, start, end }) => ({ name, start, end })),
        auspicious_period: pd.auspicious_period?.map(({ name, period }) => ({ name, period })),
        inauspicious_period: pd.inauspicious_period?.map(({ name, period }) => ({ name, period })),
      }
    : panchang;

  return { astronomy: trimmedAstronomy, calendar, panchang: trimmedPanchang };
}

async function summarizeInsights(data) {
  const trimmed = trimForSummarization(data);
  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `You are a helpful assistant that summarizes daily astronomical, panchang, and calendar insights.

Rules:
- Base every statement strictly on the values present in the input JSON. Do not infer, assume, or add information that is not explicitly in the data.
- If a field is missing, null, or contains an error, do not guess its value — omit it from the summary entirely.
- Do not reference cultural, religious, or astrological beliefs beyond what is directly stated in the input data.
- For recommendations: only generate festival-based recommendations for Hindu festivals. Ignore all non-Hindu festivals (e.g. Christmas, Easter, Eid, etc.).
- Do NOT include recommendations about upcoming holidays or future dates — only today.
- If today has a Hindu festival, you may add a recommendation relevant to that festival.
- Each recommendation must have a "text" field and a "type" field indicating the nature of the recommendation.
- Respond only with the JSON object — no markdown fences, no extra text, no commentary.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            dayRating: {
              type: 'string',
              enum: ['excellent', 'good', 'neutral', 'bad'],
              description: 'Rate the day using only the calendar[0].festival field (Hindu festivals only) and panchang data. Use "excellent" if today has more than one Hindu festival. Use "good" if today has exactly one Hindu festival, or if there are auspicious muhurats/favorable panchang with no dominant inauspicious periods. Use "neutral" if there are no festivals and auspicious/inauspicious factors are balanced. Use "bad" if inauspicious periods dominate with no festivals.',
            },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: 'The recommendation text.',
                  },
                  type: {
                    type: 'string',
                    enum: ['do', 'avoid', 'warning', 'info', 'festival'],
                    description: 'Type of recommendation: "do" for suggested actions, "avoid" for things to skip, "warning" for cautions, "info" for neutral observations, "festival" for Hindu festival-specific guidance.',
                  },
                },
                required: ['text', 'type'],
                additionalProperties: false,
              },
              description: 'Recommendations for today only, based strictly on panchang and today\'s Hindu festivals. Do not include upcoming holidays or future dates.',
            },
          },
          required: ['dayRating', 'recommendations'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'user',
        content: `Summarize today's insights:\n\n${JSON.stringify(trimmed)}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content.find((b) => b.type === 'text')?.text;
  return JSON.parse(text);
}

const ASTRONOMY_FUNCTION_ID = '6781b317002a58e5064b';
const CALENDAR_FUNCTION_ID = '67b91e390034cf42f28e';
const PANCHANG_FUNCTION_ID = '6788e8bf000f944e2335';

async function fetchSunAndMoonDetails({ cityName, cityState, dateStr }) {
  const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const functions = new Functions(client);

  const city = encodeURIComponent(`${cityName} ${cityState}`);
  const path = `/astronomy?date=${dateStr}&city=${city}`;

  const execution = await functions.createExecution(
    ASTRONOMY_FUNCTION_ID,
    '',
    false,
    path,
    'GET',
    {}
  );

  return JSON.parse(execution.responseBody);
}

async function getUpcomingCalendar({ dateStr }) {
  const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const functions = new Functions(client);

  const path = `/calendar/days?limit=3&start=${dateStr}`;

  const execution = await functions.createExecution(
    CALENDAR_FUNCTION_ID,
    '',
    false,
    path,
    'GET',
    {}
  );

  return JSON.parse(execution.responseBody);
}

function buildPanchangDatetime(isoDate) {
  const [datePart, timePart] = isoDate.split('T');
  const encodedTime = timePart
    .replace(/:/g, '%3A')
    .replace(/\+/g, '%2B')
    .replace(/-/g, '%2D');
  return { date: datePart, datetime: `${datePart}T${encodedTime}` };
}

async function getPanchang({ longitude, latitude, date }) {
  const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const functions = new Functions(client);

  const { date: formattedDate, datetime } = buildPanchangDatetime(date);

  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  const latitudeStr = lat < 0 ? `%2D${Math.abs(lat)}` : `${lat}`;
  const longitudeStr = lon < 0 ? `%2D${Math.abs(lon)}` : `${lon}`;
  const coordinates = `${latitudeStr}%2C${longitudeStr}`;

  // params sorted alphabetically: ayanamsa, calendar, coordinates, date, datetime, la
  const path = `/today?ayanamsa=1&calendar=shaka-samvat&coordinates=${coordinates}&date=${formattedDate}&datetime=${datetime}&la=en`;

  const execution = await functions.createExecution(
    PANCHANG_FUNCTION_ID,
    '',
    false,
    path,
    'GET',
    {}
  );

  return JSON.parse(execution.responseBody);
}

function makeAppwriteClient() {
  return new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}

async function lookupCache({ city, dateStr, latitude, longitude, state, tz }) {
  const db = new Databases(makeAppwriteClient());
  const result = await db.listDocuments(
    process.env.DATABASE_ID,
    process.env.INSIGHTS_STORE,
    [
      Query.equal('city', city),
      Query.equal('date', dateStr),
      Query.equal('latitude', latitude),
      Query.equal('longitude', longitude),
      Query.equal('state', state),
      Query.equal('tz', tz),
    ]
  );
  if (result.documents.length > 0) {
    return JSON.parse(result.documents[0].response);
  }
  return null;
}

async function saveCache({ city, dateStr, latitude, longitude, state, tz, summary }) {
  const db = new Databases(makeAppwriteClient());
  await db.createDocument(
    process.env.DATABASE_ID,
    process.env.INSIGHTS_STORE,
    ID.unique(),
    { city, date: dateStr, latitude, longitude, state, tz, response: JSON.stringify(summary) }
  );
}

export default async ({ req, res, log, error }) => {
  if (req.path === '/ping') {
    return res.text('Pong');
  }

  if (req.path === '/today-insights') {
    const { city, date, latitude, longitude, state, tz } = req.query;

    if (!city || !date || !latitude || !longitude || !state || !tz) {
      return res.json({ error: 'Missing required query params: city, date, latitude, longitude, state, tz' }, 400);
    }

    const [dateStr] = date.split('T');

    const cachedSummary = await lookupCache({ city, dateStr, latitude, longitude, state, tz });

    const [astronomyResult, panchangResult, calendarResult] = await Promise.allSettled([
      fetchSunAndMoonDetails({ cityTz: tz, cityName: city, cityState: state, dateStr }),
      getPanchang({ longitude, latitude, date }),
      getUpcomingCalendar({ dateStr }),
    ]);

    const toValue = (result) =>
      result.status === 'fulfilled' ? result.value : { error: result.reason?.message };

    const response = {
      astronomy: toValue(astronomyResult),
      calendar: toValue(calendarResult),
      panchang: toValue(panchangResult),
    };

    if (cachedSummary) {
      log(`Cache hit for ${city}, ${state} on ${dateStr}`);
      response.summary = cachedSummary;
    } else {
      try {
        response.summary = await summarizeInsights(response);
      } catch (err) {
        error('Failed to summarize insights: ' + err.message);
        response.summary = { error: err.message };
      }

      if (!response.summary?.error) {
        try {
          await saveCache({ city, dateStr, latitude, longitude, state, tz, summary: response.summary });
          log(`Cached summary for ${city}, ${state} on ${dateStr}`);
        } catch (err) {
          error('Failed to cache insights: ' + err.message);
        }
      }
    }

    log(`Fetched today-insights for ${city}, ${state} on ${date}`);
    return res.json(response.summary);
  }

  return res.json({ error: 'Not found' }, 404);
};
