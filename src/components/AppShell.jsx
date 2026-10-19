import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ChartColumn, Folder, House, LogOut, Pencil, Users, X } from 'lucide-react';
import { Avatar, Dropdown, Modal, SimpleForm } from './ui.jsx';
import { useStore } from '../store.jsx';

const railLinks = [
  { to: '/me', label: 'Me', icon: House },
  { to: '/projects', label: 'Projects', icon: Folder },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
  { to: '/people', label: 'People', icon: Users },
];

export default function AppShell() {
  const { me, user, loading, error, clearError, signOut, setMyName, needsMigration } = useStore();
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        {railLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="rail-link">
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
        <Dropdown
          className="rail-me"
          trigger={({ toggle }) => (
            <button className="avatar-btn" onClick={toggle} title={`Signed in as ${me}`}><Avatar name={me} size="md" /></button>
          )}
        >
          {(close) => (
            <>
              <div className="menu-user"><strong>{me}</strong><span className="meta">{user.email}</span></div>
              <hr />
              <button onClick={() => { close(); setRenaming(true); }}><Pencil size={14} /> Change display name</button>
              <button onClick={() => { close(); signOut(); }}><LogOut size={14} /> Sign out</button>
            </>
          )}
        </Dropdown>
      </nav>

      <div className="shell-main">
        {error && (
          <div className="error-banner" role="alert">
            <span>Couldn’t save to the server: {error}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={clearError}><X size={16} /></button>
          </div>
        )}
        {needsMigration && (
          <div className="info-banner" role="status">
            Some features need a database update. In the Supabase SQL editor, run the newest file(s) in
            {' '}<code>supabase/migrations/</code> (latest: <code>20261020000000_preliminaries_status.sql</code>), then refresh.
          </div>
        )}
        {loading ? <div className="page muted">Loading your projects…</div> : <Outlet />}
      </div>

      <Modal open={renaming} onClose={() => setRenaming(false)} title="Display name">
        <p className="muted small">This is the name teammates see on comments and use to assign you tasks.</p>
        <SimpleForm
          fields={[{ name: 'name', label: 'Full name', required: true, full: true }]}
          initial={{ name: me }}
          submitLabel="Save"
          onSubmit={async ({ name }) => {
            await setMyName(name.trim()).catch((e) => alert(e.message));
            setRenaming(false);
          }}
        />
      </Modal>
    </div>
  );
}
