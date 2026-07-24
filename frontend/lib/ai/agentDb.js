import getMongoClientPromise from "@/lib/mongodb";

/** Connected database handle for agent tools. */
export async function getDb() {
  const client = await getMongoClientPromise();
  return client.db(process.env.DATABASE_NAME);
}
