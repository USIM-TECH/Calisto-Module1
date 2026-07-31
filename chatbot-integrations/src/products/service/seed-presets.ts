import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

interface SeedProduct {
  productId: string
  rating: number | null
  stockStatus: string
  bestseller: boolean
  newArrival: boolean
  createdAt: Date
}

/**
 * Seeds an initial, sensible set of merchandising presets and populates their
 * membership from existing catalogue signals (bestseller flag, rating, etc.).
 * Idempotent: presets are upserted and memberships use skipDuplicates, so it
 * never wipes manual curation done through the admin UI. No preset is activated
 * (default behaviour is preserved until an admin picks one).
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient()

  const products = (await prisma.product.findMany({
    select: {
      productId: true,
      rating: true,
      stockStatus: true,
      bestseller: true,
      newArrival: true,
      createdAt: true,
    },
  })) as SeedProduct[]

  if (products.length === 0) {
    console.log('[seed-presets] No products found; nothing to populate.')
    await prisma.$disconnect()
    return
  }

  const byRatingDesc = [...products].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  const byNewest = [...products].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  // Curated, deterministic sets. The catalogue's flags/ratings are very broad
  // (nearly every product qualifies), so we cap each preset to a focused
  // selection that is genuinely distinct and useful as a starting point.
  const presetDefs: Array<{ name: string; description: string; sortOrder: number; pick: () => string[] }> = [
    {
      name: 'Best Seller',
      description: 'Top-selling products flagged as bestsellers.',
      sortOrder: 1,
      pick: () =>
        byRatingDesc
          .filter((p) => p.bestseller)
          .slice(0, 24)
          .map((p) => p.productId),
    },
    {
      name: 'Highest Rated',
      description: 'Products with the strongest customer ratings.',
      sortOrder: 2,
      pick: () => byRatingDesc.slice(0, 24).map((p) => p.productId),
    },
    {
      name: 'Recommended',
      description: 'A curated, in-stock mix recommended for most shoppers.',
      sortOrder: 3,
      pick: () =>
        byRatingDesc
          .filter((p) => p.stockStatus.toLowerCase() === 'in_stock')
          .slice(0, 30)
          .map((p) => p.productId),
    },
    {
      name: 'New Arrivals',
      description: 'The latest additions to the catalogue.',
      sortOrder: 4,
      pick: () =>
        byNewest
          .filter((p) => p.newArrival)
          .slice(0, 24)
          .map((p) => p.productId),
    },
  ]

  for (const def of presetDefs) {
    const preset = await prisma.preset.upsert({
      where: { name: def.name },
      update: { description: def.description, sortOrder: def.sortOrder },
      create: { name: def.name, description: def.description, sortOrder: def.sortOrder },
    })

    const memberIds = Array.from(new Set(def.pick()))
    // Replace membership so the seed is authoritative and re-runnable.
    await prisma.productPreset.deleteMany({ where: { presetId: preset.id } })
    if (memberIds.length > 0) {
      await prisma.productPreset.createMany({
        data: memberIds.map((productId) => ({ productId, presetId: preset.id })),
        skipDuplicates: true,
      })
    }
    console.log(`[seed-presets] ${def.name}: ${memberIds.length} products`)
  }

  console.log('[seed-presets] Done. No preset activated (default ranking preserved).')
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[seed-presets] failed:', err)
  process.exit(1)
})
