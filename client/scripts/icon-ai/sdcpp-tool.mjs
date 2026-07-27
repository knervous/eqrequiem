#!/usr/bin/env node

import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_MODEL,
  SDCPP_BINARY,
  SDCPP_BUILD,
  SDCPP_COMMIT,
  SDCPP_RELEASE,
  SDCPP_SOURCE,
  SdCppServer,
  exists,
  runProcess,
} from './sdcpp-server.mjs';

async function build() {
  if (!(await exists(path.join(SDCPP_SOURCE, '.git')))) {
    await runProcess('git', [
      'clone',
      '--recursive',
      '--branch',
      SDCPP_RELEASE,
      '--depth',
      '1',
      'https://github.com/leejet/stable-diffusion.cpp.git',
      SDCPP_SOURCE,
    ]);
  }
  await runProcess('git', ['-C', SDCPP_SOURCE, 'submodule', 'update', '--init', '--recursive']);
  await runProcess('cmake', [
    '-S',
    SDCPP_SOURCE,
    '-B',
    SDCPP_BUILD,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DSD_METAL=ON',
    '-DSD_SERVER_BUILD_FRONTEND=OFF',
    '-DGGML_CCACHE=OFF',
  ]);
  await runProcess('cmake', ['--build', SDCPP_BUILD, '--config', 'Release', '--parallel']);
}

async function doctor() {
  const model = process.env.ICON_AI_MODEL_PATH ?? DEFAULT_MODEL;
  const binary = process.env.SDCPP_BIN ?? process.env.SDCPP_BINARY ?? SDCPP_BINARY;
  const modelStats = (await exists(model)) ? await stat(model) : null;
  console.log(`stable-diffusion.cpp release: ${SDCPP_RELEASE}`);
  console.log(`pinned commit: ${SDCPP_COMMIT}`);
  console.log(`server: ${binary} (${(await exists(binary)) ? 'ready' : 'missing'})`);
  console.log(
    `model: ${model} (${modelStats ? `${(modelStats.size / 1024 ** 3).toFixed(2)} GiB` : 'missing'})`,
  );
  if (!(await exists(binary)) || !modelStats) process.exitCode = 1;
}

async function serve() {
  const server = new SdCppServer();
  const stop = async () => {
    await server.stop();
    process.exit();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await server.start();
  console.log(`sd.cpp ready at ${server.baseUrl}`);
  await new Promise((resolve) => server.child.once('exit', resolve));
}

const command = process.argv[2] ?? 'doctor';
if (command === 'build') await build();
else if (command === 'doctor') await doctor();
else if (command === 'serve') await serve();
else throw new Error(`Unknown command "${command}". Use build, doctor, or serve.`);
