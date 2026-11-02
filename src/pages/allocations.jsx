import { useState } from 'react';
import { Check, CircleAlert, Clock, Plus, Trash2, X } from 'lucide-react';
import { Avatar, Modal } from '../components/ui.jsx';
import { AttachmentThumbs, Attachments, attachmentsFor, uploadPending } from '../components/Attachments.jsx';
import { formatDate } from '../hooks.js';
import { PAYMENT_METHODS } from '../data/projects.js';
import {
  access, allocatedOf, allocationPaid, allocationSpent, canPay, memberName, money, roleOf, ROLES, sumOf, TODAY, useStore,
} from '../store.jsx';

const PAYMENT_STATUS = {
  'Awaiting confirmation': { icon: Clock, cls: 'pending' },
  Confirmed: { icon: Check, cls: 'paid' },
  Problem: { icon: CircleAlert, cls: 'overdue' },
};

function PaymentStatus({ status }) {
  const { icon: Icon, cls } = PAYMENT_STATUS[status] ?? PAYMENT_STATUS['Awaiting confirmation'];
  return <span className={`status status-${cls} pay-status`}><Icon size={12} /> {status}</span>;
}

const recipientLabel = (project, a) =>
  a.recipientUser ? memberName(project, a.recipientUser) || 'A team member' : `All ${ROLES[a.recipientRole] ?? a.recipientRole}s`;
const lineLabel = (project, costId) => {
  const c = project.costs.find((x) => x.id === costId);
  return c ? `${c.code} ${c.description}` : 'Budget line';
};

/* ---------- Budget page: allocations to people and roles ---------- */

