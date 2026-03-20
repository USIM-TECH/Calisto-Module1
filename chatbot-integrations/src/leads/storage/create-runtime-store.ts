import { getPrismaClient } from '../../db/prisma.js'
import type { RuntimeStore } from './runtime-store.interface.js'
import { FileRuntimeStore } from './file-runtime-store.js'
import { PrismaRuntimeStore } from './prisma-runtime-store.js'

export type StorageBackend = 'file' | 'postgres'

export interface CreateRuntimeStoreOptions {
  backend: StorageBackend
  dataDir: string
}

export function createRuntimeStore(options: CreateRuntimeStoreOptions): RuntimeStore {
  if (options.backend === 'postgres') {
    return new PrismaRuntimeStore(getPrismaClient())
  }
  return new FileRuntimeStore(options.dataDir)
}
