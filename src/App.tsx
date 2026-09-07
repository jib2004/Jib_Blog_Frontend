import { type FormEvent, useEffect, useState } from 'react'
import { api, getAuthorEmail, getId, getToken,type ApiPost, type ApiUser} from './api'


type Post = { id: string; title: string; content: string; author: string; createdAt: string,user_id?:string  }
type Session = { user: ApiUser; token: string }

function normalizePost(post: ApiPost, currentEmail = ''): Post {
  return { id: getId(post),user_id:post.user_id, title: post.title, content: post.content, author: getAuthorEmail(post.author, currentEmail), createdAt: post.created_at || post.createdAt || 'Recently' }
}



function App() {
  const [posts, setPosts] = useState<Post[]>([])
  const [session, setSession] = useState<Session | null>(() => JSON.parse(localStorage.getItem('jib-session') || 'null'))
  const [page, setPage] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [editor, setEditor] = useState<Post | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')


  useEffect(() => session ? localStorage.setItem('jib-session', JSON.stringify(session)) : localStorage.removeItem('jib-session'), [session])

  useEffect(() => {
    if (!session) return
    // setLoading(true)
    Promise.all([api.me(session.token), api.blogs()]).then(([user, apiPosts]) => {
      // setSession({ ...session, user })
      setPosts((apiPosts as ApiPost[]).map((post) => normalizePost({...post}, user.email)))
    }).catch((error: Error) => { setDashboardError(error.message) }).finally(() => setLoading(false))
  }, [])

  

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault()
    const email = authForm.email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email) || authForm.password.length < 8) { setAuthError('Enter a valid email and a password with at least 8 characters.'); return }
    setLoading(true); setAuthError('')
    try {
      if (page === 'register') {
        await api.register(email, authForm.password)
        setPage('login')
        setAuthForm({ email: '', password: '' })
       
        return
      }

      const response = await api.login(email, authForm.password)
      const token = getToken(response)
      if (!token) throw new Error('The API did not return a JWT token.')
      const user = response?.userInfo || await api.me(token)
      setSession({ user, token }); 
      setAuthForm({ email: '', password: '' })
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to authenticate.') } finally { setLoading(false) }
  }

  if (!session) return <AuthPage page={page} form={authForm} error={authError} onChange={setAuthForm} onSubmit={submitAuth} onSwitch={() => { setPage(page === 'login' ? 'register' : 'login'); setAuthError('') }} />

  const loggedInUserId = String(session.user.id ?? session.user._id ?? '')
  const ownedPosts = posts.filter((post) => String(post.user_id ?? '') === loggedInUserId)
  const visiblePosts = posts.filter((post) => `${post.title} ${post.content}`.toLowerCase().includes(search.toLowerCase()))
  const savePost = async (post: Post) => {
    try {
      const saved = post.id
        ? await api.updateBlog(post.id, post, loggedInUserId, session.token)
        : await api.createBlog(post, loggedInUserId, session.token)
      const normalized = normalizePost(saved, session.user.email)
      setPosts(post.id ? posts.map((item) => item.id === post.id ? normalized : item) : [normalized, ...posts]); setEditor(null); setDashboardError('')
    } catch (error) { setDashboardError(error instanceof Error ? error.message : 'Unable to save post.') }
  }
  const deletePost = async (post: Post) => {
    const isOwner = String(post.user_id ?? '') === loggedInUserId
    if (!isOwner && !session.user.admin && !session.user.is_admin) return
    try {
      await api.deleteBlog(post.id, session.token)
      setPosts(posts.filter((item) => item.id !== post.id))
    } catch (error) { setDashboardError(error instanceof Error ? error.message : 'Unable to delete post.') }
  }
  const signOut = async () => { try { await api.logout(session.token) } catch { /* The local session is still cleared if the API is unavailable. */ } finally { setSession(null) } }

  return <div className="dashboard"><header className="dashboard-header"><a className="brand" href="."><span className="brand-mark">j</span> jib<span className="brand-dot">.</span>blog</a><div className="account"><span>{session?.user.email}</span><button onClick={signOut}>Sign out</button></div></header><main className="content"><div className="page-title"><div><p className="eyebrow">Workspace</p><h1>Stories</h1><p className="muted">Create, edit, and manage your published writing.</p></div><button className="primary" onClick={() => setEditor({ id: '', title: '', content: '', author: session.user.email, createdAt: '' })}>+ New post</button></div>{dashboardError && <p className="error">{dashboardError}</p>}{loading ? <p className="empty">Loading posts...</p> : <><div className="stats"><div><strong>{posts.length}</strong><span>Total posts</span></div><div><strong>{ownedPosts.length}</strong><span>Your posts</span></div><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search posts" aria-label="Search posts" /></label></div><section className="post-list"><div className="list-heading"><span>Post</span><span>Author</span><span>Published</span><span>Actions</span></div>{visiblePosts.map((post) => {
          const isOwner = String(post.user_id ?? '') === loggedInUserId
          return <article className="post-row" key={post.id}><div><h2>{post.title}</h2><p>{post.content}</p></div><span className="author">{isOwner ? 'You' : post.author}</span><span className="date">{post.createdAt}</span><div className="actions">{isOwner || session.user.admin || session.user.is_admin ? <><button onClick={() => setEditor(post)}>Edit</button><button onClick={() => deletePost(post)}>Delete</button></> : <span className="locked">View only</span>}</div></article>
        })}{visiblePosts.length === 0 && <p className="empty">No posts match your search.</p>}</section></>}</main>{editor && <PostEditor post={editor} onClose={() => setEditor(null)} onSave={savePost} />}</div>
}

