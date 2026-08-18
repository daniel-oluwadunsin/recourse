import "reflect-metadata";

import mongoose from "mongoose";

import { parseEnvironment } from "@recourse/config";

type SearchIndexDefinition = {
  collection: string;
  name: string;
  type: "search" | "vectorSearch";
  definition: Record<string, unknown>;
};

const environment = parseEnvironment();

const definitions: SearchIndexDefinition[] = [
  {
    collection: "evidence_blocks",
    definition: {
      fields: [
        {
          numDimensions: environment.EMBEDDING_DIMENSIONS,
          path: "embedding",
          similarity: "cosine",
          type: "vector",
        },
        { path: "caseId", type: "filter" },
        { path: "evidenceId", type: "filter" },
        { path: "ownerId", type: "filter" },
      ],
    },
    name: environment.VECTOR_SEARCH_INDEX_EVIDENCE,
    type: "vectorSearch",
  },
  {
    collection: "procedure_source_chunks",
    definition: {
      fields: [
        {
          numDimensions: environment.EMBEDDING_DIMENSIONS,
          path: "embedding",
          similarity: "cosine",
          type: "vector",
        },
        { path: "institutionId", type: "filter" },
        { path: "jurisdictionKey", type: "filter" },
        { path: "procedureId", type: "filter" },
        { path: "procedureVersionId", type: "filter" },
        { path: "authorityTier", type: "filter" },
      ],
    },
    name: environment.VECTOR_SEARCH_INDEX_PROCEDURE,
    type: "vectorSearch",
  },
  {
    collection: "evidence_blocks",
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          caseId: { type: "objectId" },
          evidenceId: { type: "objectId" },
          normalizedText: { type: "string" },
          ownerId: { type: "objectId" },
          text: { type: "string" },
        },
      },
    },
    name: environment.ATLAS_SEARCH_INDEX_EVIDENCE,
    type: "search",
  },
  {
    collection: "procedure_source_chunks",
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          authorityTier: { type: "token" },
          institutionId: { type: "objectId" },
          jurisdictionKey: { type: "token" },
          normalizedText: { type: "string" },
          procedureId: { type: "objectId" },
          procedureVersionId: { type: "objectId" },
          text: { type: "string" },
        },
      },
    },
    name: environment.ATLAS_SEARCH_INDEX_PROCEDURE,
    type: "search",
  },
];

async function main(): Promise<void> {
  if (!environment.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI must be set before applying Atlas Search indexes.",
    );
  }
  const connection = await mongoose
    .createConnection(environment.MONGODB_URI, {
      autoIndex: false,
      connectTimeoutMS: environment.MONGODB_CONNECT_TIMEOUT_MS,
      dbName: environment.MONGODB_DATABASE,
      serverSelectionTimeoutMS: environment.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    })
    .asPromise();
  try {
    const db = connection.db;
    if (!db) throw new Error("MongoDB database handle is unavailable.");
    for (const definition of definitions) {
      const collection = db.collection(definition.collection);
      const existing = (await collection
        .aggregate([{ $listSearchIndexes: {} }])
        .toArray()) as Array<{ name?: string }>;
      if (!existing.some((index) => index.name === definition.name)) {
        await db.command({
          createSearchIndexes: definition.collection,
          indexes: [
            {
              definition: definition.definition,
              name: definition.name,
              type: definition.type,
            },
          ],
        });
        process.stdout.write(
          `${definition.collection}: created ${definition.name}\n`,
        );
      } else {
        process.stdout.write(
          `${definition.collection}: present ${definition.name}\n`,
        );
      }
    }
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

export { definitions as atlasSearchIndexDefinitions };
