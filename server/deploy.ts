// Pure builder for `sg deploy`: argv arrays to run here, shell lines to run on the host. sg.ts only parses flags and executes.
export type Build = 'ci' | 'local' | 'server'
export interface DeployOpts {
  build: Build
  host: string // ssh target, e.g. "root@box.example -p 2222"
  dir: string // checkout on the host
  version?: string // default: 'latest' for ci, pkgVersion otherwise
  pkgVersion: string // this checkout's package.json version
  branch?: string // this checkout's branch, for server mode without --version
  arch?: string // host `uname -m` (or amd64/arm64); local mode only
}
export const IMAGE = 'ghcr.io/pejose/sitegarden'
const ARCH: Record<string, string> = { x86_64: 'amd64', amd64: 'amd64', aarch64: 'arm64', arm64: 'arm64' }
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

// "root@box -p 2222" -> ['-p', '2222', 'root@box']: the target is the first word, the rest are ssh options.
export const sshArgv = (host: string) => { const [t, ...o] = host.trim().split(/\s+/); return [...o, t] }
export const hostArch = (uname: string) => ARCH[uname.trim()] ?? (() => { throw new Error(`unsupported host architecture "${uname.trim()}" (amd64 and arm64 only)`) })()

// Waits up to 120 s for the app inside the stack; exit 5 with the last logs when it never answers.
const HEALTH = `for i in $(seq 60); do v=$(docker compose exec -T sitegarden node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>r.json()).then(j=>console.log(j.version),()=>process.exit(1))" 2>/dev/null) && [ -n "$v" ] && { echo "running version $v"; exit 0; }; sleep 2; done; docker compose logs --tail 30 sitegarden; exit 5`

export function deployPlan(o: DeployOpts): { local: string[][]; remote: string[] } {
  const version = o.version ?? (o.build === 'ci' ? 'latest' : o.pkgVersion), ssh = ['ssh', ...sshArgv(o.host)]
  const local: string[][] = [], remote = ['set -e', `cd ${q(o.dir)}`, `export SITEGARDEN_VERSION=${q(version)}`]
  if (o.build === 'ci') remote.push('docker compose pull sitegarden', 'docker compose up -d sitegarden')
  else if (o.build === 'local') {
    const tag = `${IMAGE}:${version}`, arch = o.arch ? hostArch(o.arch) : '<host arch>'
    local.push(['docker', 'buildx', 'build', '--platform', `linux/${arch}`, '--load', '-t', tag, '.'])
    local.push(['sh', '-c', `docker save ${tag} | gzip -1 | ${[...ssh, q('gunzip | docker load')].join(' ')}`])
    remote.push('docker compose up -d sitegarden')
  } else {
    // a given version means its release tag; otherwise whatever branch this checkout is on
    const ref = o.version ? `v${o.version}` : o.branch
    remote.push('git fetch --tags', `git checkout ${q(ref ?? `v${o.pkgVersion}`)}`)
    if (!o.version && o.branch) remote.push('git merge --ff-only @{u}')
    remote.push('nice -n 10 docker compose up -d --build sitegarden')
    remote.push('docker builder prune -f --keep-storage 1gb') // builds leave cache behind that image prune never touches; capped so a small disk never fills
  }
  remote.push('docker image prune -f', HEALTH)
  return { local, remote: [remote.join('\n')] }
}
