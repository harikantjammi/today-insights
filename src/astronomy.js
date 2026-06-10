import { Functions } from 'node-appwrite';
import { makeAppwriteClient } from './appwrite.js';

const ASTRONOMY_FUNCTION_ID = '6781b317002a58e5064b';

export async function fetchSunAndMoonDetails({ cityName, cityState, dateStr }) {
  const functions = new Functions(makeAppwriteClient());

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
