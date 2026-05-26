import Anthropic from '@anthropic-ai/sdk';
import { Client, Functions } from 'node-appwrite';

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
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: `You are a helpful assistant that summarizes daily astronomical, panchang, and calendar insights.

Rules:
- Base every statement strictly on the values present in the input JSON. Do not infer, assume, or add information that is not explicitly in the data.
- If a field is missing, null, or contains an error, do not guess its value — omit it from the summary entirely.
- Do not reference cultural, religious, or astrological beliefs beyond what is directly stated in the input data.
- The dayRating must be derived solely from the combination of fields present in the input (e.g. auspicious periods, festival names, tithi, moon phase, planetary positions). If the data is insufficient to determine a rating, use "neutral".
- Respond only with the JSON object — no markdown fences, no extra text, no commentary.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            briefSummary: {
              type: 'string',
              description: 'A 1-2 sentence overview of the day.',
            },
            detailedSummary: {
              type: 'string',
              description: 'A paragraph covering key astronomy details, panchang tithi/nakshatra, and upcoming calendar events.',
            },
            keyInsights: {
              type: 'array',
              items: { type: 'string' },
              description: 'Notable highlights such as sunrise/sunset times, tithi, festivals, and auspicious periods.',
            },
            dayRating: {
              type: 'string',
              enum: ['excellent', 'good', 'neutral', 'bad'],
              description: 'Overall rating of the day. Use "excellent" if multiple auspicious muhurats, a significant festival, and favorable tithi/yoga are all present with few inauspicious periods. Use "good" if there are auspicious muhurats or a festival with only minor inauspicious periods. Use "neutral" if auspicious and inauspicious factors are roughly balanced or data is insufficient. Use "bad" if inauspicious periods (Rahu Kaal, Vishti Karana, negative yoga) dominate with no significant auspicious offsets.',
            },
            recommendations: {
              type: 'array',
              items: { type: 'string' },
              description: 'General recommendations for the day based strictly on the data provided (e.g. good time for certain activities, things to be mindful of).',
            },
          },
          required: ['briefSummary', 'detailedSummary', 'keyInsights', 'dayRating', 'recommendations'],
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

  const lon = parseFloat(longitude);
  const longitudeStr = lon < 0 ? `%2D${Math.abs(lon)}` : `${lon}`;
  const coordinates = `${latitude}%2C${longitudeStr}`;

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

    try {
      response.summary = await summarizeInsights(response);
    } catch (err) {
      error('Failed to summarize insights: ' + err.message);
      response.summary = { error: err.message };
    }

    log(`Fetched today-insights for ${city}, ${state} on ${date}`);
    log(JSON.stringify(response));
    return res.json(response);
  }

  return res.json({ error: 'Not found' }, 404);
};
