-- CreateTable
CREATE TABLE "CurrentInterest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrentInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "caseType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurrentInterest_customerId_idx" ON "CurrentInterest"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CurrentInterest_customerId_kind_key" ON "CurrentInterest"("customerId", "kind");

-- CreateIndex
CREATE INDEX "SupportCase_customerId_idx" ON "SupportCase"("customerId");

-- AddForeignKey
ALTER TABLE "CurrentInterest" ADD CONSTRAINT "CurrentInterest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
