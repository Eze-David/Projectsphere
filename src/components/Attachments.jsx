import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ImagePlus, Paperclip, X } from 'lucide-react';

const MAX_BYTES = 50 * 1024 * 1024; // matches the storage bucket limit
const ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';
const isImage = (f) => (f.mime ?? f.type ?? '').startsWith('image/');

// Signed links for private files, cached for most of their one-hour lifetime.
const urlCache = new Map();
function useSignedUrls(api, paths) {
  const key = paths.join('|');
  const [urls, setUrls] = useState({});
  useEffect(() => {
    if (!paths.length) return;
    const fill = () => setUrls(Object.fromEntries(paths.map((p) => [p, urlCache.get(p)?.url])));
    const missing = paths.filter((p) => !(urlCache.get(p)?.expires > Date.now()));
    if (!missing.length) return fill();
    let live = true;
    api.signedUrls(missing).then((list) => {
      for (const item of list) if (item.signedUrl) urlCache.set(item.path, { url: item.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
      if (live) fill();
    }).catch(() => {});
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

// Open a private file in a new tab (the tab opens first so pop-up blockers allow it).
async function openFile(api, file) {
  const tab = window.open('', '_blank');
  try {
    const url = await api.fileUrl(file);
    if (tab) tab.location.href = url;
  } catch (e) {
    tab?.close();
    alert(`Couldn’t open file: ${e.message}`);
  }
}

export const attachmentsFor = (project, entityId) => project.attachments.filter((a) => a.entityId === entityId);

/** Upload photos/files for one record. Existing records upload immediately; for a record that hasn't
 *  been saved yet, files are kept in `pending` and the parent uploads them after saving (uploadPending). */
export function Attachments({ project, api, entityType, entityId, pending = [], onPending, label = 'Photos & files', readOnly = false }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const input = useRef(null);
  const existing = entityId ? attachmentsFor(project, entityId) : [];
  const urls = useSignedUrls(api, existing.filter(isImage).map((a) => a.path));
  const previews = useMemo(() => pending.map((f) => (isImage(f) ? URL.createObjectURL(f) : null)), [pending]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const pick = async (fileList) => {
    const files = [...fileList];
    if (input.current) input.current.value = '';
    const tooBig = files.filter((f) => f.size > MAX_BYTES);
    const ok = files.filter((f) => f.size <= MAX_BYTES);
    setError(tooBig.length ? `${tooBig.map((f) => f.name).join(', ')}: larger than 50 MB` : '');
    if (!entityId) return onPending([...pending, ...ok]);

    setBusy(ok.length);
    const failed = [];
    for (const f of ok) {
      try {
        await api.uploadAttachment(f, entityType, entityId);
      } catch (e) {
        failed.push(`${f.name}: ${e.message}`);
      }
      setBusy((n) => n - 1);
    }
    if (failed.length) setError(failed.join(' · '));
  };

  return (
    <div className="attachments">
      <span className="att-label"><Paperclip size={14} /> {label}</span>
      <div className="att-grid">
        {existing.map((a) => (
          <div key={a.id} className="att-tile" title={a.name}>
            <button type="button" className="att-open" onClick={() => openFile(api, a)}>
              {isImage(a) ? (urls[a.path] ? <img src={urls[a.path]} alt={a.name} /> : <span className="att-loading" />) : <FileText size={26} />}
              {!isImage(a) && <span className="att-name">{a.name}</span>}
            </button>
            {!readOnly && <button type="button" className="att-remove" aria-label={`Remove ${a.name}`}
              onClick={() => confirm(`Remove ${a.name}?`) && api.removeAttachment(a)}><X size={12} /></button>}
          </div>
        ))}
        {pending.map((f, i) => (
          <div key={`${f.name}-${i}`} className="att-tile pending" title={`${f.name} — uploads when you save`}>
            <span className="att-open">
              {previews[i] ? <img src={previews[i]} alt={f.name} /> : <FileText size={26} />}
              {!previews[i] && <span className="att-name">{f.name}</span>}
            </span>
            <button type="button" className="att-remove" aria-label={`Remove ${f.name}`}
              onClick={() => onPending(pending.filter((_, j) => j !== i))}><X size={12} /></button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => <div key={`busy-${i}`} className="att-tile"><span className="att-loading" /></div>)}
        {readOnly && existing.length === 0 && <span className="meta">None</span>}
        {!readOnly && <button type="button" className="att-add" onClick={() => input.current?.click()}>
          <ImagePlus size={22} />
          <span>Add</span>
        </button>}
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => pick(e.target.files)} />
      </div>
      {pending.length > 0 && <p className="meta">{pending.length} file{pending.length > 1 ? 's' : ''} will upload when you save.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Upload files picked before a record existed. Errors are collected so one bad file doesn't stop the rest.
export async function uploadPending(api, entityType, entityId, files) {
  const failed = [];
  for (const f of files) {
    try {
      await api.uploadAttachment(f, entityType, entityId);
    } catch (e) {
      failed.push(`${f.name}: ${e.message}`);
    }
  }
  if (failed.length) alert(`Some files didn’t upload:\n${failed.join('\n')}`);
}

// Small paperclip + count for lists and tables; nothing when there are no attachments.
export function AttachmentBadge({ project, entityId }) {
  const n = attachmentsFor(project, entityId).length;
  return n ? <span className="att-badge" title={`${n} attachment${n > 1 ? 's' : ''}`}><Paperclip size={12} /> {n}</span> : null;
}

// Read-only row of image thumbnails (e.g. site photos on a daily log).
export function AttachmentThumbs({ project, api, entityId }) {
  const files = attachmentsFor(project, entityId);
  const urls = useSignedUrls(api, files.filter(isImage).map((a) => a.path));
  if (!files.length) return null;
  return (
    <div className="att-thumbs">
      {files.map((a) => (
        <button key={a.id} type="button" className="att-thumb" title={a.name} onClick={() => openFile(api, a)}>
          {isImage(a) ? (urls[a.path] ? <img src={urls[a.path]} alt={a.name} /> : <span className="att-loading" />) : <FileText size={18} />}
        </button>
      ))}
    </div>
  );
}