function AuthPage({ page, form, error, onChange, onSubmit, onSwitch }: { page: 'login' | 'register'; form: { email: string; password: string }; error: string; onChange: (form: { email: string; password: string }) => void; onSubmit: (event: FormEvent) => void; onSwitch: () => void }) {
  return <div className="auth-page"><div className="auth-panel"><a className="brand" href="."><span className="brand-mark">j</span> jib<span className="brand-dot">.</span>blog</a><div className="auth-copy"><p className="eyebrow">Private publishing space</p><h1>{page === 'login' ? 'Welcome back.' : 'Create your account.'}</h1><p className="muted">{page === 'login' ? 'Sign in to manage your stories.' : 'Join jib.blog and start publishing.'}</p></div><form className="auth-form" onSubmit={onSubmit}><label>Email address<input type="email" value={form.email} onChange={(event) => onChange({ ...form, email: event.target.value })} required /></label><label>Password<input type="password" value={form.password} onChange={(event) => onChange({ ...form, password: event.target.value })} minLength={8} required /></label>{error && <p className="error">{error}</p>}<button className="primary full" type="submit">{page === 'login' ? 'Sign in' : 'Register'} <span>↗</span></button></form><p className="switch">{page === 'login' ? 'No account yet?' : 'Already registered?'} <button onClick={onSwitch}>{page === 'login' ? 'Register' : 'Sign in'}</button></p></div><div className="auth-aside"><span className="aside-number">J/01</span><p>Write what<br /><em>matters.</em></p><span className="aside-footer">A simple place for<br />considered ideas.</span></div></div>
}

 function PostEditor({ post, onClose, onSave }: { post: Post; onClose: () => void; onSave: (post: Post) => void }) {
  const [draft, setDraft] = useState(post)
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => { 
    event.preventDefault(); 
  

    if (draft.title.trim().length < 3 || draft.content.trim().length < 20) { setError('Title must be 5+ characters and content must be 20+ characters.'); return } onSave({ ...draft, title: draft.title.trim(), content: draft.content.trim(), }) }
  return <div className="modal-backdrop"><div className="editor-modal"><button className="close" onClick={onClose}>×</button><p className="eyebrow">Post editor</p><h2>{post.id ? 'Edit post' : 'New post'}</h2><form onSubmit={submit}><label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Content<textarea rows={8} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>{error && <p className="error">{error}</p>}<button className="primary full" type="submit">{post.id ? 'Save changes' : 'Publish post'} <span>↗</span></button></form></div></div>
}

export default App
