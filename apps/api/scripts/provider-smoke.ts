import { createConnection } from 'mongoose';
import { tavily } from '@tavily/core';
import { randomUUID } from 'node:crypto';
import { Environment } from '../src/config';
import { CloudinaryService } from '../src/documents.providers';
import { GeminiService } from '../src/gemini.service';

async function main(): Promise<void> {
  const environment = new Environment(process.env);
  if (!environment.LIVE_PROVIDER_TESTS) {
    console.log(
      'Live provider tests skipped. Set LIVE_PROVIDER_TESTS=true to opt in.',
    );
    return;
  }

  const results: Array<{ provider: string; ok: boolean; detail: string }> = [];

  async function check(
    name: string,
    operation: () => Promise<string>,
  ): Promise<void> {
    try {
      results.push({ provider: name, ok: true, detail: await operation() });
    } catch (error: unknown) {
      results.push({
        provider: name,
        ok: false,
        detail:
          error instanceof Error
            ? error.message.slice(0, 180)
            : 'Unknown failure',
      });
    }
  }

  await check('MongoDB', async () => {
    const connection = await createConnection(environment.MONGODB_URI, {
      dbName: environment.MONGODB_DB_NAME,
      maxPoolSize: 1,
    }).asPromise();
    const collection = connection.collection('provider_smoke_checks');
    const marker = randomUUID();
    await collection.insertOne({
      marker,
      synthetic: true,
      createdAt: new Date(),
    });
    const found = await collection.findOne({ marker });
    await collection.deleteOne({ marker });
    await connection.close();
    if (!found) throw new Error('Synthetic record was not returned');
    return 'create/read/delete passed';
  });

  await check('Gemini', async () => {
    const service = new GeminiService(environment);
    const result = await service.understandCase(
      'Synthetic test only. Northfield Council refused a fictional permit on 1 August 2026 because a supporting date was unclear. The fictional user wants reconsideration.',
    );
    if (!result.decision || result.criticalUnknowns.length > 5)
      throw new Error('Structured response was incomplete');
    return `${environment.GEMINI_MODEL} structured response passed`;
  });

  await check('Tavily', async () => {
    if (!environment.TAVILY_API_KEY)
      throw new Error('TAVILY_API_KEY is missing');
    const client = tavily({ apiKey: environment.TAVILY_API_KEY });
    const searched = await client.search(
      'site:docs.tavily.com search API official documentation',
      {
        searchDepth: 'basic',
        maxResults: 3,
        includeAnswer: false,
        includeRawContent: false,
        timeout: 30,
      },
    );
    const url = searched.results[0]?.url;
    if (!url) throw new Error('Search returned no URL');
    const extracted = await client.extract([url], {
      extractDepth: 'basic',
      format: 'markdown',
      timeout: 30,
    });
    if (!extracted.results[0]?.rawContent)
      throw new Error('Extract returned no content');
    return 'one basic search and one basic extract passed';
  });

  await check('Cloudinary', async () => {
    const service = new CloudinaryService(environment);
    const marker = randomUUID();
    const bytes = Buffer.from('Synthetic Recourse provider smoke check.');
    const asset = await service.upload(
      bytes,
      `recourse/provider-smoke/${marker}`,
      'raw',
    );
    try {
      const downloaded = await service.download(asset);
      if (!downloaded.equals(bytes))
        throw new Error('Downloaded bytes did not match');
    } finally {
      await service.delete(asset);
    }
    return 'authenticated upload/download/delete passed';
  });

  for (const result of results)
    console.log(
      `${result.ok ? 'PASS' : 'FAIL'} ${result.provider}: ${result.detail}`,
    );
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

void main();
