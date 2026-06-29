import { Databases, ID, Query } from 'node-appwrite';
import { makeAppwriteClient } from './appwrite.js';

export async function lookupCache({ documentType, dateStr, latitude, longitude }) {
  const db = new Databases(makeAppwriteClient());
  const result = await db.listDocuments(
    process.env.DATABASE_ID,
    process.env.INSIGHTS_STORE,
    [
      Query.equal('document-type', documentType),
      Query.equal('date', dateStr),
      Query.equal('latitude', latitude),
      Query.equal('longitude', longitude),
    ]
  );
  if (result.documents.length > 0) {
    return JSON.parse(result.documents[0].response);
  }
  return null;
}

export async function saveCache({ documentType, dateStr, latitude, longitude, summary }) {
  const db = new Databases(makeAppwriteClient());
  await db.createDocument(
    process.env.DATABASE_ID,
    process.env.INSIGHTS_STORE,
    ID.unique(),
    { 'document-type': documentType, date: dateStr, latitude, longitude, response: JSON.stringify(summary) }
  );
}
