import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Calendar, TrendingUp } from 'lucide-react';

export default function TopDashboard({ data, filters, reportingMonth }) {
    const metrics = useMemo(() => {
        let hsfCount = 0;
        let fafsaCount = 0;
        let cssCount = 0;
        let appCount = 0;

        let totalSessPct = 0;
        let currentSessPct = 0;
        let totalWebinarPct = 0;
        let activeAfCount = 0;

        if (!data) return null;

        // Apply filters to dashboard
        let filtered = data.filter(row => !row.is_archived);
        if (filters?.assignedHAF?.length > 0) filtered = filtered.filter(row => filters.assignedHAF.includes(row.assigned_haf));

        filtered.forEach(af => {
            activeAfCount += 1;
            totalSessPct += af.overall_session_pct || 0;
            currentSessPct += af.current_session_pct || 0;
            totalWebinarPct += af.overall_webinar_pct || 0;

            if (af.mentorships) {
                af.mentorships.forEach(m => {
                    hsfCount += 1;
                    if (m.milestones?.fafsa === 'Completed') fafsaCount += 1;
                    if (m.milestones?.css === 'Completed') cssCount += 1;
                    if (m.milestones?.collegeApp?.includes('Completed') || m.milestones?.applied > 0) appCount += 1;
                });
            }
        });

        return {
            fafsaRate: hsfCount ? Math.round((fafsaCount / hsfCount) * 100) : 0,
            cssRate: hsfCount ? Math.round((cssCount / hsfCount) * 100) : 0,
            appRate: hsfCount ? Math.round((appCount / hsfCount) * 100) : 0,
            avgSessionRate: activeAfCount ? Math.round(totalSessPct / activeAfCount) : 0,
            avgCurrentSessionRate: activeAfCount ? Math.round(currentSessPct / activeAfCount) : 0,
            avgWebinarRate: activeAfCount ? Math.round(totalWebinarPct / activeAfCount) : 0,
        };
    }, [data, filters]);

    if (!data || data.length === 0) return null;

    const currentMonthLabel = reportingMonth || format(new Date(), "MMMM");

    const MinimalSparkline = ({ percentage }) => (
        <div style={{ height: '8px', width: '100%', background: 'var(--bg-card)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{
                height: '100%',
                width: `${percentage}%`,
                background: percentage >= 75 ? 'var(--success)' : percentage >= 40 ? 'var(--warning)' : 'var(--danger)',
                transition: 'width 0.4s ease'
            }}></div>
        </div>
    );

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '8px' }}>

            <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={12} color="var(--accent-cyan)" />
                        This Month Sessions
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: '800' }}>{metrics.avgCurrentSessionRate}%</span>
                </div>
                <MinimalSparkline percentage={metrics.avgCurrentSessionRate} />
            </div>

            <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        All Sessions
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: '800' }}>{metrics.avgSessionRate}%</span>
                </div>
                <MinimalSparkline percentage={metrics.avgSessionRate} />
            </div>

            <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        All Webinars
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: '800' }}>{metrics.avgWebinarRate}%</span>
                </div>
                <MinimalSparkline percentage={metrics.avgWebinarRate} />
            </div>

            <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TrendingUp size={12} color="var(--accent-gold)" />
                        FAFSA Completion
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-gold)' }}>{metrics.fafsaRate}%</span>
                </div>
                <MinimalSparkline percentage={metrics.fafsaRate} />
            </div>

        </div>
    );
}
