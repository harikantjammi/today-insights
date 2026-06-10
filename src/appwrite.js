import { Client } from 'node-appwrite';

export function makeAppwriteClient() {
  return new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}
