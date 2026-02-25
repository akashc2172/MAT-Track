import React from 'react';

export default function FilterBar({ data, filters, setFilters, reportingMonth }) {
    if (!data) return null;

    const uniqueHAFs = Array.from(new Set(data.map(d => d.assigned_haf))).filter(Boolean).sort();
    const uniqueQA = Array.from(new Set(data.map(d => d.qa_status))).filter(Boolean).sort();

    const toggleFilter = (category, value) => {
        setFilters(prev => {
            const current = prev[category] || [];
            const updated = current.includes(value)
                ? current.filter(item => item !== value)
                : [...current, value];
            return { ...prev, [category]: updated };
        });
    };

    const Pill = ({ category, value, label, colorClass = '' }) => {
        const isActive = (filters[category] || []).includes(value);
        return (
            <button
                onClick={() => toggleFilter(category, value)}
                style={{
                    background: isActive ? (colorClass || 'var(--bg-hover)') : 'transparent',
                    border: `1px solid ${isActive ? (colorClass || 'var(--text-muted)') : 'var(--border-color)'}`,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: isActive ? '700' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                    whiteSpace: 'nowrap'
                }}
            >
                {label || value}
            </button>
        );
    };

    return (
        <>
            <div className="card" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', marginBottom: '8px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '800' }}>HAF</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {uniqueHAFs.map(haf => (
                            <Pill key={haf} category="assignedHAF" value={haf} />
                        ))}
                    </div>
                </div>

                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '800' }}>QA Rating</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {uniqueQA.map(qa => (
                            <Pill key={qa} category="quality" value={qa} />
                        ))}
                    </div>
                </div>

            </div>

            <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* 1. Session Summaries */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--warning)', fontWeight: '800', width: '120px' }}>Session Summaries</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <Pill category="flags" value="missing_session" label={`Missing Sessions [${reportingMonth}]`} colorClass="var(--warning)" />
                            <Pill category="flags" value="missing_past_sessions" label="Missing Past Sessions" colorClass="var(--danger)" />
                            <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 8px', opacity: 0.5 }}></div>
                            {Array.from(new Set(data.flatMap(d => (d.action_flags || []).filter(f => f.category === 'sessions').map(f => f.month)))).sort((a, b) => {
                                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                                return months.indexOf(a) - months.indexOf(b);
                            }).map(month => (
                                <Pill key={`sess_spec_${month}`} category="flags" value={`session_${month}`} label={`Missing Sessions [${month}]`} colorClass="var(--danger)" />
                            ))}
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.5 }}></div>

                    {/* 2. Webinars */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--warning)', fontWeight: '800', width: '120px' }}>Webinars</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <Pill category="flags" value="missing_webinar" label={`Missing Webinars [${reportingMonth}]`} colorClass="var(--warning)" />
                            <Pill category="flags" value="missing_past_webinars" label="Missing Past Webinars" colorClass="var(--danger)" />
                            <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 8px', opacity: 0.5 }}></div>
                            {Array.from(new Set(data.flatMap(d => (d.action_flags || []).filter(f => f.category === 'webinars').map(f => f.target)))).map(webinar => (
                                <Pill key={`web_spec_${webinar}`} category="flags" value={`webinar_${webinar}`} label={`Missing ${webinar}`} colorClass="var(--danger)" />
                            ))}
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.5 }}></div>

                    {/* 3. Action Items */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--warning)', fontWeight: '800', width: '120px' }}>Action Items</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <Pill category="flags" value="missing_fafsa" label="Missing FAFSA" colorClass="var(--danger)" />
                            <Pill category="flags" value="missing_css" label="Missing CSS Profile" colorClass="var(--danger)" />
                            <Pill category="flags" value="missing_college_app" label="Missing College Applications" colorClass="var(--danger)" />
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.5 }}></div>

                    {/* 4. AFM / Other */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--warning)', fontWeight: '800', width: '120px' }}>AFM / Other</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {Array.from(new Set(data.flatMap(d => (d.action_flags || []).filter(f => f.category === 'afm_other').map(f => f.target)))).map(afm => (
                                <Pill key={`afm_spec_${afm}`} category="flags" value={`afm_${afm}`} label={`Missing ${afm}`} colorClass="var(--danger)" />
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ alignSelf: 'flex-end', marginTop: '-40px' }}>
                    <button
                        className="btn btn-primary"
                        onClick={() => setFilters({ assignedHAF: [], quality: [], flags: ['missing_session', 'missing_webinar'] })}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px', background: 'var(--accent-cyan)', color: '#000', fontWeight: 'bold' }}
                    >
                        Daily Routine Preset
                    </button>
                </div>
            </div>

            {/* Filter Summary Strip */}
            {(filters.assignedHAF?.length > 0 || filters.quality?.length > 0 || filters.flags?.length > 0) && (
                <div style={{ padding: '8px 16px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '16px', fontWeight: '600' }}>
                    <span style={{ color: 'var(--text-primary)' }}>Active Views:</span>
                    {filters.assignedHAF?.length > 0 && <span>HAFs: {filters.assignedHAF.join(', ')}</span>}
                    {filters.quality?.length > 0 && <span>QA: {filters.quality.join(', ')}</span>}
                    {filters.flags?.length > 0 && <span>Attention: {filters.flags.map(f => {
                        if (f.startsWith('webinar_')) return `Missing ${f.replace('webinar_', '')}`;
                        if (f.startsWith('afm_')) return `Missing ${f.replace('afm_', '')}`;
                        if (f.startsWith('session_')) return `Missing ${f.replace('session_', '')} Session`;
                        if (f === 'missing_college_app') return 'Missing College App';
                        return f.replace(/_/g, ' ');
                    }).join(', ')}</span>}

                    <button
                        onClick={() => setFilters({ assignedHAF: [], quality: [], flags: [] })}
                        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                        Clear All
                    </button>
                </div>
            )}
        </>
    );
}
