const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: "postgres://605da4df6e5094a4274e868912663341172f125023483ba1e9d65c0839d5da30:sk_TpDbgKYDo8xPZAybjqS6O@db.prisma.io:5432/postgres?sslmode=require" } } })
async function main() {
  try {
    const prods = await prisma.product.findMany({ take: 1 });
    console.log("Connected successfully! Found products:", prods.length);
  } catch (e) {
    console.error("Connection failed:", e.message);
  } finally {
    await prisma.$disconnect()
  }
}
main()
