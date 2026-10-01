import * as dotenv from 'dotenv'
import path from 'path'
import * as readline from 'readline'
import { fileURLToPath } from 'url'
import { getPrismaClient } from '../../db/prisma.js'
import { hashPassword, validatePasswordStrength } from './password.js'

// Manage dashboard users from the server shell. There is intentionally no public sign-up.
//
//   npm run admin -- create --email you@company.com [--name "Your Name"]
//   npm run admin -- reset-password --email you@company.com
//   npm run admin -- deactivate --email you@company.com
//   npm run admin -- activate --email you@company.com
//   npm run admin -- list
//
// In the production image (no tsx): node dist/core/auth/admin-cli.js <command> ...
// For non-interactive use, set ADMIN_PASSWORD instead of typing the password.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

const USAGE = `Usage:
  admin create --email <email> [--name <name>]
  admin reset-password --email <email>
  admin deactivate --email <email>
  admin activate --email <email>
  admin list`

function parseArgs(argv: string[]): { command?: string; flags: Record<string, string> } {
  const [command, ...rest] = argv
  const flags: Record<string, string> = {}
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      flags[arg.slice(2)] = rest[i + 1] ?? ''
      i += 1
    }
  }
  return { command, flags }
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const output = rl as unknown as { _writeToOutput: (text: string) => void; output: NodeJS.WriteStream }
    let muted = false
    output._writeToOutput = (text: string) => {
      if (!muted) output.output.write(text)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

async function readNewPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD
  const password = fromEnv ?? (await promptHidden('Password: '))
  const error = validatePasswordStrength(password)
  if (error) throw new Error(error)

  if (!fromEnv) {
    const confirm = await promptHidden('Confirm password: ')
    if (confirm !== password) throw new Error('Passwords do not match')
  }
  return password
}

function requireEmail(flags: Record<string, string>): string {
  const email = flags.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`A valid --email is required\n\n${USAGE}`)
  }
  return email
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2))
  const prisma = getPrismaClient()

  try {
    switch (command) {
      case 'create': {
        const email = requireEmail(flags)
        if (await prisma.adminUser.findUnique({ where: { email } })) {
          throw new Error(`Admin ${email} already exists (use reset-password to change the password)`)
        }
        const password = await readNewPassword()
        await prisma.adminUser.create({
          data: { email, name: flags.name?.trim() || null, passwordHash: await hashPassword(password) },
        })
        console.log(`Created admin ${email}`)
        break
      }
      case 'reset-password': {
        const email = requireEmail(flags)
        const user = await prisma.adminUser.findUnique({ where: { email } })
        if (!user) throw new Error(`Admin ${email} not found`)
        const password = await readNewPassword()
        await prisma.adminUser.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
        })
        await prisma.adminSession.deleteMany({ where: { userId: user.id } })
        console.log(`Password reset for ${email}; existing sessions signed out`)
        break
      }
      case 'deactivate':
      case 'activate': {
        const email = requireEmail(flags)
        const isActive = command === 'activate'
        const user = await prisma.adminUser.update({ where: { email }, data: { isActive } }).catch(() => null)
        if (!user) throw new Error(`Admin ${email} not found`)
        if (!isActive) {
          await prisma.adminSession.deleteMany({ where: { userId: user.id } })
        }
        console.log(`${isActive ? 'Activated' : 'Deactivated'} admin ${email}`)
        break
      }
      case 'list': {
        const users = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } })
        if (users.length === 0) {
          console.log('No admin users yet. Create one with: admin create --email <email>')
        }
        for (const user of users) {
          const status = user.isActive ? 'active' : 'inactive'
          const lastLogin = user.lastLoginAt?.toISOString() ?? 'never'
          console.log(`${user.email}\t${status}\tlast login: ${lastLogin}${user.name ? `\t${user.name}` : ''}`)
        }
        break
      }
      default:
        console.log(USAGE)
        process.exitCode = command ? 1 : 0
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: Error) => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
