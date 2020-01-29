import { send, receive, fork, Operation, Context } from 'effection';
import { watch } from '@effection/events';
import { ChildProcess, fork as forkProcess } from '@effection/child_process';
import * as path from 'path';
import { assoc } from 'ramda';

import { State } from './orchestrator/state';

interface TestFileServerOptions {
  manifestPath: string;
  port: number;
  state: State;
};

function* loadManifest(outDir: string, state: State) {
  let fullPath = path.resolve(outDir, 'manifest.js');

  delete require.cache[fullPath];
  let manifest = yield import(fullPath);

  state.update(assoc('manifest', manifest));
}

export function* createTestFileServer(orchestrator: Context, options: TestFileServerOptions): Operation {
  // TODO: @precompile this should use node rather than ts-node when running as a compiled package
  let child: ChildProcess = yield forkProcess(
    './bin/parcel-server.ts',
    ['-p', `${options.port}`, '--out-file', 'manifest.js', '--global', '__bigtestManifest', options.manifestPath],
    {
      execPath: 'ts-node',
      execArgv: [],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    }
  );

  yield watch(child, "message", (message) => message)

  let { options: { outDir } } = yield receive({ type: "ready" });

  console.debug("[test files] test files initialized");

  yield fork(loadManifest(outDir, options.state));
  yield send({ ready: "test-files" }, orchestrator);

  while(true) {
    yield receive({ type: "update" });

    console.debug("[test files] test files updated");

    yield fork(loadManifest(outDir, options.state));
    yield send({ update: "test-files" }, orchestrator);
  }
}
