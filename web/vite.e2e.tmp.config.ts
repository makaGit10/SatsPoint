// TEMPORAIRE (agent e2e) — à supprimer : le port 5190 est occupé par un Vite mock lancé par un autre processus.
import base from './vite.config'
const API = 'http://localhost:8120'
const entetes = { origin: 'http://localhost:5190', referer: 'http://localhost:5190/' }
const cfg: any = base
cfg.server = {
  port: 5191,
  strictPort: true,
  host: 'localhost',
  proxy: Object.fromEntries(
    Object.entries(cfg.server.proxy).map(([k, v]: [string, any]) => [k, { ...v, target: API, headers: entetes }]),
  ),
}
export default cfg
cfg.preview = { port: 5192, strictPort: true, host: 'localhost', proxy: cfg.server.proxy }
