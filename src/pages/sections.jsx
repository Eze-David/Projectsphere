import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Camera, Check, Mail, Plus, Trash2, X } from 'lucide-react';
import { Avatar, Empty, FilterBar, Modal, Progress, SimpleForm } from '../components/ui.jsx';
import { AttachmentBadge, AttachmentThumbs, Attachments, uploadPending } from '../components/Attachments.jsx';

import { formatDate } from '../hooks.js';
import { RFI_STATUSES, STANDARD_COST_CODES, TASK_STATUSES, TRADES, WEATHER } from '../data/projects.js';
import {
  access, ACCESS, allocatedOf, AREAS, inviteMessage, canApprove, canApproveFor, countedExpenses, expensesOf, isOverdue, levelLabel, money, progressOf, ROLES, roleOf,
  paidOutOf, slug, spentOf, statusClass, sumOf, TODAY, useStore,
} from '../store.jsx';
import { AllocationsSection } from './allocations.jsx';

export function PageHead({ title, children }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function DeleteButton({ onClick }) {
  return <button className="btn btn-outline danger full mt-sm" onClick={onClick}>Delete</button>;
}

/* ---------- Overview ---------- */

export function Overview() {
  const { project } = useOutletContext();
  const { user } = useStore();
  const can = (area) => access(project, user.id, area) >= 1;
  const spent = spentOf(project);
  const nextMilestones = project.milestones.filter((m) => !m.done).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const latestLog = [...project.logs].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="page">
      <PageHead title="Overview"><span className={statusClass(project.status)}>{project.status}</span></PageHead>
      <div className="layout-sidebar">
        <div>
          <div className="stats mb">
            <div className="stat"><strong>{Math.round(progressOf(project) * 100)}%</strong><span>Complete</span></div>
            <div className="stat"><strong>{project.tasks.filter((t) => t.status !== 'Done').length}</strong><span>Open tasks</span></div>
            {can('rfis') && <div className="stat"><strong>{project.rfis.filter((r) => r.status === 'Open').length}</strong><span>Open requests for information</span></div>}
            <div className="stat"><strong>{project.tasks.filter(isOverdue).length}</strong><span>Overdue tasks</span></div>
          </div>

          <div className="card card-body mb">
            <div className="row-between"><h3>Tasks by stage</h3><Link className="link-btn" to="../tasks">View board →</Link></div>
            <div className="stage-bar">
              {TASK_STATUSES.map((s) => {
                const n = project.tasks.filter((t) => t.status === s).length;
                return n ? <span key={s} className={`stage-${slug(s)}`} style={{ flex: n }} title={`${s}: ${n}`} /> : null;
              })}
            </div>
            <div className="legend">
              {TASK_STATUSES.map((s) => <span key={s}><i className={`stage-${slug(s)}`} /> {s} ({project.tasks.filter((t) => t.status === s).length})</span>)}
            </div>
          </div>

          {can('budget') && (
            <div className="card card-body mb">
              <div className="row-between"><h3>Budget</h3><Link className="link-btn" to="../budget">View →</Link></div>
              <Progress value={project.budget ? spent / project.budget : 0} />
              <p className="meta">{money(spent)} spent of {money(project.budget)} ({money(project.budget - spent)} remaining)</p>
            </div>
          )}

          <div className="card card-body mb">
            <div className="row-between"><h3>Upcoming milestones</h3><Link className="link-btn" to="../milestones">View →</Link></div>
            {nextMilestones.length === 0 ? <p className="muted">No upcoming milestones.</p> : (
              <ul className="plain-list">
                {nextMilestones.map((m) => (
                  <li key={m.id} className="row-between"><span>{m.name}</span><span className="meta">{formatDate(m.date)}</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className="card card-body">
            <div className="row-between"><h3>Latest daily log</h3><Link className="link-btn" to="../logs">View →</Link></div>
            {latestLog ? (
              <><p className="meta">{formatDate(latestLog.date)} · {latestLog.weather} · {latestLog.crew} on site</p><p>{latestLog.notes}</p></>
            ) : <p className="muted">No logs yet.</p>}
          </div>
        </div>

        <aside className="card card-body">
          <h3>Details</h3>
          <dl className="details">
            <dt>Client</dt><dd>{project.client || '—'}</dd>
            <dt>Type</dt><dd>{project.type || '—'}</dd>
            <dt>Location</dt><dd>{project.location || '—'}</dd>
            <dt>Start</dt><dd>{project.start ? formatDate(project.start) : '—'}</dd>
            <dt>Completion</dt><dd>{project.end ? formatDate(project.end) : '—'}</dd>
            {can('budget') && <><dt>Contract value</dt><dd>{money(project.budget)}</dd></>}
            {can('team') && <><dt>Team</dt><dd>{project.members.length} with access · {project.team.length} contacts</dd></>}
            <dt>Your role</dt><dd>{ROLES[roleOf(project, user.id)] ?? '—'}</dd>
          </dl>
          {project.description && <p className="muted small">{project.description}</p>}
        </aside>
      </div>
    </div>
  );
}

/* ---------- Milestones ---------- */

export function Milestones() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const canEdit = access(project, user.id, 'tasks') >= 3;
  const [adding, setAdding] = useState(false);
  const milestones = [...project.milestones].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="page">
      <PageHead title="Milestones">
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={16} /> Add milestone</button>}
      </PageHead>
      <p className="muted">{project.milestones.filter((m) => m.done).length} of {project.milestones.length} milestones complete</p>

      {milestones.length === 0 ? <Empty>No milestones yet.</Empty> : (
        <ul className="lesson-list">
          {milestones.map((m) => (
            <li key={m.id} className={m.done ? 'done' : ''}>
              <label>
                <input type="checkbox" checked={m.done} disabled={!canEdit} onChange={(e) => api.patch('milestones', m.id, { done: e.target.checked })} />
                <span>{m.name}</span>
              </label>
              <div className="btn-row tight">
                <span className={`meta ${!m.done && m.date < TODAY ? 'overdue' : ''}`}>{formatDate(m.date)}</span>
                {canEdit && <button className="icon-btn" aria-label="Delete milestone" onClick={() => api.remove('milestones', m.id)}><Trash2 size={15} /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New milestone">
        <SimpleForm
          fields={[
            { name: 'name', label: 'Milestone', required: true, full: true },
            { name: 'date', label: 'Date', type: 'date', required: true },
          ]}
          submitLabel="Add milestone"
          onSubmit={(v) => { api.add('milestones', { ...v, done: false }); setAdding(false); }}
        />
      </Modal>
    </div>
  );
}

/* ---------- Budget ---------- */

export function Budget() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const [editing, setEditing] = useState(null);
  const [requesting, setRequesting] = useState(null); // { cost } for a change, {} for a new line
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState('');
  const approver = canApprove(project, user.id);
  const budgeted = sumOf(project.costs, 'budgeted');
  const spent = spentOf(project);
  const counted = countedExpenses(project);
  const unassigned = sumOf(counted.filter((e) => !project.costs.some((c) => c.id === e.costId)), 'amount');
  const requests = [...project.budgetRequests].sort((x, y) =>
    (x.status === 'Pending') === (y.status === 'Pending') ? y.createdAt.localeCompare(x.createdAt) : x.status === 'Pending' ? -1 : 1);
  const pendingFor = (costId) => project.budgetRequests.filter((r) => r.status === 'Pending' && r.costId === costId);

  const save = (v) => {
    const item = { ...v, budgeted: Number(v.budgeted) || 0, actual: Number(v.actual) || 0 };
    if (editing.id) api.patch('costs', editing.id, item);
    else api.add('costs', item);
    setEditing(null);
  };

  const submitRequest = (v) => {
    const cost = requesting.cost;
    api.add('budgetRequests', cost
      ? { costId: cost.id, code: cost.code, description: cost.description, amount: Number(v.amount) || 0, reason: v.reason }
      : { costId: '', code: v.code, description: v.description, amount: Number(v.amount) || 0, reason: v.reason });
    setRequesting(null);
  };

  const decide = async (r, approve, reason = '') => {
    try {
      await api.decideBudgetRequest(r.id, approve, reason);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="page">
      <PageHead title="Budget">
        {approver
          ? <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Plus size={16} /> Add line item</button>
          : <button className="btn btn-primary btn-sm" onClick={() => setRequesting({})}><Plus size={16} /> Request new line item</button>}
      </PageHead>

      <div className="grid grid-3 mb">
        <div className="stat"><strong>{money(project.budget)}</strong><span>Contract value</span></div>
        <div className="stat"><strong>{money(budgeted)}</strong><span>Budgeted line items</span></div>
        <div className="stat"><strong>{money(spent)}</strong><span>Spent to date</span></div>
      </div>
      <p className="muted small">
        Spent = expenses recorded against each cost code on the <Link className="link-btn" to="../expenses">Expenses</Link> page
        (rejected ones excluded), payments made from budget allocations, plus any other costs entered directly on the line.
        {!approver && ' Only owners and approvers can change the budget — use “Request change” to propose one.'}
      </p>

      {project.costs.length === 0 && unassigned === 0 ? <Empty>No budget line items yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th><th>Description</th><th className="num">Budgeted</th><th className="num">Allocated</th>
                <th className="num">Expenses</th><th className="num">Paid to people</th><th className="num">Other costs</th>
                <th className="num">Variance</th><th />
              </tr>
            </thead>
            <tbody>
              {project.costs.map((c) => {
                const exp = sumOf(expensesOf(project, c.id), 'amount');
                const paidOut = paidOutOf(project, c.id);
                const allocated = allocatedOf(project, c.id);
                const variance = c.budgeted - c.actual - exp - paidOut;
                const open = pendingFor(c.id).length;
                return (
                  <tr key={c.id}>
                    <td>{c.code}</td>
                    <td>{c.description}{open > 0 && <span className="pill-pending">{open} change pending</span>}</td>
                    <td className="num">{money(c.budgeted)}</td>
                    <td className={`num ${allocated > c.budgeted ? 'overdue' : 'meta'}`} title={allocated > c.budgeted ? 'More is allocated than budgeted' : undefined}>{allocated ? money(allocated) : '—'}</td>
                    <td className="num">{money(exp)}</td>
                    <td className="num">{paidOut ? money(paidOut) : '—'}</td>
                    <td className="num">{money(c.actual)}</td>
                    <td className={`num ${variance < 0 ? 'overdue' : 'positive'}`}>{money(variance)}</td>
                    <td className="num nowrap">
                      {approver
                        ? <button className="link-btn" onClick={() => setEditing(c)}>Edit</button>
                        : <button className="link-btn" onClick={() => setRequesting({ cost: c })}>Request change</button>}
                    </td>
                  </tr>
                );
              })}
              {unassigned > 0 && (
                <tr>
                  <td className="meta">—</td>
                  <td className="muted">Expenses without a cost code</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="num">{money(unassigned)}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="num overdue">{money(-unassigned)}</td>
                  <td />
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="num">{money(budgeted)}</td>
                <td className="num">{money(sumOf(project.allocations, 'amount'))}</td>
                <td className="num">{money(sumOf(counted, 'amount'))}</td>
                <td className="num">{money(sumOf(project.allocationPayments, 'amount'))}</td>
                <td className="num">{money(sumOf(project.costs, 'actual'))}</td>
                <td className={`num ${budgeted - spent < 0 ? 'overdue' : 'positive'}`}>{money(budgeted - spent)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <AllocationsSection project={project} api={api} userId={user.id} />

      <div className="page-head mt-lg">
        <h2 className="section-h">Change requests</h2>
      </div>
      {requests.length === 0 ? (
        <p className="muted small">{approver ? 'No requests yet. Members can propose budget changes for you to approve.' : 'No requests yet.'}</p>
      ) : (
        <ul className="request-list">
          {requests.map((r) => {
            const mayDecide = r.status === 'Pending' && canApproveFor(project, user.id, r.requestedBy);
            return (
              <li key={r.id} className={`request request-${r.status.toLowerCase()}`}>
                <div className="request-main">
                  <div className="row-start">
                    <strong>{r.costId ? `${r.code} ${r.description}` : `New line: ${r.code} ${r.description}`}</strong>
                    <span className={statusClass(r.status)}>{r.status}</span>
                  </div>
                  <p className="request-amounts">
                    {r.costId ? <>{money(r.currentAmount)} → <strong>{money(r.amount)}</strong>
                      <span className={r.amount - r.currentAmount > 0 ? 'overdue' : 'positive'}> ({r.amount - r.currentAmount > 0 ? '+' : ''}{money(r.amount - r.currentAmount)})</span></>
                      : <strong>{money(r.amount)}</strong>}
                  </p>
                  <p className="small">“{r.reason}”</p>
                  <p className="meta">
                    Requested by {r.requestedByName || 'someone'} · {formatDate(r.createdAt.slice(0, 10))}
                    {r.status !== 'Pending' && <> · {r.status.toLowerCase()} by {r.decidedByName} {r.decidedAt && `on ${formatDate(r.decidedAt.slice(0, 10))}`}{r.decisionNote && `: “${r.decisionNote}”`}</>}
                  </p>
                </div>
                <div className="btn-row tight">
                  {mayDecide && (
                    <>
                      <button className="btn btn-success btn-sm" onClick={() => decide(r, true)}><Check size={15} /> Approve</button>
                      <button className="btn btn-outline danger btn-sm" onClick={() => { setNote(''); setRejecting(r); }}><X size={15} /> Reject</button>
                    </>
                  )}
                  {r.status === 'Pending' && !mayDecide && r.requestedBy === user.id && (
                    <button className="link-btn" onClick={() => api.remove('budgetRequests', r.id)}>Withdraw</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit line item' : 'New line item'}>
        {editing && (
          <>
            {!editing.id && (
              <label className="field mb">
                <span>Start from a standard line (optional)</span>
                <select value="" onChange={(e) => {
                  const std = STANDARD_COST_CODES.find((c) => c.code === e.target.value);
                  if (std) setEditing({ ...editing, code: std.code, description: std.description });
                }}>
                  <option value="">Choose…</option>
                  {STANDARD_COST_CODES.filter((c) => !project.costs.some((x) => x.code === c.code))
                    .map((c) => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </label>
            )}
            <SimpleForm
              key={`${editing.id || 'new'}-${editing.code ?? ''}`}
              fields={[
                { name: 'code', label: 'Cost code', required: true },
                { name: 'description', label: 'Description', required: true },
                { name: 'budgeted', label: 'Budgeted (₦)', type: 'number', required: true },
                { name: 'actual', label: 'Other costs not in Expenses (₦)', type: 'number' },
              ]}
              initial={editing}
              submitLabel="Save line item"
              onSubmit={save}
            />
            {editing.id && (allocatedOf(project, editing.id) > 0
              ? <p className="meta mt-sm">This line has budget allocations, so it can’t be deleted. Remove its allocations first.</p>
              : <DeleteButton onClick={() => { api.remove('costs', editing.id); setEditing(null); }} />)}
          </>
        )}
      </Modal>

      <Modal open={!!requesting} onClose={() => setRequesting(null)} title={requesting?.cost ? `Request change: ${requesting.cost.code} ${requesting.cost.description}` : 'Request a new line item'}>
        {requesting && (
          <>
            {requesting.cost && <p className="meta mb">Currently budgeted: <strong>{money(requesting.cost.budgeted)}</strong></p>}
            <SimpleForm
              fields={[
                ...(requesting.cost ? [] : [
                  { name: 'code', label: 'Cost code', required: true },
                  { name: 'description', label: 'Description', required: true },
                ]),
                { name: 'amount', label: requesting.cost ? 'New budget amount (₦)' : 'Budget amount (₦)', type: 'number', required: true, full: !!requesting.cost },
                { name: 'reason', label: 'Reason for the change', type: 'textarea', required: true, full: true },
              ]}
              submitLabel="Send for approval"
              onSubmit={submitRequest}
            />
          </>
        )}
      </Modal>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject budget change">
        {rejecting && (
          <div className="auth-form">
            <label className="field">
              <span>Reason (the requester will see this) *</span>
              <textarea rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn btn-primary full" disabled={!note.trim()}
              onClick={() => { decide(rejecting, false, note.trim()); setRejecting(null); }}>Reject request</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- RFIs ---------- */

export function Rfis() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const canEdit = access(project, user.id, 'rfis') >= 3;
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState([]);
  const close = () => { setEditing(null); setPending([]); };
  const [status, setStatus] = useState('All');
  const rfis = project.rfis.filter((r) => status === 'All' || r.status === status).sort((a, b) => b.number - a.number);

  const save = (v) => {
    if (editing.id) api.patch('rfis', editing.id, v);
    else {
      const id = api.add('rfis', { ...v, number: Math.max(0, ...project.rfis.map((r) => r.number)) + 1 });
      if (pending.length) uploadPending(api, 'rfi', id, pending);
    }
    close();
  };

  return (
    <div className="page">
      <PageHead title="Requests for Information">
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEditing({ status: 'Open' })}><Plus size={16} /> New request</button>}
      </PageHead>
      <FilterBar options={RFI_STATUSES} active={status} onActive={setStatus} />

      {rfis.length === 0 ? <Empty>No requests for information.</Empty> : (
        <div className="table-wrap">
          <table className="table clickable">
            <thead><tr><th>#</th><th>Subject</th><th>Assigned to</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {rfis.map((r) => (
                <tr key={r.id} onClick={() => setEditing(r)}>
                  <td>{String(r.number).padStart(3, '0')}</td>
                  <td>{r.subject} <AttachmentBadge project={project} entityId={r.id} /></td>
                  <td>{r.assignee || '—'}</td>
                  <td className={r.status === 'Open' && r.due && r.due < TODAY ? 'overdue' : ''}>{r.due ? formatDate(r.due) : '—'}</td>
                  <td><span className={statusClass(r.status)}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={close} title={editing?.id ? `Request for Information #${String(editing.number).padStart(3, '0')}` : 'New request for information'} wide>
        {editing && !canEdit && (
          <>
            <dl className="details">
              <dt>Subject</dt><dd>{editing.subject}</dd>
              <dt>Assigned to</dt><dd>{editing.assignee || '—'}</dd>
              <dt>Due</dt><dd>{editing.due ? formatDate(editing.due) : '—'}</dd>
              <dt>Status</dt><dd>{editing.status}</dd>
              <dt>Question</dt><dd className="prewrap">{editing.question}</dd>
              <dt>Response</dt><dd className="prewrap">{editing.answer || '—'}</dd>
            </dl>
            <Attachments project={project} api={api} entityType="rfi" entityId={editing.id} readOnly label="Photos & marked-up drawings" />
          </>
        )}
        {editing && canEdit && (
          <>
            <SimpleForm
              key={editing.id || 'new'}
              fields={[
                { name: 'subject', label: 'Subject', required: true, full: true },
                { name: 'assignee', label: 'Assigned to' },
                { name: 'due', label: 'Due date', type: 'date' },
                { name: 'status', label: 'Status', type: 'select', options: RFI_STATUSES, required: true },
                { name: 'question', label: 'Question', type: 'textarea', required: true, full: true },
                { name: 'answer', label: 'Official response', type: 'textarea', full: true },
              ]}
              initial={editing}
              submitLabel="Save request"
              onSubmit={save}
            >
              <Attachments project={project} api={api} entityType="rfi" entityId={editing.id}
                pending={pending} onPending={setPending} label="Photos & marked-up drawings" />
            </SimpleForm>
            {editing.id && <DeleteButton onClick={() => { api.remove('rfis', editing.id); close(); }} />}
          </>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Daily logs ---------- */

export function DailyLogs() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const level = access(project, user.id, 'logs');
  const canChange = (l) => level >= 3 || (level === 2 && l.createdBy === user.id);
  const [adding, setAdding] = useState(false);
  const [photosFor, setPhotosFor] = useState(null); // existing log whose photos are being managed
  const [pending, setPending] = useState([]);
  const [workforce, setWorkforce] = useState([{ trade: '', count: '' }]);
  const close = () => { setAdding(false); setPending([]); setWorkforce([{ trade: '', count: '' }]); };
  const logs = [...project.logs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="page">
      <PageHead title="Daily logs">
        {level >= 2 && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={16} /> New daily log</button>}
      </PageHead>

      {logs.length === 0 ? <Empty>No daily logs yet.</Empty> : logs.map((l) => (
        <div key={l.id} className="card card-body event-row">
          <div className="date-block">
            <span>{formatDate(l.date, { month: 'short' })}</span>
            <strong>{formatDate(l.date, { day: 'numeric' })}</strong>
          </div>
          <div className="grow">
            <p className="meta">{[l.weather, `${l.crew} workers on site`].filter(Boolean).join(' · ')}</p>
            {l.workforce?.length > 0 && (
              <div className="trade-chips">
                {l.workforce.map((w) => <span key={w.trade} className="trade-chip"><strong>{w.count}</strong> {w.trade}</span>)}
              </div>
            )}
            <p>{l.notes}</p>
            <AttachmentThumbs project={project} api={api} entityId={l.id} />
          </div>
          {canChange(l) && <button className="btn btn-outline btn-sm" onClick={() => setPhotosFor(l)}><Camera size={15} /> Photos</button>}
          {canChange(l) && <button className="icon-btn" aria-label="Delete log" onClick={() => api.remove('logs', l.id)}><Trash2 size={15} /></button>}
        </div>
      ))}

      <Modal open={adding} onClose={close} title="New daily log">
        <SimpleForm
          fields={[
            { name: 'date', label: 'Date', type: 'date', required: true },
            { name: 'weather', label: 'Weather', type: 'select', options: WEATHER },
            { name: 'notes', label: 'Work performed / notes', type: 'textarea', required: true, full: true },
          ]}
          initial={{ date: TODAY }}
          submitLabel="Save log"
          onSubmit={(v) => {
            const crew = cleanWorkforce(workforce);
            const id = api.add('logs', { ...v, workforce: crew, crew: crew.reduce((n, w) => n + w.count, 0) });
            if (pending.length) uploadPending(api, 'log', id, pending);
            close();
          }}
        >
          <WorkforceField rows={workforce} onChange={setWorkforce} />
          <Attachments project={project} api={api} entityType="log" pending={pending} onPending={setPending} label="Site photos" />
        </SimpleForm>
      </Modal>

      <Modal open={!!photosFor} onClose={() => setPhotosFor(null)} title={photosFor ? `Photos — ${formatDate(photosFor.date)}` : ''}>
        {photosFor && (
          <>
            <Attachments project={project} api={api} entityType="log" entityId={photosFor.id} label="Site photos" />
            <button className="btn btn-primary full mt-sm" onClick={() => setPhotosFor(null)}>Done</button>
          </>
        )}
      </Modal>
    </div>
  );
}

// Rows with a trade and a count above zero; the same trade entered twice is added together.
function cleanWorkforce(rows) {
  const totals = new Map();
  for (const r of rows) {
    const trade = r.trade.trim();
    const count = Math.max(0, Math.floor(Number(r.count) || 0));
    if (trade && count) totals.set(trade, (totals.get(trade) ?? 0) + count);
  }
  return [...totals].map(([trade, count]) => ({ trade, count }));
}

// "Workers on site" by trade: pick a trade from the list or type your own, then how many.
function WorkforceField({ rows, onChange }) {
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = cleanWorkforce(rows).reduce((n, w) => n + w.count, 0);
  return (
    <div className="workforce">
      <div className="row-between">
        <span className="att-label">Workers on site</span>
        <span className="meta">Total: <strong>{total}</strong></span>
      </div>
      <datalist id="trade-list">{TRADES.map((t) => <option key={t} value={t} />)}</datalist>
      {rows.map((r, i) => (
        <div key={i} className="workforce-row">
          <input list="trade-list" placeholder="Trade, e.g. Mason" value={r.trade} aria-label="Trade"
            onChange={(e) => set(i, { trade: e.target.value })} />
          <input type="number" min="0" placeholder="How many" value={r.count} aria-label={`Number of ${r.trade || 'workers'}`}
            onChange={(e) => set(i, { count: e.target.value })} />
          <button type="button" className="icon-btn" aria-label="Remove row" disabled={rows.length === 1}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => onChange([...rows, { trade: '', count: '' }])}><Plus size={14} /> Add another trade</button>
    </div>
  );
}

/* ---------- Team ---------- */

export function Team() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState('');
  const isOwner = roleOf(project, user.id) === 'owner';
  const canInvite = access(project, user.id, 'team') >= 3;
  const roleOptions = Object.entries(ROLES).filter(([r]) => isOwner || r !== 'owner').map(([value, label]) => ({ value, label }));

  const invite = async ({ email, role }) => {
    try {
      const outcome = await api.invite(email, role);
      setInviteResult(inviteMessage(email, ROLES[role], [outcome]));
    } catch (e) {
      setInviteResult(`Couldn’t invite: ${e.message}`);
    }
  };

  return (
    <div className="page">
      <PageHead title="People with access">
        {canInvite && <button className="btn btn-primary btn-sm" onClick={() => { setInviteResult(''); setInviting(true); }}><Mail size={16} /> Invite by email</button>}
      </PageHead>
      <div className="table-wrap mb">
        <table className="table">
          <tbody>
            {project.members.map((m) => (
              <tr key={m.userId}>
                <td><div className="row-start"><Avatar name={m.name} /> <strong>{m.name}</strong>{m.userId === user.id && <span className="meta">(you)</span>}</div></td>
                <td className="meta">{m.email}</td>
                <td>
                  {isOwner && m.userId !== user.id ? (
                    <select className="select-sm" value={m.role} onChange={(e) => api.setRole(m.userId, e.target.value)} aria-label={`Role for ${m.name}`}>
                      {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  ) : (
                    <span className={`role role-${m.role}`}>{ROLES[m.role] ?? m.role}</span>
                  )}
                </td>
                <td className="num">
                  {isOwner && m.userId !== user.id && (
                    <button className="link-btn danger" onClick={() => confirm(`Remove ${m.name}'s access to this project?`) && api.removeMember(m.userId)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
            {project.invites.map((i) => (
              <tr key={i.email}>
                <td><div className="row-start"><Avatar name={i.email} /> <span className="muted">{i.email}</span></div></td>
                <td className="meta">Invited — hasn’t signed up yet</td>
                <td><span className={`role role-${i.role}`}>{ROLES[i.role] ?? i.role}</span> <span className={statusClass('Open')}>Pending</span></td>
                <td className="num">{canInvite && <button className="link-btn danger" onClick={() => api.cancelInvite(i.email)}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RoleTable />

      <PageHead title="Project directory">
        {canInvite && <button className="btn btn-outline btn-sm" onClick={() => setAdding(true)}><Plus size={16} /> Add contact</button>}
      </PageHead>
      <p className="muted small">Subcontractors, consultants and anyone else on the job. Contacts don’t need an account and can be assigned tasks.</p>

      {project.team.length === 0 ? <Empty>No contacts yet.</Empty> : (
        <div className="grid grid-3">
          {project.team.map((m) => (
            <div key={m.id} className="card card-body speaker">
              <Avatar name={m.name} size="lg" />
              <div className="grow">
                <h4>{m.name}</h4>
                <p className="meta">{m.role}{m.company && ` · ${m.company}`}</p>
                <p className="meta">{project.tasks.filter((t) => t.assignees.includes(m.name) && t.status !== 'Done').length} open tasks</p>
                {m.email && <a className="link-btn" href={`mailto:${m.email}`}>{m.email}</a>}
              </div>
              {canInvite && <button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => api.remove('team', m.id)}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}

      <Modal open={inviting} onClose={() => setInviting(false)} title="Invite to this project">
        {inviteResult ? (
          <>
            <p>{inviteResult}</p>
            <button className="btn btn-primary full" onClick={() => setInviting(false)}>Done</button>
          </>
        ) : (
          <SimpleForm
            fields={[
              { name: 'email', label: 'Email', type: 'email', required: true, full: true },
              { name: 'role', label: 'Role', type: 'select', options: roleOptions, required: true, full: true },
            ]}
            initial={{ role: 'site_engineer' }}
            submitLabel="Send invite"
            onSubmit={invite}
          />
        )}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add contact">
        <SimpleForm
          fields={[
            { name: 'name', label: 'Full name', required: true },
            { name: 'role', label: 'Role', required: true },
            { name: 'company', label: 'Company' },
            { name: 'email', label: 'Email', type: 'email' },
          ]}
          submitLabel="Add contact"
          onSubmit={(v) => { api.add('team', v); setAdding(false); }}
        />
      </Modal>
    </div>
  );
}

// What each role can see and do (the same table the database enforces).
export function RoleTable() {
  const [open, setOpen] = useState(false);
  return (
    <div className="role-table mb">
      <button className="link-btn" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'} what each role can see and do</button>
      {open && (
        <div className="table-wrap mt-sm">
          <table className="table role-matrix">
            <thead><tr><th />{Object.values(ROLES).map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {AREAS.map((a) => (
                <tr key={a.key}>
                  <td><strong>{a.label}</strong></td>
                  {Object.keys(ROLES).map((r) => {
                    const lvl = ACCESS[a.key][r];
                    return <td key={r} className={`lvl lvl-${lvl}`}>{levelLabel(a.key, lvl)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta mt-sm">“—” means the section is hidden. Subcontractors see only tasks assigned to them. Nobody approves their own expense unless they’re the only approver on the project.</p>
        </div>
      )}
    </div>
  );
}
