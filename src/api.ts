const API_URL = import.meta.env.VITE_API_URL

export type ApiUser = { id?: string; _id?: string; email: string; admin?: boolean; is_admin?: boolean }
export type ApiPost = { id?: string; _id?: string; title: string; content: string; author?: ApiUser | string; user_id?: string; created_at?: string; createdAt?: string; }

type ApiOptions = RequestInit & { token?: string }

async function request<T>(path: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
  const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.message || body?.error || 'The API request failed.'
    throw new Error(message)
  }
  return body as T
}

function unwrap<T>(body: T | { data?: T; user?: T; blog?: T; blogs?: T; posts?: T; token?: string }) {
  if (body && typeof body === 'object') {
    const value = body as { data?: T; user?: T; blog?: T; blogs?: T; posts?: T }
    return value.data ?? value.user ?? value.blog ?? value.blogs ?? value.posts ?? body as T
  }
  return body as T
}

export const api = {
  register: async (email: string, password: string) => request<{ token?: string; access_token?: string; user_token?: string; user?: ApiUser }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: async (email: string, password: string) => request<{ token?: string; access_token?: string; user_token?: string; user?: ApiUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: (token: string) => request<unknown>('/auth/logout', { method: 'POST', token }),
  me: async (token: string) => unwrap(await request<ApiUser | { user: ApiUser }>('/auth/me', { token })),
  blogs: async () => unwrap(await request<ApiPost[] | { blogs: ApiPost[]; posts: ApiPost[] }>('/blog/')),
  createBlog: async (post: Pick<ApiPost, 'title' | 'content'>, token: string) => unwrap(await request<ApiPost>('/blog/', { method: 'POST', token, body: JSON.stringify(post) })),
  updateBlog: async (id: string, post: Pick<ApiPost, 'title' | 'content'>, token: string) => unwrap(await request<ApiPost>(`/blog/${id}`, { method: 'PUT', token, body: JSON.stringify(post) })),
  deleteBlog: (id: string, token: string) => request<unknown>(`/blog/${id}`, { method: 'DELETE', token }),
}

export function getToken(body: { token?: string; access_token?: string; user_token?: string } | null | undefined) {
  if (!body || typeof body !== 'object') return ''
  return body.token || body.access_token || body.user_token || ''
}

export function getId(value: ApiUser | ApiPost | string | undefined) {
  if (typeof value === 'string') return value
  return value?.id || value?._id || ''
}

export function getAuthorEmail(author: ApiPost['author'], fallback = '') {
  return typeof author === 'string' ? author : author?.email || fallback
}
