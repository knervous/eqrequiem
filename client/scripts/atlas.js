import fs from 'node:fs'
import path from 'node:path'
const atlasStr = fs.readFileSync('./atlas.json', 'utf-8')

const atlas = JSON.parse(atlasStr)


for (const entry of Object.values(atlas)) {
    entry.texture = entry.texture.toLowerCase().replace('tga', 'webp');
}
fs.writeFileSync('./atlas.json', JSON.stringify(atlas, null, 2), 'utf-8')
const stop = 23;