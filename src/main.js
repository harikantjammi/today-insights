import { Client, Functions } from 'node-appwrite';

const ASTRONOMY_FUNCTION_ID = '6781b317002a58e5064b';

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
      return res.json(details);
    } catch (err) {
      error('Failed to fetch astronomy details: ' + err.message);
      return res.json({ error: 'Failed to fetch astronomy details' }, 500);
    }
  }

  return res.json({ error: 'Not found' }, 404);
};
