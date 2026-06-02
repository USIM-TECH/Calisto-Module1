-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_source_key" ON "KnowledgeDocument"("source");

-- Backfill documents from existing chunk sources
INSERT INTO "KnowledgeDocument" ("id", "source", "createdAt", "updatedAt")
SELECT
    'kd_' || substr(md5("source"), 1, 22),
    "source",
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT "source" FROM "KnowledgeChunk"
) AS distinct_sources;

-- Add documentId column (nullable during backfill)
ALTER TABLE "KnowledgeChunk" ADD COLUMN "documentId" TEXT;

-- Link chunks to documents
UPDATE "KnowledgeChunk" AS c
SET "documentId" = d."id"
FROM "KnowledgeDocument" AS d
WHERE c."source" = d."source";

-- Remove orphan chunks if any (should not happen)
DELETE FROM "KnowledgeChunk" WHERE "documentId" IS NULL;

-- Enforce NOT NULL and FK
ALTER TABLE "KnowledgeChunk" ALTER COLUMN "documentId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
