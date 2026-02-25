import React, { useState } from 'react';
import { AlertCircle, CheckCircle, UploadCloud, Users, Hash, Clock, X } from 'lucide-react';

export default function MergeAuditPanel({ stats, onApprove, onDiscard }) {
    // Stats will contain information about the merge process
    // { totalParsed: 450, totalAfs: 25, totalHsfs: 70, unmatchedRows: [], duplicates: [] }

    return (
        <div className="card" style={{ maxWidth: '800px', margin: '40px auto', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <CheckCircle size={28} color="var(--success)" />
                <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Data Quality Audit</h2>
            </div>

            <p className="text-muted" style={{ marginBottom: '32px' }}>
                The ingestion engine has normalized your data. Please review the statistics below before continuing to the Mission Control dashboard.
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '16px',
                marginBottom: '32px'
            }}>
                <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-muted)' }}>
                        <Hash size={16} />
                        <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Rows</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '800' }}>{stats?.totalParsed || 0}</div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-muted)' }}>
                        <Users size={16} />
                        <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>AFs Mastered</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-gold)' }}>{stats?.totalAfs || 0}</div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-muted)' }}>
                        <Users size={16} />
                        <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>HSFs Linked</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-cyan)' }}>{stats?.totalHsfs || 0}</div>
                </div>
            </div>

            {stats?.unmatchedRows?.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} />
                        Needs Review ({stats.unmatchedRows.length} items dropped)
                    </h3>
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', padding: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                        {stats.unmatchedRows.map((row, idx) => (
                            <div key={idx} style={{ fontSize: '12px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span className="text-muted">[{row.source}]</span> Unrecognized identity: <strong style={{ color: 'var(--text-primary)' }}>{row.name || row.email}</strong>
                                <span className="text-muted" style={{ marginLeft: '8px' }}>(Not in Winter 2026 Roster)</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn" onClick={onDiscard} style={{ color: 'var(--text-muted)' }}>
                    Discard Upload
                </button>
                <button className="btn btn-primary" onClick={onApprove}>
                    Proceed to Dashboard
                </button>
            </div>
        </div>
    );
}
