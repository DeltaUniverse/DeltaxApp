/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { DatabaseService, Collection, type DatabaseRecord } from './core/database';

let globalDbInstance: DatabaseService | null = null;

export function getDatabase(d1?: D1Database): DatabaseService {
  if (!globalDbInstance || (d1 && globalDbInstance.raw !== d1)) {
    globalDbInstance = new DatabaseService(d1);
  }
  return globalDbInstance;
}

export { DatabaseService, Collection, type DatabaseRecord };
