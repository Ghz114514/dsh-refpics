/* Simulated-browser smoke for the built client bundle: evaluates
 * lib/client.js with a stubbed window.__ModuleLoader__ / document, runs the
 * factory with a react stub, and asserts the exported plugin face plus the
 * service wiring (toolview slot, sessions capture, sidebar board tab).
 * Run: node scripts/smoke-client.mjs
 */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let registered = null
const elementStub = () => ({
  style: {},
  dataset: {},
  set textContent(_) {},
  appendChild() {},
})
const windowStub = {
  __ModuleLoader__: {
    load(handoff) {
      registered = handoff
    },
  },
  document: {
    documentElement: { lang: 'zh' },
    head: { appendChild() {} },
    createElement: elementStub,
    querySelector: () => null,
  },
  location: { origin: 'http://127.0.0.1:3080' },
  setTimeout,
}

const context = vm.createContext({
  window: windowStub,
  document: windowStub.document,
  location: windowStub.location,
  console,
  Symbol,
  Object,
  JSON,
})
vm.runInContext(source, context)

if (registered === null) throw new Error('bundle did not register a module via window.__ModuleLoader__.load')
console.log('module id:', registered.id)

const reactStub = {
  memo: (fn) => fn,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useState: (initial) => [initial, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}
const requireStub = (specifier) => {
  if (specifier === 'react') return reactStub
  if (specifier === 'react/jsx-runtime') {
    return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }
  }
  throw new Error(`unexpected require: ${specifier}`)
}

const exports = registered.factory(requireStub)
console.log('exports keys:', Object.keys(exports).join(', '))
console.log('inject:', JSON.stringify(exports.inject))
if (typeof exports.apply !== 'function') throw new Error('client bundle exports no apply()')

// Drive apply with fake client services and verify every wiring branch.
let slotRegistration = null
let tabDescriptor = null
let capturedSessions = null
const sentPrompts = []
const openedTabs = []
const fakeSlots = {
  inject: (_key, callback) => callback(),
  register: (options, component) => {
    slotRegistration = { options, component }
    return () => {}
  },
}
const fakeSession = {
  sessionId: 's1',
  prompt: (content, mode) => {
    sentPrompts.push({ id: 's1', text: content.map((part) => part.text ?? '').join(''), mode })
    return Promise.resolve({ ok: true })
  },
}
const fakeSessions = {
  scope: (id) => ({ __sessionTag: id }),
  sessionOf: () => fakeSession,
  binding: () => ({ session: fakeSession }),
}
const fakeSidebar = {
  registerTab: (descriptor) => {
    tabDescriptor = descriptor
    return () => {}
  },
  openTab: (seed, scope) => {
    openedTabs.push({ seed, scope })
  },
}
const fakeCtx = {
  effect: (callback) => {
    callback()
    return () => {}
  },
  inject: (deps, callback) => {
    const scope = {}
    if (deps.includes('sessions')) {
      scope.sessions = fakeSessions
      capturedSessions = fakeSessions
    }
    if (deps.includes('betterSidebar')) scope.betterSidebar = fakeSidebar
    if (deps.includes('slots')) scope.slots = fakeSlots
    callback(scope)
  },
}
exports.apply(fakeCtx)

if (slotRegistration === null) throw new Error('keyed toolview slot never registered')
console.log('toolview slot:', JSON.stringify({ name: slotRegistration.options.name, key: slotRegistration.options.key }))
if (tabDescriptor === null) throw new Error('sidebar board tab never registered')
console.log('sidebar tab:', JSON.stringify({ id: tabDescriptor.id, single: tabDescriptor.single, order: tabDescriptor.order }))
if (typeof tabDescriptor.component !== 'function') throw new Error('tab descriptor has no component')
if (capturedSessions === null) throw new Error('sessions service never captured')

// Exercise the tab component's board store path (render with empty state).
const boardNode = tabDescriptor.component({ scope: { sessionId: 's1' }, visible: true, tab: { id: 'refpics:board', type: 'refpics:board', title: '参考图' } })
console.log('board component renders:', boardNode !== null && typeof boardNode === 'object')

// Drive the toolview's 换一批 / 翻页 / 在侧边栏打开 click path end to end.
const sampleOutcome = {
  query: 'pop art',
  provider: 'openverse',
  page: 1,
  perPage: 12,
  total: 240,
  truncated: true,
  images: [{
    id: 'openverse:x1',
    url: 'https://example.org/full.jpg',
    thumbUrl: 'https://example.org/thumb.jpg',
    width: 800,
    height: 600,
    title: 'Pop art sample',
  }],
}
const settledBlock = {
  kind: 'tool-result',
  seq: 10,
  time: Date.now(),
  callId: 'c1',
  call: { name: 'search_refs', argsRaw: '{}' },
  callTime: null,
  content: [{ type: 'text', text: 'x' }],
  isError: false,
  callView: null,
  resultView: null,
  subCalls: [],
  meta: sampleOutcome,
}
const toolviewNode = slotRegistration.component({ callId: 'c1', toolName: 'search_refs', block: settledBlock, openFile: () => {}, sessionId: 's1' })

