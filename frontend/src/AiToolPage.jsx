import React, { useState } from 'react';
import { postJson } from './api.js';

export default function AiToolPage({ title, intro, endpoint, fields }) {
  const initial = {};
  fields.forEach((f) => { initial[f.name] = f.default || ''; });
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState(null);

  function update(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setResponse(null);
    setLoading(true);
    try {
      const data = await postJson(`/api/ai/${endpoint}`, form);
      setResponse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>{title}</h2>
      {intro && <p className="muted">{intro}</p>}

      <div className="card">
        <form onSubmit={onSubmit}>
          {fields.map((f) => (
            <div className="form-row" key={f.name}>
              <label>{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  value={form[f.name]}
                  onChange={(e) => update(f.name, e.target.value)}
                  placeholder={f.placeholder || ''}
                  rows={f.rows || 4}
                />
              ) : f.type === 'number' ? (
                <input
                  type="number"
                  value={form[f.name]}
                  onChange={(e) => update(f.name, e.target.value)}
                  placeholder={f.placeholder || ''}
                />
              ) : (
                <input
                  type="text"
                  value={form[f.name]}
                  onChange={(e) => update(f.name, e.target.value)}
                  placeholder={f.placeholder || ''}
                />
              )}
            </div>
          ))}
          <button className="primary" disabled={loading}>
            {loading ? 'Working...' : 'Submit'}
          </button>
        </form>
      </div>

      {loading && <div className="loading">Calling AI service, please wait...</div>}
      {error && <div className="error">{error}</div>}
      {response && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Response</h3>
          {response.result ? (
            <div className="result-box">{response.result}</div>
          ) : (
            <pre className="result-box">{JSON.stringify(response, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
