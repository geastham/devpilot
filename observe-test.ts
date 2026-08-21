import { BridgeClient } from '@devpilot.sh/bridge-client';
import { SessionObserver } from './packages/cli/src/commands/bridge/observer';

const client = new BridgeClient({
  bridgeUrl: process.argv[2],
  token: 'dp_orch_4JI-DP0b_mFQnDo-06wiD-QeyayJle9myTsPddqUVnM',
});
const observer = new SessionObserver({
  client,
  machineName: 'mac.lan',
  repos: [],
  onLog: (l) => console.log('  log:', l),
});
async function main() {
  const t0 = Date.now();
  const first = await observer.sweep();
  console.log('sweep 1:', first, `(${Date.now() - t0}ms)`);
  const second = await observer.sweep();
  console.log('sweep 2 (idempotence):', second);
}
void main();
