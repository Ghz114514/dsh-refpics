/* Live end-to-end smoke: import the built host bundle, register the tool
 * through a fake context, and run one real Openverse search. Run:
 *   node scripts/smoke-host.mjs
 */
import { apply } from '../lib/index.js'
import { runBoardSearch, safeFileName, extensionFor } from '../lib/index.js'

let tool
const ctx = {
  inject: () => {},
  effect: () => () => {},
  tools: {
    register: (definition) => {
      tool = definition
      return () => {}
    },
  },
}

apply(ctx, {})
console.log('tool:', tool.name, '| timeoutMs:', tool.timeoutMs)

const args = { query: 'minimalist interior design living room' }
console.log('calling execute with omitted optional args (defaults must materialize)...')
const outcome = await tool.execute(args, { signal: undefined })
console.log('provider:', outcome.provider, '| total:', outcome.total, '| images:', outcome.images.length, '| truncated:', outcome.truncated)
for (const image of outcome.images.slice(0, 3)) {
  console.log(' -', image.id.slice(0, 32), `${image.width}x${image.height}`, (image.title ?? '').slice(0, 48))
}
console.log('render head:', tool.output.render(args, outcome)[0].text.split('\n')[0])
console.log('presentCall:', JSON.stringify(tool.presentCall(args)).slice(0, 120))
console.log('presentResult:', JSON.stringify(tool.presentResult(args, {
  content: tool.output.render(args, outcome),
  isError: false,
  meta: outcome,
})).slice(0, 160))
