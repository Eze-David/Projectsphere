import { useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Download, File, FileImage, FileSpreadsheet, FileText, Trash2, Upload } from 'lucide-react';
import { Empty, FilterBar } from '../components/ui.jsx';
import { formatDate, matchesQuery } from '../hooks.js';
import { DOC_FOLDERS } from '../data/projects.js';
import { access, memberName, money, useStore } from '../store.jsx';
import { PageHead } from './sections.jsx';

const MAX_BYTES = 50 * 1024 * 1024; // matches the storage bucket limit

const sizeLabel = (b) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;

function FileIcon({ mime, name }) {
  if (mime.startsWith('image/')) return <FileImage size={20} className="file-icon image" />;
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet size={20} className="file-icon sheet" />;
  if (/pdf|word|text|document/.test(mime) || /\.(pdf|docx?|txt)$/i.test(name)) return <FileText size={20} className="file-icon doc" />;
  return <File size={20} className="file-icon" />;
}

const isImage = (f) => f.mime.startsWith('image/');

// Which Documents folder a file attached to a record belongs in.
function folderFor(a) {
  if (['expense', 'material', 'invoice', 'payment'].includes(a.entityType)) return 'Invoices & receipts';
  if (a.entityType === 'rfi') return 'Drawings';
  return isImage(a) ? 'Photos' : 'Other';
}

// The record a file is attached to: a readable label and a link to where it lives.
function sourceOf(project, a) {
  const find = (key) => project[key].find((x) => x.id === a.entityId);
  switch (a.entityType) {
    case 'expense': { const e = find('expenses'); return e && { label: `Expense: ${e.description}`, to: '../expenses' }; }
    case 'invoice': { const i = find('invoices'); return i && { label: `Invoice INV-${String(i.number).padStart(3, '0')}: ${i.description}`, to: '../finance' }; }
    case 'payment': {
      const x = find('allocationPayments');
      return x && { label: `Payment: ${money(x.amount)} to ${memberName(project, x.payee) || 'team member'} (${formatDate(x.date)})`, to: '../budget' };
    }
    case 'material': { const m = find('materials'); return m && { label: `Material: ${m.name}`, to: '../materials' }; }
    case 'equipment': { const q = find('equipment'); return q && { label: `Equipment: ${q.name}`, to: '../equipment' }; }
    case 'log': { const l = find('logs'); return l && { label: `Daily log: ${formatDate(l.date)}`, to: '../logs' }; }
    case 'rfi': { const r = find('rfis'); return r && { label: `Request for Information #${String(r.number).padStart(3, '0')}: ${r.subject}`, to: '../rfis' }; }
    case 'task': { const t = find('tasks'); return t && { label: `Task #${t.number}: ${t.title}`, to: `../tasks?task=${t.id}` }; }
    default: return null;
  }
}

const AREA_OF = { expense: 'expenses', invoice: 'finance', material: 'site', equipment: 'site', log: 'logs', rfi: 'rfis', task: 'tasks', payment: 'budget' };