export function AllocationsSection({ project, api, userId }) {
  const [open, setOpen] = useState(null); // allocation, or {} for new
  const canEdit = access(project, userId, 'budget') >= 3;
  const allocations = [...project.allocations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <div className="page-head mt-lg">
        <h2 className="section-h">Budget allocations</h2>
        {canEdit && project.costs.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => setOpen({})}><Plus size={16} /> Allocate budget</button>
        )}
      </div>
      {allocations.length === 0 ? (
        <p className="muted small">
          {canEdit ? 'Set aside part of a budget line for a person or a role, then record payments to them as you pay.' : 'Nothing allocated yet.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table clickable">
            <thead>
              <tr>
                <th>Allocated to</th><th>Budget line</th><th className="num">Allocated</th><th className="num">Paid</th>
                <th className="num" title="Allocated − paid">Left to pay</th>
                <th className="num" title="Expenses on this line recorded by the person (or role) the money was allocated to">Spent</th>
                <th className="num" title="Allocated − spent: money allocated but not spent yet">Balance</th><th>Payments</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => {
                const paid = allocationPaid(project, a.id);
                const spentBy = allocationSpent(project, a);
                const pays = project.allocationPayments.filter((x) => x.allocationId === a.id);
                const counts = Object.keys(PAYMENT_STATUS).map((s) => [s, pays.filter((x) => x.status === s).length]).filter(([, n]) => n);
                return (
                  <tr key={a.id} onClick={() => setOpen(a)}>
                    <td>
                      <div className="row-start">
                        {a.recipientUser ? <Avatar name={recipientLabel(project, a)} /> : <span className={`role role-${a.recipientRole}`}>Role</span>}
                        <div><strong>{recipientLabel(project, a)}</strong>{a.purpose && <div className="meta">{a.purpose}</div>}</div>
                      </div>
                    </td>
                    <td className="meta">{lineLabel(project, a.costId)}</td>
                    <td className="num">{money(a.amount)}</td>
                    <td className="num">{money(paid)}</td>
                    <td className={`num ${a.amount - paid > 0 ? '' : 'positive'}`}>{money(a.amount - paid)}</td>
                    <td className="num">{money(spentBy)}</td>
                    <td className={`num balance ${a.amount - spentBy < 0 ? 'overdue' : ''}`}>{money(a.amount - spentBy)}</td>
                    <td>
                      {counts.length === 0 ? <span className="meta">None yet</span> : (
                        <div className="pay-counts">{counts.map(([s, n]) => <span key={s} className="meta">{n} {s.toLowerCase()}</span>)}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && !open.id && <NewAllocation project={project} api={api} onClose={() => setOpen(null)} />}
      {open?.id && <AllocationDetail project={project} api={api} userId={userId} allocationId={open.id} onClose={() => setOpen(null)} />}
    </>
  );
}

function NewAllocation({ project, api, onClose }) {
  const [v, setV] = useState({ costId: project.costs[0]?.id ?? '', to: 'person', recipientUser: '', recipientRole: '', amount: '', purpose: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const line = project.costs.find((c) => c.id === v.costId);
  const alreadyAllocated = line ? allocatedOf(project, line.id) : 0;
  const over = line && Number(v.amount) + alreadyAllocated > line.budgeted;

  const save = (e) => {
    e.preventDefault();
    if (!v.costId) return setError('Choose a budget line');
    if (v.to === 'person' ? !v.recipientUser : !v.recipientRole) return setError(v.to === 'person' ? 'Choose a person' : 'Choose a role');
    if (!(Number(v.amount) > 0)) return setError('Enter an amount');
    api.add('allocations', {
      costId: v.costId,
      recipientUser: v.to === 'person' ? v.recipientUser : '',
      recipientRole: v.to === 'role' ? v.recipientRole : '',
      amount: Number(v.amount),
      purpose: v.purpose.trim(),
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Allocate budget">
      <form className="auth-form" onSubmit={save} noValidate>
        <label className="field">
          <span>From budget line *</span>
          <select value={v.costId} onChange={set('costId')}>
            {project.costs.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.description} ({money(c.budgeted)})</option>)}
          </select>
          {line && <span className="meta">Already allocated from this line: {money(alreadyAllocated)} of {money(line.budgeted)}</span>}
        </label>
        <div className="field">
          <span>Allocate to *</span>
          <div className="seg seg-fit">
            <button type="button" className={v.to === 'person' ? 'active' : ''} onClick={() => setV({ ...v, to: 'person' })}>A person</button>
            <button type="button" className={v.to === 'role' ? 'active' : ''} onClick={() => setV({ ...v, to: 'role' })}>A role</button>
          </div>
        </div>
        {v.to === 'person' ? (
          <label className="field">
            <span>Person *</span>
            <select value={v.recipientUser} onChange={set('recipientUser')}>
              <option value="">Choose…</option>
              {project.members.map((m) => <option key={m.userId} value={m.userId}>{m.name} — {ROLES[m.role] ?? m.role}</option>)}
            </select>
            <span className="meta">Only people with an account on this project can be paid and confirm payments.</span>
          </label>
        ) : (
          <label className="field">
            <span>Role *</span>
            <select value={v.recipientRole} onChange={set('recipientRole')}>
              <option value="">Choose…</option>
              {Object.entries(ROLES).filter(([r]) => r !== 'owner').map(([r, label]) => (
                <option key={r} value={r}>{label} ({project.members.filter((m) => m.role === r).length} on project)</option>
              ))}
            </select>
            <span className="meta">Each payment from a role allocation goes to one person with that role.</span>
          </label>
        )}
        <label className="field">
          <span>Amount (₦) *</span>
          <input type="number" min="0" value={v.amount} onChange={set('amount')} />
          {over && <span className="warn-text">This allocates more than the line’s budget.</span>}
        </label>
        <label className="field">
          <span>Purpose</span>
          <input value={v.purpose} onChange={set('purpose')} placeholder="e.g. Blockwork, level 1" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary full">Allocate</button>
      </form>
    </Modal>
  );
}

function AllocationDetail({ project, api, userId, allocationId, onClose }) {
  const a = project.allocations.find((x) => x.id === allocationId);
  const canEdit = access(project, userId, 'budget') >= 3;
  const pays = project.allocationPayments.filter((x) => x.allocationId === allocationId).sort((x, y) => x.date.localeCompare(y.date));
  const paid = sumOf(pays, 'amount');
  const remaining = a ? a.amount - paid : 0;
  // Who this allocation can be paid to, and whether *you* may record a payment to them.
  const eligible = a ? project.members.filter((m) => (a.recipientUser ? m.userId === a.recipientUser : m.role === a.recipientRole)) : [];
  const [draft, setDraft] = useState({ payee: eligible.length === 1 ? eligible[0].userId : '', date: TODAY, amount: '', method: '', note: '' });
  const [receipts, setReceipts] = useState([]); // files picked for the payment being recorded
  const [receiptFor, setReceiptFor] = useState(null); // existing payment getting a receipt added
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ amount: a?.amount ?? 0, purpose: a?.purpose ?? '' });
  const [error, setError] = useState('');
  if (!a) return null;

  const pay = () => {
    setError('');
    if (!draft.payee) return setError('Choose who is being paid');
    if (!canPay(project, userId, draft.payee)) return setError('You can’t record a payment to yourself — someone else on the project must.');
    const amount = Number(draft.amount);
    if (!(amount > 0)) return setError('Enter the amount paid');
    if (amount > remaining) return setError(`That’s more than is left on this allocation (${money(remaining)}).`);
    const id = api.add('allocationPayments', { allocationId: a.id, payee: draft.payee, date: draft.date, amount, method: draft.method, note: draft.note.trim() });
    if (receipts.length) uploadPending(api, 'payment', id, receipts);
    setDraft({ ...draft, amount: '', note: '' });
    setReceipts([]);
  };

  const saveEdit = () => {
    if (Number(edit.amount) < paid) return setError(`The allocation can’t be less than what’s been paid (${money(paid)}).`);
    api.patch('allocations', a.id, { amount: Number(edit.amount), purpose: edit.purpose.trim() });
    setEditing(false);
  };

  return (
    <Modal open onClose={onClose} title={`Allocation: ${recipientLabel(project, a)}`} wide>
      <div className="alloc-summary">
        <div><span className="meta">Budget line</span><strong>{lineLabel(project, a.costId)}</strong></div>
        <div><span className="meta">Allocated</span><strong>{money(a.amount)}</strong></div>
        <div><span className="meta">Paid</span><strong>{money(paid)}</strong></div>
        <div><span className="meta">Remaining</span><strong className={remaining > 0 ? '' : 'positive'}>{money(remaining)}</strong></div>
      </div>
      {a.purpose && !editing && <p className="muted">{a.purpose}</p>}

      {canEdit && (editing ? (
        <div className="alloc-edit">
          <label className="field"><span>Amount (₦)</span><input type="number" min={paid} value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></label>
          <label className="field"><span>Purpose</span><input value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /></label>
          <div className="btn-row tight"><button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button><button className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>Cancel</button></div>
        </div>
      ) : (
        <div className="btn-row tight mb">
          <button className="link-btn" onClick={() => setEditing(true)}>Change amount or purpose</button>
          {pays.length === 0 && <button className="link-btn danger" onClick={() => { api.remove('allocations', a.id); onClose(); }}>Delete allocation</button>}
        </div>
      ))}

      <h4 className="mt-sm">Payments</h4>
      {pays.length === 0 ? <p className="meta">No payments yet.</p> : (
        <ul className="alloc-payments">
          {pays.map((x) => (
            <li key={x.id}>
              <div className="grow">
                <div className="row-start"><strong>{money(x.amount)}</strong> <span className="meta">to {memberName(project, x.payee) || 'team member'} · {formatDate(x.date)}{x.method && ` · ${x.method}`}</span></div>
                <div className="meta">Recorded by {x.paidByName || 'someone'}{x.note && ` · “${x.note}”`}</div>
                {x.status === 'Problem' && <div className="problem-note">Reported a problem: “{x.payeeNote}”</div>}
                <AttachmentThumbs project={project} api={api} entityId={x.id} />
                {canEdit && (receiptFor === x.id ? (
                  <div className="mt-sm">
                    <Attachments project={project} api={api} entityType="payment" entityId={x.id} label="Payment receipt" />
                    <button className="link-btn" onClick={() => setReceiptFor(null)}>Done</button>
                  </div>
                ) : (
                  <button className="link-btn small-link" onClick={() => setReceiptFor(x.id)}>
                    {attachmentsFor(project, x.id).length ? 'Add or remove receipts' : 'Add receipt'}
                  </button>
                ))}
              </div>
              <PaymentStatus status={x.status} />
              {canEdit && x.status !== 'Confirmed' && (
                <button className="icon-btn" title="Remove this payment (to correct a mistake)" onClick={() => confirm('Remove this payment?') && api.remove('allocationPayments', x.id)}><Trash2 size={15} /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && remaining > 0 && (
        <div className="payments mt-sm">
          <span className="att-label">Record a payment</span>
          {eligible.length === 0 ? (
            <p className="meta">Nobody on the project {a.recipientUser ? 'matches this allocation' : `has the ${ROLES[a.recipientRole]} role`} yet. Invite them on the Team page first.</p>
          ) : (
            <>
              <div className="payment-add">
                <select value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} aria-label="Paid to">
                  <option value="">Paid to…</option>
                  {eligible.map((m) => (
                    <option key={m.userId} value={m.userId} disabled={!canPay(project, userId, m.userId)}>
                      {m.name}{!canPay(project, userId, m.userId) ? ' (someone else must pay you)' : ''}
                    </option>
                  ))}
                </select>
                <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} aria-label="Payment date" />
                <input type="number" min="0" placeholder={`Max ${money(remaining)}`} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} aria-label="Amount paid" />
                <select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} aria-label="Payment method">
                  <option value="">Method…</option>
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <input className="payment-note" placeholder="Note (optional), e.g. first half" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              <Attachments project={project} api={api} entityType="payment" pending={receipts} onPending={setReceipts} label="Payment receipt (optional)" />
              <button className="btn btn-primary btn-sm" onClick={pay}><Plus size={14} /> Record payment</button>
              <p className="meta">The person paid will be asked to confirm they received it.</p>
            </>
          )}
        </div>
      )}
      {error && <p className="error mt-sm">{error}</p>}
    </Modal>
  );
}

/* ---------- Me page: payments made to me ---------- */

export function MyPayments({ projects, apiFor, userId }) {
  const [problem, setProblem] = useState(null); // { project, payment }
  const [note, setNote] = useState('');
  // Payments waiting for my confirmation first, then newest first.
  const waitingFirst = ({ x }) => (x.status === 'Awaiting confirmation' ? 0 : 1);
  const mine = projects.flatMap((p) => p.allocationPayments.filter((x) => x.payee === userId).map((x) => ({ p, x })))
    .sort((a, b) => waitingFirst(a) - waitingFirst(b) || b.x.date.localeCompare(a.x.date));
  const allocations = projects.flatMap((p) => p.allocations
    .filter((a) => a.recipientUser === userId || (a.recipientRole && a.recipientRole === roleOf(p, userId)))
    .map((a) => ({ p, a })));
  if (!mine.length && !allocations.length) return null;
  const waiting = mine.filter(({ x }) => x.status === 'Awaiting confirmation').length;

  const respond = async (p, x, received, response = '') => {
    try {
      await apiFor(p.id).respondToPayment(x.id, received, response);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section className="task-group">
      <h3>My payments {waiting > 0 && <span className="col-count stage-in-review">{waiting} to confirm</span>}</h3>
      {allocations.length > 0 && (
        <div className="my-allocations">
          {allocations.map(({ p, a }) => {
            const paidToMe = sumOf(p.allocationPayments.filter((x) => x.allocationId === a.id && x.payee === userId), 'amount');
            return (
              <div key={a.id} className="my-allocation">
                <span className="meta">{p.name}{a.recipientRole ? ` · for all ${ROLES[a.recipientRole]}s` : ''}</span>
                <strong>{a.purpose || lineLabel(p, a.costId)}</strong>
                <span>{money(paidToMe)} paid to you{a.recipientUser ? ` of ${money(a.amount)} allocated` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
      {mine.length === 0 ? <p className="meta">No payments recorded to you yet.</p> : (
        <ul className="task-rows">
          {mine.map(({ p, x }) => {
            const a = p.allocations.find((al) => al.id === x.allocationId);
            return (
              <li key={x.id}>
                <div className="task-row-main">
                  <strong>{money(x.amount)} · {formatDate(x.date)}{x.method && ` · ${x.method}`}</strong>
                  <span className="meta">{p.name}{a?.purpose && ` · ${a.purpose}`} · from {x.paidByName || 'the project'}{x.note && ` · “${x.note}”`}</span>
                  <AttachmentThumbs project={p} api={apiFor(p.id)} entityId={x.id} />
                  {x.status === 'Problem' && <span className="problem-note">You reported: “{x.payeeNote}”</span>}
                </div>
                <PaymentStatus status={x.status} />
                {x.status !== 'Confirmed' && (
                  <>
                    <button className="btn btn-success btn-sm" onClick={() => respond(p, x, true)}><Check size={15} /> Confirm received</button>
                    {x.status !== 'Problem' && <button className="btn btn-outline danger btn-sm" onClick={() => { setNote(''); setProblem({ p, x }); }}><X size={15} /> Not received</button>}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!problem} onClose={() => setProblem(null)} title="Report a problem with this payment">
        {problem && (
          <div className="auth-form">
            <p><strong>{money(problem.x.amount)}</strong> recorded as paid to you on {formatDate(problem.x.date)}.</p>
            <label className="field">
              <span>What’s wrong? *</span>
              <textarea rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I only received ₦100,000" />
            </label>
            <button className="btn btn-primary full" disabled={!note.trim()}
              onClick={() => { respond(problem.p, problem.x, false, note.trim()); setProblem(null); }}>Send to the payer</button>
          </div>
        )}
      </Modal>
    </section>
  );
}
