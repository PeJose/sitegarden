import { Panel } from '../ui/Panels'
import { TileLayer } from '../map/TileLayer'
import { Labels, Live } from '../map/WorldLayer'
import { registry } from './registry'

// The first-party map layers and side-panel tabs, in the order they have always stacked.
registry.add({ id: 'layer:garden:tiles', slot: 'map', input: 'layers', order: 10, render: ({ world, scheme, view }) => <TileLayer world={world} scheme={scheme} view={view} /> })
registry.add({ id: 'layer:garden:live', slot: 'map', input: 'layers', order: 20, render: ({ world, scheme }) => <Live world={world} scheme={scheme} /> })
registry.add({ id: 'layer:garden:labels', slot: 'map', input: 'layers', order: 30, render: ({ world }) => <Labels world={world} /> })
for (const kind of ['inventory', 'links'] as const) {
  registry.add({ id: `tab:essentials:${kind}`, slot: 'sidepanel', input: 'tabs', render: ({ onClose, onPick }) => <Panel kind={kind} onClose={onClose} onPick={onPick} /> })
}
