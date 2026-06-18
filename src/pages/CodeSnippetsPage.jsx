import React, { useCallback, useEffect, useState } from 'react';
import HomeButton from '../components/common/HomeButtom';
import { formatSql } from '../utils/sqlFormat';
import {
    deleteCodeSnippet,
    descriptionPreview,
    getCodeSnippets,
    saveCodeSnippet,
    SNIPPET_LANGUAGES,
} from '../utils/codeSnippetsStorage';
import '../styles/pages/_code-snippets.scss';

const EMPTY_FORM = {
    id: null,
    title: '',
    description: '',
    language: 'sql',
    code: '',
};

const LANGUAGE_LABELS = {
    sql: 'SQL',
    pyspark: 'PySpark',
    python: 'Python',
    other: 'Other',
};

function formatTimestamp(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
}

function tryFormatSql(code) {
    return formatSql(code);
}

function SnippetForm({ initial, onSave, onCancel }) {
    const [form, setForm] = useState(initial);
    const [formatError, setFormatError] = useState(null);
    const [saving, setSaving] = useState(false);

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (field === 'code' || field === 'language') {
            setFormatError(null);
        }
    };

    const handleFormatSql = () => {
        const { formatted, error } = tryFormatSql(form.code);
        if (error) {
            setFormatError(error);
            return;
        }
        setFormatError(null);
        setForm((prev) => ({ ...prev, code: formatted }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.title.trim()) {
            return;
        }
        try {
            setSaving(true);
            await onSave(form);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="cs-form" onSubmit={handleSubmit}>
            <div className="cs-form-row">
                <label>
                    Title
                    <input
                        type="text"
                        value={form.title}
                        onChange={(e) => handleChange('title', e.target.value)}
                        placeholder="Snippet title"
                        required
                        autoFocus
                    />
                </label>
                <label>
                    Language
                    <select
                        value={form.language}
                        onChange={(e) => handleChange('language', e.target.value)}
                    >
                        {SNIPPET_LANGUAGES.map((lang) => (
                            <option key={lang} value={lang}>{LANGUAGE_LABELS[lang]}</option>
                        ))}
                    </select>
                </label>
            </div>
            <label>
                Description
                <textarea
                    value={form.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="What does this snippet do?"
                    rows={2}
                />
            </label>
            <div className="cs-code-field">
                <div className="cs-code-field-header">
                    <span>Code</span>
                    {form.language === 'sql' && (
                        <button
                            type="button"
                            className="cs-btn cs-btn--secondary cs-btn--sm"
                            onClick={handleFormatSql}
                        >
                            Format SQL
                        </button>
                    )}
                </div>
                <textarea
                    className="cs-code-textarea"
                    value={form.code}
                    onChange={(e) => handleChange('code', e.target.value)}
                    placeholder="Paste your code here…"
                    rows={14}
                    spellCheck={false}
                />
                {formatError && (
                    <p className="cs-format-error" role="alert">{formatError}</p>
                )}
            </div>
            <div className="cs-form-actions">
                <button type="button" className="cs-btn cs-btn--secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="cs-btn" disabled={saving || !form.title.trim()}>
                    {saving ? 'Saving…' : (form.id ? 'Save changes' : 'Add snippet')}
                </button>
            </div>
        </form>
    );
}

export default function CodeSnippetsPage() {
    const [snippets, setSnippets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [editorMode, setEditorMode] = useState(null);
    const [editorInitial, setEditorInitial] = useState(EMPTY_FORM);
    const [filterLanguage, setFilterLanguage] = useState('all');
    const [search, setSearch] = useState('');
    const [actionMessage, setActionMessage] = useState(null);
    const [viewFormatError, setViewFormatError] = useState(null);

    const loadSnippets = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getCodeSnippets();
            setSnippets(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSnippets();
    }, [loadSnippets]);

    useEffect(() => {
        if (!actionMessage) return undefined;
        const timer = window.setTimeout(() => setActionMessage(null), 4000);
        return () => window.clearTimeout(timer);
    }, [actionMessage]);

    const filteredSnippets = snippets.filter((snippet) => {
        if (filterLanguage !== 'all' && snippet.language !== filterLanguage) {
            return false;
        }
        const term = search.trim().toLowerCase();
        if (!term) {
            return true;
        }
        const haystack = [
            snippet.title,
            snippet.description,
            snippet.code,
            snippet.language,
        ].join(' ').toLowerCase();
        return haystack.includes(term);
    });

    const openCreate = () => {
        setEditorInitial({ ...EMPTY_FORM });
        setEditorMode('create');
        setExpandedId(null);
    };

    const openEdit = (snippet, event) => {
        event.stopPropagation();
        setEditorInitial({
            id: snippet.id,
            title: snippet.title,
            description: snippet.description,
            language: snippet.language,
            code: snippet.code,
            createdAt: snippet.createdAt,
        });
        setEditorMode('edit');
    };

    const closeEditor = () => {
        setEditorMode(null);
        setEditorInitial(EMPTY_FORM);
    };

    const handleSave = async (form) => {
        const saved = await saveCodeSnippet(form);
        await loadSnippets();
        closeEditor();
        setExpandedId(saved.id);
        setActionMessage(form.id ? 'Snippet updated' : 'Snippet added');
    };

    const handleDelete = async (snippet, event) => {
        event.stopPropagation();
        if (!window.confirm(`Delete "${snippet.title}"?`)) {
            return;
        }
        try {
            await deleteCodeSnippet(snippet.id);
            if (expandedId === snippet.id) {
                setExpandedId(null);
            }
            await loadSnippets();
            setActionMessage('Snippet deleted');
        } catch (err) {
            setActionMessage(err.message);
        }
    };

    const copyCode = async (code, event) => {
        if (event) {
            event.stopPropagation();
        }
        try {
            await navigator.clipboard.writeText(code);
            setActionMessage('Copied to clipboard');
        } catch (err) {
            setActionMessage(err.message);
        }
    };

    const formatExpandedSql = async (snippet) => {
        const { formatted, error } = tryFormatSql(snippet.code);
        if (error) {
            setViewFormatError(error);
            return;
        }
        setViewFormatError(null);
        try {
            const updated = await saveCodeSnippet({ ...snippet, code: formatted });
            await loadSnippets();
            setExpandedId(updated.id);
            setActionMessage('SQL formatted and saved');
        } catch (err) {
            setActionMessage(err.message);
        }
    };

    const toggleExpand = (id) => {
        setViewFormatError(null);
        setExpandedId((current) => (current === id ? null : id));
    };

    return (
        <div className="code-snippets-page">
            <HomeButton />
            <header className="cs-header">
                <div>
                    <h1>Code Snippets</h1>
                    <p className="cs-subtitle">
                        Store reusable SQL, PySpark, and other code. Saved on the server host.
                    </p>
                </div>
                <button type="button" className="cs-btn" onClick={openCreate}>
                    Add snippet
                </button>
            </header>

            {editorMode && (
                <section className="cs-editor-panel">
                    <h2>{editorMode === 'create' ? 'New snippet' : 'Edit snippet'}</h2>
                    <SnippetForm
                        initial={editorInitial}
                        onSave={handleSave}
                        onCancel={closeEditor}
                    />
                </section>
            )}

            <div className="cs-filters">
                <label>
                    Language
                    <select
                        value={filterLanguage}
                        onChange={(e) => setFilterLanguage(e.target.value)}
                    >
                        <option value="all">All</option>
                        {SNIPPET_LANGUAGES.map((lang) => (
                            <option key={lang} value={lang}>{LANGUAGE_LABELS[lang]}</option>
                        ))}
                    </select>
                </label>
                <label className="cs-search">
                    Search
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Title, description, or code…"
                    />
                </label>
                <button type="button" className="cs-btn cs-btn--secondary" onClick={loadSnippets} disabled={loading}>
                    Refresh
                </button>
            </div>

            {actionMessage && (
                <div className="cs-banner" role="status">{actionMessage}</div>
            )}
            {error && <div className="cs-banner cs-banner--error">{error}</div>}

            <div className="cs-grid-wrap">
                {loading && <p className="cs-empty">Loading…</p>}
                {!loading && filteredSnippets.length === 0 && (
                    <p className="cs-empty">
                        {snippets.length === 0
                            ? 'No snippets yet. Add your first one above.'
                            : 'No snippets match your filters.'}
                    </p>
                )}
                {!loading && filteredSnippets.length > 0 && (
                    <div className="cs-grid">
                        {filteredSnippets.map((snippet) => {
                            const expanded = expandedId === snippet.id;
                            return (
                                <article
                                    key={snippet.id}
                                    className={`cs-card ${expanded ? 'cs-card--expanded' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="cs-card-summary"
                                        onClick={() => toggleExpand(snippet.id)}
                                        aria-expanded={expanded}
                                    >
                                        <div className="cs-card-head">
                                            <h3>{snippet.title}</h3>
                                            <span className={`cs-lang-badge cs-lang-badge--${snippet.language}`}>
                                                {LANGUAGE_LABELS[snippet.language] || snippet.language}
                                            </span>
                                        </div>
                                        {snippet.description && (
                                            <p className="cs-card-desc">
                                                {descriptionPreview(snippet.description, expanded ? 500 : 100)}
                                            </p>
                                        )}
                                        <p className="cs-card-meta">
                                            Updated {formatTimestamp(snippet.updatedAt)}
                                        </p>
                                    </button>

                                    {expanded && (
                                        <div className="cs-card-detail">
                                            {snippet.description && (
                                                <p className="cs-detail-desc">{snippet.description}</p>
                                            )}
                                            <div className="cs-detail-actions">
                                                <button
                                                    type="button"
                                                    className="cs-btn cs-btn--secondary cs-btn--sm"
                                                    onClick={(e) => copyCode(snippet.code, e)}
                                                >
                                                    Copy to clipboard
                                                </button>
                                                {snippet.language === 'sql' && (
                                                    <button
                                                        type="button"
                                                        className="cs-btn cs-btn--secondary cs-btn--sm"
                                                        onClick={() => formatExpandedSql(snippet)}
                                                    >
                                                        Format SQL
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="cs-btn cs-btn--secondary cs-btn--sm"
                                                    onClick={(e) => openEdit(snippet, e)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="cs-btn cs-btn--danger cs-btn--sm"
                                                    onClick={(e) => handleDelete(snippet, e)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                            {viewFormatError && expandedId === snippet.id && (
                                                <p className="cs-format-error" role="alert">{viewFormatError}</p>
                                            )}
                                            <div className="cs-code-block-wrap">
                                                <div className="cs-code-block-header">Code</div>
                                                <pre className="cs-code-block">{snippet.code}</pre>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
