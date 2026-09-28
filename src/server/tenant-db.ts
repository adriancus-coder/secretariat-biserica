import "server-only";
import { prisma } from "./db";
import { scopeToChurch, type TenantClient } from "./tenant-scope";

const cache = new Map<string, TenantClient>();

/** Clientul Prisma limitat la biserica dată (vezi `scopeToChurch`). */
export function tenantDb(churchId: string): TenantClient {
  let client = cache.get(churchId);
  if (!client) {
    client = scopeToChurch(prisma, churchId);
    if (cache.size > 500) cache.clear();
    cache.set(churchId, client);
  }
  return client;
}

export type { TenantClient };
