import { Client, Functions } from 'node-appwrite';

const ASTRONOMY_FUNCTION_ID = '6781b317002a58e5064b';
const CALENDAR_FUNCTION_ID = '67b91e390034cf42f28e';
const PANCHANG_FUNCTION_ID = '6788e8bf000f944e2335';

async function fetchSunAndMoonDetails({ cityTz, cityName, cityState, date }) {
  const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const functions = new Functions(client);

  const formattedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: cityTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  const city = encodeURIComponent(`${cityName} ${cityState}`);
  const path = `/astronomy?date=${formattedDate}&city=${city}`;

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

async function getUpcomingCalendar({ date, tz }) {
  const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const functions = new Functions(client);

  const formattedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  const path = `/calendar/days?limit=3&start=${formattedDate}`;

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

function buildPanchangDatetime(date, tz) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  }).formatToParts(date);

  const get = (type) => parts.find(p => p.type === type)?.value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  const tzName = get('timeZoneName'); // e.g. "GMT+05:30" or "GMT"

  const offsetMatch = tzName?.match(/GMT([+-]\d{2}:\d{2})/);
  const offset = offsetMatch ? offsetMatch[1] : '+00:00';

  const datePart = `${get('year')}-${get('month')}-${get('day')}`;
  const timePart = `${hour}:${get('minute')}:${get('second')}${offset}`;

  const encodedTime = timePart
    .replace(/:/g, '%3A')
    .replace(/\+/g, '%2B')
    .replace(/-/g, '%2D');

  return { date: datePart, datetime: `${datePart}T${encodedTime}` };
}

async function getPanchang({ tz, longitude, latitude, date }) {
  const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const functions = new Functions(client);

  const { date: formattedDate, datetime } = buildPanchangDatetime(date, tz);

  // params sorted alphabetically: ayanamsa, calendar, date, datetime, la, latitude, longitude
  const path = `/today?ayanamsa=1&calendar=shaka-samvat&date=${formattedDate}&datetime=${datetime}&la=en&latitude=${latitude}&longitude=${longitude}`;

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

  if (req.path === '/astronomy') {
    const { tz, city, state, date } = req.query;

    if (!tz || !city || !state) {
      return res.json({ error: 'Missing required query params: tz, city, state' }, 400);
    }

    try {
      const details = await fetchSunAndMoonDetails({
        cityTz: tz,
        cityName: city,
        cityState: state,
        date: date ? new Date(date) : new Date(),
      });
      log(`Fetched astronomy details for ${city}, ${state} on ${date}`);
      log(JSON.stringify(details));
      return res.json(details);
    } catch (err) {
      error('Failed to fetch astronomy details: ' + err.message);
      return res.json({ error: 'Failed to fetch astronomy details' }, 500);
    }
  }

  if (req.path === '/calendar') {
    const { tz, date } = req.query;

    if (!tz) {
      return res.json({ error: 'Missing required query param: tz' }, 400);
    }

    try {
      const days = await getUpcomingCalendar({
        tz,
        date: date ? new Date(date) : new Date(),
      });
      log(`Fetched upcoming calendar for tz=${tz} from ${date}`);
      log(JSON.stringify(days));
      return res.json(days);
    } catch (err) {
      error('Failed to fetch calendar: ' + err.message);
      return res.json({ error: 'Failed to fetch calendar' }, 500);
    }
  }

  if (req.path === '/panchang') {
    const { tz, date, longitude, latitude } = req.query;

    if (!tz || !date || !longitude || !latitude) {
      return res.json({ error: 'Missing required query params: tz, date, longitude, latitude' }, 400);
    }

    try {
      const data = await getPanchang({
        tz,
        longitude,
        latitude,
        date: new Date(date),
      });
      log(`Fetched panchang for tz=${tz} on ${date}`);
      log(JSON.stringify(data));
      return res.json(data);
    } catch (err) {
      error(err)
      error('Failed to fetch panchang: ' + err.message);
      return res.json({ error: 'Failed to fetch panchang' }, 500);
    }
  }

  return res.json({ error: 'Not found' }, 404);
};
