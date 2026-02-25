import React, { useMemo, useState, useEffect } from 'react';
import { EyeOff, ChevronDown, ChevronRight, Activity, Clock, CheckCircle, XCircle, MessageSquare, Copy, Smartphone, Mail } from 'lucide-react';
import { db } from '../utils/db.js';
import { getMentorshipNeedsAttentionItems, getMentorshipScore, getMentorshipColorColor } from '../utils/scoring.js';

const getHeatmapColor = (pct) => {
    if (pct === undefined || pct === null) return 'var(--bg-card)';
    // Red (0) to Green (120) hue
    const hue = Math.min(120, Math.max(0, (pct / 100) * 120));
    return `hsla(${hue}, 80%, 40%, 0.15)`;
};

const getTextColor = (pct) => {
    if (pct === undefined || pct === null) return 'var(--text-muted)';
    if (pct < 30) return 'var(--danger)';
    if (pct > 80) return 'var(--success)';
    return 'var(--warning)';
};

export default function MasterTable({ data, filters, reportingMonth }) {
    const [hiddenAFs, setHiddenAFs] = useState(() => {
        const saved = localStorage.getItem('hiddenAFs');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });

    const [expandedRows, setExpandedRows] = useState(new Set());
    const [quickOutreachOpen, setQuickOutreachOpen] = useState(null); // email string of active quick outreach
    const [selectedStudents, setSelectedStudents] = useState({}); // af.email -> student name

    // Sort logic, default by Urgency Score DESC
    const [sortConfig, setSortConfig] = useState({ key: 'urgency_score', direction: 'desc' });

    useEffect(() => {
        localStorage.setItem('hiddenAFs', JSON.stringify(Array.from(hiddenAFs)));
    }, [hiddenAFs]);

    const toggleHide = (e, email) => {
        e.stopPropagation();
        setHiddenAFs(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const toggleRow = (email) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const toggleStudent = (email, hsfName) => {
        setSelectedStudents(prev => {
            const next = { ...prev };
            if (next[email] === hsfName) delete next[email];
            else next[email] = hsfName;
            return next;
        });
    };

    const handleSort = (key) => {
        setSortConfig(prev => {
            if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            return { key, direction: 'desc' }; // default to desc for metrics
        });
    };

    const processedData = useMemo(() => {
        if (!data) return [];
        let filtered = data.filter(row => !hiddenAFs.has(row.email) && !row.is_archived);

        if (filters.assignedHAF?.length > 0) {
            filtered = filtered.filter(row => filters.assignedHAF.includes(row.assigned_haf));
        }
        if (filters.quality?.length > 0) {
            filtered = filtered.filter(row => filters.quality.includes(row.qa_status));
        }
        if (filters.flags?.length > 0) {
            filtered = filtered.filter(row => {
                return filters.flags.some(flag => {
                    const flags = row.action_flags || [];

                    if (flag === 'missing_session' && row.missing_sessions_count > 0) return true;
                    if (flag === 'missing_past_sessions' && row.missing_past_sessions_count > 0) return true;
                    if (flag === 'not_live_session' && row.not_live_sessions_count > 0) return true;
                    if (flag === 'not_live_past_sessions' && row.not_live_past_sessions_count > 0) return true;
                    if (flag === 'missing_webinar' && row.missing_webinars_count > 0) return true;
                    if (flag === 'missing_past_webinars' && row.missing_past_webinars_count > 0) return true;
                    if (flag === 'missing_fafsa' && row.has_missing_fafsa) return true;
                    if (flag === 'missing_css' && row.has_missing_css) return true;

                    if (flag.startsWith('session_')) {
                        const search = flag.replace('session_', '');
                        if (flags.some(f => f.type === 'session' && f.month === search)) return true;
                    }
                    if (flag.startsWith('not_live_') && flag !== 'not_live_session' && flag !== 'not_live_past_sessions') {
                        const search = flag.replace('not_live_', '');
                        if (flags.some(f => f.type === 'session_not_live' && f.month === search)) return true;
                    }
                    if (flag.startsWith('webinar_')) {
                        const search = flag.replace('webinar_', '');
                        if (flags.some(f => f.type === 'webinar' && f.target === search)) return true;
                    }
                    if (flag.startsWith('afm_')) {
                        const search = flag.replace('afm_', '');
                        if (flags.some(f => f.type === 'afm' && f.target === search)) return true;
                    }

                    if (flag === 'inactive' && row.current_session_pct === 0 && row.current_webinar_pct === 0) return true;
                    return false;
                });
            });
        }

        return filtered.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, hiddenAFs, filters, sortConfig]);

    const getRecommendedAction = (af) => {
        if (af.missing_sessions_count > 0) return `Text reminder for missing session [${reportingMonth}]`;
        if (af.missing_webinars_count > 0) return `Email follow-up for missing webinar [${reportingMonth}]`;
        if (af.missing_past_sessions_count > 0 || af.missing_past_webinars_count > 0) return `Check-in regarding past missing requirements`;
        if (af.has_missing_fafsa || af.has_missing_css) return `Urgent follow-up for milestone documentation`;
        if (String(af.qa_status).toLowerCase().includes('not meeting')) return `QA check-in recommended`;
        return 'No action needed';
    };

    if (!processedData || processedData.length === 0) {
        return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>No AFs match the current filters.</div>;
    }

    const QuickOutreachPanel = ({ af }) => {
        const hasPhone = !!af.mobile;
        const [status, setStatus] = useState('');

        const message = `Hi ${af.preferredName || af.fullName.split(' ')[0]},\n\nYou are currently missing items for ${reportingMonth}.\nPlease submit these as soon as possible!`;

        const handleCopy = async (text, type) => {
            navigator.clipboard.writeText(text);
            setStatus(`Copied ${type}!`);
            try {
                await db.afs.update(af.email, { last_contact_date: new Date().toISOString() });
            } catch (e) { console.error(e); }
            setTimeout(() => setStatus(''), 2000);
        };

        return (
            <div style={{ background: 'var(--bg-card)', borderRadius: '6px', padding: '16px', border: '1px solid var(--accent-cyan)', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h5 style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageSquare size={14} color="var(--accent-cyan)" />
                        Quick Outreach
                    </h5>
                    <button onClick={() => setQuickOutreachOpen(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><XCircle size={14} /></button>
                </div>

                <textarea
                    defaultValue={message}
                    style={{ width: '100%', height: '80px', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', fontSize: '12px', marginBottom: '12px' }}
                />

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => handleCopy(message, 'Message')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '4px 12px' }}>
                        {hasPhone ? <Smartphone size={12} /> : <Mail size={12} />}
                        {hasPhone ? 'Copy Text Message' : 'Copy Email Message'}
                    </button>
                    {hasPhone && <button onClick={() => handleCopy(af.mobile, 'Phone')} className="btn" style={{ fontSize: '11px', padding: '4px 8px' }}>Copy Phone</button>}
                    <button onClick={() => handleCopy(af.email, 'Email')} className="btn" style={{ fontSize: '11px', padding: '4px 8px' }}>Copy Email</button>

                    {status && <span style={{ color: 'var(--success)', fontSize: '11px', fontWeight: 'bold', marginLeft: 'auto' }}>{status}</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="table-container databallr-table" style={{ overflowX: 'hidden' }}>
            <table style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th onClick={() => handleSort('fullName')} style={{ cursor: 'pointer' }}>AF Name</th>
                        <th onClick={() => handleSort('assigned_haf')} style={{ cursor: 'pointer' }}>HAF</th>
                        <th onClick={() => handleSort('qa_status')} style={{ cursor: 'pointer' }}>QA</th>
                        <th onClick={() => handleSort('current_session_pct')} style={{ cursor: 'pointer', textAlign: 'center' }}>This Month Sessions</th>
                        <th onClick={() => handleSort('overall_session_pct')} style={{ cursor: 'pointer', textAlign: 'center' }}>All Sessions</th>
                        <th onClick={() => handleSort('current_webinar_pct')} style={{ cursor: 'pointer', textAlign: 'center' }}>This Month Webinars</th>
                        <th onClick={() => handleSort('overall_webinar_pct')} style={{ cursor: 'pointer', textAlign: 'center' }}>All Webinars</th>
                        <th onClick={() => handleSort('overall_afm_pct')} style={{ cursor: 'pointer', textAlign: 'center' }}>AFM %</th>
                    </tr>
                </thead>
                <tbody>
                    {processedData.map(af => {
                        const isExpanded = expandedRows.has(af.email);
                        const hasHsfs = af.mentorships && af.mentorships.length > 0;
                        const hasStaleData = new Date(af.last_file_update).getTime() < (Date.now() - (48 * 60 * 60 * 1000));

                        return (
                            <React.Fragment key={af.email}>
                                <tr
                                    style={{
                                        cursor: hasHsfs ? 'pointer' : 'default',
                                        background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                                        transition: 'background 0.2s',
                                        opacity: af.last_contact_date ? 0.4 : 1
                                    }}
                                    onClick={() => hasHsfs && toggleRow(af.email)}
                                >
                                    <td>
                                        <div className="stack-cell">
                                            <span className="stack-main" style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button onClick={(e) => toggleHide(e, af.email)} className="btn" style={{ padding: '0', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center' }} title="Hide/Archive">
                                                    <XCircle size={14} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                                                </button>
                                                {hasHsfs && (isExpanded ? <ChevronDown size={14} color="var(--accent-cyan)" /> : <ChevronRight size={14} color="var(--accent-cyan)" />)}
                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={af.fullName || af.email}>
                                                    {af.fullName || af.email}
                                                </span>
                                                {hasStaleData && <Clock size={12} color="var(--warning)" title="Data older than 48hrs" />}
                                            </span>
                                            <span className="stack-sub" style={{ paddingLeft: '24px' }} title={(af.action_flags || []).map(f => {
                                                if (f.type === 'session') return `Missing Session [${f.month}]`;
                                                if (f.type === 'webinar') return `Missing ${f.target}`;
                                                if (f.type === 'afm') return `Missing ${f.target}`;
                                                if (f.type === 'milestone') return `Missing ${f.target}`;
                                                return '';
                                            }).filter(Boolean).join(' | ')}>
                                                {getRecommendedAction(af)}
                                            </span>
                                        </div>
                                    </td>

                                    <td title={af.assigned_haf || 'Unassigned'}>
                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {af.assigned_haf || 'Unassigned'}
                                        </div>
                                    </td>

                                    <td>
                                        <span style={{
                                            fontSize: '10px',
                                            textTransform: 'uppercase',
                                            fontWeight: '700',
                                            color: String(af.qa_status).includes('Not') || String(af.qa_status).includes('Missing') ? 'var(--danger)' : 'var(--text-primary)'
                                        }}>
                                            {af.qa_status || 'Unknown'}
                                        </span>
                                    </td>

                                    <td title={`${af.monthSessionsTotal} required in [${reportingMonth}]`} style={{ background: getHeatmapColor(af.current_session_pct), textAlign: 'center', fontWeight: '800', color: getTextColor(af.current_session_pct) }}>
                                        {af.current_session_pct != null ? `${Math.round(af.current_session_pct)}%` : '-'}
                                    </td>

                                    <td title={`All expected sessions`} style={{ background: getHeatmapColor(af.overall_session_pct), textAlign: 'center', fontWeight: '800', color: getTextColor(af.overall_session_pct) }}>
                                        {af.overall_session_pct != null ? `${Math.round(af.overall_session_pct)}%` : '-'}
                                    </td>

                                    <td title={`${af.monthWebinarsTotal} required in [${reportingMonth}]`} style={{ background: getHeatmapColor(af.current_webinar_pct), textAlign: 'center', fontWeight: '800', color: getTextColor(af.current_webinar_pct) }}>
                                        {af.current_webinar_pct != null ? `${Math.round(af.current_webinar_pct)}%` : '-'}
                                    </td>

                                    <td title="All expected webinars" style={{ background: getHeatmapColor(af.overall_webinar_pct), textAlign: 'center', fontWeight: '800', color: getTextColor(af.overall_webinar_pct) }}>
                                        {af.overall_webinar_pct != null ? `${Math.round(af.overall_webinar_pct)}%` : '-'}
                                    </td>

                                    <td title={`Completed AFMs`} style={{ background: getHeatmapColor(af.overall_afm_pct), textAlign: 'center', fontWeight: '800', color: getTextColor(af.overall_afm_pct) }}>
                                        {af.overall_afm_pct != null ? `${Math.round(af.overall_afm_pct)}%` : '-'}
                                    </td>
                                </tr>

                                {/* Stratified Expansion Row */}
                                {isExpanded && hasHsfs && (
                                    <tr style={{ background: 'var(--bg-main)' }}>
                                        <td colSpan={8} style={{ padding: '0' }}>
                                            <div style={{ padding: '16px 20px 24px 44px', borderLeft: '2px solid var(--accent-cyan)', background: 'rgba(0,0,0,0.1)' }}>

                                                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: '800' }}>Assigned Students ({af.mentorships.length})</h4>

                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                                                    {af.mentorships.map(m => {
                                                        const score = getMentorshipScore(af, m, reportingMonth);
                                                        const borderColor = getMentorshipColorColor(score);

                                                        const isSelected = selectedStudents[af.email] === m.hsfName;

                                                        return (
                                                            <div
                                                                key={m.mentorshipId}
                                                                onClick={() => toggleStudent(af.email, m.hsfName)}
                                                                style={{
                                                                    background: isSelected ? 'rgba(255,255,255,0.05)' : 'var(--bg-card)',
                                                                    padding: '10px',
                                                                    borderRadius: '6px',
                                                                    border: `2px solid ${borderColor}`,
                                                                    cursor: 'pointer',
                                                                    opacity: (selectedStudents[af.email] && !isSelected) ? 0.4 : 1,
                                                                    transition: 'all 0.2s ease',
                                                                    boxShadow: isSelected ? `0 0 8px ${borderColor}40` : 'none'
                                                                }}
                                                            >
                                                                <div style={{ fontWeight: '700', fontSize: '11px', color: 'var(--text-primary)', marginBottom: '4px' }}>{m.hsfName}</div>
                                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                                                                    {m.milestones?.fafsa && <span>FAFSA: {m.milestones.fafsa}</span>}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {Object.keys(af.webinars || {}).length > 0 && (
                                                    <>
                                                        <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: '800' }}>Webinar Progress</h4>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                                                            {Object.entries(af.webinars).map(([webinarName, status]) => {
                                                                const isCompleted = status && !String(status).toLowerCase().includes('missing') && !String(status).toLowerCase().includes('not completed') && !String(status).toLowerCase().includes('not started') && String(status).toLowerCase() !== 'no' && String(status).toLowerCase() !== 'n/a';
                                                                const isExcused = String(status).toLowerCase().includes('excused') || String(status).toLowerCase() === 'n/a';

                                                                let color = 'var(--danger)'; // Red for missing
                                                                if (isCompleted) color = 'var(--success)'; // Green for done
                                                                else if (isExcused) color = 'var(--text-muted)'; // Grey for excused

                                                                return (
                                                                    <div key={webinarName} style={{ background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '16px', border: `1px solid ${color}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></div>
                                                                        <span style={{ fontSize: '10px', color: 'var(--text-primary)', fontWeight: '600' }}>{webinarName.replace(' Webinar', '')}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </>
                                                )}

                                                <div style={{ background: 'var(--bg-card)', borderRadius: '6px', padding: '12px', border: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--warning)' }}>Needs Attention:</span>
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                            {(af.action_flags || []).length > 0 ? (af.action_flags || []).filter(flagObj => {
                                                                const selStudent = selectedStudents[af.email];
                                                                if (!selStudent) return true;

                                                                if (flagObj.category === 'sessions' && flagObj.target === selStudent) return true;
                                                                if (flagObj.category === 'action_items' && flagObj.type === 'milestone' && (flagObj.hsfNames || []).includes(selStudent)) return true;
                                                                // If a student is selected, hide the global AF-level tags so Need Attention only shows student items
                                                                return false;
                                                            }).flatMap((flagObj, idx) => {
                                                                if (!flagObj || typeof flagObj !== 'object') return [];

                                                                if (flagObj.type === 'milestone') {
                                                                    const selStudent = selectedStudents[af.email];
                                                                    const studentsToRender = selStudent && (flagObj.hsfNames || []).includes(selStudent)
                                                                        ? [selStudent]
                                                                        : (flagObj.hsfNames || ['Unknown']);

                                                                    return studentsToRender.map((studentName, s_idx) => (
                                                                        <span key={`${idx}-${s_idx}`} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                                                                            {`Missing ${flagObj.target} (${studentName})`}
                                                                        </span>
                                                                    ));
                                                                }

                                                                let displayFlag = '';
                                                                let isDanger = true;

                                                                if (flagObj.type === 'session') {
                                                                    displayFlag = `Missing Session: ${flagObj.month} (${flagObj.target})`;
                                                                    isDanger = flagObj.month !== reportingMonth;
                                                                } else if (flagObj.type === 'session_not_live') {
                                                                    displayFlag = `Not Live: ${flagObj.month} (${flagObj.target})`;
                                                                    isDanger = false;
                                                                } else if (flagObj.type === 'webinar') {
                                                                    displayFlag = `Missing Webinar: ${flagObj.target}`;
                                                                    isDanger = !flagObj.target.toLowerCase().includes(reportingMonth.toLowerCase());
                                                                } else if (flagObj.type === 'afm') {
                                                                    displayFlag = `Missing AFM: ${flagObj.target}`;
                                                                    isDanger = true;
                                                                } else if (flagObj.type === 'qa') {
                                                                    displayFlag = 'Low QA';
                                                                    isDanger = false;
                                                                }

                                                                return [
                                                                    <span key={idx} style={{ background: isDanger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: isDanger ? 'var(--danger)' : 'var(--warning)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                                                                        {displayFlag}
                                                                    </span>
                                                                ];
                                                            }) : <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>None - On track!</span>}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setQuickOutreachOpen(quickOutreachOpen === af.email ? null : af.email)}
                                                        className="btn btn-primary"
                                                        style={{ padding: '4px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        <MessageSquare size={12} />
                                                        Quick Outreach
                                                    </button>
                                                </div>

                                                {quickOutreachOpen === af.email && <QuickOutreachPanel af={af} />}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
            {hiddenAFs.size > 0 && (
                <div style={{ padding: '12px 16px', background: 'var(--bg-main)', borderTop: '1px solid var(--border-color)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="text-muted">Hidden: {hiddenAFs.size} AFs</span>
                    <button className="btn" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => setHiddenAFs(new Set())}>
                        Unhide All
                    </button>
                </div>
            )}
        </div>
    );
}
