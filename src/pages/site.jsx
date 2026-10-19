import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, TriangleAlert } from 'lucide-react';
import { Empty, FilterBar, Modal, SimpleForm } from '../components/ui.jsx';
import { formatDate, matchesQuery } from '../hooks.js';
import { EQUIPMENT_STATUSES, MATERIAL_STATUSES, OWNERSHIP } from '../data/projects.js';
import { access, money, statusClass, sumOf, TODAY, useStore } from '../store.jsx';
import { AttachmentBadge, Attachments, uploadPending } from '../components/Attachments.jsx';
import { DeleteButton, PageHead } from './sections.jsx';

const num = (n) => new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(n || 0);
const dayNum = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

export const materialValue = (m) => Number(m.quantity || 0) * Number(m.unitCost || 0);
export const onSite = (m) => Number(m.delivered || 0) - Number(m.used || 0);
// Running low: work still needs this material, but what's on site covers 10% or less of what's left to use.
const isLow = (m) => m.delivered > 0 && m.used < m.quantity && onSite(m) <= (m.quantity - m.used) * 0.1;

// Rented equipment cost from its start date up to today (or its end date, if earlier).
export function equipmentCostToDate(q) {
  if (q.ownership !== 'Rented' || !q.start || q.start > TODAY) return 0;
  const last = q.end && q.end < TODAY ? q.end : TODAY;
  return Math.max(0, dayNum(last) - dayNum(q.start) + 1) * Number(q.dailyRate || 0);
}

/* ---------- Materials ---------- */

