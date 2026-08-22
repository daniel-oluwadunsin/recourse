import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

const LEGACY_CASE_KEY_INDEX = 'cases_case_key_unique';

/**
 * Removes indexes left by pre-rebuild schemas that are incompatible with the
 * current data model. Each migration is deliberately narrow: an index is only
 * removed when both its known name and key definition match.
 */
export async function removeLegacyCaseIndexes(
  database: NonNullable<Connection['db']>,
): Promise<string[]> {
  const collections = await database
    .listCollections({ name: 'cases' }, { nameOnly: true })
    .toArray();
  if (collections.length === 0) return [];

  const cases = database.collection('cases');
  const indexes = await cases.listIndexes().toArray();
  const removed: string[] = [];

  for (const index of indexes) {
    const key = index.key as Record<string, unknown>;
    const isLegacyCaseKeyIndex =
      index.name === LEGACY_CASE_KEY_INDEX &&
      index.unique === true &&
      Object.keys(key).length === 1 &&
      key.caseKey === 1;

    if (!isLegacyCaseKeyIndex) continue;
    await cases.dropIndex(LEGACY_CASE_KEY_INDEX);
    removed.push(LEGACY_CASE_KEY_INDEX);
  }

  return removed;
}

@Injectable()
export class DatabaseMaintenanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseMaintenanceService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB connection was not ready for schema maintenance.');
    }

    const removed = await removeLegacyCaseIndexes(database);
    if (removed.length > 0) {
      this.logger.log(`Removed obsolete MongoDB index: ${removed.join(', ')}`);
    }
  }
}
