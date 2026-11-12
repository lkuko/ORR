"""Exercise real rotation/rollback scripts with fake Docker and curl in isolated folders.

Run as root in Linux (no server connection):
  wsl.exe -u root --exec python3 /mnt/e/wechat/ORR/scripts/test-wechat-rotation.py
Only the fixed deployment root is replaced in fixture copies. No real secrets are read.
"""
import os
from pathlib import Path
import subprocess
import tempfile


REPO = Path(__file__).resolve().parent.parent
NEW_APP = 'wx2222222222222222'
NEW_CONFIG = f'WECHAT_APP_ID="{NEW_APP}"\nWECHAT_APP_SECRET="' + 'b' * 32 + '"\n'
OLD_WECHAT = 'WECHAT_APP_ID="wx1111111111111111"\nWECHAT_APP_SECRET="' + 'a' * 32 + '"\n'
SERVER = 'TOKEN_SECRET="unchanged-test-token"\nADMIN_USERNAME="admin"\n'
DOCKER = r'''#!/bin/bash
set -eu
printf '%s\n' "$*" >> "$TEST_LOG"
case " $* " in
  *' config --quiet '*) point=config ;;
  *' up -d --no-deps --force-recreate --wait --wait-timeout 120 api '*) point=api ;;
  *' exec -T admin nginx -t '*|*' exec -T admin nginx -s reload '*) point=nginx ;;
  *' exec -T api node - '*) point=wechat; cat >/dev/null ;;
  *) printf 'Unexpected Docker command\n' >&2; exit 90 ;;
esac
if [[ $TEST_FAIL == "$point" ]] && grep -q wx2222222222222222 "$TEST_ROOT/secrets/wechat.env" 2>/dev/null; then
  printf 'Simulated failure: %s\n' "$point" >&2
  exit 1
fi
'''
CURL = r'''#!/bin/bash
set -eu
if [[ $TEST_FAIL == ready ]] && grep -q wx2222222222222222 "$TEST_ROOT/secrets/wechat.env" 2>/dev/null; then exit 1; fi
printf '{"status":"ready"}'
'''


def run_case(failure='', separate=False, invalid=False):
    with tempfile.TemporaryDirectory(prefix='campus-rotation-test-') as folder:
        work = Path(folder)
        root = work / 'campus'
        package = work / 'package'
        for relative in ['campus/state', 'campus/secrets', 'campus/app/deploy', 'package/deploy', 'bin']:
            (work / relative).mkdir(parents=True, exist_ok=True)
        for name in ['rotate-wechat.sh', 'rollback-wechat.sh']:
            source = (REPO / 'deploy' / name).read_text().replace('root=/opt/campus-internal', f'root={root}')
            (package / 'deploy' / name).write_text(source)
        original_server = SERVER + ('' if separate else OLD_WECHAT)
        (root / 'secrets/server.env').write_text(original_server)
        if separate:
            (root / 'secrets/wechat.env').write_text(OLD_WECHAT)
        (root / 'secrets/compose.env').write_text('APP_VERSION=test\n')
        (root / 'secrets/db-password').write_text('database-must-stay-unchanged')
        (root / 'app/deploy/internal.compose.yaml').write_text('old-compose\n')
        (root / 'state/install-complete').touch()
        (package / 'deploy/internal.compose.yaml').write_text('new-compose\n')
        (package / 'wechat.env').write_text(NEW_CONFIG + ('UNEXPECTED=value\n' if invalid else ''))
        for name, source in [('docker', DOCKER), ('curl', CURL)]:
            executable = work / 'bin' / name
            executable.write_text(source)
            executable.chmod(0o700)
        env = {**os.environ, 'PATH': str(work / 'bin') + ':' + os.environ['PATH'],
               'TEST_LOG': str(work / 'commands.log'), 'TEST_ROOT': str(root), 'TEST_FAIL': failure}
        result = subprocess.run(['bash', str(package / 'deploy/rotate-wechat.sh'), str(package), NEW_APP],
                                env=env, capture_output=True, text=True, timeout=15)
        output = result.stdout + result.stderr
        assert ('a' * 32) not in output and ('b' * 32) not in output
        assert (root / 'secrets/db-password').read_text() == 'database-must-stay-unchanged'
        if not failure and not invalid:
            assert result.returncode == 0, output
            assert 'CAMPUS_WECHAT_ROTATION_COMPLETE' in output
            assert (root / 'secrets/server.env').read_text() == SERVER
            assert (root / 'secrets/wechat.env').read_text() == NEW_CONFIG
            snapshot = next((root / 'state').glob('wechat-rotation-*'))
            restored = subprocess.run(['bash', str(snapshot / 'rollback-wechat.sh'), str(snapshot)],
                                      env=env, capture_output=True, text=True, timeout=15)
            assert restored.returncode == 0, restored.stdout + restored.stderr
            assert 'CAMPUS_WECHAT_ROLLBACK_COMPLETE' in restored.stdout
        else:
            assert result.returncode != 0, output
            assert 'CAMPUS_WECHAT_ROTATION_COMPLETE' not in output
            if not invalid:
                assert 'CAMPUS_WECHAT_ROLLBACK_COMPLETE' in output, output
        assert (root / 'secrets/server.env').read_text() == original_server
        assert (root / 'app/deploy/internal.compose.yaml').read_text() == 'old-compose\n'
        assert (root / 'secrets/wechat.env').exists() == separate
        if separate:
            assert (root / 'secrets/wechat.env').read_text() == OLD_WECHAT
        if invalid:
            assert not (work / 'commands.log').exists()
        else:
            commands = (work / 'commands.log').read_text()
            assert 'exec -T admin nginx -s reload' in commands
            assert ' down ' not in commands and ' db ' not in commands
        print(f'PASS rotation: failure={failure or "none"}, prior-wechat-file={separate}, invalid={invalid}')


if __name__ == '__main__':
    assert os.geteuid() == 0, 'Run this isolated Linux test as root for the deployment guard'
    for previous in [False, True]:
        run_case(separate=previous)
        run_case(separate=previous, invalid=True)
        for point in ['config', 'api', 'nginx', 'ready', 'wechat']:
            run_case(failure=point, separate=previous)
