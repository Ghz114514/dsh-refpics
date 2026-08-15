/**
 * Shared Pinterest-style wall components for dsh-refpics, rendered by both
 * the chat toolview (keyed tool.call.toolview entry) and the sidebar board
 * tab. Fully presentational: data arrives as props, side effects (agent
 * round trips, downloads, Eagle saves) arrive as callbacks, so the same
 * tree renders in both hosts. The lightbox owns keyboard navigation and
 * its download / save-to-Eagle action state.
 *
 * @module dsh-refpics/client/wall
 */

import { memo, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { openDownload, saveToEagle } from './actions.ts'
import { outcomeSummary, type RefImage, type RefPicsOutcome } from '../core/outcome.ts'
import { ensureStyle } from './styles.ts'

ensureStyle()

interface Copy {
  searching: string
  clickHint: string
  empty: string
  openSource: string
  openFull: string
  download: string
  saveEagle: string
  savedEagle: string
  savingEagle: string
  refresh: string
  nextPage: string
  openBoard: string
  search: string
  searchPlaceholder: string
  sent: string
  images: string
  close: string
  previous: string
  next: string
  of: string
  eagleUnavailable: string
}

const COPY: Record<'zh' | 'en', Copy> = {
  zh: {
    searching: '正在搜索参考图…',
    clickHint: '点击图片查看大图',
    empty: '没有找到匹配的图片，换一个更宽泛的描述再试试。',
    openSource: '原站',
    openFull: '原图',
    download: '下载',
    saveEagle: '存 Eagle',
    savedEagle: '已保存到 Eagle',
    savingEagle: '正在保存…',
    refresh: '换一批',
    nextPage: '下一页',
    openBoard: '在侧边栏打开',
    search: '搜索',
    searchPlaceholder: '描述你想找的参考图…',
    sent: '已发送，稍等新结果…',
    images: '张',
    close: '关闭',
    previous: '上一张',
    next: '下一张',
    of: '/',
    eagleUnavailable: 'Eagle 未运行 (请先打开 Eagle)',
  },
  en: {
    searching: 'Searching for reference images…',
    clickHint: 'Click any image to enlarge',
    empty: 'No matches found; try a broader description.',
    openSource: 'Source',
    openFull: 'Full size',
    download: 'Download',
    saveEagle: 'Save to Eagle',
    savedEagle: 'Saved to Eagle',
    savingEagle: 'Saving…',
    refresh: 'Shuffle',
    nextPage: 'Next page',
    openBoard: 'Open in sidebar',
    search: 'Search',
    searchPlaceholder: 'Describe the references you want…',
    sent: 'Sent; the next batch is on its way…',
    images: 'images',
    close: 'Close',
    previous: 'Previous',
    next: 'Next',
    of: '/',
    eagleUnavailable: 'Eagle is not running',
  },
}

/** Active copy dictionary, following the shell's document language. */
export function copy(): Copy {
  const lang = document.documentElement.lang ?? ''
  return lang === 'zh' || lang.startsWith('zh-') ? COPY.zh : COPY.en
}

/** Skeleton masonry shown while a search runs. */
export const RunningWall = memo(function RunningWall(): ReactNode {
  const t = copy()
  const ratios = [1.3, 0.8, 1.1, 0.7, 1.25, 0.95, 1.4, 0.75]
  return (
    <div className="rfp-root">
      <div className="rfp-wall" aria-hidden>
        {ratios.map((ratio, index) => (
          <div key={index} className="rfp-skel" style={{ aspectRatio: String(ratio) }} />
        ))}
      </div>
      <div className="rfp-hint">{t.searching}</div>
    </div>
  )
})

type EaglePhase = 'idle' | 'busy' | 'ok' | 'error'

/** Quick actions shared by the card overlay and the lightbox caption. */
function EagleSaveButton({ image }: { image: RefImage }): ReactNode {
  const t = copy()
  const [phase, setPhase] = useState<EaglePhase>('idle')
  const [message, setMessage] = useState('')
  const onClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    if (phase === 'busy') return
    setPhase('busy')
    setMessage('')
    void saveToEagle(image).then((result) => {
      setPhase(result.ok ? 'ok' : 'error')
      setMessage(result.message)
    })
  }, [image, phase])
  const label = phase === 'busy' ? t.savingEagle : phase === 'ok' ? t.savedEagle : t.saveEagle
  return (
    <button
      type="button"
      className="rfp-mini-btn"
      title={message.length > 0 ? message : undefined}
      disabled={phase === 'busy' || phase === 'ok'}
      onClick={onClick}
    >{label}</button>
  )
}

