-- CreateTable
CREATE TABLE "Product" (
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "priceMyr" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "frameMaterial" TEXT,
    "frameShape" TEXT,
    "frameColor" TEXT,
    "gender" TEXT,
    "uvProtection" TEXT,
    "polarized" TEXT,
    "lensColor" TEXT,
    "frameStyle" TEXT,
    "lensType" TEXT,
    "lensFeature" TEXT,
    "lensDuration" TEXT,
    "multifocal" TEXT,
    "storeLocation" TEXT,
    "city" TEXT,
    "stockStatus" TEXT NOT NULL DEFAULT 'in_stock',
    "rating" DOUBLE PRECISION,
    "bestseller" BOOLEAN NOT NULL DEFAULT false,
    "newArrival" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE INDEX "Product_productType_idx" ON "Product"("productType");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_priceMyr_idx" ON "Product"("priceMyr");
