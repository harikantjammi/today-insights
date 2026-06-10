import { Functions } from 'node-appwrite';
import { makeAppwriteClient } from './appwrite.js';

const CALENDAR_FUNCTION_ID = '67b91e390034cf42f28e';

export async function getUpcomingCalendar({ dateStr }) {
  const functions = new Functions(makeAppwriteClient());

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
