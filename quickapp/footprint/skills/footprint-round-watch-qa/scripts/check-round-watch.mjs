import { access, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const requiredTests = [
  'vertical_balance.test.mjs',
  'round_layout.test.mjs',
  'recovery_round_layout.test.mjs',
  'history_delete.test.mjs',
  'prematch_round_stability.test.mjs'
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function checkRoundWatch(projectRoot) {
  const root = resolve(projectRoot)
  const errors = []
  const configPath = resolve(root, 'src/config-watch.json')
  const recoveryPath = resolve(root, 'src/pages/Recovery/index.ux')

  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    if (config?.config?.designWidth !== 466) errors.push('config.designWidth must be 466 for the Footprint round-watch baseline')
  } catch {
    errors.push('src/config-watch.json is missing or invalid JSON')
  }

  let recovery = ''
  try {
    recovery = await readFile(recoveryPath, 'utf8')
  } catch {
    errors.push('src/pages/Recovery/index.ux is missing')
  }
  if (recovery) {
    if (!/class="[^"]*screen-round/.test(recovery)) errors.push('Recovery root must include screen-round')
    if (!/class="[^"]*fit-round/.test(recovery)) errors.push('Recovery content must include fit-round')
    if (!/\.screen\s*\{[\s\S]*?overflow:\s*hidden;/.test(recovery)) errors.push('Recovery must keep overflow hidden to prevent vertical scrolling')
  }

  for (const test of requiredTests) {
    if (!await exists(resolve(root, 'test', test))) errors.push(`required regression test is missing: test/${test}`)
  }
  return { ok: errors.length === 0, errors }
}

function runNode(cwd, args) {
  return new Promise(resolveRun => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' })
    child.on('close', code => resolveRun(code ?? 1))
    child.on('error', () => resolveRun(1))
  })
}

async function main() {
  const args = process.argv.slice(2)
  const shouldRun = args.includes('--run')
  const projectArg = args.find(arg => arg !== '--run' && arg !== '--help')
  if (args.includes('--help')) {
    console.log('Usage: node scripts/check-round-watch.mjs [project-root] [--run]')
    return
  }
  const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
  const defaultRoot = resolve(scriptDir, '../../..')
  const projectRoot = resolve(projectArg || defaultRoot)
  const result = await checkRoundWatch(projectRoot)
  if (!result.ok) {
    for (const error of result.errors) console.error(`FAIL: ${error}`)
    process.exitCode = 1
    return
  }
  console.log('PASS: Footprint round-watch structural checks')
  if (!shouldRun) return
  for (const test of requiredTests) {
    const code = await runNode(projectRoot, [`test/${test}`])
    if (code !== 0) {
      process.exitCode = code
      return
    }
  }
  console.log('PASS: Footprint round-watch regression checks')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
