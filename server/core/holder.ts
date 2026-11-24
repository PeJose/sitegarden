import { ConfigError, type Graph } from './graph'

// The graph the server runs on. A reload that fails validation keeps the last good one and says why.
export function createHolder(load: () => Graph, emit: (type: string, data: unknown) => void) {
  let graph: Graph | null = null
  return {
    get: () => graph,
    reload(): boolean {
      try {
        graph = load()
        emit('config.loaded', { groups: graph.groups.length, nodes: graph.nodes.length, edges: graph.edges.length })
        return true
      } catch (e) {
        const issues = e instanceof ConfigError ? e.issues : [{ line: 1, path: '', message: (e as Error).message }]
        console.error(`[config] invalid, keeping the last good graph:\n${(e as Error).message}`)
        emit('config.invalid', { message: (e as Error).message, issues })
        return false
      }
    },
  }
}
