import { readdir, rm } from 'node:fs/promises'

for (const name of await readdir('dist/assets')) {
  if (/^ort-.*\.wasm$/.test(name)) await rm(`dist/assets/${name}`)
}
