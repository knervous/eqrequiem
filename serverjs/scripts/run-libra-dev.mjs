import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "libra:api:dev"], { stdio: "inherit" }),
  spawn(npm, ["run", "libra:ui:dev"], { stdio: "inherit" }),
];
let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal));
}

for (const child of children) {
  child.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      process.exitCode = code ?? (signal ? 1 : 0);
      stop();
    }
  });
}
