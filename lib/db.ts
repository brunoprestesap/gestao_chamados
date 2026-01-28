import mongoose from 'mongoose';
import { MongoClient, ServerApiVersion } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in environment variables');
}

const options = {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
};

let client: MongoClient;

if (process.env.NODE_ENV === 'development') {
  const globalWithMongo = global as typeof globalThis & { _mongoClient?: MongoClient };
  if (!globalWithMongo._mongoClient)
    globalWithMongo._mongoClient = new MongoClient(MONGODB_URI, options);
  client = globalWithMongo._mongoClient;
} else {
  client = new MongoClient(MONGODB_URI, options);
}

// Função para conectar o Mongoose
export async function dbConnect() {
  if (mongoose.connection.readyState === 1) {
    return; // Já conectado
  }

  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => {
      mongoose.connection.once('connected', resolve);
    });
    return;
  }

  await mongoose.connect(MONGODB_URI);
}

export default client;
