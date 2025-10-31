import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import { Configuration, NeynarAPIClient } from "@neynar/nodejs-sdk";

if (fs.existsSync("env.local")) {
  loadEnv({ path: "env.local" });
} else {
  loadEnv();
}

const apiKey = process.env.NEYNAR_API_KEY;

if (!apiKey) {
  throw new Error("NEYNAR_API_KEY is not set. Add it to your .env file.");
}

const configuration = new Configuration({ apiKey });

export const neynarClient = new NeynarAPIClient(configuration);

