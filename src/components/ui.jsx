import { useCallback, useEffect, useRef, useState } from 'react';
import { useClickOutside } from '../hooks.js';

export function FilterBar({ query, onQuery, placeholder = 'Search…', options, active, onActive, allLabel = 'All', counts, children }) {
  return (
    <div className="toolbar">
      {onQuery && (
        <input
          className="search-input"
          type="search"
          value={query}
          placeholder={placeholder}
          onChange={(e) => onQuery(e.target.value)}
        />
      )}
      {options && (
        <div className="chips">
          {[allLabel, ...options].map((o) => (
            <button
              key={o}
              className={`chip ${active === o ? 'active' : ''}`}
              onClick={() => onActive(o)}
            >
              {o}{counts?.[o] > 0 && <span className="chip-count">{counts[o]}</span>}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

export function Empty({ children = 'Nothing matches your filters.' }) {
  return <div className="empty">{children}</div>;
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Progress({ value }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar">
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

const OTHER = '__other__';
const optionValue = (o) => (typeof o === 'string' ? o : o.value);

/**
 * Declarative form with required-field and email validation.
 * A select with `allowOther: true` gets an "Other (type your own)" choice that reveals a text box.
 * fields: [{ name, label, type?: 'text'|'email'|'select'|'textarea'|'checkbox', required?, options? }]
 */
export function SimpleForm({ fields, submitLabel = 'Submit', onSubmit, initial = {}, children, onValuesChange }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? (f.type === 'checkbox' ? false : '')]))
  );
  const [errors, setErrors] = useState({});
  // Selects showing their free-text box: on when an existing value isn't one of the options.
  const [typing, setTyping] = useState(() => Object.fromEntries(fields
    .filter((f) => f.allowOther && initial[f.name] && !f.options.map(optionValue).includes(initial[f.name]))
    .map((f) => [f.name, true])));

  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));
  useEffect(() => { onValuesChange?.(values); }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.required && (f.type === 'checkbox' ? !v : !String(v).trim())) errs[f.name] = 'Required';
      else if (f.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v)) errs[f.name] = 'Enter a valid email';
    }
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(values);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {fields.map((f) => (
        <label key={f.name} className={`field ${f.type === 'checkbox' ? 'field-check' : ''} ${f.full ? 'full' : ''}`}>
          {f.type === 'checkbox' ? (
            <>
              <input type="checkbox" checked={values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
              <span>{f.label}</span>
            </>
          ) : (
            <>
              <span>{f.label}{f.required && ' *'}</span>
              {f.type === 'select' ? (
                <>
                  <select
                    value={typing[f.name] ? OTHER : values[f.name]}
                    onChange={(e) => {
                      const other = e.target.value === OTHER;
                      setTyping((t) => ({ ...t, [f.name]: other }));
                      set(f.name, other ? '' : e.target.value);
                    }}
                  >
                    <option value="">Select…</option>
                    {f.options.map((o) => (typeof o === 'string'
                      ? <option key={o}>{o}</option>
                      : <option key={o.value} value={o.value}>{o.label}</option>))}
                    {f.allowOther && <option value={OTHER}>Other (type your own)…</option>}
                  </select>
                  {typing[f.name] && (
                    <input
                      autoFocus
                      aria-label={`${f.label} (your own)`}
                      placeholder={f.otherPlaceholder ?? 'Type your own'}
                      value={values[f.name]}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  )}
                </>
              ) : f.type === 'textarea' ? (
                <textarea rows={4} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />
              ) : (
                <input type={f.type || 'text'} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />
              )}
            </>
          )}
          {f.hint && <small className="meta">{f.hint}</small>}
          {errors[f.name] && <small className="error">{errors[f.name]}</small>}
        </label>
      ))}
      {children && <div className="field full">{children}</div>}
      <button type="submit" className="btn btn-primary full">{submitLabel}</button>
    </form>
  );
}

const hueOf = (name) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function Avatar({ name, size = 'sm' }) {
  return (
    <span className={`avatar ${size}`} title={name} style={{ background: `hsl(${hueOf(name)} 55% 45%)` }}>
      {name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ names, max = 3 }) {
  if (!names.length) return <span className="meta">—</span>;
  return (
    <span className="avatar-stack">
      {names.slice(0, max).map((n) => <Avatar key={n} name={n} />)}
      {names.length > max && <span className="avatar sm more">+{names.length - max}</span>}
    </span>
  );
}

// Button that toggles a popover menu; children receive a `close` function.
export function Dropdown({ trigger, className = '', align = 'left', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  return (
    <div className={`dropdown ${className}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className={`dropdown-menu ${align}`}>{children(close)}</div>}
    </div>
  );
}
