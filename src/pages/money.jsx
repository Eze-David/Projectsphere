import { useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Banknote, Check, CircleCheck, CircleX, Clock, Plus, X } from 'lucide-react';
import { Empty, FilterBar, Modal, Progress, SimpleForm } from '../components/ui.jsx';
import { formatDate, matchesQuery } from '../hooks.js';
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, INVOICE_STATUSES, PAYMENT_METHODS, STANDARD_COST_CODES } from '../data/projects.js';
import {
  access, canApprove, seesContract, canApproveFor, countedExpenses, memberName, money, spentOf, statusClass, sumOf, TODAY, useStore,
} from '../store.jsx';
import { AttachmentBadge, Attachments, uploadPending } from '../components/Attachments.jsx';
import { DeleteButton, PageHead } from './sections.jsx';
import { equipmentCostToDate, materialValue } from './site.jsx';

/* ---------- Expenses ---------- */

// Changing any of these on an approved, paid or rejected expense sends it back for approval.
const REVIEWED_FIELDS = ['amount', 'costId', 'category', 'description', 'vendor', 'date'];
const dateOf = (iso) => (iso ? formatDate(iso.slice(0, 10)) : '');

function ApprovalPanel({ project, expense: e, onReject }) {
  const { user } = useStore();
  const { api } = useOutletContext();
  const submitter = memberName(project, e.createdBy) || 'someone';
  const mayDecide = canApproveFor(project, user.id, e.createdBy);
  const own = e.createdBy === user.id;

  return (
    <div className={`approval-panel approval-${e.status.toLowerCase()}`}>
      <div className="approval-text">
        {e.status === 'Pending' && <><Clock size={16} /> <span><strong>Awaiting approval</strong> · submitted by {own ? 'you' : submitter}</span></>}
        {e.status === 'Approved' && <><CircleCheck size={16} /> <span><strong>Approved</strong> by {e.approvedByName} · {dateOf(e.approvedAt)}</span></>}
        {e.status === 'Paid' && <><CircleCheck size={16} /> <span><strong>Paid</strong> · approved by {e.approvedByName} · {dateOf(e.approvedAt)}</span></>}
        {e.status === 'Rejected' && <><CircleX size={16} /> <span><strong>Rejected</strong> by {e.approvedByName}: “{e.rejectionReason}”{own && ' — edit and save to resubmit.'}</span></>}
      </div>
      <div className="btn-row tight">
        {e.status === 'Pending' && mayDecide && (
          <>
            <button type="button" className="btn btn-success btn-sm" onClick={() => api.decideExpense(e.id, 'Approved')}><Check size={15} /> Approve</button>
            <button type="button" className="btn btn-outline danger btn-sm" onClick={() => onReject(e)}><X size={15} /> Reject</button>
          </>
        )}
        {e.status === 'Pending' && !mayDecide && canApprove(project, user.id) && own && (
          <span className="meta">Someone else on the project must approve your own expense.</span>
        )}
        {e.status === 'Approved' && canApprove(project, user.id) && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => api.decideExpense(e.id, 'Paid')}><Banknote size={15} /> Mark paid</button>
        )}
      </div>
    </div>
  );
}

