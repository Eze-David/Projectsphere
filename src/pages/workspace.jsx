import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, Check, CircleAlert, Mail, Receipt } from 'lucide-react';
import { MyPayments } from './allocations.jsx';
import { Avatar, Empty, Modal, Progress } from '../components/ui.jsx';
import { formatDate, matchesQuery, shortDate } from '../hooks.js';
import {
  access, allPeople, canApproveFor, inviteMessage, isOverdue, memberName, money, progressOf, ROLES, roleOf, spentOf, statusClass, TODAY, useStore,
} from '../store.jsx';
import { Labels, PriorityFlag } from './tasks.jsx';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

/* ---------- Me: my tasks across every project ---------- */

export function MyTasks() {
  const { projects, apiFor, me: myName, user } = useStore();
  const [me, setMe] = useState(myName);
  const [showDone, setShowDone] = useState(false);
  const navigate = useNavigate();
  const people = allPeople(projects);
  const weekOut = addDays(TODAY, 7);

  const mine = projects.flatMap((p) => p.tasks.filter((t) => t.assignees.includes(me)).map((t) => ({ p, t })));
  const open = mine.filter(({ t }) => t.status !== 'Done').sort((a, b) => (a.t.due || '9999').localeCompare(b.t.due || '9999'));
  const groups = [
    ['Overdue', open.filter(({ t }) => isOverdue(t))],
    ['Due this week', open.filter(({ t }) => t.due && t.due >= TODAY && t.due <= weekOut)],
    ['Later', open.filter(({ t }) => t.due && t.due > weekOut)],
    ['No due date', open.filter(({ t }) => !t.due)],
  ];
  if (showDone) groups.push(['Completed', mine.filter(({ t }) => t.status === 'Done')]);

  const toggleDone = (p, t) =>
    apiFor(p.id).patch('tasks', t.id, t.status === 'Done' ? { status: 'In progress', progress: 50 } : { status: 'Done', progress: 100 });

  return (
    <div className="page">
      <div className="page-head">
        <div className="row-start">
          {me && <Avatar name={me} size="lg" />}
          <div>
            <h1>{me === myName ? 'My tasks' : `${me}’s tasks`}</h1>
            <p className="meta">{open.length} open · {mine.length - open.length} completed</p>
          </div>
        </div>
        <div className="btn-row tight">
          <label className="meta">Viewing as{' '}
            <select className="select-sm" value={me} onChange={(e) => setMe(e.target.value)}>
              {!people.some((u) => u.name === me) && <option>{me}</option>}
              {people.map((u) => <option key={u.name}>{u.name}</option>)}
            </select>
          </label>
          <label className="check-inline"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed</label>
        </div>
      </div>

      {me === myName && <ApprovalQueue projects={projects} apiFor={apiFor} userId={user.id} />}
      {me === myName && <MyPayments projects={projects} apiFor={apiFor} userId={user.id} />}

      {mine.length === 0 ? <Empty>No tasks assigned to {me}. Tasks are matched by the assignee’s name.</Empty> : (
        groups.filter(([, items]) => items.length).map(([title, items]) => (
          <section key={title} className="task-group">
            <h3 className={title === 'Overdue' ? 'overdue' : ''}>{title} <span className="col-count">{items.length}</span></h3>
            <ul className="task-rows">
              {items.map(({ p, t }) => (
                <li key={`${p.id}-${t.id}`} className={t.status === 'Done' ? 'done' : ''}>
                  <input type="checkbox" checked={t.status === 'Done'} onChange={() => toggleDone(p, t)} aria-label={`Mark ${t.title} done`} />
                  <button className="task-row-main" onClick={() => navigate(`/projects/${p.id}/tasks?task=${t.id}`)}>
                    <strong>{t.title}</strong>
                    <span className="meta">#{t.number} · {p.name} · {p.taskLists.find((l) => l.id === t.listId)?.name}</span>
                  </button>
                  <Labels labels={t.labels} />
                  <span className={statusClass(t.status)}>{t.status}</span>
                  <span className={`meta due ${isOverdue(t) ? 'overdue' : ''}`}>{t.due ? shortDate(t.due) : '—'}</span>
                  <PriorityFlag priority={t.priority} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

// Everything across all projects that's waiting for this person's approval.
function ApprovalQueue({ projects, apiFor, userId }) {
  const expenses = projects.flatMap((p) => p.expenses
    .filter((e) => e.status === 'Pending' && canApproveFor(p, userId, e.createdBy))
    .map((e) => ({ p, e })));
  const problems = projects.flatMap((p) => (access(p, userId, 'budget') >= 3 ? p.allocationPayments : [])
    .filter((x) => x.status === 'Problem')
    .map((x) => ({ p, x })));
  const requests = projects.flatMap((p) => p.budgetRequests
    .filter((r) => r.status === 'Pending' && canApproveFor(p, userId, r.requestedBy))
    .map((r) => ({ p, r })));
  if (!expenses.length && !requests.length && !problems.length) return null;

  return (
    <section className="task-group">
      <h3>Waiting for you <span className="col-count">{expenses.length + requests.length + problems.length}</span></h3>
      <ul className="task-rows">
        {expenses.map(({ p, e }) => (
          <li key={e.id}>
            <Receipt size={16} className="muted" />
            <Link className="task-row-main" to={`/projects/${p.id}/expenses`}>
              <strong>{e.description} · {money(e.amount)}</strong>
              <span className="meta">Expense · {p.name} · from {memberName(p, e.createdBy) || 'someone'} · {shortDate(e.date)}</span>
            </Link>
            <button className="btn btn-success btn-sm" onClick={() => apiFor(p.id).decideExpense(e.id, 'Approved')}><Check size={15} /> Approve</button>
            <Link className="btn btn-outline btn-sm" to={`/projects/${p.id}/expenses`}>Review</Link>
          </li>
        ))}
        {problems.map(({ p, x }) => (
          <li key={x.id}>
            <CircleAlert size={16} className="overdue" />
            <Link className="task-row-main" to={`/projects/${p.id}/budget`}>
              <strong>Payment problem: {money(x.amount)} to {memberName(p, x.payee) || 'team member'}</strong>
              <span className="meta">{p.name} · “{x.payeeNote}”</span>
            </Link>
            <Link className="btn btn-outline btn-sm" to={`/projects/${p.id}/budget`}>Review</Link>
          </li>
        ))}
        {requests.map(({ p, r }) => (
          <li key={r.id}>
            <Banknote size={16} className="muted" />
            <Link className="task-row-main" to={`/projects/${p.id}/budget`}>
              <strong>{r.costId ? `${r.code} ${r.description}: ${money(r.currentAmount)} → ${money(r.amount)}` : `New line ${r.code} ${r.description}: ${money(r.amount)}`}</strong>
              <span className="meta">Budget change · {p.name} · from {r.requestedByName || 'someone'} · “{r.reason}”</span>
            </Link>
            <Link className="btn btn-outline btn-sm" to={`/projects/${p.id}/budget`}>Review</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Reports: health of every project ---------- */

export function Reports() {
  const { projects, user } = useStore();
  // Money totals only include projects where this person can see the budget.
  const moneyProjects = projects.filter((p) => access(p, user.id, 'budget') >= 1);
  const tasks = projects.flatMap((p) => p.tasks);
  const contract = moneyProjects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const spent = moneyProjects.reduce((s, p) => s + spentOf(p), 0);

  return (
    <div className="page">
      <div className="page-head"><h1>Reports</h1></div>

      <div className="stats mb">
        <div className="stat"><strong>{tasks.filter((t) => t.status === 'Done').length}/{tasks.length}</strong><span>Tasks completed</span></div>
        <div className="stat"><strong>{tasks.filter(isOverdue).length}</strong><span>Overdue tasks</span></div>
        <div className="stat"><strong>{tasks.reduce((s, t) => s + Number(t.hours || 0), 0)}h</strong><span>Hours logged</span></div>
        <div className="stat"><strong>{contract ? Math.round((spent / contract) * 100) : 0}%</strong><span>Of contract value spent</span></div>
      </div>

      {projects.length === 0 ? <Empty>No projects yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th><th>Status</th><th>Progress</th><th className="num">Open tasks</th><th className="num">Overdue</th>
                <th className="num">Open requests for information</th><th className="num">Spent / budget</th><th>Next milestone</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const next = p.milestones.filter((m) => !m.done).sort((a, b) => a.date.localeCompare(b.date))[0];
                const overdue = p.tasks.filter(isOverdue).length;
                const used = p.budget ? spentOf(p) / p.budget : 0;
                return (
                  <tr key={p.id}>
                    <td><Link className="table-link" to={`/projects/${p.id}/overview`}>{p.name}</Link></td>
                    <td><span className={statusClass(p.status)}>{p.status}</span></td>
                    <td className="progress-cell"><Progress value={progressOf(p)} /><span className="meta">{Math.round(progressOf(p) * 100)}%</span></td>
                    <td className="num">{p.tasks.filter((t) => t.status !== 'Done').length}</td>
                    <td className={`num ${overdue ? 'overdue' : ''}`}>{overdue}</td>
                    <td className="num">{access(p, user.id, 'rfis') >= 1 ? p.rfis.filter((r) => r.status === 'Open').length : '—'}</td>
                    <td className={`num ${used > 1 ? 'overdue' : ''}`}>{access(p, user.id, 'budget') >= 1 ? `${money(spentOf(p))} / ${money(p.budget)}` : '—'}</td>
                    <td>{next ? <>{next.name} <span className="meta">{formatDate(next.date)}</span></> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- People: everyone across all projects ---------- */

export function People() {
  const { projects, user } = useStore();
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState(false);
  const people = allPeople(projects).filter((u) => matchesQuery(query, u.name, u.role, u.company, u.email));
  const openTasks = (name) => projects.reduce((n, p) => n + p.tasks.filter((t) => t.assignees.includes(name) && t.status !== 'Done').length, 0);
  // Projects where this person may invite (owners and project managers).
  const ownedProjects = projects.filter((p) => access(p, user.id, 'team') >= 3);

  return (
    <div className="page">
      <div className="page-head">
        <h1>People</h1>
        <div className="btn-row tight">
          <input className="search-input sm" type="search" placeholder="Search people…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {ownedProjects.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setInviting(true)}><Mail size={16} /> Invite people</button>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <Empty>
          <h3>No people yet</h3>
          <p>People are added to projects. Create a project first, then invite your team to it.</p>
          <Link to="/projects?new=1" className="btn btn-primary btn-sm">Create a project</Link>
        </Empty>
      ) : people.length === 0 ? <Empty>No people match your search.</Empty> : (
        <div className="grid grid-3">
          {people.map((u) => (
            <div key={u.name} className="card card-body speaker">
              <Avatar name={u.name} size="lg" />
              <div className="grow">
                <h4>{u.name}</h4>
                <p className="meta">{[u.role, u.company, u.hasAccount && 'Has access'].filter(Boolean).join(' · ') || 'Assignee'}</p>
                <p className="meta">{openTasks(u.name)} open tasks</p>
                <div className="chip-links">
                  {u.projects.map((p) => <Link key={p.id} to={`/projects/${p.id}/team`}>{p.name}</Link>)}
                </div>
                {u.email && <a className="link-btn" href={`mailto:${u.email}`}>{u.email}</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      {inviting && <InviteModal projects={ownedProjects} onClose={() => setInviting(false)} />}
    </div>
  );
}

// Invite one email address to one or more projects you own.
function InviteModal({ projects, onClose }) {
  const { apiFor } = useStore();
  const [email, setEmail] = useState('');
  const { user } = useStore();
  const [selected, setSelected] = useState(projects.length === 1 ? [projects[0].id] : []);
  const [role, setRole] = useState('site_engineer');
  // Only owners of every chosen project can invite another owner.
  const canInviteOwner = selected.length > 0 && selected.every((id) => roleOf(projects.find((p) => p.id === id), user.id) === 'owner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email');
    if (!selected.length) return setError('Choose at least one project');
    setBusy(true);
    setError('');
    try {
      const outcomes = [];
      // One email at most: after the first invite creates their account, the rest are added straight away.
      for (const id of selected) outcomes.push(await apiFor(id).invite(email.trim(), role === 'owner' && !canInviteOwner ? 'site_engineer' : role));
      setResult(inviteMessage(email.trim(), ROLES[role], outcomes));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title="Invite people">
      {result ? (
        <>
          <p>{result}</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { setResult(''); setEmail(''); }}>Invite someone else</button>
            <button className="btn btn-outline" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Email</span>
            <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLES).filter(([r]) => r !== 'owner' || canInviteOwner).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="meta">Decides what they can see and do. You can change it later on the project’s Team page.</span>
          </label>
          <div className="field">
            <span>Give access to</span>
            <div className="pick-list">
              {projects.map((p) => (
                <button type="button" key={p.id} className={`pick ${selected.includes(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
                  <span className="dot" style={{ background: `hsl(${p.hue} 70% 50%)` }} /> {p.name}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary full" disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</button>
          <p className="meta">Only projects where you can invite people are listed. New people get an email inviting them to sign up.</p>
        </form>
      )}
    </Modal>
  );
}