/** Walk the stubbed jsx tree, collecting button-like nodes with their labels. */
function walk(node, out) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out)
    return
  }
  // Function components: materialize one render pass and keep walking.
  if (typeof node.type === 'function') {
    walk(node.type(node.props), out)
    return
  }
  if (typeof node.type === 'string' && node.type === 'button') {
    const label = node.props?.children
    out.push({ label: typeof label === 'string' ? label : JSON.stringify(label), onClick: node.props?.onClick })
  }
  for (const key of ['children', 'caption', 'overlay']) {
    const value = node.props?.[key]
    if (value !== undefined) walk(value, out)
  }
}
const buttons = []
walk(toolviewNode, buttons)
const byLabel = (text) => buttons.find((button) => typeof button.label === 'string' && button.label.includes(text))
const refreshButton = byLabel('换一批')
const nextPageButton = byLabel('下一页')
const openBoardButton = byLabel('在侧边栏打开')
if (refreshButton === undefined) throw new Error('换一批 button missing from the toolview tree')
if (nextPageButton === undefined) throw new Error('翻页 button missing from the toolview tree')
if (openBoardButton === undefined) throw new Error('在侧边栏打开 button missing from the toolview tree')

refreshButton.onClick()
await new Promise((resolve) => setImmediate(resolve))
if (sentPrompts.length !== 1) throw new Error(`expected 1 sent prompt after 换一批, got ${sentPrompts.length}`)
if (!sentPrompts[0].text.includes('pop art')) throw new Error('refresh prompt lost the query')
if (sentPrompts[0].mode !== 'queue') throw new Error('prompt mode must be queue')
console.log('换一批 click -> session.prompt(queue) ok:', sentPrompts[0].text.slice(0, 60) + '...')

nextPageButton.onClick()
await new Promise((resolve) => setImmediate(resolve))
if (sentPrompts.length !== 2) throw new Error(`expected 2 sent prompts after 翻页, got ${sentPrompts.length}`)
if (!sentPrompts[1].text.includes('page: 2')) throw new Error('next-page prompt lost page 2')
console.log('翻页 click -> session.prompt(queue) ok:', sentPrompts[1].text.slice(0, 60) + '...')

openBoardButton.onClick()
if (openedTabs.length !== 1) throw new Error(`expected 1 openTab call, got ${openedTabs.length}`)
if (openedTabs[0].seed.type !== 'refpics:board') throw new Error('openTab targeted the wrong tab type')
if (openedTabs[0].seed.path === undefined) throw new Error('openTab seed lost the content path marker (panel would not expand)')
console.log('在侧边栏打开 click -> openTab ok:', JSON.stringify({ type: openedTabs[0].seed.type, path: openedTabs[0].seed.path }))

// The board must mirror the clicked wall's outcome (not just the latest).
const mirroredBoard = tabDescriptor.component({ scope: { sessionId: 's1' }, visible: true, tab: { id: 'refpics:board', type: 'refpics:board', title: '参考图' } })
const mirroredButtons = []
walk(mirroredBoard, mirroredButtons)
const mirrorHasQuery = mirroredButtons.some((button) => typeof button.label === 'string' && button.label.includes('下一页'))
const boardTexts = []
walkText(mirroredBoard, boardTexts)
const boardShowsOutcome = boardTexts.some((text) => String(text).includes('pop art'))
if (!boardShowsOutcome) throw new Error('board did not mirror the clicked wall outcome')
console.log('board mirror -> shows clicked wall outcome:', boardShowsOutcome, '| wall actions present:', mirrorHasQuery)
console.log('CLIENT BUNDLE OK')

/** Walk the tree collecting every text node for content assertions. */
function walkText(node, out) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walkText(item, out)
    return
  }
  if (typeof node.type === 'function') {
    walkText(node.type(node.props), out)
    return
  }
  if (typeof node.type === 'string' && (node.type === 'span' || node.type === 'div' || node.type === 'button')) {
    const children = node.props?.children
    if (typeof children === 'string' || typeof children === 'number') out.push(children)
  }
  for (const key of ['children', 'caption', 'overlay']) {
    const value = node.props?.[key]
    if (value !== undefined) walkText(value, out)
  }
}
