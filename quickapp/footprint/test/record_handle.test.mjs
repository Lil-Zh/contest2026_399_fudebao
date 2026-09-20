import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Record/index.ux', import.meta.url), 'utf8')
const handles = source.match(/class="page-grabber" onclick="openPanel"/g) || []

assert.equal(handles.length, 2, 'record and control pages each expose one top drag handle that opens the information panel')
assert.match(source, /\.page-grabber\s*\{[^}]*height:\s*14px;[^}]*justify-content:\s*center;/, 'the drag handle gets a compact centered hit area')
assert.match(source, /<div class="page-grabber" onclick="openPanel">\s*<div class="grabber"><\/div>/, 'the page hint reuses the established panel grabber visual')

console.log('record handle tests passed')
