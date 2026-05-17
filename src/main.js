import { Client, Functions } from 'node-appwrite';

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

  if (req.path === '/astronomy') {
    const { tz, city, state, date } = req.query;

    if (!tz || !city || !state) {
      return res.json({ error: 'Missing required query params: tz, city, state' }, 400);
    }

    try {
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date ? new Date(date) : new Date());

      const details = await fetchSunAndMoonDetails({
        cityName: city,
        cityState: state,
        dateStr,
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
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date ? new Date(date) : new Date());

      const days = await getUpcomingCalendar({ dateStr });
      log(`Fetched upcoming calendar for tz=${tz} from ${date}`);
      log(JSON.stringify(days));
      return res.json(days);
    } catch (err) {
      error('Failed to fetch calendar: ' + err.message);
      return res.json({ error: 'Failed to fetch calendar' }, 500);
    }
  }

  if (req.path === '/panchang') {
    const { date, longitude, latitude } = req.query;

    if (!date || !longitude || !latitude) {
      return res.json({ error: 'Missing required query params: date, latitude, longitude' }, 400);
    }

    try {
      const data = await getPanchang({
        longitude,
        latitude,
        date,
      });
      log(`Fetched panchang for ${date}`);
      log(JSON.stringify(data));
      return res.json(data);
    } catch (err) {
      error(err)
      error('Failed to fetch panchang: ' + err.message);
      return res.json({ error: 'Failed to fetch panchang' }, 500);
    }
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

    log(`Fetched today-insights for ${city}, ${state} on ${date}`);
    log(JSON.stringify(response));
    return res.json(response);
  }

  return res.json({ error: 'Not found' }, 404);
};
