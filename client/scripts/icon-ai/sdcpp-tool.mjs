#!/usr/bin/env node

import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
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
import { DEFAULT_BACKGROUND_MODEL } from './background-removal.mjs';

const execFileAsync = promisify(execFile);

async function sourceCommit() {
  if (!(await exists(path.join(SDCPP_SOURCE, '.git')))) return null;
  const { stdout } = await execFileAsync('git', ['-C', SDCPP_SOURCE, 'rev-parse', 'HEAD']);
  return stdout.trim();
}

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
  const actualCommit = await sourceCommit();
  if (actualCommit !== SDCPP_COMMIT) {
    throw new Error(
      `stable-diffusion.cpp source is ${actualCommit ?? 'unresolved'}; ` +
        `expected pinned commit ${SDCPP_COMMIT}. Move the local source aside and rerun build.`,
    );
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
  const backgroundModel =
    process.env.ICON_AI_BACKGROUND_MODEL ?? DEFAULT_BACKGROUND_MODEL;
  const backgroundModelStats = (await exists(backgroundModel))
    ? await stat(backgroundModel)
    : null;
  const actualCommit = await sourceCommit();
  console.log(`stable-diffusion.cpp release: ${SDCPP_RELEASE}`);
  console.log(
    `source commit: ${actualCommit ?? 'missing'} ` +
      `(${actualCommit === SDCPP_COMMIT ? 'pinned' : `expected ${SDCPP_COMMIT}`})`,
  );
  console.log(`server: ${binary} (${(await exists(binary)) ? 'ready' : 'missing'})`);
  console.log(
    `model: ${model} (${modelStats ? `${(modelStats.size / 1024 ** 3).toFixed(2)} GiB` : 'missing'})`,
  );
  console.log(
    `background model: ${backgroundModel} ` +
      `(${backgroundModelStats ? `${(backgroundModelStats.size / 1024 ** 2).toFixed(1)} MiB` : 'optional/missing'})`,
  );
  if (
    !(await exists(binary)) ||
    !modelStats ||
    actualCommit !== SDCPP_COMMIT
  ) {
    process.exitCode = 1;
  }
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
