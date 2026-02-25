import React, { useState, useRef, useMemo } from 'react';
import { Copy, Download, Calendar, PlusCircle, CheckCircle, Smartphone, Mail, AlertCircle, MessageSquare } from 'lucide-react';
import { db } from '../utils/db.js';

export default function OutreachPanel({ data, filters, reportingMonth }) {
    const [message, setMessage] = useState("Hi {FirstName},\n\nYou are currently missing {MissingSummary}.\n\nPlease submit this as soon as possible!");
    const [scheduledDate, setScheduledDate] = useState("");
    const [recentlyCopied, setRecentlyCopied] = useState(new Set());
    const textareaRef = useRef(null);

    // Apply the same global filters to the Outreach selection
    const filteredData = useMemo(() => {
        if (!data) return [];
        let filtered = data.filter(row => !row.is_archived);

        if (filters.assignedHAF?.length > 0) {
            filtered = filtered.filter(row => filters.assignedHAF.includes(row.assigned_haf));
        }
        if (filters.quality?.length > 0) {
            filtered = filtered.filter(row => filters.quality.includes(row.qa_status));
        }
        if (filters.flags?.length > 0) {
            filtered = filtered.filter(row => {
                return filters.flags.some(flag => {
                    const flagStr = String(flag);
                    if (flagStr === 'missing_session') return (row.action_flags || []).some(f => f.type === 'session' && f.month === reportingMonth);
                    if (flagStr === 'missing_webinar') return (row.action_flags || []).some(f => f.type === 'webinar' && String(f.target).includes(reportingMonth));
                    if (flagStr === 'missing_past_sessions') return row.missing_past_sessions_count > 0;
                    if (flagStr === 'missing_past_webinars') return row.missing_past_webinars_count > 0;
                    if (flagStr === 'missing_fafsa') return row.has_missing_fafsa;
                    if (flagStr === 'missing_css') return row.has_missing_css;
                    if (flagStr === 'missing_college_app') return row.has_missing_college_app;

                    if (flagStr.startsWith('session_')) return (row.action_flags || []).some(f => f.type === 'session' && flagStr === `session_${f.month}`);
                    if (flagStr.startsWith('webinar_')) return (row.action_flags || []).some(f => f.type === 'webinar' && flagStr === `webinar_${f.target}`);
                    if (flagStr.startsWith('afm_')) return (row.action_flags || []).some(f => f.type === 'afm' && flagStr === `afm_${f.target}`);

                    if (flagStr === 'inactive' && row.current_session_pct === 0 && row.current_webinar_pct === 0) return true;
                    return false;
                });
            });
        }
        return filtered;
    }, [data, filters]);

    const selectedCount = filteredData.length;

    const uniqueWebinars = useMemo(() => {
        return Array.from(new Set((data || []).flatMap(d => (d.action_flags || []).filter(f => f.type === 'webinar' && f.target).map(f => String(f.target))))).sort();
    }, [data]);

    const uniqueAFMs = useMemo(() => {
        return Array.from(new Set((data || []).flatMap(d => (d.action_flags || []).filter(f => f.type === 'afm' && f.target).map(f => String(f.target))))).sort();
    }, [data]);

    // Calculate most recent month globally for the current cohort to power {MissingHsfs}
    const monthOrder = ['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'];
    const allMonths = Array.from(new Set(
        (data || []).flatMap(d => (d.mentorships || []).flatMap(m => Object.keys(m.statuses || {})))
    )).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

    const mostRecentMonth = allMonths.length > 0 ? allMonths[allMonths.length - 1] : null;

    // --- Validation Rules ---
    const validationResults = useMemo(() => {
        const results = { passed: 0, failed: 0, skipped: 0, failures: [] };
        if (!filteredData || filteredData.length === 0) return results;

        filteredData.forEach(af => {
            // Check if they even have missing obligations at all
            const hasAnyMissing = (af.action_flags || []).length > 0 || af.has_missing_fafsa || af.has_missing_css || af.has_missing_college_app;
            if (!hasAnyMissing) {
                results.skipped++;
                return; // They are a No-Op, so they don't fail, they just get skipped
            }

            const msg = getReplacedMessage(af);
            const reasons = [];

            if (msg.includes('[No Missing') || msg.includes('[NO MISSING') || msg.includes('[Not Missing')) {
                reasons.push('Contains placeholder for missing obligation');
            }
            if (msg.includes('[USE {MissingSummary} INSTEAD]')) {
                reasons.push('Contains an invalid or legacy token');
            }
            if (msg.match(/\{[^}]+\}/)) {
                reasons.push('Contains unresolved token');
            }
            if (msg.includes('[]')) {
                reasons.push('Contains empty brackets []');
            }

            if (reasons.length > 0) {
                results.failed++;
                if (results.failures.length < 50) {
                    results.failures.push({ email: af.email, name: af.fullName, reasons });
                }
            } else {
                results.passed++;
            }
        });
        return results;
    }, [filteredData, message, reportingMonth]);

    const getBccList = () => {
        if (validationResults.failed > 0) {
            alert("Validation failed for some recipients. Please fix message errors before exporting.");
            return "";
        }
        return filteredData.filter(d => {
            const hasAnyMissing = (d.action_flags || []).length > 0 || d.has_missing_fafsa || d.has_missing_css || d.has_missing_college_app;
            return hasAnyMissing;
        }).map(d => d.email).filter(Boolean).join(', ');
    };

    function getReplacedMessage(af) {
        let msg = message;
        msg = msg.replace(/\{FirstName\}/g, af.preferredName || af.fullName.split(' ')[0] || '');
        msg = msg.replace(/\{FullName\}/g, af.fullName || '');
        msg = msg.replace(/\{HAF\}/g, af.assigned_haf || 'Unassigned');

        if (msg.includes('{MissingSummary}')) {
            const clauses = [];

            // 1. Sessions
            const missingSessions = (af.action_flags || []).filter(f => f.type === 'session').map(f => f.month).reduce((acc, current) => {
                if (!acc.includes(current)) acc.push(current);
                return acc;
            }, []);

            if (missingSessions.length > 0) {
                // Sort chronologically
                missingSessions.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
                const formattedMonths = missingSessions.length > 1
                    ? missingSessions.slice(0, -1).join(', ') + ' and ' + missingSessions[missingSessions.length - 1]
                    : missingSessions[0];
                clauses.push(`your session ${missingSessions.length > 1 ? 'summaries' : 'summary'} for ${formattedMonths}`);
            }

            // 2. Webinars
            const missingWebinars = (af.action_flags || []).filter(f => f.type === 'webinar').map(f => f.target).reduce((acc, current) => {
                if (!acc.includes(current)) acc.push(current);
                return acc;
            }, []);

            if (missingWebinars.length > 0) {
                const uniqueWebs = missingWebinars.map(w => w.replace(' Webinar', ''));
                const formattedWebs = uniqueWebs.length > 1
                    ? uniqueWebs.slice(0, -1).join(', ') + ' and ' + uniqueWebs[uniqueWebs.length - 1]
                    : uniqueWebs[0];
                clauses.push(`the ${formattedWebs} ${missingWebinars.length > 1 ? 'webinars' : 'webinar'}`);
            }

            // 3. Action Items (AFM / Milestones)
            if (af.has_missing_fafsa) clauses.push('your FAFSA');
            if (af.has_missing_css) clauses.push('your CSS Profile');
            if (af.has_missing_college_app) clauses.push('your College Application');

            const missingAFMs = (af.action_flags || []).filter(f => f.type === 'afm').map(f => f.target).reduce((acc, current) => {
                if (!acc.includes(current)) acc.push(current);
                return acc;
            }, []);

            if (missingAFMs.length > 0) {
                clauses.push(...missingAFMs);
            }

            let joinedSummary = '';
            if (clauses.length === 0) {
                joinedSummary = '[NO MISSING OBLIGATIONS]';
            } else if (clauses.length === 1) {
                joinedSummary = clauses[0];
            } else if (clauses.length === 2) {
                joinedSummary = clauses.join(' and ');
            } else {
                joinedSummary = clauses.slice(0, -1).join(', ') + ', and ' + clauses[clauses.length - 1];
            }

            msg = msg.replace(/\{MissingSummary\}/g, joinedSummary);
        }

        // Granular Session Tokens
        if (msg.includes('{MissingSessions_Current}')) {
            const missing = (af.action_flags || []).filter(f => f.type === 'session' && f.month === reportingMonth).map(f => f.month);
            msg = msg.replace(/\{MissingSessions_Current\}/g, missing.length > 0 ? `missing session for ${missing[0]}` : `[No Missing Session for ${reportingMonth}]`);
        }
        if (msg.includes('{MissingSessions_Past}')) {
            const missing = (af.action_flags || []).filter(f => f.type === 'session' && f.month !== reportingMonth).map(f => f.month);
            if (missing.length > 0) {
                missing.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
                const formatted = missing.length > 1 ? missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1] : missing[0];
                msg = msg.replace(/\{MissingSessions_Past\}/g, `missing session ${missing.length > 1 ? 'summaries' : 'summary'} for ${formatted}`);
            } else {
                msg = msg.replace(/\{MissingSessions_Past\}/g, '[No Missing Past Sessions]');
            }
        }

        // Granular Specific Sessions (Jan 2026, etc)
        // Supported fallback for specific months
        const allPossibleMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        allPossibleMonths.forEach(month => {
            const tag = `{Missing_${month}}`;
            if (msg.includes(tag)) {
                const isMissing = (af.action_flags || []).some(f => f.type === 'session' && f.month === month);
                msg = msg.replace(new RegExp(tag, 'g'), isMissing ? `session for ${month}` : `[No Missing ${month} Session]`);
            }
        });

        // Granular Webinar Tokens
        if (msg.includes('{MissingWebinars_Current}')) {
            const missing = (af.action_flags || []).filter(f => f.type === 'webinar' && String(f.target).toLowerCase().includes(reportingMonth.toLowerCase())).map(f => f.target);
            msg = msg.replace(/\{MissingWebinars_Current\}/g, missing.length > 0 ? `missing ${missing.join(', ')}` : `[No Missing Webinars for ${reportingMonth}]`);
        }
        if (msg.includes('{MissingWebinars_Past}')) {
            const missing = (af.action_flags || []).filter(f => f.type === 'webinar' && !String(f.target).toLowerCase().includes(reportingMonth.toLowerCase())).map(f => f.target);
            msg = msg.replace(/\{MissingWebinars_Past\}/g, missing.length > 0 ? `missing ${missing.join(', ')}` : '[No Missing Past Webinars]');
        }

        // Granular Specific Webinar tags
        uniqueWebinars.forEach(webinar => {
            const tag = `{Missing_${webinar.replace(/\s+/g, '')}}`;
            if (msg.includes(tag)) {
                const isMissing = (af.action_flags || []).some(f => f.type === 'webinar' && f.target === webinar);
                msg = msg.replace(new RegExp(tag, 'g'), isMissing ? webinar : `[No Missing ${webinar}]`);
            }
        });

        // Granular AFM tags
        uniqueAFMs.forEach(afm => {
            const tag = `{Missing_${afm.replace(/\s+/g, '')}}`;
            if (msg.includes(tag)) {
                const isMissing = (af.action_flags || []).some(f => f.type === 'afm' && f.target === afm);
                msg = msg.replace(new RegExp(tag, 'g'), isMissing ? afm : `[No Missing ${afm}]`);
            }
        });

        if (msg.includes('{MissingCss}')) {
            msg = msg.replace(/\{MissingCss\}/g, af.has_missing_css ? 'CSS Profile' : '[Not Missing CSS Profile]');
        }
        if (msg.includes('{MissingFafsa}')) {
            msg = msg.replace(/\{MissingFafsa\}/g, af.has_missing_fafsa ? 'FAFSA' : '[Not Missing FAFSA]');
        }
        if (msg.includes('{MissingCollegeApp}')) {
            msg = msg.replace(/\{MissingCollegeApp\}/g, af.has_missing_college_app ? 'College Application' : '[Not Missing College App]');
        }

        // Final cleanup of legacy tags if somehow used
        msg = msg.replace(/\{MissingHsfs\}|\{MissingWebinars\}|\{MissingPastWebinars\}/g, '[USE {MissingSummary} INSTEAD]');

        return msg;
    };

    const getRecommendedAction = (af) => {
        if (af.missing_sessions_count > 0) return `Text reminder for missing session [${reportingMonth}]`;
        if (af.missing_webinars_count > 0) return `Email follow-up for missing webinar [${reportingMonth}]`;
        if (af.missing_past_sessions_count > 0 || af.missing_past_webinars_count > 0) return `Check-in regarding past missing requirements`;
        if (af.has_missing_fafsa || af.has_missing_css) return `Urgent follow-up for milestone documentation`;
        if (String(af.qa_status).toLowerCase().includes('not meeting')) return `QA check-in recommended`;
        return 'No action needed';
    };

    const copyGeneral = (text) => {
        navigator.clipboard.writeText(text);
    };

    const copyToClipboardAndMarkContacted = async (text, email) => {
        navigator.clipboard.writeText(text);

        try {
            await db.afs.update(email, {
                last_contact_date: new Date().toISOString()
            });

            setRecentlyCopied(prev => {
                const updated = new Set(prev);
                updated.add(email);
                return updated;
            });

            setTimeout(() => {
                setRecentlyCopied(prev => {
                    const updated = new Set(prev);
                    updated.delete(email);
                    return updated;
                });
            }, 3000);
        } catch (err) {
            console.error("Could not update last_contact_date", err);
        }
    };

    const exportCSV = () => {
        if (selectedCount === 0 || validationResults.failed > 0) {
            alert("Validation failed. Please fix message errors before exporting.");
            return;
        }

        const validAFs = filteredData.filter(af => {
            return (af.action_flags || []).length > 0 || af.has_missing_fafsa || af.has_missing_css || af.has_missing_college_app;
        });

        const headers = ["Email", "FullName", "PreferredName", "AssignedHAF", "QualityAssessment", "Message"];
        const rows = validAFs.map(af => [
            af.email,
            `"${af.fullName}"`,
            `"${af.preferredName}"`,
            `"${af.assigned_haf}"`,
            `"${af.qa_status}"`,
            `"${getReplacedMessage(af).replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `matriculate_outreach_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const insertVariable = (variable) => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const newText = message.substring(0, start) + variable + message.substring(end);
        setMessage(newText);

        setTimeout(() => {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(start + variable.length, start + variable.length);
        }, 10);
    };

    if (selectedCount === 0) {
        return (
            <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <AlertCircle size={20} color="var(--accent-cyan)" /> No Recipients Selected
                </h3>
                <p className="text-muted">Use the Dashboard Filter Bar to select a specific cohort for outreach, or adjust the Reporting Month.</p>
            </div>
        );
    }

    const VariableBtn = ({ tag, label }) => (
        <button
            onClick={() => insertVariable(tag)}
            style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                color: 'var(--accent-gold)', padding: '4px 8px', borderRadius: '4px',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
            }}
        >
            <PlusCircle size={12} /> {label}
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Step 1 & 2 Container */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>

                {/* Step 1: Choose Who */}
                <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>1</div>
                        <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>Choose Who</h3>
                    </div>
                    <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>{selectedCount} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>AFs Selected</span></div>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Imported from Dashboard active filters:</p>
                        <ul style={{ fontSize: '11px', color: 'var(--accent-gold)', paddingLeft: '16px', margin: '4px 0 0 0' }}>
                            {filters.assignedHAF?.length > 0 && <li>HAFs: {filters.assignedHAF.join(', ')}</li>}
                            {filters.quality?.length > 0 && <li>QA: {filters.quality.join(', ')}</li>}
                            {filters.flags?.length > 0 && <li>Needs Attention: {filters.flags.map(f => f.replace('_', ' ')).join(', ')}</li>}
                            {filters.assignedHAF?.length === 0 && filters.quality?.length === 0 && filters.flags?.length === 0 && <li>No active filters (All Data)</li>}
                        </ul>
                    </div>
                </div>

                {/* Step 2: Choose Message */}
                <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>2</div>
                        <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>Choose Message</h3>
                    </div>

                    <div>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Personalized Message Fields (auto-fills each AF’s missing items)</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-gold)', width: '90px' }}>Smart Default:</span>
                                <VariableBtn tag="{MissingSummary}" label="All Missing Obligations Summary" />
                            </div>

                            <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.5, margin: '2px 0' }}></div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '90px' }}>Identity:</span>
                                <VariableBtn tag="{FirstName}" label="First Name" />
                                <VariableBtn tag="{FullName}" label="Full Name" />
                                <VariableBtn tag="{HAF}" label="Assigned HAF" />
                                <VariableBtn tag="{QA}" label="QA Status" />
                            </div>

                            <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.2, margin: '2px 0' }}></div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '90px' }}>Sessions:</span>
                                <VariableBtn tag="{MissingSessions_Current}" label={`Missing Sessions [${reportingMonth}]`} />
                                <VariableBtn tag="{MissingSessions_Past}" label="Missing Past Sessions" />
                                {Array.from(new Set(data.flatMap(d => (d.action_flags || []).filter(f => f.type === 'session').map(f => f.month)))).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b)).map(month => (
                                    <VariableBtn key={month} tag={`{Missing_${month}}`} label={month} />
                                ))}
                            </div>

                            <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.2, margin: '2px 0' }}></div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '90px' }}>Webinars:</span>
                                <VariableBtn tag="{MissingWebinars_Current}" label={`Missing Webinars [${reportingMonth}]`} />
                                <VariableBtn tag="{MissingWebinars_Past}" label="Missing Past Webinars" />
                                {uniqueWebinars.map(webinar => (
                                    <VariableBtn key={webinar} tag={`{Missing_${webinar.replace(/\s+/g, '')}}`} label={webinar} />
                                ))}
                            </div>

                            <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.2, margin: '2px 0' }}></div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '90px' }}>Action Items:</span>
                                <VariableBtn tag="{MissingFafsa}" label="Missing FAFSA" />
                                <VariableBtn tag="{MissingCss}" label="Missing CSS Profile" />
                                <VariableBtn tag="{MissingCollegeApp}" label="Missing College App" />
                                {uniqueAFMs.map(afm => (
                                    <VariableBtn key={afm} tag={`{Missing_${afm.replace(/\s+/g, '')}}`} label={afm} />
                                ))}
                            </div>
                        </div>
                    </div>

                    <textarea
                        ref={textareaRef}
                        style={{
                            width: '100%', minHeight: '120px', padding: '16px',
                            background: 'var(--bg-main)', color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)', borderRadius: '6px',
                            fontFamily: 'inherit', fontSize: '13px', resize: 'vertical'
                        }}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                    />
                </div>
            </div>

            {/* Step 3 & 4 Container */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 2fr) 1fr', gap: '20px', alignItems: 'start' }}>

                {/* Step 3: Preview outputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>3</div>
                        <h4 style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>Preview & Send ({selectedCount} AFs)</h4>
                    </div>

                    {validationResults.failed > 0 && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '16px', borderRadius: '6px', color: 'var(--text-primary)' }}>
                            <h4 style={{ color: 'var(--danger)', margin: '0 0 8px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={16} /> Validation Failed: Cannot Export</h4>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', marginBottom: '12px' }}>
                                <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Passed: {validationResults.passed}</span>
                                <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>Failed: {validationResults.failed}</span>
                            </div>
                            <ul style={{ fontSize: '11px', margin: 0, paddingLeft: '16px', color: 'var(--text-muted)' }}>
                                {validationResults.failures.slice(0, 5).map(f => (
                                    <li key={f.email}>{f.name} ({f.email}): {f.reasons.join(', ')}</li>
                                ))}
                                {validationResults.failures.length > 5 && <li>...and {validationResults.failures.length - 5} more</li>}
                            </ul>
                        </div>
                    )}

                    {validationResults.failed === 0 && selectedCount > 0 && (
                        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--success)', padding: '12px 16px', borderRadius: '6px', color: 'var(--success)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle size={16} /> All valid recipients passed validation. Ready to export! ({validationResults.passed} passed, {validationResults.skipped} skipped)
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
                        {filteredData.slice(0, 50).map(af => {
                            const isSuccess = recentlyCopied.has(af.email);
                            const hasPhone = !!af.mobile;
                            const msgValidation = validationResults.failures.find(f => f.email === af.email);
                            const hasAnyMissing = (af.action_flags || []).length > 0 || af.has_missing_fafsa || af.has_missing_css || af.has_missing_college_app;

                            let borderColor = 'var(--border-color)';
                            if (!hasAnyMissing) borderColor = 'var(--success)';
                            else if (msgValidation) borderColor = 'var(--danger)';
                            else if (isSuccess) borderColor = 'var(--success)';

                            return (
                                <div key={af.email} className="card" style={{
                                    padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                                    opacity: af.last_contact_date && hasAnyMissing ? 0.6 : 1, transition: 'all 0.3s ease',
                                    borderLeft: `4px solid ${borderColor}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {af.fullName}
                                                <span style={{ fontSize: '10px', background: 'var(--bg-main)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>{af.assigned_haf || 'Unassigned HAF'}</span>
                                                <span style={{ fontSize: '10px', background: String(af.qa_status).includes('Not') ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-main)', color: String(af.qa_status).includes('Not') ? 'var(--danger)' : 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px' }}>QA: {af.qa_status}</span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '12px' }}>
                                                {hasPhone && <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => copyGeneral(af.mobile)} title="Copy Phone"><Smartphone size={10} /> {af.mobile}</span>}
                                                <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => copyGeneral(af.email)} title="Copy Email"><Mail size={10} /> {af.email}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {hasAnyMissing ? (
                                        <>
                                            {/* Grouped Needs Attention Section */}
                                            <div style={{ background: 'var(--bg-card)', borderRadius: '6px', padding: '12px', border: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {/* Session Summaries */}
                                                {(af.missing_sessions_count > 0 || af.missing_past_sessions_count > 0 || (af.action_flags || []).some(f => f.type === 'session')) && (
                                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--warning)', width: '120px' }}>Session Summaries:</span>
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            {af.missing_sessions_count > 0 && <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing Session [{reportingMonth}]</span>}
                                                            {af.missing_past_sessions_count > 0 && <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing Past Sessions</span>}

                                                            {(af.missing_sessions_count > 0 || af.missing_past_sessions_count > 0) && (af.action_flags || []).some(f => f.type === 'session') && (
                                                                <div style={{ width: '1px', height: '12px', background: 'var(--border-color)', margin: '0 4px', opacity: 0.5 }}></div>
                                                            )}

                                                            {Array.from(new Set((af.action_flags || []).filter(f => f.type === 'session').map(f => f.month))).sort((a, b) => {
                                                                const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                                                                return m.indexOf(a) - m.indexOf(b);
                                                            }).map(month => (
                                                                <span key={`af_sess_${month}`} style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing {month}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Webinars */}
                                                {(af.missing_webinars_count > 0 || af.missing_past_webinars_count > 0 || (af.action_flags || []).some(f => f.type === 'webinar')) && (
                                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--warning)', width: '120px' }}>Webinars:</span>
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            {af.missing_webinars_count > 0 && <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing Webinar [{reportingMonth}]</span>}
                                                            {af.missing_past_webinars_count > 0 && <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing Past Webinars</span>}

                                                            {(af.missing_webinars_count > 0 || af.missing_past_webinars_count > 0) && (af.action_flags || []).some(f => f.type === 'webinar') && (
                                                                <div style={{ width: '1px', height: '12px', background: 'var(--border-color)', margin: '0 4px', opacity: 0.5 }}></div>
                                                            )}

                                                            {Array.from(new Set((af.action_flags || []).filter(f => f.type === 'webinar').map(f => f.target))).map(webinar => (
                                                                <span key={`af_web_${webinar}`} style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing {webinar}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Action Items */}
                                                {(af.has_missing_fafsa || af.has_missing_css || af.has_missing_college_app || String(af.qa_status).toLowerCase().includes('not') || (af.action_flags || []).some(f => f.type === 'afm')) && (
                                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--warning)', width: '120px' }}>Action Items / AFM:</span>
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            {af.has_missing_fafsa && <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing FAFSA</span>}
                                                            {af.has_missing_css && <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing CSS Profile</span>}
                                                            {af.has_missing_college_app && <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing College App</span>}
                                                            {String(af.qa_status).toLowerCase().includes('not') && <span style={{ background: 'var(--danger)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Low QA Score</span>}

                                                            {Array.from(new Set((af.action_flags || []).filter(f => f.type === 'afm').map(f => f.target))).map(afm => (
                                                                <span key={`af_afm_${afm}`} style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Missing {afm}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ fontSize: '12px', color: 'var(--text-primary)', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                                                {getReplacedMessage(af)}
                                            </div>

                                            {msgValidation && (
                                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderLeft: '2px solid var(--danger)', padding: '8px 12px', fontSize: '11px', display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px' }}>
                                                    <AlertCircle size={14} style={{ marginTop: '2px' }} />
                                                    <div>
                                                        <strong>Validation Error:</strong><br />
                                                        {msgValidation.reasons.join(', ')}
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <strong>Recommended Action:</strong> {getRecommendedAction(af)}
                                                    {af.last_contact_date && <span style={{ color: 'var(--success)' }}>(Contacted)</span>}
                                                </div>

                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn" onClick={() => copyToClipboardAndMarkContacted(getReplacedMessage(af), af.email)} style={{ fontSize: '11px', padding: '6px 12px' }} disabled={!!msgValidation}>
                                                        <Copy size={12} /> Copy Message
                                                    </button>
                                                    <button
                                                        className={`btn ${isSuccess ? 'success' : 'btn-primary'}`}
                                                        style={{ fontSize: '11px', padding: '6px 12px' }}
                                                        onClick={() => copyToClipboardAndMarkContacted(getReplacedMessage(af), af.email)}
                                                        disabled={!!msgValidation}
                                                    >
                                                        {isSuccess ? <><CheckCircle size={12} /> Logged!</> : <>{hasPhone ? <Smartphone size={12} /> : <Mail size={12} />} {hasPhone ? 'Copy Text Message' : 'Copy Email Message'}</>}
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px dashed var(--success)', borderRadius: '6px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--success)', fontWeight: 'bold' }}>
                                            <CheckCircle size={16} /> Skipped - No Active Obligations
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Step 4: Export Actions */}
                <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>4</div>
                        <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>Bulk Copy / Export</h3>
                    </div>
                    <p className="text-muted" style={{ fontSize: '12px', margin: 0 }}>Export the finalized set list for bulk mailing.</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button className="btn btn-primary" onClick={exportCSV} style={{ justifyContent: 'center' }} disabled={validationResults.failed > 0}>
                            <Download size={16} /> Mail Merge (.csv)
                        </button>
                        <button className="btn" onClick={() => copyGeneral(getBccList())} style={{ justifyContent: 'center' }} disabled={validationResults.failed > 0}>
                            <Copy size={16} /> Copy BCC Field
                        </button>
                        <button className="btn" onClick={() => copyGeneral(message)} style={{ justifyContent: 'center' }}>
                            <Copy size={16} /> Copy Template Body
                        </button>
                    </div>
                </div>
            </div >
        </div >
    );
}
