import { Functions } from 'node-appwrite';
import { makeAppwriteClient } from './appwrite.js';

const PANCHANG_FUNCTION_ID = '6788e8bf000f944e2335';

function buildPanchangDatetime(isoDate) {
  const [datePart, timePart] = isoDate.split('T');
  const encodedTime = timePart
    .replace(/:/g, '%3A')
    .replace(/\+/g, '%2B')
    .replace(/-/g, '%2D');
  return { date: datePart, datetime: `${datePart}T${encodedTime}` };
}

export async function getPanchang({ longitude, latitude, date }) {
  const functions = new Functions(makeAppwriteClient());

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

export function trimPanchang(panchang) {
  const pd = panchang?.data?.panchang?.data;
  return pd
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
}
