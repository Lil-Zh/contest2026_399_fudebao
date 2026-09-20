import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRoundWatch } from './check-round-watch.mjs'

async function makeProject({ designWidth = 466, recovery = '<div class="screen round screen-round"><div class="fit fit-round"></div></div><style>.screen { overflow: hidden; }</style>' } = {}) {
  const project = await mkdtemp(join(tmpdir(), 'footprint-round-qa-'))
  await mkdir(join(project, 'src', 'pages', 'Recovery'), { recursive: true })
  await mkdir(join(project, 'test'), { recursive: true })
  await writeFile(join(project, 'src', 'config-watch.json'), JSON.stringify({ config: { designWidth } }))
  await writeFile(join(project, 'src', 'pages', 'Recovery', 'index.ux'), recovery)
  for (const name of ['vertical_balance', 'round_layout', 'recovery_round_layout', 'history_delete', 'prematch_round_stability']) {
    await writeFile(join(project, 'test', `${name}.test.mjs`), '')
  }
  return project
}

{
  const project = await makeProject()
  const result = await checkRoundWatch(project)
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
}

{
  const project = await makeProject({ designWidth: 390 })
  const result = await checkRoundWatch(project)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('designWidth must be 466')))
}

{
  const project = await makeProject({ recovery: 'screen fit' })
  const result = await checkRoundWatch(project)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Recovery root must include screen-round')))
  assert.ok(result.errors.some(error => error.includes('Recovery content must include fit-round')))
}

console.log('check-round-watch tests passed')
