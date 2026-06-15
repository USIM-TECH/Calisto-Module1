import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaKnowledgeChunkStore, chunkHash } from './src/knowledge/storage/prisma-knowledge-chunk-store.js';
import { chunksFromPlainText } from './src/knowledge/service/ingest.js';

async function main() {
  const prisma = new PrismaClient();
  const store = new PrismaKnowledgeChunkStore(prisma);
  const text = fs.readFileSync('../calisto_nlp_export/knowledge_base/faq_customer_support_calisto_added.txt', 'utf8');
  const source = 'faq_customer_support_calisto_added.txt';
  
  // Clean up old ones
  if (await store.documentExists(source)) {
    await store.deleteDocument(source);
    console.log(`Deleted existing document ${source}`);
  }
  
  const chunks = chunksFromPlainText(source, text);
  const items = chunks.map(c => ({
    chunkHash: chunkHash(source, c.text),
    source,
    text: c.text
  }));
  
  const n = await store.upsertMany(items);
  console.log(`Upserted ${n} chunks for ${source}`);
  await prisma.$disconnect();
}
main().catch(console.error);
