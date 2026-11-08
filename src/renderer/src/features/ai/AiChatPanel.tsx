import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import {
  AI_CONTEXT_LEVELS,
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  type AiAskResponse,
  type AiChatTurn,
  type AiConfigInfo,
  type AiProvider,
  type RagCitation,
} from '../../../../shared/types'
import { errMsg } from '../../lib/api'
import { chatToMarkdown } from '../../lib/chatExport'
import { PASTE_PATH } from '../viewer/useMdViewer'
import { sanitizeHtml } from '../../lib/sanitize'
import { cn, copyText, toast, uid } from '../../lib/utils'
import { btnGhost, btnPrimary, btnSm, cx } from '../../lib/ui'
import { SidePanel } from '../../components/SidePanel'
import { IconCopy } from '../../components/icons'
import { LOCALES, t as tr, useLang, useT } from '../../i18n'

/** Câu trả lời đã render. memo: gõ vào ô hỏi không parse lại Markdown của mọi câu trả lời cũ. */
const AnswerHtml = memo(function AnswerHtml({ text }: { text: string }) {
  return (
    <div
      className="md-body x2m-ai-md"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(text, { breaks: false }) as string) }}
    />
  )
})

interface ChatEntry {
  id: string
  role: 'user' | 'model'
  text: string
  citations?: RagCitation[]
  usage?: AiAskResponse['usage']
  mode?: AiAskResponse['mode']
  docCount?: number
  isError?: boolean
  failedPrompt?: string
  failedScope?: 'folder' | 'active'
}

interface Props {
  collapsed: boolean
  onToggleCollapsed: () => void
  width?: number
  rootDir: string | null
  relFiles: string[]
  looseFiles: Array<{ path: string; name: string }>
  activeFilePath: string | null
  activeMarkdown: string
  pastedMarkdown?: string | null
  onJumpToCitation: (citation: RagCitation) => void
}

/** Câu hỏi nhanh: nhãn `ai.quick.<id>`, câu lệnh gửi AI `ai.quick.<id>Prompt` (theo ngôn ngữ giao diện
 * để AI trả lời bằng ngôn ngữ của người dùng). */
const QUICK_PROMPTS: Array<{ id: 'summary' | 'translate' | 'review' | 'tests' | 'cross'; scope: 'folder' | 'active' }> = [
  { id: 'summary', scope: 'active' },
  { id: 'translate', scope: 'active' },
  { id: 'review', scope: 'active' },
  { id: 'tests', scope: 'active' },
  { id: 'cross', scope: 'folder' },
]

