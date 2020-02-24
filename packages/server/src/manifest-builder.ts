import { Operation } from 'effection';
import { Mailbox } from '@effection/events';
import { ChildProcess, fork as forkProcess } from '@effection/child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as fprint from 'fprint';
import { assoc } from 'ramda';

import { Atom } from './orchestrator/atom';

const { copyFile, mkdir } = fs.promises;

interface ManifestBuilderOptions {
  delegate: Mailbox;
  atom: Atom;
  srcPath: string;
  buildDir: string;
  distDir: string;
};

function* processManifest(options: ManifestBuilderOptions): Operation {
  let buildDir = path.resolve(options.buildDir, 'manifest.js');
  let fingerprint = yield fprint(buildDir, 'sha256');
  let name = `manifest-${fingerprint}.js`;
  let distPath = path.resolve(options.distDir, name);

  yield mkdir(path.dirname(distPath), { recursive: true });
  yield copyFile(buildDir, distPath);

  let manifest = yield import(distPath);
  manifest.name = name;
  options.atom.update(assoc('manifest', manifest));

  return distPath;
}

export function* createManifestBuilder(options: ManifestBuilderOptions): Operation {
  // TODO: @precompile this should use node rather than ts-node when running as a compiled package
  let child: ChildProcess = yield forkProcess(
    './bin/parcel-server.ts',
    ['--out-dir', options.buildDir, '--out-file', 'manifest.js', '--global', '__bigtestManifest', options.srcPath],
    {
      execPath: 'ts-node',
      execArgv: [],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    }
  );

  let messages = yield Mailbox.watch(child, "message", ({ args: [message] }) => message);

  yield messages.receive({ type: "ready" });
  let distPath = yield processManifest(options);

  console.debug("[manifest builder] manifest ready");
  options.delegate.send({ status: "ready", path: distPath });

  while(true) {
    yield messages.receive({ type: "update" });
    let distPath = yield processManifest(options);

    console.debug("[manifest builder] manifest updated");
    options.delegate.send({ event: "update", path: distPath });
  }
}