export function Expenses() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState([]);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const close = () => { setEditing(null); setPending([]); };
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('');
  const [formKey, setFormKey] = useState(0);
  const formValues = useRef({});
  const approver = canApprove(project, user.id);
  const canAddLine = access(project, user.id, 'budget') >= 3;
  const needsMe = (e) => e.status === 'Pending' && canApproveFor(project, user.id, e.createdBy);
  const costLabel = (id) => {
    const c = project.costs.find((x) => x.id === id);
    return c ? `${c.code} ${c.description}` : '';
  };

  // Re-read the open expense from the project so approval changes show immediately.
  const current = editing?.id ? project.expenses.find((e) => e.id === editing.id) ?? editing : editing;
  const canEdit = !current?.id || approver || current.createdBy === user.id;
  const canDelete = current?.id && (approver || (current.createdBy === user.id && current.status === 'Pending'));
  const willReset = current?.id && current.status !== 'Pending' && !canApproveFor(project, user.id, current.createdBy);

  const visible = project.expenses
    .filter((e) => (category === 'All' || e.category === category) &&
      (!status || (status === 'mine' ? needsMe(e) : e.status === status)) &&
      matchesQuery(query, e.description, e.vendor, e.category, costLabel(e.costId), memberName(project, e.createdBy)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const month = TODAY.slice(0, 7);
  const counted = countedExpenses(project);
  const awaitingApproval = project.expenses.filter((e) => e.status === 'Pending');
  const forMe = project.expenses.filter(needsMe);

  const save = (v) => {
    const item = { ...v, amount: Number(v.amount) || 0, costId: v.costId || '' };
    if (current.id) {
      const changed = REVIEWED_FIELDS.some((f) => String(item[f] ?? '') !== String(current[f] ?? ''));
      api.patch('expenses', current.id, willReset && changed ? { ...item, status: 'Pending', approvedByName: '', rejectionReason: '' } : item);
    } else {
      const id = api.add('expenses', item);
      if (pending.length) uploadPending(api, 'expense', id, pending);
    }
    close();
  };

  const reject = () => {
    api.decideExpense(rejecting.id, 'Rejected', reason.trim());
    setRejecting(null);
    setReason('');
  };

  return (
    <div className="page">
      <PageHead title="Expenses">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ date: TODAY })}><Plus size={16} /> Add expense</button>
      </PageHead>

      {approver && forMe.length > 0 && (
        <button className="approval-callout" onClick={() => setStatus('mine')}>
          <Clock size={16} /> <strong>{forMe.length} expense{forMe.length > 1 ? 's' : ''} need{forMe.length === 1 ? 's' : ''} your approval</strong>
          <span className="meta">{money(sumOf(forMe, 'amount'))} · Show them →</span>
        </button>
      )}

      <div className="stats mb">
        <div className="stat"><strong>{money(sumOf(counted, 'amount'))}</strong><span>Total expenses (excl. rejected)</span></div>
        <div className="stat"><strong>{money(sumOf(counted.filter((e) => e.date.startsWith(month)), 'amount'))}</strong><span>This month</span></div>
        <div className="stat"><strong>{money(sumOf(awaitingApproval, 'amount'))}</strong><span>{awaitingApproval.length} awaiting approval</span></div>
        <div className="stat"><strong>{money(sumOf(project.expenses.filter((e) => e.status === 'Paid'), 'amount'))}</strong><span>Paid</span></div>
      </div>

      <FilterBar query={query} onQuery={setQuery} placeholder="Search expenses…" options={EXPENSE_CATEGORIES} active={category} onActive={setCategory}>
        <select className="select-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {approver && <option value="mine">Needs my approval ({forMe.length})</option>}
          {EXPENSE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </FilterBar>

      {visible.length === 0 ? <Empty>{project.expenses.length ? 'No expenses match your filters.' : 'No expenses recorded yet.'}</Empty> : (
        <div className="table-wrap">
          <table className="table clickable">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Cost code</th><th>Status</th><th className="num">Amount</th>{approver && <th />}</tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} onClick={() => setEditing(e)} className={e.status === 'Rejected' ? 'row-muted' : ''}>
                  <td className="nowrap">{formatDate(e.date)}</td>
                  <td>
                    <strong>{e.description}</strong> <AttachmentBadge project={project} entityId={e.id} />
                    <div className="meta">{[e.vendor, memberName(project, e.createdBy) && `by ${memberName(project, e.createdBy)}`].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>{e.category}</td>
                  <td className="meta">{costLabel(e.costId) || '—'}</td>
                  <td>
                    <span className={statusClass(e.status)}>{e.status}</span>
                    {e.approvedByName && e.status !== 'Pending' && <div className="meta nowrap">{e.status === 'Rejected' ? 'by' : '✓'} {e.approvedByName}</div>}
                  </td>
                  <td className="num">{money(e.amount)}</td>
                  {approver && (
                    <td className="num nowrap" onClick={(ev) => ev.stopPropagation()}>
                      {needsMe(e) && (
                        <>
                          <button className="icon-btn approve" title="Approve" onClick={() => api.decideExpense(e.id, 'Approved')}><Check size={17} /></button>
                          <button className="icon-btn reject" title="Reject" onClick={() => setRejecting(e)}><X size={17} /></button>
                        </>
                      )}
                      {e.status === 'Approved' && <button className="link-btn" onClick={() => api.decideExpense(e.id, 'Paid')}>Mark paid</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Total{visible.length !== project.expenses.length && ' (filtered)'}{visible.some((e) => e.status === 'Rejected') && ', excluding rejected'}</td>
                <td className="num">{money(sumOf(visible.filter((e) => e.status !== 'Rejected'), 'amount'))}</td>
                {approver && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={close} title={current?.id ? (canEdit ? 'Edit expense' : 'Expense') : 'New expense'} wide>
        {current && (
          <>
            {current.id && <ApprovalPanel project={project} expense={current} onReject={setRejecting} />}
            {!current.id && <p className="meta mb">New expenses are sent for approval. {approver ? 'Another approver on the project will review it.' : 'An owner or approver will review it.'}</p>}
            {canEdit ? (
              <SimpleForm
                key={`${current.id || 'new'}-${formKey}`}
                onValuesChange={(vals) => { formValues.current = vals; }}
                fields={[
                  { name: 'description', label: 'Description', required: true, full: true },
                  { name: 'amount', label: 'Amount (₦)', type: 'number', required: true },
                  { name: 'date', label: 'Date', type: 'date', required: true },
                  { name: 'category', label: 'Category', type: 'select', options: EXPENSE_CATEGORIES, required: true },
                  { name: 'vendor', label: 'Paid to (vendor)' },
                  {
                    name: 'costId', label: 'Budget cost code', type: 'select',
                    options: project.costs.map((c) => ({ value: c.id, label: `${c.code} — ${c.description}` })),
                    hint: project.costs.length ? undefined : canAddLine
                      ? 'This project has no budget lines yet — add one below.'
                      : 'This project has no budget lines yet. An owner, project manager or quantity surveyor adds them on the Budget page.',
                  },
                  { name: 'paymentMethod', label: 'Payment method', type: 'select', options: PAYMENT_METHODS },
                ]}
                initial={current}
                submitLabel={current.id ? (willReset ? 'Save and resubmit for approval' : 'Save expense') : 'Submit for approval'}
                onSubmit={save}
              >
                {canAddLine && (
                  <QuickCostLine
                    onAdd={(line) => {
                      const costId = api.add('costs', { ...line, actual: 0 });
                      // Re-open the form with what was typed so far, plus the new line selected.
                      setEditing({ ...current, ...formValues.current, costId });
                      setFormKey((k) => k + 1);
                    }}
                  />
                )}
                <Attachments project={project} api={api} entityType="expense" entityId={current.id}
                  pending={pending} onPending={setPending} label="Receipts & photos" />
                {willReset && <p className="meta warn-text">Changing the amount, date, category, description, vendor or cost code sends this expense back for approval.</p>}
              </SimpleForm>
            ) : (
              <>
                <dl className="details">
                  <dt>Description</dt><dd>{current.description}</dd>
                  <dt>Amount</dt><dd>{money(current.amount)}</dd>
                  <dt>Date</dt><dd>{formatDate(current.date)}</dd>
                  <dt>Category</dt><dd>{current.category}</dd>
                  <dt>Paid to</dt><dd>{current.vendor || '—'}</dd>
                  <dt>Cost code</dt><dd>{costLabel(current.costId) || '—'}</dd>
                  <dt>Payment method</dt><dd>{current.paymentMethod || '—'}</dd>
                </dl>
                <Attachments project={project} api={api} entityType="expense" entityId={current.id} label="Receipts & photos" />
                <p className="meta mt-sm">Only the person who submitted this expense, or an owner/approver, can edit it.</p>
              </>
            )}
            {canDelete && <DeleteButton onClick={() => { api.remove('expenses', current.id); close(); }} />}
          </>
        )}
      </Modal>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject expense">
        {rejecting && (
          <div className="auth-form">
            <p><strong>{rejecting.description}</strong> · {money(rejecting.amount)}</p>
            <label className="field">
              <span>Reason (the submitter will see this) *</span>
              <textarea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No receipt attached, wrong cost code" />
            </label>
            <button className="btn btn-primary full" disabled={!reason.trim()} onClick={reject}>Reject expense</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Add a budget line without leaving the expense form (owners, project managers, quantity surveyors).
function QuickCostLine({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState({ code: '', description: '', budgeted: '' });
  const pick = (code) => {
    const std = STANDARD_COST_CODES.find((c) => c.code === code);
    setLine((l) => ({ ...l, code, description: std && !l.description ? std.description : l.description }));
  };
  if (!open) return <button type="button" className="link-btn small-link" onClick={() => setOpen(true)}><Plus size={13} /> Add a budget line</button>;
  return (
    <div className="quick-line">
      <span className="att-label">New budget line</span>
      <datalist id="std-cost-codes">{STANDARD_COST_CODES.map((c) => <option key={c.code} value={c.code}>{c.description}</option>)}</datalist>
      <div className="quick-line-row">
        <input list="std-cost-codes" placeholder="Code, e.g. 04-000" value={line.code} onChange={(e) => pick(e.target.value)} aria-label="Cost code" />
        <input placeholder="Description, e.g. Concrete works" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} aria-label="Description" />
        <input type="number" min="0" placeholder="Budget (₦), optional" value={line.budgeted} onChange={(e) => setLine({ ...line, budgeted: e.target.value })} aria-label="Budgeted amount" />
      </div>
      <div className="btn-row tight">
        <button type="button" className="btn btn-outline btn-sm" disabled={!line.code.trim() || !line.description.trim()}
          onClick={() => { onAdd({ code: line.code.trim(), description: line.description.trim(), budgeted: Number(line.budgeted) || 0 }); setOpen(false); setLine({ code: '', description: '', budgeted: '' }); }}>
          Add and select
        </button>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- Finance ---------- */

// Invoices can be paid in parts. Outstanding = amount − payments; "Part paid"/"Paid" follow from the payments.
export const paidOf = (i) => sumOf(i.payments ?? [], 'amount');
export const outstandingOf = (i) => Math.max(0, Number(i.amount || 0) - paidOf(i));
const baseStatus = (i) => (i.status === 'Draft' ? 'Draft' : 'Sent');
export function invoiceStatus(i) {
  const paid = paidOf(i);
  if (Number(i.amount) > 0 && paid >= Number(i.amount)) return 'Paid';
  return paid > 0 ? 'Part paid' : baseStatus(i);
}
const invoiceOverdue = (i) => invoiceStatus(i) !== 'Paid' && baseStatus(i) === 'Sent' && i.due && i.due < TODAY;
const invoiceRef = (i) => `INV-${String(i.number).padStart(3, '0')}`;

// Payments received against one invoice: list, add, remove. Kept in the form until the invoice is saved.
function PaymentsEditor({ payments, onChange, amount }) {
  const [draft, setDraft] = useState({ date: TODAY, amount: '', method: '' });
  const paid = sumOf(payments, 'amount');
  const outstanding = Math.max(0, Number(amount || 0) - paid);
  const add = () => {
    const value = Number(draft.amount);
    if (!(value > 0) || !draft.date) return;
    onChange([...payments, { date: draft.date, amount: value, method: draft.method }].sort((x, y) => x.date.localeCompare(y.date)));
    setDraft({ date: TODAY, amount: '', method: draft.method });
  };

  return (
    <div className="payments">
      <span className="att-label">Payments received</span>
      {payments.length > 0 && (
        <ul className="payment-list">
          {payments.map((pay, idx) => (
            <li key={`${pay.date}-${idx}`}>
              <span className="nowrap">{formatDate(pay.date)}</span>
              <span className="meta">{pay.method || '—'}</span>
              <strong className="num">{money(pay.amount)}</strong>
              <button type="button" className="icon-btn" aria-label="Remove payment" onClick={() => onChange(payments.filter((_, j) => j !== idx))}><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="payment-add">
        <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} aria-label="Payment date" />
        <input type="number" min="0" placeholder={outstanding ? `Amount (₦), e.g. ${outstanding}` : 'Amount (₦)'} value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })} aria-label="Payment amount"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} aria-label="Payment method">
          <option value="">Method…</option>
          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <button type="button" className="btn btn-outline btn-sm" disabled={!(Number(draft.amount) > 0)} onClick={add}><Plus size={14} /> Add payment</button>
      </div>
      <div className="payment-summary">
        <span>Paid so far <strong>{money(paid)}</strong></span>
        <span className={outstanding > 0 ? 'overdue' : 'positive'}>Outstanding <strong>{money(outstanding)}</strong></span>
        {Number(amount) > 0 && paid > Number(amount) && <span className="warn-text">Payments are more than the invoice amount.</span>}
      </div>
    </div>
  );
}

export function Finance() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState([]);
  const [payments, setPayments] = useState([]);
  const [formAmount, setFormAmount] = useState(0);
  const open = (inv) => { setEditing(inv); setPayments(inv.payments ?? []); setFormAmount(inv.amount ?? 0); };
  const close = () => { setEditing(null); setPending([]); setPayments([]); };

  const issued = project.invoices.filter((i) => invoiceStatus(i) !== 'Draft');
  const invoiced = sumOf(issued, 'amount');
  const received = project.invoices.reduce((n, i) => n + paidOf(i), 0);
  const outstanding = issued.reduce((n, i) => n + outstandingOf(i), 0);
  const overdue = project.invoices.filter(invoiceOverdue);
  const spent = spentOf(project);
  const budgeted = sumOf(project.costs, 'budgeted');

  // Spending by category: expenses, plus costs entered directly on budget lines.
  const byCategory = new Map();
  for (const e of countedExpenses(project)) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount || 0));
  const paidToPeople = sumOf(project.allocationPayments, 'amount');
  if (paidToPeople) byCategory.set('Payments to people (allocations)', paidToPeople);
  const otherCosts = sumOf(project.costs, 'actual');
  if (otherCosts) byCategory.set('Other budget costs', otherCosts);
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categories.map(([, v]) => v));

  const save = (v) => {
    const amount = Number(v.amount) || 0;
    const status = invoiceStatus({ amount, payments, status: v.status });
    const lastPayment = payments.map((pay) => pay.date).sort().pop() ?? '';
    const item = { ...v, amount, payments, status, paidDate: status === 'Paid' ? lastPayment : '' };
    if (editing.id) api.patch('invoices', editing.id, item);
    else {
      const id = api.add('invoices', { ...item, number: Math.max(0, ...project.invoices.map((i) => i.number)) + 1 });
      if (pending.length) uploadPending(api, 'invoice', id, pending);
    }
    close();
  };

  return (
    <div className="page">
      <PageHead title="Finance" />

      <div className="stats stats-6 mb">
        {seesContract(project, user.id) && <div className="stat"><strong>{money(project.budget)}</strong><span>Contract value</span></div>}
        <div className="stat"><strong>{money(invoiced)}</strong><span>Invoiced to client</span></div>
        <div className="stat"><strong>{money(received)}</strong><span>Received</span></div>
        <div className="stat"><strong className={overdue.length ? 'overdue' : ''}>{money(outstanding)}</strong><span>Outstanding{overdue.length > 0 && ` · ${overdue.length} overdue`}</span></div>
        <div className="stat"><strong>{money(spent)}</strong><span>Spent</span></div>
        <div className="stat"><strong className={received - spent < 0 ? 'overdue' : 'positive'}>{money(received - spent)}</strong><span>Cash position (received − spent)</span></div>
      </div>

      <div className="layout-sidebar">
        <div>
          <div className="card card-body mb">
            <div className="row-between"><h3>Client invoices</h3>
              <button className="btn btn-primary btn-sm" onClick={() => open({ date: TODAY, status: 'Draft', payments: [] })}><Plus size={16} /> New invoice</button>
            </div>
            {project.invoices.length === 0 ? <p className="muted mt-sm">No invoices yet. Add progress claims or payment requests you send to the client.</p> : (
              <div className="table-wrap mt-sm">
                <table className="table clickable">
                  <thead><tr><th>#</th><th>Description</th><th>Due</th><th>Status</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
                  <tbody>
                    {[...project.invoices].sort((a, b) => b.number - a.number).map((i) => (
                      <tr key={i.id} onClick={() => open(i)}>
                        <td className="meta nowrap">{invoiceRef(i)}</td>
                        <td>{i.description} <AttachmentBadge project={project} entityId={i.id} /><div className="meta">Issued {formatDate(i.date)}</div></td>
                        <td className={`nowrap ${invoiceOverdue(i) ? 'overdue' : ''}`}>{i.due ? formatDate(i.due) : '—'}</td>
                        <td>
                          <span className={statusClass(invoiceStatus(i) === 'Sent' ? 'Open' : invoiceStatus(i))}>{invoiceStatus(i)}</span>
                          {invoiceOverdue(i) && <div><span className={statusClass('Overdue')}>Overdue</span></div>}
                        </td>
                        <td className="num">{money(i.amount)}</td>
                        <td className="num">{paidOf(i) ? money(paidOf(i)) : '—'}</td>
                        <td className={`num ${outstandingOf(i) && invoiceStatus(i) !== 'Draft' ? 'overdue' : ''}`}>{invoiceStatus(i) === 'Draft' ? '—' : money(outstandingOf(i))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card card-body">
            <div className="row-between"><h3>Spending by category</h3><Link className="link-btn" to="../expenses">View expenses →</Link></div>
            {categories.length === 0 ? <p className="muted mt-sm">Nothing spent yet.</p> : (
              <ul className="hbar-list">
                {categories.map(([name, value]) => (
                  <li key={name} title={`${name}: ${money(value)} (${Math.round((value / spent) * 100)}% of spending)`}>
                    <span className="hbar-label">{name}</span>
                    <span className="hbar-track"><span className="hbar" style={{ width: `${(value / maxCategory) * 100}%` }} /></span>
                    <span className="hbar-value">{money(value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside>
          <div className="card card-body mb">
            <h3>Budget</h3>
            <Progress value={budgeted ? spent / budgeted : 0} />
            <p className="meta">{money(spent)} spent of {money(budgeted)} budgeted ({budgeted ? Math.round((spent / budgeted) * 100) : 0}%)</p>
            <Link className="link-btn" to="../budget">View budget →</Link>
          </div>
          <div className="card card-body">
            <h3>Committed on site</h3>
            <dl className="details">
              <dt>Materials ordered</dt><dd>{money(sumOf(project.materials.map((m) => ({ v: materialValue(m) })), 'v'))}</dd>
              <dt>Equipment rental to date</dt><dd>{money(sumOf(project.equipment.map((q) => ({ v: equipmentCostToDate(q) })), 'v'))}</dd>
            </dl>
            <p className="meta">Tracked on the Materials and Equipment pages. Record payments as expenses so they count toward spending.</p>
          </div>
        </aside>
      </div>

      <Modal open={!!editing} onClose={close} title={editing?.id ? `Invoice ${invoiceRef(editing)}` : 'New invoice'} wide>
        {editing && (
          <>
            <SimpleForm
              key={editing.id || 'new'}
              fields={[
                { name: 'description', label: 'Description', required: true, full: true },
                { name: 'amount', label: 'Amount (₦)', type: 'number', required: true },
                { name: 'status', label: 'Status', type: 'select', options: INVOICE_STATUSES, required: true },
                { name: 'date', label: 'Issue date', type: 'date', required: true },
                { name: 'due', label: 'Due date', type: 'date' },
              ]}
              initial={{ ...editing, status: baseStatus(editing) }}
              submitLabel="Save invoice"
              onSubmit={save}
              onValuesChange={(v) => setFormAmount(v.amount)}
            >
              <PaymentsEditor payments={payments} onChange={setPayments} amount={formAmount} />
              <Attachments project={project} api={api} entityType="invoice" entityId={editing.id}
                pending={pending} onPending={setPending} label="Invoice copy (optional)" />
            </SimpleForm>
            {editing.id && <DeleteButton onClick={() => { api.remove('invoices', editing.id); close(); }} />}
          </>
        )}
      </Modal>
    </div>
  );
}
