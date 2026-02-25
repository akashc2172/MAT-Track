import React from 'react';

export default function FilterSidebar({ data, filters, setFilters }) {
    const uniqueHAFs = Array.from(new Set(data.map(d => d.assignedHAF))).filter(Boolean).sort();
    const uniqueQA = Array.from(new Set(data.map(d => d.qualityAssessment))).filter(Boolean).sort();

    const handleToggle = (category, value) => {
        setFilters(prev => {
            const currentList = prev[category] || [];
            const isSelected = currentList.includes(value);

            return {
                ...prev,
                [category]: isSelected
                    ? currentList.filter(v => v !== value)
                    : [...currentList, value]
            };
        });
    };

    const PillList = ({ category, options, isBoolean = false }) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {options.map(opt => {
                const val = isBoolean ? opt.id : opt;
                const label = isBoolean ? opt.label : opt;
                const isActive = (filters[category] || []).includes(val);
                return (
                    <button
                        key={val}
                        onClick={() => handleToggle(category, val)}
                        style={{
                            background: isActive ? 'var(--accent-gold)' : 'var(--bg-main)',
                            color: isActive ? 'var(--bg-main)' : 'var(--text-primary)',
                            border: `1px solid ${isActive ? 'var(--accent-gold)' : 'var(--border-color)'}`,
                            padding: '4px 12px',
                            borderRadius: '16px',
                            fontSize: '11px',
                            fontWeight: isActive ? '600' : '400',
                            cursor: 'pointer',
                            transition: 'all 0.1s'
                        }}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );

    const flagOptions = [
        { id: 'missing_session', label: 'Any Missing Session' },
        { id: 'missing_webinar', label: 'Missing a Webinar' },
        { id: 'inactive', label: 'Completely Inactive' }
    ];

    return (
        <aside style={{
            width: '240px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
        }}>
            <div className="card">
                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-cyan)', marginBottom: '12px' }}>
                    Action Required
                </h3>
                <PillList category="flags" options={flagOptions} isBoolean={true} />
            </div>

            <div className="card">
                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Assigned HAF
                </h3>
                <PillList category="assignedHAF" options={uniqueHAFs} />
            </div>

            <div className="card">
                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Quality Assessment
                </h3>
                <PillList category="quality" options={uniqueQA} />
            </div>
        </aside>
    );
}
