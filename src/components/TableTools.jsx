import React, { useState, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, LineChart, Line, Legend } from 'recharts';
import { BarChart2, Activity, X } from 'lucide-react';

export default function TableTools({ filteredData }) {
    const [activeTool, setActiveTool] = useState(null); // 'scatter', 'trend', null

    // Utility to convert QA to a number for charting
    const getQAScore = (qa) => {
        switch ((qa || '').toLowerCase()) {
            case 'exceeding expectations': return 3;
            case 'working towards expectations': return 2;
            case 'needs improvement': return 1;
            case 'not meeting expectations': return 0;
            default: return null;
        }
    };

    // Process data for Scatter Plot (X: # of HSFs, Y: QA Score)
    const scatterData = useMemo(() => {
        if (activeTool !== 'scatter') return [];
        return filteredData.map(af => ({
            name: af.preferredName || af.fullName.split(' ')[0],
            hsfs: af.hsfs.length,
            qaScore: getQAScore(af.qualityAssessment)
        })).filter(d => d.qaScore !== null);
    }, [filteredData, activeTool]);


    // Process data for Trend Line (Tracking "Completed" session rates over time)
    // Assuming September -> February
    const trendData = useMemo(() => {
        if (activeTool !== 'trend') return [];
        const months = ['sepStatus', 'octStatus', 'novStatus', 'decStatus', 'janStatus', 'febStatus'];
        const monthLabels = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];

        // We'll graph the top 5 selected/filtered AFs to avoid a messy chart
        const targetAFs = filteredData.slice(0, 5);

        return monthLabels.map((lbl, i) => {
            const dataPoint = { name: lbl };
            const mKey = months[i];

            targetAFs.forEach(af => {
                // Average completion rate of their HSFs for this month
                if (af.hsfs.length === 0) {
                    dataPoint[af.preferredName || af.fullName] = 0;
                    return;
                }
                const completed = af.hsfs.filter(h => h[mKey] && h[mKey].toLowerCase().includes('completed')).length;
                dataPoint[af.preferredName || af.fullName] = (completed / af.hsfs.length) * 100;
            });
            return dataPoint;
        });

    }, [filteredData, activeTool]);


    const renderToolCanvas = () => {
        if (!activeTool) return null;

        return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', marginBottom: '24px', position: 'relative' }}>
                <button
                    onClick={() => setActiveTool(null)}
                    style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                    <X size={20} />
                </button>

                <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '24px', color: 'var(--accent-gold)' }}>
                    {activeTool === 'scatter' ? 'AF Bandwidth vs Quality Matrix' : 'Session Completion Trends (Top 5 visible AFs)'}
                </h3>

                <div style={{ width: '100%', height: '300px' }}>
                    {activeTool === 'scatter' && (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" />
                                <XAxis type="number" dataKey="hsfs" name="Number of HSFs" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
                                <YAxis type="number" dataKey="qaScore" name="QA Score" domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v) => {
                                    if (v === 3) return 'Exceeding'; if (v === 2) return 'Working Towards'; if (v === 1) return 'Needs Impr.'; if (v === 0) return 'Not Meeting'; return '';
                                }} stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={120} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                                <Scatter name="AFs" data={scatterData} fill="var(--accent-cyan)">
                                    <LabelList dataKey="name" position="top" fill="var(--text-primary)" fontSize={11} />
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    )}

                    {activeTool === 'trend' && (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
                                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} domain={[0, 100]} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                                <Legend />
                                {filteredData.slice(0, 5).map((af, i) => {
                                    const colors = ['#38BDF8', '#FFCD57', '#10B981', '#F59E0B', '#EF4444'];
                                    return (
                                        <Line key={i} type="monotone" dataKey={af.preferredName || af.fullName} stroke={colors[i % 5]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    );
                                })}
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 
        This acts like the thin strip of tools above the table in Databallr. 
        Instead of modifying the table directly, clicking one opens the canvas above it.
      */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: '8px' }}>
                    Visualizations
                </span>
                <button
                    className="btn"
                    onClick={() => setActiveTool(activeTool === 'scatter' ? null : 'scatter')}
                    style={{ background: activeTool === 'scatter' ? 'var(--bg-hover)' : 'var(--bg-main)' }}
                >
                    <Activity size={16} color="var(--accent-gold)" /> QA vs Bandwidth Scatter
                </button>
                <button
                    className="btn"
                    onClick={() => setActiveTool(activeTool === 'trend' ? null : 'trend')}
                    style={{ background: activeTool === 'trend' ? 'var(--bg-hover)' : 'var(--bg-main)' }}
                >
                    <BarChart2 size={16} color="var(--accent-cyan)" /> Session Engagement Trends
                </button>
            </div>

            {renderToolCanvas()}
        </div>
    );
}