export function Documents() {
  const { project, api } = useOutletContext();
  const { needsMigration, user, me } = useStore();
  const canEdit = access(project, user.id, 'documents') >= 3;
  const canEditAttachment = (a) => a.uploader === me || access(project, user.id, AREA_OF[a.entityType]) >= 3;
  const [folder, setFolder] = useState('All');
  const [uploadFolder, setUploadFolder] = useState('Drawings');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);

  // Uploaded documents plus every file attached to a record, filed into the matching folder.
  const all = [
    ...project.documents,
    ...project.attachments.map((a) => ({ ...a, folder: folderFor(a), attached: true, source: sourceOf(project, a) })),
  ];
  const visible = all
    .filter((d) => (folder === 'All' || d.folder === folder) && matchesQuery(query, d.name, d.uploader, d.folder, d.source?.label))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts = Object.fromEntries(DOC_FOLDERS.map((f) => [f, all.filter((d) => d.folder === f).length]));

  const upload = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const target = folder === 'All' ? uploadFolder : folder;
    setErrors([]);
    setUploading(list.length);
    const failed = [];
    for (const file of list) {
      if (file.size > MAX_BYTES) failed.push(`${file.name}: larger than 50 MB`);
      else {
        try {
          await api.uploadDocument(file, target);
        } catch (e) {
          failed.push(`${file.name}: ${e.message}`);
        }
      }
      setUploading((n) => n - 1);
    }
    setErrors(failed);
    if (input.current) input.current.value = '';
  };

  const open = async (doc, download) => {
    // Open the tab first so pop-up blockers allow it, then point it at the signed link.
    const tab = download ? null : window.open('', '_blank');
    try {
      const url = await api.documentUrl(doc, download);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      alert(`Couldn’t open file: ${e.message}`);
    }
  };

  if (needsMigration) {
    return (
      <div className="page">
        <PageHead title="Documents" />
        <Empty>Documents need a database update before they can be used. Run <code>supabase/migrations/20261016000000_finance_site_documents.sql</code> in the Supabase SQL editor.</Empty>
      </div>
    );
  }

  return (
    <div
      className={`page drop-page ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
    >
      <PageHead title="Documents">
        {canEdit && <div className="btn-row tight">
          {folder === 'All' && (
            <select className="select-sm" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} aria-label="Upload to folder">
              {DOC_FOLDERS.map((f) => <option key={f}>{f}</option>)}
            </select>
          )}
          <button className="btn btn-primary btn-sm" disabled={uploading > 0} onClick={() => input.current?.click()}>
            <Upload size={16} /> {uploading ? `Uploading ${uploading}…` : `Upload${folder !== 'All' ? ` to ${folder}` : ''}`}
          </button>
          <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>}
      </PageHead>

      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search documents…"
        options={DOC_FOLDERS}
        active={folder}
        onActive={setFolder}
        counts={counts}
      />

      {errors.length > 0 && (
        <div className="error-banner inline" role="alert">
          <span>Some files didn’t upload:<br />{errors.map((e) => <span key={e}>{e}<br /></span>)}</span>
          <button className="icon-btn" onClick={() => setErrors([])} aria-label="Dismiss">✕</button>
        </div>
      )}

      {visible.length === 0 ? (
        <Empty>
          {all.length ? `No documents ${folder === 'All' ? 'match your search' : `in ${folder}`}.` : (
            <>
              <Upload size={28} />
              <p>{canEdit ? <>Drag files here, or use <strong>Upload</strong>.</> : 'No documents yet.'} Drawings, contracts, permits, photos — up to 50 MB each.</p>
            </>
          )}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Folder</th><th>Attached to</th><th>Size</th><th>Uploaded</th><th /></tr></thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button className="doc-name" onClick={() => open(d, false)} title="Open">
                      <FileIcon mime={d.mime} name={d.name} /> <span>{d.name}</span>
                    </button>
                  </td>
                  <td>
                    {d.attached || !canEdit ? <span className="folder-fixed" title="Filed automatically from the record it's attached to">{d.folder}</span> : (
                      <select className="select-sm" value={d.folder} onChange={(e) => api.patch('documents', d.id, { folder: e.target.value })} aria-label={`Folder for ${d.name}`}>
                        {DOC_FOLDERS.map((f) => <option key={f}>{f}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="source-cell">
                    {d.attached ? (d.source ? <Link className="link-btn" to={d.source.to}>{d.source.label}</Link> : <span className="meta">Deleted record</span>) : <span className="meta">—</span>}
                  </td>
                  <td className="meta nowrap">{sizeLabel(d.size)}</td>
                  <td className="meta nowrap">{d.uploader}{d.uploader && ' · '}{formatDate(d.createdAt.slice(0, 10))}</td>
                  <td className="num nowrap">
                    <button className="icon-btn" title="Download" onClick={() => open(d, true)}><Download size={16} /></button>
                    {(d.attached ? canEditAttachment(d) : canEdit) && <button className="icon-btn" title="Delete" onClick={() => confirm(`Delete ${d.name}?${d.attached ? ' It will also be removed from the record it’s attached to.' : ''}`) && (d.attached ? api.removeAttachment(d) : api.removeDocument(d))}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dragging && <div className="drop-overlay"><Upload size={32} /> Drop to upload to {folder === 'All' ? uploadFolder : folder}</div>}
    </div>
  );
}
