import React, { useMemo, useState } from 'react';
import { EyeOff, ChevronDown, ChevronRight, Activity, Clock, CheckCircle } from 'lucide-react';
import { getMentorshipScore, getMentorshipColorColor } from '../utils/scoring.js';

const getHeatmapColor = (pct) => {
    if (pct === undefined || pct === null) return 'var(--bg-card)';
    if (pct >= 85) return 'var(--success)';
    if (pct >= 60) return 'var(--warning)';
    return 'var(--danger)';
};

// Extracted from MasterTable metrics component
const StatCell = ({ value, label, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: '15px', fontWeight: '800', color: color || 'var(--text-primary)' }}>{value}</span>
        <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>{label}</span>
    </div>
);

export default function MentorshipScoresTab({ data, filters, reportingMonth }) {
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [selectedStudents, setSelectedStudents] = useState({});
    const [sortConfig, setSortConfig] = useState({ key: 'urgency_score', direction: 'desc' });

    const handleSort = (key) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            let defaultDir = 'desc';
            if (key === 'fullName') defaultDir = 'asc';
            return { key, direction: defaultDir };
        });
    };

    // Color filters
    const [activeColors, setActiveColors] = useState({
        red: false,
        yellow: false,
        green: false
    });

    const isAnyColorFilterActive = activeColors.red || activeColors.yellow || activeColors.green;

    const toggleColor = (color) => {
        setActiveColors(prev => ({ ...prev, [color]: !prev[color] }));
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

    const processedData = useMemo(() => {
        if (!data) return [];
        let filtered = data.filter(row => !row.is_archived);

        // Apply standard HAF/QA filters
        if (filters?.assignedHAF?.length > 0) {
            filtered = filtered.filter(row => filters.assignedHAF.includes(row.assigned_haf));
        }
        if (filters?.quality?.length > 0) {
            filtered = filtered.filter(row => filters.quality.includes(row.qa_status));
        }

        // Apply Color Score Filter Logic
        if (isAnyColorFilterActive) {
            filtered = filtered.filter(row => {
                if (!row.mentorships || row.mentorships.length === 0) return false;

                return row.mentorships.some(m => {
                    const score = getMentorshipScore(row, m, reportingMonth);
                    if (activeColors.red && score <= -5) return true;
                    if (activeColors.yellow && score <= -2 && score > -5) return true;
                    if (activeColors.green && score > -2) return true;
                    return false;
                });
            });
        }

        // Apply Flag Filters
        if (filters?.flags?.length > 0) {
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
                    if (flag === 'missing_college_app' && row.has_missing_college_app) return true;

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

        // Apply Sorting
        return filtered.sort((a, b) => {
            let valA, valB;
            switch (sortConfig.key) {
                case 'fullName':
                    valA = a.fullName || a.email || '';
                    valB = b.fullName || b.email || '';
                    return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'students':
                    valA = a.mentorships?.length || 0;
                    valB = b.mentorships?.length || 0;
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                case 'flags':
                    valA = (a.action_flags || []).length;
                    valB = (b.action_flags || []).length;
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                case 'urgency_score':
                case 'metrics':
                default:
                    valA = a.urgency_score || 0;
                    valB = b.urgency_score || 0;
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            }
        });
    }, [data, filters, activeColors, reportingMonth, sortConfig]);


    return (
        <div className="card" style={{ overflow: 'hidden' }}>
            {/* Color Filter Bar */}
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--bg-main)' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Score Filters:</span>

                <button
                    onClick={() => toggleColor('green')}
                    style={{
                        background: activeColors.green ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                        border: `1px solid ${activeColors.green ? 'var(--success)' : 'var(--border-color)'}`,
                        color: activeColors.green ? 'var(--success)' : 'var(--text-muted)',
                        padding: '6px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}>
                    Green (0 to -1)
                </button>

                <button
                    onClick={() => toggleColor('yellow')}
                    style={{
                        background: activeColors.yellow ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                        border: `1px solid ${activeColors.yellow ? 'var(--warning)' : 'var(--border-color)'}`,
                        color: activeColors.yellow ? 'var(--warning)' : 'var(--text-muted)',
                        padding: '6px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}>
                    Yellow (-2 to -4)
                </button>

                <button
                    onClick={() => toggleColor('red')}
                    style={{
                        background: activeColors.red ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        border: `1px solid ${activeColors.red ? 'var(--danger)' : 'var(--border-color)'}`,
                        color: activeColors.red ? 'var(--danger)' : 'var(--text-muted)',
                        padding: '6px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}>
                    Red (≤ -5)
                </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-hover)', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                            <th onClick={() => handleSort('fullName')} style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer', borderRight: '1px solid var(--border-color)' }}>
                                Advising Fellow {sortConfig.key === 'fullName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('students')} style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: '600', width: '25%', cursor: 'pointer', borderRight: '1px solid var(--border-color)' }}>
                                Students {sortConfig.key === 'students' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('flags')} style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center', cursor: 'pointer', borderRight: '1px solid var(--border-color)' }}>
                                <div className="tooltip-container">
                                    Flags {sortConfig.key === 'flags' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    <span className="tooltip-text">Number of missing tasks (e.g. Uncompleted Milestones, Missing Sessions) older than 48 hours</span>
                                </div>
                            </th>
                            <th onClick={() => handleSort('metrics')} style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: '600', textAlign: 'center', cursor: 'pointer', borderRight: '1px solid var(--border-color)' }}>
                                <div className="tooltip-container">
                                    Metrics {sortConfig.key === 'metrics' || sortConfig.key === 'urgency_score' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                    <span className="tooltip-text">Combined Urgency Score calculated from overdue timestamps, inactive duration, and QA items</span>
                                </div>
                            </th>
                            <th style={{ padding: '12px 16px', width: '40px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedData.map((af, i) => {
                            const isExpanded = expandedRows.has(af.email);
                            const hasHsfs = af.mentorships && af.mentorships.length > 0;

                            const activeStudents = af.mentorships?.length || 0;
                            const fafsaCompleted = af.mentorships?.filter(m => m.milestones?.fafsa === 'Completed').length || 0;

                            // Determine if row has actions
                            const flagsCount = (af.action_flags || []).length;

                            return (
                                <React.Fragment key={af.email}>
                                    <tr style={{
                                        borderBottom: '1px solid var(--border-color)',
                                        background: isExpanded ? 'var(--bg-hover)' : 'transparent',
                                        transition: 'background 0.2s ease'
                                    }}>
                                        <td style={{ padding: '16px', borderRight: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{af.fullName}</span>
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {af.assigned_haf}
                                                    <span>•</span>
                                                    {af.email}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', borderRight: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', gap: '24px' }}>
                                                <StatCell value={activeStudents} label="Students" />
                                                <StatCell value={`${fafsaCompleted}/${activeStudents}`} label="FAFSA" color="var(--accent-gold)" />
                                                <StatCell value={`${Math.round(af.current_session_pct)}%`} label="Sess" color={getHeatmapColor(af.current_session_pct)} />
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                {flagsCount > 0 ? (
                                                    <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>{flagsCount}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                <div style={{
                                                    background: af.urgency_score >= 10 ? 'rgba(239, 68, 68, 0.1)' : af.urgency_score > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                    color: af.urgency_score >= 10 ? 'var(--danger)' : af.urgency_score > 0 ? 'var(--warning)' : 'var(--success)',
                                                    padding: '4px 12px', borderRadius: '12px', fontWeight: '800', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
                                                }}>
                                                    <Activity size={14} />
                                                    {af.urgency_score}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => toggleRow(af.email)}
                                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                                            >
                                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Expanded Row */}
                                    {isExpanded && hasHsfs && (
                                        <tr style={{ background: 'var(--bg-main)' }}>
                                            <td colSpan={6} style={{ padding: '0' }}>
                                                <div style={{ padding: '16px 20px 24px 44px', borderLeft: '2px solid var(--accent-cyan)', background: 'rgba(0,0,0,0.1)' }}>

                                                    <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: '800' }}>Assigned Students ({af.mentorships.length})</h4>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                                                        {af.mentorships.map(m => {
                                                            const score = getMentorshipScore(af, m, reportingMonth);
                                                            const borderColor = getMentorshipColorColor(score);

                                                            const isSelected = selectedStudents[af.email] === m.hsfName;

                                                            // Determine if it matches current color filters
                                                            let matchesFilter = true;
                                                            if (isAnyColorFilterActive) {
                                                                matchesFilter = false;
                                                                if (activeColors.red && score <= -5) matchesFilter = true;
                                                                if (activeColors.yellow && score <= -2 && score > -5) matchesFilter = true;
                                                                if (activeColors.green && score > -2) matchesFilter = true;
                                                            }

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
                                                                        opacity: matchesFilter ? 1 : 0.3, // Fade out non-matching 
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

                                                    <div style={{ background: 'var(--bg-card)', borderRadius: '6px', padding: '12px', border: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
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
                                                    </div>

                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {processedData.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No advising fellows match the selected filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
