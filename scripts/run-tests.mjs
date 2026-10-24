import {spawnSync} from 'node:child_process';
import {p} from './lib/util.mjs';
for(const file of ['scripts/test-extension.mjs','scripts/test-history-localization.mjs','tests/build-profile.test.mjs','tests/install-state.test.mjs','tests/installation-lock.test.mjs','tests/file-transaction.test.mjs','tests/installer-fault.test.mjs','tests/runtime-ui.test.mjs','tests/history-dom.test.mjs','tests/offline-client.test.mjs','tests/offline-host.test.mjs','tests/version-adapters.test.mjs','scripts/check-repository.mjs']){
  const result=spawnSync(process.execPath,[p(file)],{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status??1);
}
