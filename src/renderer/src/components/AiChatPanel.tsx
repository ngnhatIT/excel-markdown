import { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import type { AiAskResponse, AiChatTurn, AiConfigInfo, RagCitation } from '../../../types'
import { errMsg } from '../api'
import { PASTE_PATH } from '../hooks/useMdViewer'
import { sanitizeHtml } from '../sanitize'
import { cn, copyText, toast, uid } from '../utils'
import { btnGhost, btnPrimary, btnSm, cx } from '../ui'
import { SidePanel } from './SidePanel'
import { IconCopy } from './icons'

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

const QUICK_PROMPTS = [
  {
    label: '📋 Tóm tắt nghiệp vụ',
    prompt:
      'Hãy tóm tắt mục đích nghiệp vụ, luồng xử lý chính và các bảng quan trọng của tài liệu đang xem bằng tiếng Việt.',
  },
  {
    label: '🌐 Dịch sang tiếng Việt',
    prompt:
      'Hãy dịch và giải thích chi tiết các mục, bảng biểu và chú thích (※) trong tài liệu đang xem sang tiếng Việt chuẩn BA/BrSE.',
  },
  {
    label: '🔍 Kiểm tra thiếu sót',
    prompt:
      'Hãy rà soát tài liệu thiết kế này xem có điểm nào mơ hồ, thiếu điều kiện biên (validation/error handling) hoặc mâu thuẫn giữa các mục không.',
  },
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
  const [config, setConfig] = useState<AiConfigInfo>({
    hasKey: false,
    maskedKey: '',
    model: 'gemini-2.5-flash',
  })
  const [showKeyBox, setShowKeyBox] = useState(false)
  const [models, setModels] = useState<string[]>(['gemini-2.5-flash', 'gemini-2.5-pro'])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [scope, setScope] = useState<'folder' | 'active'>('folder')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.api
      .aiGetConfig()
      .then((c) => {
        setConfig(c)
        if (!c.hasKey) setShowKeyBox(true)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries, busy])

  const saveKey = useCallback(async () => {
    try {
      const next = await window.api.aiSetConfig({
        apiKey: apiKeyInput.trim() || undefined,
        model: config.model,
      })
      setConfig(next)
      setApiKeyInput('')
      setShowKeyBox(false)
      toast('Đã lưu cấu hình Gemini AI', 'ok')
    } catch (e) {
      toast('Lưu cấu hình thất bại: ' + errMsg(e), 'err')
    }
  }, [apiKeyInput, config.model])

  const clearKey = useCallback(async () => {
    try {
      const next = await window.api.aiSetConfig({ apiKey: '' })
      setConfig(next)
      setApiKeyInput('')
      toast('Đã xóa Gemini API Key', 'ok')
    } catch (e) {
      toast('Xóa key thất bại: ' + errMsg(e), 'err')
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

  const refreshModels = useCallback(async () => {
    try {
      const ids = await window.api.aiListModels()
      setModels(ids)
      toast(`Key dùng được ${ids.length} model Gemini`, 'ok')
    } catch (e) {
      toast(errMsg(e), 'err')
    }
  }, [])

  useEffect(() => {
    if (config.hasKey) {
      window.api
        .aiListModels()
        .then(setModels)
        .catch(() => {})
    }
  }, [config.hasKey])

  const sendQuestion = useCallback(
    async (questionText: string, forceScope?: 'folder' | 'active') => {
      const q = questionText.trim()
      if (!q || busy) return
      if (!config.hasKey) {
        setShowKeyBox(true)
        toast('Vui lòng nhập Gemini API Key trước khi hỏi AI', 'err')
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

      try {
        const res = await window.api.aiAsk({
          question: q,
          scope: effectiveScope,
          rootDir,
          relFiles,
          looseFiles: looseFiles.map((f) => f.path),
          activeFilePath,
          activeMarkdown: activeFilePath === PASTE_PATH ? activeMarkdown : undefined,
          pastedMarkdown: pastedMarkdown ?? (activeFilePath === PASTE_PATH ? activeMarkdown : null),
          history,
        })
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
        if (!msg.includes('Đã dừng')) {
          toast(msg, 'err')
          setEntries((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'model',
              text: `⚠️ **Không thể hoàn tất:** ${msg}`,
              isError: true,
              failedPrompt: q,
              failedScope: effectiveScope,
            },
          ])
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, config.hasKey, scope, entries, rootDir, relFiles, looseFiles, activeFilePath, activeMarkdown, pastedMarkdown]
  )

  const stopAsk = useCallback(async () => {
    await window.api.aiCancel().catch(() => {})
    setBusy(false)
  }, [])

  const hasPaste = Boolean((pastedMarkdown && pastedMarkdown.trim() !== '') || activeFilePath === PASTE_PATH)
  const totalFiles = relFiles.length + looseFiles.length + (hasPaste ? 1 : 0)

  return (
    <SidePanel
      title="Trợ lý AI (RAG)"
      collapsed={collapsed}
      onToggle={onToggleCollapsed}
      width={width}
      actions={
        <div className="x2m-ai-head-btns">
          <button
            className={cn('btn btn-sm btn-ghost', showKeyBox && 'active-pill')}
            onClick={() => setShowKeyBox((s) => !s)}
            title="Cấu hình Gemini API Key & Model"
          >
            🔑 {config.hasKey ? config.maskedKey : 'API Key'}
          </button>
          {entries.length > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setEntries([])}
              disabled={busy}
              title="Xóa lịch sử trò chuyện"
            >
              Xóa chat
            </button>
          )}
        </div>
      }
    >
      <div className="x2m-ai-panel flex h-full flex-col bg-soft">
        {showKeyBox && (
          <div className="x2m-ai-keybox flex flex-col gap-2 border-b border-line bg-raised/50 p-3">
            <div className="x2m-ai-keybox-row flex items-center gap-2">
              <label className="x2m-ai-label text-xs font-medium text-dim">Model:</label>
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
                <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={() => void refreshModels()} title="Lấy lại danh sách model mới nhất mà key này dùng được">
                  ↻
                </button>
              )}
            </div>
            <div className="x2m-ai-keybox-row flex items-center gap-2">
              <input
                type="password"
                className="x2m-input flex-1 rounded-md border border-line bg-canvas px-2.5 py-1 text-xs text-ink outline-none focus:border-accent"
                placeholder={config.hasKey ? `Đang dùng ${config.maskedKey} (nhập mới để đổi)` : 'Dán Gemini API Key (AIza...)'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <button className={cx('btn btn-sm btn-primary', btnPrimary, btnSm)} onClick={() => void saveKey()}>
                Lưu
              </button>
              {config.hasKey && (
                <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={() => void clearKey()} title="Xóa API Key đã lưu">
                  Xóa key
                </button>
              )}
            </div>
            <div className="x2m-ai-hint text-[11px] leading-relaxed text-faint">
              Key được mã hóa cục bộ bằng OS SafeStorage, chỉ gọi trực tiếp tới Google Gemini API.
              {!config.hasKey && ' Lưu key xong, danh sách model mới nhất sẽ tự tải về.'}
            </div>
          </div>
        )}

        <div className="x2m-ai-toolbar border-b border-line bg-soft px-3 py-2 flex flex-col gap-2">
          <div className="x2m-ai-scope flex items-center gap-1 rounded-lg border border-line bg-raised p-0.5" role="group" aria-label="Phạm vi ngữ cảnh">
            <button
              className={cn(
                'x2m-ai-scope-btn flex-1 text-center rounded-md py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
                scope === 'folder' && 'active seg-on'
              )}
              onClick={() => setScope('folder')}
              title="Tìm kiếm ngữ cảnh trên toàn bộ các file Markdown đang mở"
            >
              Cả thư mục ({totalFiles} file)
            </button>
            <button
              className={cn(
                'x2m-ai-scope-btn flex-1 text-center rounded-md py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
                scope === 'active' && 'active seg-on'
              )}
              onClick={() => setScope('active')}
              title="Gửi trọn vẹn 100% nội dung file đang xem"
            >
              Chỉ file đang xem
            </button>
          </div>
          {activeFilePath && (
            <div className="x2m-ai-quick flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  className="x2m-ai-chip rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-dim hover:border-accent-line hover:text-ink hover:bg-hover transition-colors"
                  disabled={busy}
                  onClick={() => void sendQuestion(q.prompt, 'active')}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={listRef} className="x2m-ai-messages flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {entries.length === 0 ? (
            <div className="x2m-ai-empty flex flex-col items-center justify-center gap-2 p-6 text-center text-dim text-xs">
              <strong className="text-ink font-semibold">Hỏi đáp thông minh trên tài liệu thiết kế</strong>
              <p className="text-faint text-[11.5px] leading-relaxed">
                Hỗ trợ tra cứu chéo tiếng Việt ↔ tiếng Nhật (基本設計, 画面項目, バリデーション, エラー...) với trích dẫn nguồn bấm được.
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
                    <div
                      className="md-body x2m-ai-md"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(marked.parse(entry.text, { breaks: false }) as string),
                      }}
                    />
                    {entry.citations && entry.citations.length > 0 && (
                      <div className="x2m-ai-citations mt-2 flex flex-wrap gap-1.5">
                        {entry.citations.map((c, idx) => (
                          <button
                            key={idx}
                            className="x2m-ai-citation-chip inline-flex items-center gap-1 rounded-md border border-accent-line/40 bg-accent-soft px-2 py-0.5 text-[11px] text-accent-ink hover:brightness-110 transition-colors"
                            onClick={() => onJumpToCitation(c)}
                            title={`Mở ${c.relPath} tới mục "${c.sectionTitle}"`}
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
                          🔄 Thử lại
                        </button>
                      ) : (
                        <>
                          {entry.mode && (
                            <span className="x2m-ai-badge rounded bg-line/60 px-1.5 py-0.5 text-[10px]" title={`Chế độ ngữ cảnh: ${entry.mode}`}>
                              {entry.mode === 'parent-rag' ? 'RAG' : 'Toàn văn'} · {entry.docCount ?? 1} file
                            </span>
                          )}
                          {entry.usage && (
                            <span className="x2m-ai-badge rounded bg-line/60 px-1.5 py-0.5 text-[10px]">
                              ⚡ {entry.usage.totalTokens.toLocaleString('vi-VN')} tokens
                            </span>
                          )}
                        </>
                      )}
                      <button
                        className={cx('btn btn-sm btn-ghost x2m-ai-copy ml-auto text-[11px]', btnGhost, btnSm)}
                        onClick={async () => {
                          const ok = await copyText(entry.text)
                          toast(ok ? 'Đã copy câu trả lời' : 'Copy thất bại', ok ? 'ok' : 'err')
                        }}
                        title="Copy câu trả lời"
                      >
                        <IconCopy size={12} /> Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {busy && (
            <div className="x2m-ai-loading self-start flex items-center gap-3 rounded-2xl rounded-tl-xs border border-line bg-raised/70 px-3.5 py-2.5 text-xs text-dim shadow-xs">
              <div className="flex items-center gap-1.5 py-1 px-0.5" aria-label="Đang trả lời">
                <span className="size-1.5 rounded-full bg-accent animate-typing-dot [animation-delay:-0.4s]" />
                <span className="size-1.5 rounded-full bg-accent animate-typing-dot [animation-delay:-0.2s]" />
                <span className="size-1.5 rounded-full bg-accent animate-typing-dot" />
              </div>
              <span className="text-faint text-[11.5px]">Đang phân tích tài liệu & soạn câu trả lời...</span>
              <button
                className={cx('btn btn-sm btn-ghost ml-auto text-[11px] text-faint hover:text-danger hover:bg-danger-soft', btnGhost, btnSm)}
                onClick={() => void stopAsk()}
                title="Dừng tạo câu trả lời"
              >
                Dừng
              </button>
            </div>
          )}
        </div>

        <div className="x2m-ai-input-bar flex items-end gap-2 border-t border-line bg-soft p-3">
          <textarea
            className="x2m-ai-textarea flex-1 resize-none rounded-lg border border-line bg-canvas p-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent"
            rows={2}
            placeholder="Đặt câu hỏi về tài liệu (Enter để gửi, Shift+Enter xuống dòng)..."
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
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
            Gửi
          </button>
        </div>
      </div>
    </SidePanel>
  )
}