export function AiChatPanel({
  collapsed,
  onToggleCollapsed,
  width,
  rootDir,
  relFiles,
  looseFiles,
  activeFilePath,
  activeMarkdown,
  pastedMarkdown,
  onJumpToCitation,
}: Props): React.ReactElement {
  const t = useT()
  const locale = LOCALES[useLang()]
  const [config, setConfig] = useState<AiConfigInfo>({
    provider: DEFAULT_AI_PROVIDER,
    hasKey: false,
    maskedKey: '',
    model: AI_PROVIDERS[DEFAULT_AI_PROVIDER].defaultModel,
    contextTokens: AI_CONTEXT_LEVELS[0],
    keys: { gemini: '', claude: '', openai: '' },
  })
  const providerInfo = AI_PROVIDERS[config.provider]
  const [showKeyBox, setShowKeyBox] = useState(false)
  const [models, setModels] = useState<string[]>(AI_PROVIDERS[DEFAULT_AI_PROVIDER].suggested)
  const [streamText, setStreamText] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [scope, setScope] = useState<'folder' | 'active'>('folder')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Mã của câu hỏi đang chạy: bấm Dừng thì tăng lên để mọi delta/kết quả muộn của câu hỏi cũ bị bỏ qua
  const askSeq = useRef(0)

  useEffect(() => {
    window.api
      .aiGetConfig()
      .then((c) => {
        setConfig(c)
        if (!c.hasKey) setShowKeyBox(true)
      })
      .catch(() => {})
  }, [])

  // Rời chế độ Đọc Markdown khi đang trả lời: dừng hẳn yêu cầu (không để main tiếp tục stream, tốn token)
  useEffect(
    () => () => {
      askSeq.current++
      void window.api.aiCancel().catch(() => {})
    },
    []
  )

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries, busy, streamText])

  const saveKey = useCallback(async () => {
    try {
      const next = await window.api.aiSetConfig({
        apiKey: apiKeyInput.trim() || undefined,
        model: config.model,
      })
      setConfig(next)
      setApiKeyInput('')
      setShowKeyBox(false)
      toast(tr('ai.toast.saved', { provider: AI_PROVIDERS[next.provider].label }), 'ok')
    } catch (e) {
      toast(tr('ai.toast.saveFailed', { err: errMsg(e) }), 'err')
    }
  }, [apiKeyInput, config.model])

  const clearKey = useCallback(async () => {
    try {
      const next = await window.api.aiSetConfig({ apiKey: '' })
      setConfig(next)
      setApiKeyInput('')
      toast(tr('ai.toast.keyCleared', { provider: AI_PROVIDERS[next.provider].label }), 'ok')
    } catch (e) {
      toast(tr('ai.toast.clearFailed', { err: errMsg(e) }), 'err')
    }
  }, [])

  const changeModel = useCallback(async (model: string) => {
    try {
      const next = await window.api.aiSetConfig({ model })
      setConfig(next)
    } catch (e) {
      toast(errMsg(e), 'err')
    }
  }, [])

  const changeProvider = useCallback(async (provider: AiProvider) => {
    try {
      setModels(AI_PROVIDERS[provider].suggested)
      setConfig(await window.api.aiSetConfig({ provider }))
    } catch (e) {
      toast(errMsg(e), 'err')
    }
  }, [])

  const changeContext = useCallback(async (contextTokens: number) => {
    try {
      setConfig(await window.api.aiSetConfig({ contextTokens }))
    } catch (e) {
      toast(errMsg(e), 'err')
    }
  }, [])

  const refreshModels = useCallback(async () => {
    try {
      const ids = await window.api.aiListModels(config.provider)
      setModels(ids)
      toast(tr('ai.toast.models', { n: ids.length, provider: AI_PROVIDERS[config.provider].label }), 'ok')
    } catch (e) {
      toast(errMsg(e), 'err')
    }
  }, [config.provider])

  useEffect(() => {
    if (!config.hasKey) return
    // Đổi nhà cung cấp khi danh sách cũ chưa về thì bỏ kết quả cũ
    let stale = false
    window.api
      .aiListModels(config.provider)
      .then((ids) => {
        if (!stale && ids.length > 0) setModels(ids)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [config.hasKey, config.provider])

  const sendQuestion = useCallback(
    async (questionText: string, forceScope?: 'folder' | 'active') => {
      const q = questionText.trim()
      if (!q || busy) return
      if (!config.hasKey) {
        setShowKeyBox(true)
        toast(tr('ai.toast.needKey', { provider: providerInfo.label }), 'err')
        return
      }

      const effectiveScope = forceScope ?? scope
      const userEntry: ChatEntry = { id: uid(), role: 'user', text: q }
      const history: AiChatTurn[] = entries
        .filter((e) => !e.isError)
        .map((e) => ({ role: e.role, text: e.text }))

      setEntries((prev) => [...prev, userEntry])
      setInput('')
      setBusy(true)
      const seq = ++askSeq.current
      const isCurrent = (): boolean => askSeq.current === seq

      // Gom các đoạn stream, vẽ lại tối đa ~16 lần/giây để không parse Markdown theo từng token
      let acc = ''
      let timer: number | undefined
      const off = window.api.onAiDelta((t) => {
        if (!isCurrent()) return
        acc += t
        if (timer === undefined) {
          timer = window.setTimeout(() => {
            timer = undefined
            if (isCurrent()) setStreamText(acc)
          }, 60)
        }
      })

      try {
        const res = await window.api.aiAsk({
          question: q,
          scope: effectiveScope,
          provider: config.provider,
          model: config.model,
          rootDir,
          relFiles,
          looseFiles: looseFiles.map((f) => f.path),
          activeFilePath,
          activeMarkdown: activeFilePath === PASTE_PATH ? activeMarkdown : undefined,
          pastedMarkdown: pastedMarkdown ?? (activeFilePath === PASTE_PATH ? activeMarkdown : null),
          history,
        })
        if (!isCurrent()) return
        const modelEntry: ChatEntry = {
          id: uid(),
          role: 'model',
          text: res.answer,
          citations: res.citations,
          usage: res.usage,
          mode: res.mode,
          docCount: res.docCount,
        }
        setEntries((prev) => [...prev, modelEntry])
      } catch (e) {
        const msg = errMsg(e)
        // 'Đã dừng': thông báo hủy từ main (chưa dịch), không phải lỗi
        if (isCurrent() && !msg.includes('Đã dừng')) {
          toast(msg, 'err')
          setEntries((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'model',
              text: tr('ai.failed', { msg }),
              isError: true,
              failedPrompt: q,
              failedScope: effectiveScope,
            },
          ])
        }
      } finally {
        off()
        window.clearTimeout(timer)
        if (isCurrent()) {
          setStreamText('')
          setBusy(false)
        }
      }
    },
    [busy, config.hasKey, config.provider, config.model, providerInfo.label, scope, entries, rootDir, relFiles, looseFiles, activeFilePath, activeMarkdown, pastedMarkdown]
  )

  const stopAsk = useCallback(async () => {
    askSeq.current++
    setStreamText('')
    setBusy(false)
    await window.api.aiCancel().catch(() => {})
  }, [])

  const exportChat = useCallback(async () => {
    try {
      const saved = await window.api.saveMarkdown(`${tr('ai.exportStem')}-${new Date().toISOString().slice(0, 10)}`, chatToMarkdown(entries, rootDir))
      if (saved) toast(tr('ai.toast.mdSaved', { path: saved }), 'ok')
    } catch (e) {
      toast(tr('ai.toast.mdFailed', { err: errMsg(e) }), 'err')
    }
  }, [entries, rootDir])

  const hasPaste = Boolean((pastedMarkdown && pastedMarkdown.trim() !== '') || activeFilePath === PASTE_PATH)
  const totalFiles = relFiles.length + looseFiles.length + (hasPaste ? 1 : 0)

  return (
    <SidePanel
      title={t('ai.title')}
      collapsed={collapsed}
      onToggle={onToggleCollapsed}
      width={width}
      actions={
        <div className="x2m-ai-head-btns">
          <button
            className={cn('btn btn-sm btn-ghost', showKeyBox && 'active-pill')}
            onClick={() => setShowKeyBox((s) => !s)}
            title={t('ai.configTitle')}
          >
            🔑 {providerInfo.label}
            {config.hasKey ? ` · ${config.maskedKey}` : ''}
          </button>
          {entries.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => void exportChat()} title={t('ai.exportTitle')}>
              {t('ai.export')}
            </button>
          )}
          {entries.length > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setEntries([])}
              disabled={busy}
              title={t('ai.clearTitle')}
            >
              {t('ai.clear')}
            </button>
          )}
        </div>
      }
    >
      <div className="x2m-ai-panel flex min-h-0 flex-1 flex-col">
        {showKeyBox && (
          <div className="x2m-ai-keybox flex flex-col gap-2 border-b border-line bg-raised/50 p-3">
            <div className="x2m-ai-scope flex items-center gap-1 rounded-lg border border-line bg-raised p-0.5" role="radiogroup" aria-label={t('ai.provider')}>
              {AI_PROVIDER_IDS.map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={config.provider === p}
                  className={cn(
                    'x2m-ai-scope-btn flex-1 text-center rounded-md py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
                    config.provider === p && 'active seg-on'
                  )}
                  onClick={() => void changeProvider(p)}
                  title={config.keys[p] ? t('ai.hasKey', { key: config.keys[p] }) : t('ai.noKey', { site: AI_PROVIDERS[p].site })}
                >
                  {AI_PROVIDERS[p].label}
                  {config.keys[p] ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <div className="x2m-ai-keybox-row flex items-center gap-2">
              <label className="x2m-ai-label text-xs font-medium text-dim">{t('ai.model')}</label>
              <select
                className="x2m-select flex-1 rounded-md border border-line bg-canvas px-2.5 py-1 text-xs text-ink outline-none focus:border-accent"
                value={config.model}
                onChange={(e) => void changeModel(e.target.value)}
              >
                {Array.from(new Set([config.model, ...models])).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              {config.hasKey && (
                <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={() => void refreshModels()} title={t('ai.refreshModels')}>
                  ↻
                </button>
              )}
            </div>
            <div className="x2m-ai-keybox-row flex items-center gap-2">
              <input
                type="password"
                className="x2m-input flex-1 rounded-md border border-line bg-canvas px-2.5 py-1 text-xs text-ink outline-none focus:border-accent"
                placeholder={config.hasKey ? t('ai.keyInUse', { key: config.maskedKey }) : t(`ai.keyHint.${config.provider}`)}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <button className={cx('btn btn-sm btn-primary', btnPrimary, btnSm)} onClick={() => void saveKey()}>
                {t('common.save')}
              </button>
              {config.hasKey && (
                <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={() => void clearKey()} title={t('ai.clearKeyTitle')}>
                  {t('ai.clearKey')}
                </button>
              )}
            </div>
            <div className="x2m-ai-keybox-row flex items-center gap-2">
              <label className="x2m-ai-label shrink-0 whitespace-nowrap text-xs font-medium text-dim" htmlFor="x2m-ai-ctx">
                {t('ai.context')}
              </label>
              <select
                id="x2m-ai-ctx"
                className="x2m-select flex-1 rounded-md border border-line bg-canvas px-2.5 py-1 text-xs text-ink outline-none focus:border-accent"
                value={config.contextTokens}
                onChange={(e) => void changeContext(Number(e.target.value))}
                title={t('ai.contextTitle')}
              >
                {AI_CONTEXT_LEVELS.map((n) => (
                  <option key={n} value={n}>
                    {t(n === AI_CONTEXT_LEVELS[0] ? 'ai.ctxCheap' : n === AI_CONTEXT_LEVELS[2] ? 'ai.ctxFull' : 'ai.ctx', { n: (n / 1000).toLocaleString(locale) })}
                  </option>
                ))}
              </select>
            </div>
            <div className="x2m-ai-hint text-[11px] leading-relaxed text-faint">
              {t('ai.keyNote', { site: providerInfo.site })}
              {!config.hasKey && ` ${t('ai.keyNoteModels')}`}
            </div>
          </div>
        )}

        <div className="x2m-ai-toolbar border-b border-line bg-soft px-3 py-2 flex flex-col gap-2">
          <div className="x2m-ai-scope flex items-center gap-1 rounded-lg border border-line bg-raised p-0.5" role="group" aria-label={t('ai.scope')}>
            <button
              className={cn(
                'x2m-ai-scope-btn flex-1 text-center rounded-md py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
                scope === 'folder' && 'active seg-on'
              )}
              onClick={() => setScope('folder')}
              title={t('ai.scope.folderTitle')}
            >
              {t('ai.scope.folder', { n: totalFiles })}
            </button>
            <button
              className={cn(
                'x2m-ai-scope-btn flex-1 text-center rounded-md py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
                scope === 'active' && 'active seg-on'
              )}
              onClick={() => setScope('active')}
              title={t('ai.scope.activeTitle')}
            >
              {t('ai.scope.active')}
            </button>
          </div>
          {activeFilePath && (
            <div className="x2m-ai-quick flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.id}
                  className="x2m-ai-chip rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-dim hover:border-accent-line hover:text-ink hover:bg-hover transition-colors"
                  disabled={busy}
                  onClick={() => void sendQuestion(t(`ai.quick.${q.id}Prompt`), q.scope)}
                  title={t(q.scope === 'folder' ? 'ai.quick.folderTitle' : 'ai.quick.activeTitle')}
                >
                  {t(`ai.quick.${q.id}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={listRef} className="x2m-ai-messages flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {entries.length === 0 ? (
            <div className="x2m-ai-empty flex flex-col items-center justify-center gap-2 p-6 text-center text-dim text-xs">
              <strong className="text-ink font-semibold">{t('ai.empty.title')}</strong>
              <p className="text-faint text-[11.5px] leading-relaxed">
                {t('ai.empty.body')}
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className={cn('x2m-ai-msg flex flex-col', entry.role === 'user' ? 'is-user items-end' : 'is-model items-start')}>
                {entry.role === 'user' ? (
                  <div className="x2m-ai-bubble-user self-end rounded-2xl rounded-tr-xs bg-accent px-3 py-2 text-xs text-white max-w-[85%] whitespace-pre-wrap shadow-xs">
                    {entry.text}
                  </div>
                ) : (
                  <div className="x2m-ai-bubble-model self-start rounded-2xl rounded-tl-xs border border-line bg-raised/70 p-3 text-xs text-ink max-w-[95%] shadow-xs">
                    <AnswerHtml text={entry.text} />
                    {entry.citations && entry.citations.length > 0 && (
                      <div className="x2m-ai-citations mt-2 flex flex-wrap gap-1.5">
                        {entry.citations.map((c, idx) => (
                          <button
                            key={idx}
                            className="x2m-ai-citation-chip inline-flex items-center gap-1 rounded-md border border-accent-line/40 bg-accent-soft px-2 py-0.5 text-[11px] text-accent-ink hover:brightness-110 transition-colors"
                            onClick={() => onJumpToCitation(c)}
                            title={t('ai.citationTitle', { path: c.relPath, section: c.sectionTitle })}
                          >
                            📍 {c.relPath} › {c.sectionTitle}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="x2m-ai-msg-foot mt-2.5 flex items-center gap-2 text-[11px] text-faint border-t border-line/40 pt-1.5">
                      {entry.isError && entry.failedPrompt ? (
                        <button
                          className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink hover:text-accent hover:border-accent-line transition-colors"
                          onClick={() => sendQuestion(entry.failedPrompt!, entry.failedScope)}
                          disabled={busy}
                        >
                          🔄 {t('common.retry')}
                        </button>
                      ) : (
                        <>
                          {entry.mode && (
                            <span className="x2m-ai-badge rounded bg-line/60 px-1.5 py-0.5 text-[10px]" title={t('ai.modeTitle', { mode: entry.mode })}>
                              {t('ai.badge', { mode: entry.mode === 'parent-rag' ? 'RAG' : t('ai.mode.full'), n: entry.docCount ?? 1 })}
                            </span>
                          )}
                          {entry.usage && (
                            <span className="x2m-ai-badge rounded bg-line/60 px-1.5 py-0.5 text-[10px]">
                              ⚡ {t('ai.tokens', { n: entry.usage.totalTokens.toLocaleString(locale) })}
                              {entry.usage.cachedTokens ? ` · ${t('ai.cache', { n: entry.usage.cachedTokens.toLocaleString(locale) })}` : ''}
                            </span>
                          )}
                        </>
                      )}
                      <button
                        className={cx('btn btn-sm btn-ghost x2m-ai-copy ml-auto text-[11px]', btnGhost, btnSm)}
                        onClick={async () => {
                          const ok = await copyText(entry.text)
                          toast(tr(ok ? 'ai.toast.answerCopied' : 'common.copyFailed'), ok ? 'ok' : 'err')
                        }}
                        title={t('ai.copyTitle')}
                      >
                        <IconCopy size={12} /> {t('common.copy')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {busy && streamText && (
            <div className="x2m-ai-msg is-model flex flex-col items-start">
              <div className="x2m-ai-bubble-model self-start rounded-2xl rounded-tl-xs border border-line bg-raised/70 p-3 text-xs text-ink max-w-[95%] shadow-xs" aria-live="polite">
                <AnswerHtml text={streamText} />
                <div className="x2m-ai-msg-foot mt-2.5 flex items-center gap-2 text-[11px] text-faint border-t border-line/40 pt-1.5">
                  <span>{t('ai.writing')}</span>
                  <button
                    className={cx('btn btn-sm btn-ghost ml-auto text-[11px] text-faint hover:text-danger hover:bg-danger-soft', btnGhost, btnSm)}
                    onClick={() => void stopAsk()}
                    title={t('ai.stopTitle')}
                  >
                    {t('ai.stop')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {busy && !streamText && (
            <div className="x2m-ai-loading self-start flex items-center gap-3 rounded-2xl rounded-tl-xs border border-line bg-raised/70 px-3.5 py-2.5 text-xs text-dim shadow-xs">
              <div className="flex items-center gap-1.5 py-1 px-0.5" aria-label={t('ai.answering')}>
                <span className="size-1.5 rounded-full bg-accent animate-typing-dot [animation-delay:-0.4s]" />
                <span className="size-1.5 rounded-full bg-accent animate-typing-dot [animation-delay:-0.2s]" />
                <span className="size-1.5 rounded-full bg-accent animate-typing-dot" />
              </div>
              <span className="text-faint text-[11.5px]">{t('ai.thinking')}</span>
              <button
                className={cx('btn btn-sm btn-ghost ml-auto text-[11px] text-faint hover:text-danger hover:bg-danger-soft', btnGhost, btnSm)}
                onClick={() => void stopAsk()}
                title={t('ai.stopTitle')}
              >
                {t('ai.stop')}
              </button>
            </div>
          )}
        </div>

        <div className="x2m-ai-input-bar flex items-end gap-2 border-t border-line bg-soft p-3">
          <textarea
            className="x2m-ai-textarea flex-1 resize-none rounded-lg border border-line bg-canvas p-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent"
            rows={2}
            placeholder={t('ai.placeholder')}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // isComposing: Enter đang chốt chữ Nhật/Việt của bộ gõ IME, không phải gửi câu hỏi
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void sendQuestion(input)
              }
            }}
          />
          <button
            className={cx('btn btn-sm btn-primary x2m-ai-send shrink-0', btnPrimary, btnSm)}
            disabled={busy || !input.trim()}
            onClick={() => void sendQuestion(input)}
          >
            {t('ai.send')}
          </button>
        </div>
      </div>
    </SidePanel>
  )
}
