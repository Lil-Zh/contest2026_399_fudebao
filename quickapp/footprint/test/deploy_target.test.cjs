const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '..', 'auto-start.cjs'), 'utf8')

assert.match(source, /const APP_DIR = '\/data\/app\/' \+ PKG;/, 'the refresh target must be the simulator runtime app directory')
assert.match(source, /shell', 'unzip', '-o', targetRpk, '-d', APP_DIR/, 'a registered package is refreshed where the runtime reads it')
assert.doesNotMatch(source, /\/data\/quickapp\/app\/' \+ PKG \+ '\/manifest\.json'/, 'the RPK staging directory must not be mistaken for the live package directory')

console.log('deploy target tests passed')
