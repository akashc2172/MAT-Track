import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { parseFile, unifyReports } from '../utils/DataMerger';

const UPLOAD_TYPES = [
    {
        id: 'qa',
        title: 'QA & Quality Tags',
        subtitle: 'Formatted Report: Contacts with Mentorships and Mat Relationships',
        subtitle2: 'Copy of Co2026 UCLA QA, FAFSA,CSS,SS'
    },
    {
        id: 'session',
        title: 'Session Summaries',
        subtitle: 'Formatted Report: Mentorships with AF',
        subtitle2: 'UCLA co2026 Session Summary Tracker'
    },
    {
        id: 'afm',
        title: 'AFM Completion',
        subtitle: 'Formatted Report: UCLA co26 AFM Completion'
    },
    {
        id: 'webinar',
        title: 'Webinar Progress',
        subtitle: 'Formatted Report: Learning Assignments (New)',
        subtitle2: 'UCLA co26 Webinars, class progress_AF'
    }
];

export default function UploadZone({ onDataProcessed }) {
    const [files, setFiles] = useState({ qa: null, session: null, afm: null, webinar: null });
    const [status, setStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleFileInput = (e, typeId) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.csv') && !file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
            setErrorMsg(`Invalid file type for ${typeId}. Please use .csv or .xls/.xlsx`);
            return;
        }

        setFiles(prev => ({ ...prev, [typeId]: file }));
        setErrorMsg('');
    };

    const processData = async () => {
        setStatus('processing');
        try {
            let qaData = [];
            let sessionData = [];
            let afmData = [];
            let webinarData = [];

            if (files.qa) qaData = await parseFile(files.qa);
            if (files.session) sessionData = await parseFile(files.session);
            if (files.afm) afmData = await parseFile(files.afm);
            if (files.webinar) webinarData = await parseFile(files.webinar);

            if (!files.qa && !files.session && !files.afm && !files.webinar) {
                throw new Error("Please upload at least one report to continue.");
            }

            const unified = unifyReports(qaData, sessionData, afmData, webinarData);
            setStatus('success');
            setTimeout(() => onDataProcessed(unified), 800);

        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || 'Error processing files.');
            setStatus('error');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '20px'
            }}>
                {UPLOAD_TYPES.map(type => (
                    <div
                        key={type.id}
                        onClick={() => document.getElementById(`file-${type.id}`).click()}
                        style={{
                            background: files[type.id] ? 'rgba(56, 189, 248, 0.1)' : 'var(--bg-card)',
                            border: `1px solid ${files[type.id] ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                            borderRadius: '8px',
                            padding: '24px 20px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {files[type.id] ? (
                            <FileSpreadsheet size={32} color="var(--accent-cyan)" style={{ marginBottom: '12px' }} />
                        ) : (
                            <UploadCloud size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                        )}

                        <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px' }}>
                            {type.title}
                        </h3>
                        <p className="text-muted" style={{ fontSize: '11px', lineHeight: '1.4', marginBottom: '4px' }}>
                            {type.subtitle}
                        </p>
                        {type.subtitle2 && (
                            <p className="text-muted" style={{ fontSize: '11px', lineHeight: '1.4' }}>
                                {type.subtitle2}
                            </p>
                        )}

                        {files[type.id] && (
                            <div style={{ marginTop: '16px', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                {files[type.id].name}
                            </div>
                        )}

                        <input
                            id={`file-${type.id}`}
                            type="file"
                            accept=".csv,.xls,.xlsx"
                            style={{ display: 'none' }}
                            onChange={(e) => handleFileInput(e, type.id)}
                        />
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '16px' }}>
                <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        Select School Context
                    </label>
                    <select
                        style={{
                            width: '100%', padding: '10px', background: 'var(--bg-main)',
                            color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                            borderRadius: '6px', fontSize: '13px'
                        }}
                    >
                        <option value="ucla">UCLA University of California-Los Angeles</option>
                    </select>
                </div>

                <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px' }}
                    onClick={processData}
                    disabled={status === 'processing' || status === 'success'}
                >
                    {status === 'processing' ? 'Processing...' : status === 'success' ? 'Data Unified!' : 'Ingest Data & Enter Dashboard'}
                </button>

                {status === 'error' && (
                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', justifyContent: 'center' }}>
                        <AlertCircle size={16} />
                        <span className="text-sm">{errorMsg}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
