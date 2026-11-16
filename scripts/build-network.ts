// Writes the manifest and network files for both agent sites.
// Usage: tsx scripts/build-network.ts [--no-peer]   (PEER_LIBRARY_URL sets the peer, default http://localhost:5174/library_desk)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCampusNetwork, buildManifest, NETWORK_NAME } from '../network/campus-desk';
import { LIB_NETWORK, buildLibraryManifest, buildLibraryNetwork } from '../network/library-desk';
import type { CampusData } from '../src/data/model';

const root = join(import.meta.dirname, '..');
const dataDir = join(root, 'data', 'seed');
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
const data: CampusData = {
  department: read('department.json'),
  timetable: read('timetable.json'),
  notices: read('notices.json').notices,
  fees: read('fees.json'),
  exams: read('exams.json'),
};

const noPeer = process.argv.includes('--no-peer');
const peerUrl = noPeer ? undefined : (process.env.PEER_LIBRARY_URL ?? 'http://localhost:5174/library_desk');
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const pub = join(root, 'public');
writeFileSync(join(pub, 'agent-manifest.json'), json(buildManifest(data, { peerUrl })));
writeFileSync(join(pub, `${NETWORK_NAME}.network.json`), json(buildCampusNetwork(data, { peerUrl })));
writeFileSync(join(pub, 'links.json'), json({ version: 1, networks: { [NETWORK_NAME]: peerUrl ? { library_desk: peerUrl } : {} } }));
writeFileSync(join(pub, 'agent-mcp.json'), json(buildManifest(data, { peerUrl }).agent_mcp));

const lib = join(root, 'peer', 'library-desk');
mkdirSync(lib, { recursive: true });
writeFileSync(join(lib, 'agent-manifest.json'), json(buildLibraryManifest()));
writeFileSync(join(lib, `${LIB_NETWORK}.network.json`), json(buildLibraryNetwork()));
console.log(`Wrote manifests and networks. Peer: ${peerUrl ?? 'none'}`);
