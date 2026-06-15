import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const c = await prisma.customer.findFirst({ where: { phone: '60111222333' }, include: { interests: true, supportCases: true } })
  console.log(JSON.stringify(c, null, 2))
}
main()