/** One image card in the wall. */
const Card = memo(function Card({ image, onOpen }: { image: RefImage; onOpen: (image: RefImage) => void }): ReactNode {
  const t = copy()
  const open = useCallback(() => onOpen(image), [image, onOpen])
  return (
    <figure
      className="rfp-card"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      }}
    >
      <img
        src={image.thumbUrl}
        alt={image.title ?? image.author ?? ''}
        loading="lazy"
        decoding="async"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      />
      <div className="rfp-card-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="rfp-mini-btn" onClick={() => openDownload(image)}>{t.download}</button>
        <EagleSaveButton image={image} />
      </div>
      <figcaption className="rfp-overlay">
        {image.title !== undefined && image.title.length > 0 && (
          <div className="rfp-title">{image.title}</div>
        )}
        {image.author !== undefined && image.author.length > 0 && (
          <div className="rfp-author">{image.author}</div>
        )}
      </figcaption>
    </figure>
  )
})

/** Lightbox overlay with keyboard navigation and save/download actions. */
function Lightbox({ images, index, onClose, onNav }: {
  images: readonly RefImage[]
  index: number
  onClose: () => void
  onNav: (next: number) => void
}): ReactNode {
  const t = copy()
  const image = images[index]
  const [degraded, setDegraded] = useState(false)
  const [eagle, setEagle] = useState<{ phase: EaglePhase; message: string }>({ phase: 'idle', message: '' })

  useEffect(() => {
    setDegraded(false)
    setEagle({ phase: 'idle', message: '' })
  }, [index])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') onNav((index - 1 + images.length) % images.length)
      else if (event.key === 'ArrowRight') onNav((index + 1) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [images.length, index, onClose, onNav])

  if (image === undefined) return null
  const src = degraded ? image.thumbUrl : image.url
  const save = (): void => {
    if (eagle.phase === 'busy') return
    setEagle({ phase: 'busy', message: '' })
    void saveToEagle(image).then((result) => {
      setEagle({ phase: result.ok ? 'ok' : 'error', message: result.message })
    })
  }
  return (
    <div className="rfp-lb" role="dialog" aria-modal="true" onClick={onClose}>
      <img
        src={src}
        alt={image.title ?? image.author ?? ''}
        onClick={(event) => event.stopPropagation()}
        onError={() => {
          if (!degraded) setDegraded(true)
        }}
      />
      <button type="button" className="rfp-lb-btn rfp-lb-close" aria-label={t.close} onClick={onClose}>×</button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            className="rfp-lb-btn rfp-lb-prev"
            aria-label={t.previous}
            onClick={(event) => {
              event.stopPropagation()
              onNav((index - 1 + images.length) % images.length)
            }}
          >‹</button>
          <button
            type="button"
            className="rfp-lb-btn rfp-lb-next"
            aria-label={t.next}
            onClick={(event) => {
              event.stopPropagation()
              onNav((index + 1) % images.length)
            }}
          >›</button>
        </>
      )}
      <div className="rfp-lb-caption" onClick={(event) => event.stopPropagation()}>
        {image.title !== undefined && image.title.length > 0 && (
          <div className="rfp-lb-title">{image.title}</div>
        )}
        {image.author !== undefined && image.author.length > 0 && (
          <span className="rfp-lb-meta">{image.author}</span>
        )}
        {images.length > 1 && (
          <span className="rfp-lb-count">{index + 1} {t.of} {images.length}</span>
        )}
        {image.sourceUrl !== undefined && (
          <a className="rfp-lb-link" href={image.sourceUrl} target="_blank" rel="noreferrer noopener">{t.openSource}</a>
        )}
        <a className="rfp-lb-link" href={image.url} target="_blank" rel="noreferrer noopener">{t.openFull}</a>
        <button type="button" className="rfp-mini-btn" onClick={() => openDownload(image)}>{t.download}</button>
        <button type="button" className="rfp-mini-btn" disabled={eagle.phase === 'busy' || eagle.phase === 'ok'} onClick={save}>
          {eagle.phase === 'busy' ? t.savingEagle : eagle.phase === 'ok' ? t.savedEagle : t.saveEagle}
        </button>
        {eagle.phase !== 'idle' && (
          <span className={`rfp-lb-eagle ${eagle.phase === 'ok' ? 'rfp-lb-eagle-ok' : 'rfp-lb-eagle-err'}`}>
            {eagle.message}
          </span>
        )}
      </div>
    </div>
  )
}

