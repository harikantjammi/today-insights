import { Databases, ID, Query } from 'node-appwrite';
import { makeAppwriteClient } from './appwrite.js';

export async function lookupCache({ documentType, city, dateStr, latitude, longitude, state, tz }) {
  const db = new Databases(makeAppwriteClient());
  const result = await db.listDocuments(
    process.env.DATABASE_ID,
    process.env.INSIGHTS_STORE,
    [
      Query.equal('document-type', documentType),
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

export async function saveCache({ documentType, city, dateStr, latitude, longitude, state, tz, summary }) {
  const db = new Databases(makeAppwriteClient());
  await db.createDocument(
    process.env.DATABASE_ID,
    process.env.INSIGHTS_STORE,
    ID.unique(),
    { 'document-type': documentType, city, date: dateStr, latitude, longitude, state, tz, response: JSON.stringify(summary) }
  );
}
