// Thin typed wrappers around the FastAPI backend (proxied under /api by Vite).

export type Role = 'user' | 'assistant' | 'note' | 'system-notification'

export interface ConversationSummary {
  id: number
  created_at: string
  preview: string | null
}

export interface Message {
  seq: number
  role: Role
  content: string
  created_at: string
}

export interface ModelList {
  models: string[]
  default: string
}

async function errorFrom(response: Response): Promise<Error> {
  // FastAPI errors look like {"detail": "..."}.
  const body = await response.json().catch(() => null)
  const detail = typeof body?.detail === 'string' ? body.detail : null
  return new Error(detail ?? `Erreur ${response.status}`)
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error('Impossible de joindre le serveur.')
  }
  if (!response.ok) throw await errorFrom(response)
  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchApi(path, init)
  return response.json() as Promise<T>
}

export function listConversations(): Promise<ConversationSummary[]> {
  return request('/conversations')
}

export async function createConversation(): Promise<number> {
  const { conversation_id } = await request<{ conversation_id: number }>('/conversations', {
    method: 'POST',
  })
  return conversation_id
}

export function getMessages(conversationId: number): Promise<Message[]> {
  return request(`/conversations/${conversationId}/messages`)
}

export function getModels(): Promise<ModelList> {
  return request('/models')
}

export function createNote(conversationId: number, content: string): Promise<Message> {
  return request(`/conversations/${conversationId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export interface StreamResult {
  notification: string | null // set when the backend also stored a system-notification
}

// Reads the SSE stream from POST /chat/stream. Resolves only once the backend confirms the turn was saved;
// rejects if the stream fails or ends before [DONE], so the caller can roll back its optimistic UI.
export async function streamChat(
  conversationId: number,
  message: string,
  model: string,
  onContent: (chunk: string) => void,
): Promise<StreamResult> {
  const response = await fetchApi('/chat/stream', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, message, model }),
  })
  if (!response.body) throw new Error('Le flux de réponse est indisponible.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let notification: string | null = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      for (const line of event.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice('data: '.length)
        if (data === '[DONE]') return { notification }
        const payload = JSON.parse(data)
        if (payload.error) throw new Error(payload.error)
        if (payload.content) onContent(payload.content)
        if (payload.done) notification = payload.notification ?? null
      }
    }
  }
  throw new Error('La réponse a été interrompue.')
}
