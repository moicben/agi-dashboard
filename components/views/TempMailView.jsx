import { useCallback, useEffect, useMemo, useState } from 'react';
import ViewShell from '../ViewShell.jsx';
import {
    createTempMailInbox,
    deleteTempMailInbox,
    fetchTempMailState,
    markTempMailRead,
    refreshTempMailAll,
    refreshTempMailInbox
} from '../../lib/api.js';

function RefreshIcon({ className = '' } = {}) {
    return (
        <svg
            className={className}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d="M20 6v6h-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M20 12a8 8 0 1 1-2.35-5.65"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

function TrashIcon({ className = '' } = {}) {
    return (
        <svg
            className={className}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d="M4 7h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            <path
                d="M10 11v6M14 11v6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            <path
                d="M6 7l1 14h10l1-14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <path
                d="M9 7V4h6v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function fmtDateTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('fr-FR');
}

function extractPlainText(htmlContent) {
    if (!htmlContent) return '';
    return String(htmlContent)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function createEmailPreview(content, maxLength = 120) {
    if (!content) return '(Aucun contenu)';
    const str = String(content);
    const plain = str.includes('<') ? extractPlainText(str) : str;
    if (!plain) return '(Contenu HTML)';
    return plain.length > maxLength ? `${plain.slice(0, maxLength - 1)}…` : plain;
}

function isHtmlContent(content) {
    if (!content || typeof content !== 'string') return false;
    return /<\/?[a-z][\s\S]*>/i.test(content) || content.includes('&lt;') || content.includes('&gt;');
}

function sanitizeHtml(html) {
    if (!html) return '';
    let s = String(html);
    // Protection basique: on retire les scripts/iframes et handlers inline.
    s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    s = s.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    s = s.replace(/javascript:/gi, '');
    s = s.replace(/on\w+\s*=\s*(['"]).*?\1/gi, '');
    s = s.replace(/on\w+\s*=\s*[^\s>]+/gi, '');
    return s;
}

export default function TempMailView() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [inboxes, setInboxes] = useState([]);
    const [emails, setEmails] = useState([]);

    const [selectedInboxId, setSelectedInboxId] = useState('');
    const [selectedEmailId, setSelectedEmailId] = useState('');

    const [createInput, setCreateInput] = useState('');
    const [creating, setCreating] = useState(false);
    const [refreshingAll, setRefreshingAll] = useState(false);
    const [refreshingInboxId, setRefreshingInboxId] = useState('');
    const [deletingInboxId, setDeletingInboxId] = useState('');

    const [emailViewMode, setEmailViewMode] = useState('rendered'); // rendered | source

    const selectedInbox = useMemo(() => {
        if (!selectedInboxId) return null;
        return inboxes.find((i) => String(i?.id) === String(selectedInboxId)) || null;
    }, [inboxes, selectedInboxId]);

    const filteredEmails = useMemo(() => {
        const list = Array.isArray(emails) ? emails : [];
        const inboxId = String(selectedInboxId || '');
        const rows = inboxId ? list.filter((e) => String(e?.inbox_id) === inboxId) : list;
        return rows.slice().sort((a, b) => {
            const da = new Date(a?.received_at || a?.created_at || 0).getTime();
            const db = new Date(b?.received_at || b?.created_at || 0).getTime();
            return db - da;
        });
    }, [emails, selectedInboxId]);

    const selectedEmail = useMemo(() => {
        if (!selectedEmailId) return null;
        return emails.find((e) => String(e?.id) === String(selectedEmailId)) || null;
    }, [emails, selectedEmailId]);

    const unreadCount = useMemo(() => filteredEmails.filter((e) => !e?.is_read).length, [filteredEmails]);

    const layoutMode = useMemo(() => {
        // Clic mail -> retracte "boites" et agrandit "lecture"
        if (selectedEmailId) return 'reading';
        // Clic boite -> cache "lecture" et agrandit "emails"
        if (selectedInboxId) return 'inbox';
        // Etat initial (aucune selection)
        return 'empty';
    }, [selectedEmailId, selectedInboxId]);

    const loadState = useCallback(async () => {
        const data = await fetchTempMailState();
        const nextInboxes = Array.isArray(data?.inboxes) ? data.inboxes : [];
        const nextEmails = Array.isArray(data?.emails) ? data.emails : [];
        setInboxes(nextInboxes);
        setEmails(nextEmails);

        // Maintenir une sélection cohérente.
        setSelectedInboxId((prev) => {
            if (prev && nextInboxes.some((i) => String(i?.id) === String(prev))) return prev;
            return nextInboxes[0]?.id ? String(nextInboxes[0].id) : '';
        });
        setSelectedEmailId((prev) => {
            if (prev && nextEmails.some((e) => String(e?.id) === String(prev))) return prev;
            return '';
        });
    }, []);

    useEffect(() => {
        const boot = async () => {
            setLoading(true);
            setError(null);
            try {
                await loadState();
            } catch (e) {
                setError(e?.message || 'Erreur chargement');
            } finally {
                setLoading(false);
            }
        };
        boot();
    }, [loadState]);

    const onCreateInbox = async (e) => {
        e?.preventDefault?.();
        const input = String(createInput || '').trim();
        if (!input) return;

        setCreating(true);
        setError(null);
        try {
            const inbox = await createTempMailInbox(input);
            setCreateInput('');
            await loadState();
            if (inbox?.id) setSelectedInboxId(String(inbox.id));
        } catch (err) {
            setError(err?.message || 'Erreur creation');
        } finally {
            setCreating(false);
        }
    };

    const onRefreshInbox = async (inboxId) => {
        const id = String(inboxId || '').trim();
        if (!id) return;
        setRefreshingInboxId(id);
        setError(null);
        try {
            await refreshTempMailInbox(id);
            await loadState();
        } catch (err) {
            setError(err?.message || 'Erreur refresh inbox');
        } finally {
            setRefreshingInboxId('');
        }
    };

    const onRefreshAll = async () => {
        setRefreshingAll(true);
        setError(null);
        try {
            await refreshTempMailAll();
            await loadState();
        } catch (err) {
            setError(err?.message || 'Erreur refresh all');
        } finally {
            setRefreshingAll(false);
        }
    };

    const onDeleteInbox = async (inboxId) => {
        const id = String(inboxId || '').trim();
        if (!id) return;
        setDeletingInboxId(id);
        setError(null);
        try {
            await deleteTempMailInbox(id);
            if (String(selectedInboxId) === id) setSelectedInboxId('');
            await loadState();
        } catch (err) {
            setError(err?.message || 'Erreur suppression inbox');
        } finally {
            setDeletingInboxId('');
        }
    };

    const onSelectEmail = async (email) => {
        if (!email?.id) return;
        setSelectedEmailId(String(email.id));
        setEmailViewMode('rendered');

        if (!email?.is_read) {
            // UX: on ne bloque pas la sélection si l'update échoue.
            markTempMailRead(email.id)
                .then(() => loadState())
                .catch(() => {});
        }
    };

    if (loading) {
        return (
            <ViewShell>
                <div className="loading">
                    <div className="spinner" />
                    <p>Chargement…</p>
                </div>
            </ViewShell>
        );
    }

    return (
        <ViewShell>
            <section className={`tempmail-card tempmail-board tempmail-board--${layoutMode}`}>
                <div className="tempmail-board-body">
                    <aside className="tempmail-pane tempmail-pane--inboxes">
                        <div className="tempmail-pane-header">
                            <div className="tempmail-card-title">Boites</div>
                            <div className="tempmail-pane-actions">
                                {layoutMode === 'reading' ? (
                                    <button
                                        type="button"
                                        className="conversions-pagination-btn tempmail-pane-toggle"
                                        onClick={() => setSelectedEmailId('')}
                                        title="Reafficher les boites"
                                    >
                                        Boites
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <div className="tempmail-pane-body">
                            {error ? <div className="tempmail-inline-error">Erreur: {error}</div> : null}

                            <form className="tempmail-create" onSubmit={onCreateInbox}>
                                <input
                                    className="tempmail-input"
                                    value={createInput}
                                    onChange={(e) => setCreateInput(e.target.value)}
                                    placeholder="Email complet (ex: prenom@domaine) ou juste le nom"
                                />
                                <button
                                    type="submit"
                                    className="conversions-pagination-btn"
                                    disabled={creating || !String(createInput || '').trim()}
                                    title="Creer une boite temporaire"
                                >
                                    {creating ? 'Creation…' : 'Creer'}
                                </button>
                            </form>

                            <div className="tempmail-inboxes">
                                {inboxes.length === 0 ? (
                                    <div className="tempmail-empty">Aucune boite. Cree-en une pour commencer.</div>
                                ) : (
                                    inboxes.map((inbox) => {
                                        const id = String(inbox?.id || '');
                                        const active = id && id === String(selectedInboxId);
                                        const inboxEmails = emails.filter((e) => String(e?.inbox_id) === id);
                                        const unread = inboxEmails.filter((e) => !e?.is_read).length;

                                        return (
                                            <div key={id} className={`tempmail-inbox${active ? ' is-active' : ''}`}>
                                                <button
                                                    type="button"
                                                    className="tempmail-inbox-main"
                                                    onClick={() => {
                                                        setSelectedInboxId(id);
                                                        setSelectedEmailId('');
                                                    }}
                                                    title={inbox?.email || inbox?.name || 'Boite'}
                                                >
                                                    <div className="tempmail-inbox-name">
                                                        <span className="tempmail-mono">{inbox?.name || '—'}</span>
                                                        {unread ? (
                                                            <span className="tempmail-badge" title="Non lus">
                                                                {unread}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <div className="tempmail-inbox-email">{inbox?.email || '—'}</div>
                                                </button>

                                                {layoutMode !== 'reading' ? (
                                                    <div className="tempmail-inbox-actions">
                                                        <button
                                                            type="button"
                                                            className="conversions-pagination-btn tempmail-icon-btn"
                                                            disabled={refreshingInboxId === id || refreshingAll || !id}
                                                            onClick={() => onRefreshInbox(id)}
                                                            title="Actualiser cette boite"
                                                            aria-label="Actualiser cette boite"
                                                        >
                                                            {refreshingInboxId === id ? '…' : <RefreshIcon className="tempmail-icon" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="conversions-pagination-btn tempmail-danger tempmail-icon-btn"
                                                            disabled={deletingInboxId === id || refreshingAll || !id}
                                                            onClick={() => onDeleteInbox(id)}
                                                            title="Supprimer cette boite"
                                                            aria-label="Supprimer cette boite"
                                                        >
                                                            {deletingInboxId === id ? '…' : <TrashIcon className="tempmail-icon" />}
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </aside>

                    <section className="tempmail-pane tempmail-pane--emails">
                        <div className="tempmail-pane-header">
                            <div className="tempmail-card-title">
                                Emails{selectedInbox ? ` • ${selectedInbox.name || selectedInbox.email || ''}` : ''}
                            </div>
                            {selectedEmailId ? (
                                <button
                                    type="button"
                                    className="conversions-pagination-btn tempmail-pane-toggle"
                                    onClick={() => setSelectedEmailId('')}
                                    title="Revenir a la liste"
                                >
                                    Liste
                                </button>
                            ) : null}
                        </div>
                        <div className="tempmail-pane-body tempmail-emails">
                            {filteredEmails.length === 0 ? (
                                <div className="tempmail-empty">
                                    {selectedInboxId ? 'Aucun email pour cette boite.' : 'Selectionne une boite.'}
                                </div>
                            ) : (
                                filteredEmails.map((email) => {
                                    const active = String(email?.id) === String(selectedEmailId);
                                    const unread = !email?.is_read;
                                    const preview = createEmailPreview(email?.content, 120);
                                    const time = fmtDateTime(email?.received_at || email?.created_at);

                                    return (
                                        <button
                                            key={String(email?.id || '')}
                                            type="button"
                                            className={[
                                                'tempmail-email',
                                                active ? 'is-active' : '',
                                                unread ? 'is-unread' : ''
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            onClick={() => onSelectEmail(email)}
                                            title={email?.subject || '(Aucun sujet)'}
                                        >
                                            <div className="tempmail-email-row">
                                                <div className="tempmail-email-from">{email?.from_email || '—'}</div>
                                                <div className="tempmail-email-time">{time}</div>
                                            </div>
                                            <div className="tempmail-email-subject">
                                                {email?.subject || '(Aucun sujet)'}
                                            </div>
                                            <div className="tempmail-email-preview">{preview}</div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    <section className="tempmail-pane tempmail-pane--reader">
                        <div className="tempmail-pane-header">
                            <div className="tempmail-card-title">Lecture</div>
                            {selectedEmail && isHtmlContent(selectedEmail?.content) ? (
                                <div className="tempmail-detail-actions">
                                    <button
                                        type="button"
                                        className={`conversions-pagination-btn${emailViewMode === 'rendered' ? ' is-active' : ''}`}
                                        onClick={() => setEmailViewMode('rendered')}
                                    >
                                        Rendu
                                    </button>
                                    <button
                                        type="button"
                                        className={`conversions-pagination-btn${emailViewMode === 'source' ? ' is-active' : ''}`}
                                        onClick={() => setEmailViewMode('source')}
                                    >
                                        Source
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        <div className="tempmail-pane-body tempmail-detail">
                            {!selectedEmail ? (
                                <div className="tempmail-empty">Selectionne un email pour le lire.</div>
                            ) : (
                                <>
                                    <div className="tempmail-detail-head">
                                        <div className="tempmail-detail-subject">
                                            {selectedEmail?.subject || '(Aucun sujet)'}
                                        </div>
                                        <div className="tempmail-detail-meta">
                                            <div>
                                                <span className="tempmail-muted">De: </span>
                                                <span className="tempmail-mono">{selectedEmail?.from_email || '—'}</span>
                                            </div>
                                            <div>
                                                <span className="tempmail-muted">A: </span>
                                                <span className="tempmail-mono">{selectedEmail?.to_email || '—'}</span>
                                            </div>
                                            <div>
                                                <span className="tempmail-muted">Date: </span>
                                                <span className="tempmail-mono">
                                                    {fmtDateTime(selectedEmail?.received_at || selectedEmail?.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="tempmail-detail-content">
                                        {isHtmlContent(selectedEmail?.content) && emailViewMode === 'rendered' ? (
                                            <div
                                                className="tempmail-html"
                                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmail?.content || '') }}
                                            />
                                        ) : (
                                            <pre className="tempmail-source">{String(selectedEmail?.content || '')}</pre>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                </div>
            </section>
        </ViewShell>
    );
}

