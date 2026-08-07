import { MongoClient, ServerApiVersion } from "mongodb";

let client;
let clientPromise;

function createMongoClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is required but not set");
  }
  const uri = process.env.MONGODB_URI;
  const options = {
    appName: "smartmeters",
    // Client-side operation timeout (CSOT): the server aborts ANY query/aggregation
    // that runs longer than this, so a slow or runaway query can't hang a request.
    // Our heaviest analytics run in ~1-2s; 20s is safe headroom. Tune via env.
    timeoutMS: Number(process.env.MONGODB_TIMEOUT_MS) || 20_000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  };
  return new MongoClient(uri, options);
}

function getMongoClientPromise() {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      client = createMongoClient();
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    if (!clientPromise) {
      client = createMongoClient();
      clientPromise = client.connect();
    }
  }
  return clientPromise;
}

export async function closeMongoClient() {
  if (client) {
    await client.close();
    client = undefined;
    clientPromise = undefined;
    if (global._mongoClientPromise) {
      global._mongoClientPromise = undefined;
    }
  }
}

export default getMongoClientPromise;