/** Header/action callbacks the wall's buttons may carry; absent = hidden. */
export interface WallActions {
  /** Disable the header buttons (a round trip is already in flight). */
  busy?: boolean
  /** 换一批: request a fresh batch. */
  onRefresh?: () => void
  /** 翻页: request the next page of the same query. */
  onNextPage?: () => void
  /** Open the board tab in the sidebar. */
  onOpenBoard?: () => void
  /** The short confirmation text after a send-triggered action. */
  sentNote?: string
  /** A visible failure message from the last action (replaces the sent note). */
  error?: string
}

/** The full wall: header with actions, masonry grid, and the lightbox. */
export function RefPicsWall({ outcome, actions }: { outcome: RefPicsOutcome; actions?: WallActions }): ReactNode {
  const t = copy()
  const [active, setActive] = useState<number | null>(null)
  const [sent, setSent] = useState(false)
  const onNav = useCallback((next: number) => {
    setActive(next)
  }, [])
  const onClose = useCallback(() => {
    setActive(null)
  }, [])

  useEffect(() => {
    setSent(false)
  }, [outcome, actions?.busy])

  const fire = (handler: (() => void) | undefined): void => {
    if (handler === undefined || actions?.busy === true) return
    setSent(true)
    handler()
  }

  if (outcome.images.length === 0) {
    return (
      <div className="rfp-root">
        <div className="rfp-head">
          <span className="rfp-head-query">{outcome.query}</span>
          <span className="rfp-head-meta">{outcomeSummary(outcome)}</span>
        </div>
        <div className="rfp-empty">{t.empty}</div>
      </div>
    )
  }

  return (
    <div className="rfp-root">
      <div className="rfp-head">
        <span className="rfp-head-query">{outcome.query}</span>
        <span className="rfp-head-meta">{outcomeSummary(outcome)}</span>
        <span className="rfp-chip">{outcome.provider}</span>
        <span className="rfp-hint">{t.clickHint}</span>
      </div>
      {(actions?.onRefresh !== undefined || actions?.onNextPage !== undefined || actions?.onOpenBoard !== undefined) && (
        <div className="rfp-actions">
          {actions.onRefresh !== undefined && (
            <button type="button" className="rfp-btn rfp-btn-primary" disabled={actions.busy === true} onClick={() => fire(actions.onRefresh)}>{t.refresh}</button>
          )}
          {actions.onNextPage !== undefined && outcome.truncated && (
            <button type="button" className="rfp-btn" disabled={actions.busy === true} onClick={() => fire(actions.onNextPage)}>{t.nextPage} ({outcome.page + 1})</button>
          )}
          {actions.onOpenBoard !== undefined && (
            <button type="button" className="rfp-btn" onClick={actions.onOpenBoard}>{t.openBoard}</button>
          )}
          {actions.error !== undefined && <span className="rfp-send-err">{actions.error}</span>}
          {actions.error === undefined && sent && <span className="rfp-hint">{actions.sentNote ?? t.sent}</span>}
        </div>
      )}
      <div className="rfp-wall">
        {outcome.images.map((image, index) => (
          <Card key={image.id} image={image} onOpen={() => setActive(index)} />
        ))}
      </div>
      {active !== null && (
        <Lightbox images={outcome.images} index={active} onClose={onClose} onNav={onNav} />
      )}
    </div>
  )
}
