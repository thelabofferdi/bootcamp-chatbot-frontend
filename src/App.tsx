import { useEffect, useState } from 'react'
import './App.css'
import {
  createConversation,
  createNote,
  getMessages,
  getModels,
  listConversations,
  streamChat,
  type ConversationSummary,
} from './api'
import ChatWindow, { type ChatMessage } from './components/ChatWindow'
import Sidebar from './components/Sidebar'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.'
}

export default function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [asNote, setAsNote] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On startup, load the history, the allowed models and open the most recent conversation.
  useEffect(() => {
    listConversations()
      .then((list) => {
        setConversations(list)
        if (list.length > 0) setActiveId(list[0].id)
      })
      .catch((err) => setError(errorMessage(err)))
    getModels()
      .then(({ models, default: defaultModel }) => {
        setModels(models)
        setModel(defaultModel)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  // Load the messages whenever another conversation is opened.
  useEffect(() => {
    if (activeId === null) return
    let cancelled = false
    getMessages(activeId)
      .then((list) => {
        if (!cancelled) setMessages(list.map(({ role, content }) => ({ role, content })))
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [activeId])

  function selectConversation(id: number) {
    if (loading || id === activeId) return
    setError(null)
    setDraft('')
    setMessages([])
    setActiveId(id)
  }

  async function handleNew() {
    if (loading) return
    setError(null)
    try {
      const id = await createConversation()
      setConversations((list) => [
        { id, created_at: new Date().toISOString(), preview: null },
        ...list,
      ])
      setDraft('')
      setMessages([])
      setActiveId(id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function refreshPreviews() {
    setConversations(await listConversations())
  }

  async function handleSend() {
    if (activeId === null) return
    const text = draft.trim()
    const isFirstMessage = messages.length === 0
    setError(null)
    setDraft('')
    // An empty assistant bubble is added now and filled chunk by chunk as the answer streams in.
    setMessages((list) => [...list, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setLoading(true)
    try {
      const { notification } = await streamChat(activeId, text, model, (chunk) =>
        setMessages((list) => {
          const last = list[list.length - 1]
          return [...list.slice(0, -1), { ...last, content: last.content + chunk }]
        }),
      )
      if (notification) {
        setMessages((list) => [...list, { role: 'system-notification', content: notification }])
      }
      // The first message becomes the conversation's preview in the sidebar.
      if (isFirstMessage) await refreshPreviews()
    } catch (err) {
      // The backend saved nothing for this turn: remove the optimistic bubbles and give the text back.
      setMessages((list) => list.slice(0, -2))
      setDraft(text)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleNote() {
    if (activeId === null) return
    const text = draft.trim()
    const isFirstMessage = messages.length === 0
    setError(null)
    setDraft('')
    try {
      const note = await createNote(activeId, text)
      setMessages((list) => [...list, { role: 'note', content: note.content }])
      if (isFirstMessage) await refreshPreviews()
    } catch (err) {
      setDraft(text)
      setError(errorMessage(err))
    }
  }

  function handleSubmit() {
    if (asNote) void handleNote()
    else void handleSend()
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={handleNew}
      />
      <main className="main">
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Fermer">
              ×
            </button>
          </div>
        )}
        {activeId === null ? (
          <div className="empty">
            <p>Aucune conversation ouverte.</p>
            <button className="new-button" onClick={handleNew}>
              + Nouvelle conversation
            </button>
          </div>
        ) : (
          <ChatWindow
            messages={messages}
            loading={loading}
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={handleSubmit}
            asNote={asNote}
            onAsNoteChange={setAsNote}
            models={models}
            model={model}
            onModelChange={setModel}
          />
        )}
      </main>
    </div>
  )
}
