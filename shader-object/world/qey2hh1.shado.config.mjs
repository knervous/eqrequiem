import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidate =
  process.env.SHADO_QEY2HH1_GLB ??
  path.resolve(here, '../../assets/reference/everquest_rof2/zones/qey2hh1.glb.gz');

export default {
  worlds: {
    name: 'qey2hh1',
    input: candidate,
    outFile: path.resolve(here, '../sandbox/public/shado/worlds/qey2hh1.spatial.json.gz'),
    runtimeSource: '/shado/worlds/qey2hh1.glb.gz',
    copyInputTo: path.resolve(here, '../sandbox/public/shado/worlds/qey2hh1.glb.gz'),
    authoringInput: path.resolve(
      here,
      '../sandbox/public/shado/worlds/qey2hh1.authoring.json'
    ),
    metadataInput: path.resolve(
      here,
      '../../assets/reference/everquest_rof2/zones/qey2hh1.json'
    ),
    tileSize: 256,
    maxClusterTriangles: 128,
  },
};
