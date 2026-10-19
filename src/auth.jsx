import { useEffect, useState } from 'react';
import { arrivedFromInvite, isConfigured, supabase } from './supabase.js';
import { StoreProvider } from './store.jsx';

// Shows the sign-in screen until there is a session, then renders the app with its data store.
export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [recovering, setRecovering] = useState(false);
  const [welcoming, setWelcoming] = useState(arrivedFromInvite);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <SetupNeeded />;
  if (session === undefined) return <div className="auth-page"><p className="muted">Loading…</p></div>;
  if (recovering && session) return <NewPassword onDone={() => setRecovering(false)} />;
  if (welcoming && session) return <Welcome session={session} onDone={() => setWelcoming(false)} />;
  if (!session) return <SignIn />;
  return <StoreProvider key={session.user.id} session={session}>{children}</StoreProvider>;
}

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><span className="logo-mark">P</span> ProjectSphere</div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function SignIn() {
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const switchTo = (m) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const email = form.email.trim();
    let result;
    if (mode === 'signin') {
      result = await supabase.auth.signInWithPassword({ email, password: form.password });
    } else if (mode === 'signup') {
      result = await supabase.auth.signUp({
        email,
        password: form.password,
        options: { data: { full_name: form.name.trim() }, emailRedirectTo: window.location.origin },
      });
      if (!result.error && !result.data.session) setNotice('Check your email and click the link to confirm your account.');
    } else {
      result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (!result.error) setNotice('If that email has an account, a reset link is on its way.');
    }
    if (result.error) setError(result.error.message);
    setBusy(false);
  };

  const titles = {
    signin: ['Sign in', 'Welcome back to your projects.'],
    signup: ['Create your account', 'Your team will see projects you share with them.'],
    reset: ['Reset your password', 'We’ll email you a link to set a new one.'],
  };

  return (
    <AuthCard title={titles[mode][0]} subtitle={titles[mode][1]}>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && (
          <label className="field">
            <span>Full name</span>
            <input required value={form.name} onChange={set('name')} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input required type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </label>
        {mode !== 'reset' && (
          <label className="field">
            <span>Password</span>
            <input required type="password" minLength={6} value={form.password} onChange={set('password')}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="btn btn-primary full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>

      <div className="auth-links">
        {mode === 'signin' ? (
          <>
            <button className="link-btn" onClick={() => switchTo('signup')}>Create an account</button>
            <button className="link-btn" onClick={() => switchTo('reset')}>Forgot password?</button>
          </>
        ) : (
          <button className="link-btn" onClick={() => switchTo('signin')}>Back to sign in</button>
        )}
      </div>
    </AuthCard>
  );
}

function NewPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  };

  return (
    <AuthCard title="Choose a new password">
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary full" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthCard>
  );
}

// First visit from an invite email: they're signed in by the link; ask for their name and a password.
function Welcome({ session, onDone }) {
  const meta = session.user.user_metadata ?? {};
  const [name, setName] = useState(meta.full_name ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.updateUser({ password, data: { full_name: name.trim() } });
    if (authError) {
      setBusy(false);
      return setError(authError.message);
    }
    await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', session.user.id);
    setBusy(false);
    onDone();
  };

  return (
    <AuthCard
      title="Welcome to ProjectSphere"
      subtitle={meta.project_name
        ? `${meta.invited_by ?? 'A teammate'} invited you to ${meta.project_name}${meta.role_label ? ` as ${meta.role_label}` : ''}. Set up your account to continue.`
        : 'You’ve been invited. Set up your account to continue.'}
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Your full name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <small className="meta">Teammates see this name, and it’s used to assign you tasks.</small>
        </label>
        <label className="field">
          <span>Email</span>
          <input value={session.user.email} disabled />
        </label>
        <label className="field">
          <span>Choose a password</span>
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary full" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Continue'}</button>
      </form>
    </AuthCard>
  );
}

function SetupNeeded() {
  return (
    <AuthCard title="Connect Supabase" subtitle="The app needs a Supabase project before anyone can sign in.">
      <ol className="setup-steps">
        <li>Create a project at supabase.com.</li>
        <li>Run <code>supabase/migrations/20261015000000_init.sql</code> in its SQL editor.</li>
        <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in the project URL and anon key (Project Settings → API).</li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
    </AuthCard>
  );
}