export function Materials() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const canEdit = access(project, user.id, 'site') >= 3; // others can only look
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState([]);
  const close = () => { setEditing(null); setPending([]); };
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');

  const visible = project.materials.filter(
    (m) => (status === 'All' || m.status === status) && matchesQuery(query, m.name, m.supplier, m.unit)
  );
  const awaiting = project.materials.filter((m) => m.status !== 'Delivered' && m.delivered < m.quantity);
  const low = project.materials.filter(isLow);

  const save = (v) => {
    const item = {
      ...v,
      quantity: Number(v.quantity) || 0,
      delivered: Number(v.delivered) || 0,
      used: Number(v.used) || 0,
      unitCost: Number(v.unitCost) || 0,
    };
    if (editing.id) api.patch('materials', editing.id, item);
    else {
      const id = api.add('materials', item);
      if (pending.length) uploadPending(api, 'material', id, pending);
    }
    close();
  };

  return (
    <div className="page">
      <PageHead title="Materials">
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEditing({ status: 'Requested' })}><Plus size={16} /> Add material</button>}
      </PageHead>

      <div className="stats mb">
        <div className="stat"><strong>{project.materials.length}</strong><span>Materials tracked</span></div>
        <div className="stat"><strong>{money(sumOf(project.materials.map((m) => ({ v: materialValue(m) })), 'v'))}</strong><span>Total value ordered</span></div>
        <div className="stat"><strong>{awaiting.length}</strong><span>Awaiting delivery</span></div>
        <div className="stat"><strong className={low.length ? 'overdue' : ''}>{low.length}</strong><span>Running low on site</span></div>
      </div>

      <FilterBar query={query} onQuery={setQuery} placeholder="Search materials…" options={MATERIAL_STATUSES} active={status} onActive={setStatus} />

      {visible.length === 0 ? <Empty>{project.materials.length ? 'No materials match your filters.' : 'No materials yet. Add what you need to order and track deliveries.'}</Empty> : (
        <div className="table-wrap">
          <table className={`table ${canEdit ? 'clickable' : ''}`}>
            <thead>
              <tr>
                <th>Material</th><th>Needed by</th><th className="num">Required</th><th>Delivered</th>
                <th className="num">Used</th><th className="num">On site</th><th className="num">Value</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const late = m.neededBy && m.neededBy < TODAY && m.delivered < m.quantity;
                return (
                  <tr key={m.id} onClick={() => canEdit && setEditing(m)}>
                    <td><strong>{m.name}</strong> <AttachmentBadge project={project} entityId={m.id} />{m.supplier && <div className="meta">{m.supplier}</div>}</td>
                    <td className={`nowrap ${late ? 'overdue' : ''}`}>{m.neededBy ? formatDate(m.neededBy) : '—'}</td>
                    <td className="num nowrap">{num(m.quantity)} {m.unit}</td>
                    <td className="nowrap">
                      <div className="mini-progress"><div style={{ width: `${m.quantity ? Math.min(100, (m.delivered / m.quantity) * 100) : 0}%` }} /></div>{' '}
                      <span className="meta">{num(m.delivered)}</span>
                    </td>
                    <td className="num">{num(m.used)}</td>
                    <td className={`num nowrap ${isLow(m) ? 'overdue' : ''}`}>
                      {isLow(m) && <TriangleAlert size={13} aria-label="Low stock" />} {num(onSite(m))} {m.unit}
                    </td>
                    <td className="num">{money(materialValue(m))}</td>
                    <td><span className={statusClass(m.status)}>{m.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={close} title={editing?.id ? 'Edit material' : 'New material'} wide>
        {editing && (
          <>
            <SimpleForm
              key={editing.id || 'new'}
              fields={[
                { name: 'name', label: 'Material', required: true },
                { name: 'unit', label: 'Unit (e.g. bags, tonnes, m³)', required: true },
                { name: 'quantity', label: 'Quantity required', type: 'number', required: true },
                { name: 'unitCost', label: 'Unit cost (₦)', type: 'number' },
                { name: 'delivered', label: 'Quantity delivered', type: 'number' },
                { name: 'used', label: 'Quantity used', type: 'number' },
                { name: 'supplier', label: 'Supplier' },
                { name: 'neededBy', label: 'Needed on site by', type: 'date' },
                { name: 'status', label: 'Status', type: 'select', options: MATERIAL_STATUSES, required: true },
              ]}
              initial={editing}
              submitLabel="Save material"
              onSubmit={save}
            >
              <Attachments project={project} api={api} entityType="material" entityId={editing.id}
                pending={pending} onPending={setPending} label="Delivery notes & photos" />
            </SimpleForm>
            {editing.id && <DeleteButton onClick={() => { api.remove('materials', editing.id); close(); }} />}
          </>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Equipment ---------- */

export function Equipment() {
  const { project, api } = useOutletContext();
  const { user } = useStore();
  const canEdit = access(project, user.id, 'site') >= 3; // others can only look
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState([]);
  const close = () => { setEditing(null); setPending([]); };
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');

  const visible = project.equipment.filter(
    (q) => (status === 'All' || q.status === status) && matchesQuery(query, q.name, q.category, q.supplier, q.operator)
  );
  const onSiteNow = project.equipment.filter((q) => q.status === 'On site');
  const dailyBurn = sumOf(onSiteNow.filter((q) => q.ownership === 'Rented'), 'dailyRate');

  const save = (v) => {
    if (v.start && v.end && v.start > v.end) return alert('The end date must be after the start date.');
    const item = { ...v, dailyRate: Number(v.dailyRate) || 0 };
    if (editing.id) api.patch('equipment', editing.id, item);
    else {
      const id = api.add('equipment', item);
      if (pending.length) uploadPending(api, 'equipment', id, pending);
    }
    close();
  };

  return (
    <div className="page">
      <PageHead title="Equipment">
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEditing({ status: 'Scheduled', ownership: 'Rented' })}><Plus size={16} /> Add equipment</button>}
      </PageHead>

      <div className="stats mb">
        <div className="stat"><strong>{onSiteNow.length}</strong><span>On site now</span></div>
        <div className="stat"><strong>{project.equipment.filter((q) => q.ownership === 'Rented' && q.status !== 'Returned').length}</strong><span>Active rentals</span></div>
        <div className="stat"><strong>{money(dailyBurn)}</strong><span>Rental cost per day</span></div>
        <div className="stat"><strong>{money(sumOf(project.equipment.map((q) => ({ v: equipmentCostToDate(q) })), 'v'))}</strong><span>Rental cost to date</span></div>
      </div>

      <FilterBar query={query} onQuery={setQuery} placeholder="Search equipment…" options={EQUIPMENT_STATUSES} active={status} onActive={setStatus} />

      {visible.length === 0 ? <Empty>{project.equipment.length ? 'No equipment matches your filters.' : 'No equipment yet. Add owned plant and rentals to track them.'}</Empty> : (
        <div className="table-wrap">
          <table className={`table ${canEdit ? 'clickable' : ''}`}>
            <thead>
              <tr><th>Equipment</th><th>Ownership</th><th>Operator</th><th>On site</th><th className="num">Daily rate</th><th className="num">Cost to date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {visible.map((q) => (
                <tr key={q.id} onClick={() => canEdit && setEditing(q)}>
                  <td><strong>{q.name}</strong> <AttachmentBadge project={project} entityId={q.id} /><div className="meta">{[q.category, q.supplier].filter(Boolean).join(' · ')}</div></td>
                  <td>{q.ownership}</td>
                  <td>{q.operator || '—'}</td>
                  <td className="nowrap meta">
                    {q.start ? formatDate(q.start, { month: 'short', day: 'numeric' }) : '—'} – {q.end ? formatDate(q.end, { month: 'short', day: 'numeric', year: 'numeric' }) : 'ongoing'}
                  </td>
                  <td className="num">{q.ownership === 'Rented' ? money(q.dailyRate) : '—'}</td>
                  <td className="num">{q.ownership === 'Rented' ? money(equipmentCostToDate(q)) : '—'}</td>
                  <td><span className={statusClass(q.status)}>{q.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={close} title={editing?.id ? 'Edit equipment' : 'New equipment'} wide>
        {editing && (
          <>
            <SimpleForm
              key={editing.id || 'new'}
              fields={[
                { name: 'name', label: 'Equipment', required: true },
                { name: 'category', label: 'Type (e.g. Crane, Excavator)' },
                { name: 'ownership', label: 'Ownership', type: 'select', options: OWNERSHIP, required: true },
                { name: 'supplier', label: 'Supplier / rental company' },
                { name: 'dailyRate', label: 'Daily rental rate (₦)', type: 'number' },
                { name: 'operator', label: 'Operator' },
                { name: 'start', label: 'On site from', type: 'date' },
                { name: 'end', label: 'On site until', type: 'date' },
                { name: 'status', label: 'Status', type: 'select', options: EQUIPMENT_STATUSES, required: true },
                { name: 'notes', label: 'Notes', type: 'textarea', full: true },
              ]}
              initial={editing}
              submitLabel="Save equipment"
              onSubmit={save}
            >
              <Attachments project={project} api={api} entityType="equipment" entityId={editing.id}
                pending={pending} onPending={setPending} label="Photos & papers" />
            </SimpleForm>
            {editing.id && <DeleteButton onClick={() => { api.remove('equipment', editing.id); close(); }} />}
          </>
        )}
      </Modal>
    </div>
  );
}
