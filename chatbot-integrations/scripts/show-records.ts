import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany({
    take: 5,
  })
  console.log(JSON.stringify(products, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
