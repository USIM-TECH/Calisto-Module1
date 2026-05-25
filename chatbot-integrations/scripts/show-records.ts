import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany({
    where: { fallbackImageUrl: { not: null } },
    take: 5,
    select: {
      productId: true,
      productName: true,
      productType: true,
      category: true,
      fallbackImageUrl: true
    }
  })
  console.log(JSON.stringify(products, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
