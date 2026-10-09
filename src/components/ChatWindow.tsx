import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import type { Role } from '../api'

export interface ChatMessage {
  role: Role
  content: string
}

interface ChatWindowProps {
  messages: ChatMessage[]
  loading: boolean
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: () => void
  asNote: boolean
  onAsNoteChange: (value: boolean) => void
  models: string[]
  model: string
  onModelChange: (value: string) => void
}

export default function ChatWindow({
  messages,
  loading,
  draft,
  onDraftChange,
  onSubmit,
  asNote,
  onAsNoteChange,
  models,
  model,
  onModelChange,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep the latest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!loading && draft.trim()) onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a new line.
    if (event.key === 'Enter' && !event.shiftKey) handleSubmit(event)
  }

  return (
    <section className="chat">
      <div className="messages">
        {messages.length === 0 && !loading && (
          <p className="muted center">Pose ta première question à Study Buddy.</p>
        )}
        {messages.map((m, i) => {
          if (m.role === 'system-notification') {
            return (
              <div key={i} className="notification">
                {m.content}
              </div>
            )
          }
          if (m.role === 'note') {
            return (
              <div key={i} className="bubble note">
                <span className="note-label">Note personnelle</span>
                {m.content}
              </div>
            )
          }
          // The streaming placeholder stays empty until the first chunk arrives; the typing dots cover that gap.
          if (m.role === 'assistant' && m.content === '') return null
          return (
            <div key={i} className={`bubble ${m.role}`}>
              {/* The LLM answers in Markdown; user messages are shown as typed. */}
              {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
            </div>
          )
        })}
        {loading && <div className="bubble assistant typing">…</div>}
        <div ref={bottomRef} />
      </div>
      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer-options">
          <label>
            Modèle
            <select value={model} onChange={(e) => onModelChange(e.target.value)} disabled={loading}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="note-toggle">
            <input
              type="checkbox"
              checked={asNote}
              onChange={(e) => onAsNoteChange(e.target.checked)}
              disabled={loading}
            />
            Note personnelle (non envoyée au LLM)
          </label>
        </div>
        <div className="composer-row">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={asNote ? 'Écris ta note…' : 'Écris ton message…'}
            rows={2}
            disabled={loading}
            autoFocus
          />
          <button type="submit" disabled={loading || !draft.trim() || !model}>
            {asNote ? 'Noter' : 'Envoyer'}
          </button>
        </div>
      </form>
    </section>
  )
}
