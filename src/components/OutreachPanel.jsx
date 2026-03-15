import React, { useState, useRef, useMemo } from 'react';
import { Copy, Download, Calendar, PlusCircle, CheckCircle, Smartphone, Mail, AlertCircle, MessageSquare } from 'lucide-react';
import { db } from '../utils/db.js';

export default function OutreachPanel({ data, filters, reportingMonth }) {
    const [message, setMessage] = useState("Hi {FirstName},\n\nYou are currently missing {MissingSummary}.\n\nPlease submit this as soon as possible!");
    const [scheduledDate, setScheduledDate] = useState("");
    const [subject, setSubject] = useState("Missing Requirements Update");
    const [cc, setCc] = useState("");
    const [recentlyCopied, setRecentlyCopied] = useState(new Set());
    const [justCopied, setJustCopied] = useState(null); // format: "type-email"
    const [showExportModal, setShowExportModal] = useState(false);
    const [showHSFNames, setShowHSFNames] = useState(true);
    const [individualHSFOverrides, setIndividualHSFOverrides] = useState({});
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
                    if (flagStr === 'not_live_session') return row.not_live_sessions_count > 0;
                    if (flagStr === 'not_live_past_sessions') return row.not_live_past_sessions_count > 0;
                    if (flagStr === 'missing_past_webinars') return row.missing_past_webinars_count > 0;
                    if (flagStr === 'missing_fafsa') return row.has_missing_fafsa;
                    if (flagStr === 'missing_css') return row.has_missing_css;
                    if (flagStr === 'missing_college_app') return row.has_missing_college_app;

                    if (flagStr.startsWith('session_')) return (row.action_flags || []).some(f => f.type === 'session' && flagStr === `session_${f.month}`);
                    if (flagStr.startsWith('not_live_') && flagStr !== 'not_live_session' && flagStr !== 'not_live_past_sessions') {
                        return (row.action_flags || []).some(f => f.type === 'session_not_live' && flagStr === `not_live_${f.month}`);
                    }
                    if (flagStr.startsWith('webinar_')) return (row.action_flags || []).some(f => f.type === 'webinar' && flagStr === `webinar_${f.target}`);
                    if (flagStr.startsWith('afm_')) return (row.action_flags || []).some(f => f.type === 'afm' && flagStr === `afm_${f.target}`);

                    if (flagStr === 'inactive' && row.current_session_pct === 0 && row.current_webinar_pct === 0) return true;
                    return false;
                });
            });
        }

        // Manual Selection Logic: Only filter down if no flags are active AND manual selection has emails
        if ((filters.flags || []).length === 0 && (filters.manualSelected || []).length > 0) {
            filtered = filtered.filter(row => filters.manualSelected.includes(row.email));
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
    const allMonths = [
        'March 2025', 'April 2025', 'May 2025', 'June 2025', 'July 2025', 'August 2025',
        'September 2025', 'October 2025', 'November 2025', 'December 2025',
        'January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026'
    ];

    const mostRecentMonth = allMonths.length > 0 ? allMonths[allMonths.length - 1] : null;

    const validationResults = useMemo(() => {
        const results = { passed: 0, failed: 0, skipped: 0, failures: [] };
        if (!filteredData || filteredData.length === 0) return results;

        const allSupportedTokens = [
            '{FirstName}', '{FullName}', '{HAF}', '{QA}',
            '{MissingSummary}', '{SessionsOnlySummary}', '{WebinarsOnlySummary}', '{ActionItemsOnlySummary}',
            '{NotLiveSessionsOnlySummary}',
            '{MissingSessions_Current}', '{MissingSessions_Past}',
            '{NotLiveSessions_Current}', '{NotLiveSessions_Past}',
            '{MissingWebinars_Current}', '{MissingWebinars_Past}',
            '{MissingFafsa}', '{MissingCss}', '{MissingCollegeApp}'
        ];

        // Dynamically add supported granular specific tags
        allMonths.forEach(m => allSupportedTokens.push(`{Missing_${m}}`));
        allMonths.forEach(m => allSupportedTokens.push(`{NotLive_${m}}`));
        uniqueWebinars.forEach(w => allSupportedTokens.push(`{Missing_${w.replace(/\s+/g, '')}}`));
        uniqueAFMs.forEach(a => allSupportedTokens.push(`{Missing_${a.replace(/\s+/g, '')}}`));

        filteredData.forEach(af => {
            const msg = getReplacedMessage(af, false); // loose check to see if obligations exist at all
            const strictMsg = getReplacedMessage(af, true); // strict check for the actual text
            const reasons = [];

            // Check if they even have missing obligations matching current filters
            if (msg.includes('[NO MISSING OBLIGATIONS MATCHING FILTERS]')) {
                results.skipped++;
                return;
            }

            if (strictMsg.includes('[No Missing') || strictMsg.includes('[NO MISSING') || strictMsg.includes('[Not Missing')) {
                reasons.push('Contains placeholder for missing obligation');
            }
            if (strictMsg.includes('[USE {MissingSummary} INSTEAD]')) {
                reasons.push('Contains an invalid or legacy token. We recommend using the new {MissingSummary} presets.');
            }

            // Check for literally any typed token that wasn't replaced (meaning it's unsupported)
            const remainingBraces = strictMsg.match(/\{[^}]+\}/g);
            if (remainingBraces && remainingBraces.length > 0) {
                const legacyDetected = remainingBraces.some(t => ['{MissingSessions_Current}', '{MissingWebinars_Current}', '{MissingPastWebinars}', '{MissingHsfs}', '{MissingSessions_Past}'].includes(t));
                if (legacyDetected) {
                    reasons.push(`Contains legacy or unresolved token: ${remainingBraces.join(', ')}. Please use {MissingSummary} or Presets instead.`);
                } else {
                    reasons.push(`Contains unresolved or unsupported token: ${remainingBraces.join(', ')}`);
                }
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
    }, [filteredData, message, reportingMonth, filters]);

    const getBccList = () => {
        if (validationResults.failed > 0) {
            alert("Validation failed for some recipients. Please fix message errors before exporting.");
            return "";
        }
        return filteredData.filter(d => {
            const isMissingStandard = !getReplacedMessage(d, false).includes('[NO MISSING OBLIGATIONS MATCHING FILTERS]');
            const hasNeedsAttention = isMissingStandard || (d.action_flags || []).some(f => f.type === 'session_not_live');
            return hasNeedsAttention;
        }).map(d => d.email).filter(Boolean).join(', ');
    };

    const getPhoneNumbersList = () => {
        return filteredData
            .filter(d => {
                const isMissingStandard = !getReplacedMessage(d, false).includes('[NO MISSING OBLIGATIONS MATCHING FILTERS]');
                const hasNeedsAttention = isMissingStandard || (d.action_flags || []).some(f => f.type === 'session_not_live');
                return hasNeedsAttention;
            })
            .map(d => d.mobile ? String(d.mobile).replace(/\D/g, '') : '')
            .filter(Boolean)
            .join(', ');
    };

    const formatMonthList = (months) => {
        if (!months || months.length === 0) return '';
        const mOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const sorted = [...months].sort((a, b) => {
            const [mA, yA] = a.split(' ');
            const [mB, yB] = b.split(' ');
            if (yA !== yB) return parseInt(yA) - parseInt(yB);
            return mOrder.indexOf(mA) - mOrder.indexOf(mB);
        });
        if (sorted.length === 1) return sorted[0];
        if (sorted.length === 2) return sorted.join(' and ');
        return sorted.slice(0, -1).join(', ') + ', and ' + sorted[sorted.length - 1];
    };

    function formatSessionMonthList(monthMap, showHSF = true) {
        const months = Object.keys(monthMap).sort((a, b) => {
            const mOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const [mA, yA] = a.split(' ');
            const [mB, yB] = b.split(' ');
            if (yA !== yB) return parseInt(yA) - parseInt(yB);
            return mOrder.indexOf(mA) - mOrder.indexOf(mB);
        });
        if (months.length === 0) return '';

        let displayItems = months.map(m => {
            const hsfs = Array.from(monthMap[m] || []).filter(Boolean).sort();
            const hsfStr = (showHSF && hsfs.length > 0) ? ` (${hsfs.join(', ')})` : '';
            return m + hsfStr;
        });

        if (displayItems.length === 1) return displayItems[0];
        if (displayItems.length === 2) return `${displayItems[0]} and ${displayItems[1]}`;
        return displayItems.slice(0, -1).join(', ') + ', and ' + displayItems[displayItems.length - 1];
    }

    function getReplacedMessage(af, strict = true) {
        let msg = message;
        const currentHSFVisibility = individualHSFOverrides[af.email] ?? showHSFNames;

        const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const sortMonths = (a, b) => {
            const [mA, yA] = a.split(' ');
            const [mB, yB] = b.split(' ');
            if (yA && yB && yA !== yB) return parseInt(yA) - parseInt(yB);
            return monthOrder.indexOf(mA) - monthOrder.indexOf(mB);
        };

        if (!strict) {
            msg = '{MissingSummary}';
        }

        msg = msg.replace(/\{FirstName\}/g, af.preferredName || (af.fullName || '').split(' ')[0] || '');
        msg = msg.replace(/\{FullName\}/g, af.fullName || '');
        msg = msg.replace(/\{HAF\}/g, af.assigned_haf || 'Unassigned');
        msg = msg.replace(/\{QA\}/g, af.qa_status || 'Unknown');

        // Identify intersection with Dashboard filters
        const activeFlags = filters.flags || [];
        const isAll = activeFlags.length === 0;

        const buildSummary = (includeSessions, includeWebinars, includeActionItems) => {
            // --- 1. SESSIONS & NOT LIVE ---
            let sessionMap = {};
            let notLiveMap = {};
            if (includeSessions) {
                (af.action_flags || []).forEach(f => {
                    let include = isAll;
                    if (f.type === 'session') {
                        if (!include) {
                            if (activeFlags.includes('missing_session') && f.month === reportingMonth) include = true;
                            if (activeFlags.includes('missing_past_sessions') && f.month !== reportingMonth) include = true;
                            if (activeFlags.includes(`session_${f.month}`)) include = true;
                        }
                        if (include) {
                            if (!sessionMap[f.month]) sessionMap[f.month] = new Set();
                            if (f.target) sessionMap[f.month].add(f.target);
                        }
                    } else if (f.type === 'session_not_live') {
                        if (!include) {
                            if (activeFlags.includes('not_live_session') && f.month === reportingMonth) include = true;
                            if (activeFlags.includes('not_live_past_sessions') && f.month !== reportingMonth) include = true;
                            if (activeFlags.includes(`not_live_${f.month}`)) include = true;
                        }
                        if (include) {
                            if (!notLiveMap[f.month]) notLiveMap[f.month] = new Set();
                            if (f.target) notLiveMap[f.month].add(f.target);
                        }
                    }
                });
            }
            const sortFn = (a, b) => {
                const mOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const [mA, yA] = a.split(' ');
                const [mB, yB] = b.split(' ');
                if (yA !== yB) return parseInt(yA) - parseInt(yB);
                return mOrder.indexOf(mA) - mOrder.indexOf(mB);
            };
            const sessionMonthsArr = Object.keys(sessionMap).sort(sortFn);
            const notLiveMonthsArr = Object.keys(notLiveMap).sort(sortFn);

            // --- 2. WEBINARS ---
            let webinarNames = [];
            if (includeWebinars) {
                (af.action_flags || []).filter(f => f.type === 'webinar').forEach(f => {
                    let include = isAll;
                    if (!include) {
                        if (activeFlags.includes('missing_webinar') && String(f.target).toLowerCase().includes(reportingMonth.toLowerCase())) include = true;
                        if (activeFlags.includes('missing_past_webinars') && !String(f.target).toLowerCase().includes(reportingMonth.toLowerCase())) include = true;
                        if (activeFlags.includes(`webinar_${f.target}`)) include = true;
                    }
                    if (include && !webinarNames.includes(f.target)) webinarNames.push(f.target);
                });
            }

            let friendlyWebinars = [];
            let rawWebinars = [];
            webinarNames.forEach(w => {
                const wLower = String(w).toLowerCase();
                let matchedMonth = null;
                monthOrder.forEach(m => {
                    if (wLower.includes(m.toLowerCase()) && !wLower.includes('cfu')) matchedMonth = m;
                });
                if (matchedMonth && friendlyWebinars.indexOf(matchedMonth) === -1) friendlyWebinars.push(matchedMonth);
                else rawWebinars.push(w);
            });

            let webinarClauses = [];
            if (friendlyWebinars.length > 0) {
                friendlyWebinars.sort(sortMonths);
                webinarClauses.push(`the ${formatMonthList(friendlyWebinars)} ${friendlyWebinars.length > 1 ? 'webinars' : 'webinar'}`);
            }
            rawWebinars.forEach(w => webinarClauses.push(`the ${w} webinar`));

            let webinarJoined = '';
            if (webinarClauses.length === 1) webinarJoined = webinarClauses[0];
            else if (webinarClauses.length === 2) webinarJoined = webinarClauses.join(' and ');
            else if (webinarClauses.length > 2) webinarJoined = webinarClauses.slice(0, -1).join(', ') + ', and ' + webinarClauses[webinarClauses.length - 1];

            // --- 3. ACTION ITEMS ---
            let hsfMap = {};
            if (includeActionItems) {
                (af.action_flags || []).filter(f => f.type === 'milestone').forEach(f => {
                    let include = isAll;
                    if (!include) {
                        if (f.target === 'FAFSA' && activeFlags.includes('missing_fafsa')) include = true;
                        if (f.target === 'CSS Profile' && activeFlags.includes('missing_css')) include = true;
                        if (f.target === 'College Application' && activeFlags.includes('missing_college_app')) include = true;
                    }
                    if (include) {
                        const names = [...(f.hsfNames || [])].sort().join(', ');
                        if (!hsfMap[names]) hsfMap[names] = [];
                        if (!hsfMap[names].includes(f.target)) hsfMap[names].push(f.target);
                    }
                });
            }

            let actionClauses = [];
            Object.keys(hsfMap).forEach(hsfNamesStr => {
                const items = hsfMap[hsfNamesStr];
                const itemStr = items.length === 1 ? items[0] : (items.length === 2 ? items.join(' and ') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]);
                const hsfs = hsfNamesStr ? hsfNamesStr.split(', ') : [];
                let hsfStr = '';
                if (hsfs.length === 1) hsfStr = ` for ${hsfs[0]}`;
                else if (hsfs.length === 2) hsfStr = ` for ${hsfs[0]} and ${hsfs[1]}`;
                else if (hsfs.length >= 3) hsfStr = ` for ${hsfs.length} students`;
                actionClauses.push(`your ${itemStr}${hsfStr}`);
            });

            // --- 4. AFM ---
            let afmItems = [];
            if (includeActionItems) {
                (af.action_flags || []).filter(f => f.type === 'afm').forEach(f => {
                    let include = isAll;
                    if (!include) {
                        if (activeFlags.includes(`afm_${f.target}`)) include = true;
                    }
                    if (include && !afmItems.includes(f.target)) afmItems.push(f.target);
                });
            }

            // --- SUMMARY ASSEMBLY ---
            let finalSummary = '';
            let baseClauses = [];

            if (sessionMonthsArr.length === 1 && notLiveMonthsArr.length === 0 && friendlyWebinars.length === 1 && rawWebinars.length === 0 && sessionMonthsArr[0].split(' ')[0] === friendlyWebinars[0] && actionClauses.length === 0) {
                // Same-month Optimization
                const m = sessionMonthsArr[0]; // e.g. "March 2026"
                const hsfs = Array.from(sessionMap[m] || []).filter(Boolean).sort();
                const hsfStr = (currentHSFVisibility && hsfs.length > 0) ? ` (${hsfs.join(', ')})` : '';
                baseClauses.push(`your ${m}${hsfStr} session summary and webinar`);
            } else {
                const sessionSummaryStr = sessionMonthsArr.length > 0 ? `your ${formatSessionMonthList(sessionMap, currentHSFVisibility)} session ${sessionMonthsArr.length > 1 ? 'summaries' : 'summary'}` : '';
                const notLiveSummaryStr = notLiveMonthsArr.length > 0 ? `your ${formatSessionMonthList(notLiveMap, currentHSFVisibility)} session ${notLiveMonthsArr.length > 1 ? 'summaries' : 'summary'} marked Completed - Not Live` : '';
                if (sessionSummaryStr) baseClauses.push(sessionSummaryStr);
                if (notLiveSummaryStr) baseClauses.push(notLiveSummaryStr);
                if (webinarJoined) baseClauses.push(webinarJoined);
                actionClauses.forEach(ac => baseClauses.push(ac));
            }

            if (baseClauses.length === 0 && afmItems.length === 0) {
                finalSummary = '[NO MISSING OBLIGATIONS MATCHING FILTERS]';
            } else {
                if (baseClauses.length === 1) finalSummary = baseClauses[0];
                else if (baseClauses.length === 2) finalSummary = baseClauses.join(' and ');
                else if (baseClauses.length > 2) finalSummary = baseClauses.slice(0, -1).join(', ') + ', and ' + baseClauses[baseClauses.length - 1];

                if (afmItems.length > 0) {
                    let afmTrimmed = afmItems;
                    let extraStr = '';
                    if (afmItems.length > 2) {
                        afmTrimmed = afmItems.slice(0, 2);
                        extraStr = ` and ${afmItems.length - 2} more AFM/other items`;
                    }
                    let afmStr = afmTrimmed.length === 1 ? afmTrimmed[0] : (afmTrimmed.length === 2 ? afmTrimmed.join(' and ') : afmTrimmed.slice(0, -1).join(', ') + ', and ' + afmTrimmed[afmTrimmed.length - 1]);

                    if (finalSummary) finalSummary += `, and the following AFM/other items: ${afmStr}${extraStr}`;
                    else finalSummary = `the following AFM/other items: ${afmStr}${extraStr}`;
                }
            }
            return finalSummary;
        };

        if (msg.includes('{MissingSummary}')) msg = msg.replace(/\{MissingSummary\}/g, buildSummary(true, true, true));
        if (msg.includes('{SessionsOnlySummary}')) msg = msg.replace(/\{SessionsOnlySummary\}/g, buildSummary(true, false, false));
        if (msg.includes('{WebinarsOnlySummary}')) msg = msg.replace(/\{WebinarsOnlySummary\}/g, buildSummary(false, true, false));
        if (msg.includes('{ActionItemsOnlySummary}')) msg = msg.replace(/\{ActionItemsOnlySummary\}/g, buildSummary(false, false, true));

        // --- NOT LIVE SUMMARY AGGREGATION ---
        if (msg.includes('{NotLiveSessionsOnlySummary}')) {
            const nlMap = {};
            (af.action_flags || []).filter(f => f.type === 'session_not_live').forEach(f => {
                if (!nlMap[f.month]) nlMap[f.month] = new Set();
                if (f.target) nlMap[f.month].add(f.target);
            });
            const nlMonths = Object.keys(nlMap);
            if (nlMonths.length > 0) {
                const monthStr = formatSessionMonthList(nlMap, currentHSFVisibility);
                const suffix = nlMonths.length > 1 ? 'summaries marked Not Live' : 'summary marked Not Live';
                msg = msg.replace(/\{NotLiveSessionsOnlySummary\}/g, `your ${monthStr} session ${suffix}`);
            } else {
                msg = msg.replace(/\{NotLiveSessionsOnlySummary\}/g, '[No Not Live Sessions]');
            }
        }

        // --- GRANULAR FALLBACKS ---
        if (msg.includes('{MissingSessions_Current}')) {
            const missingList = (af.action_flags || []).filter(f => f.type === 'session' && f.month === reportingMonth);
            if (missingList.length > 0) {
                const map = { [reportingMonth]: new Set(missingList.map(f => f.target)) };
                msg = msg.replace(/\{MissingSessions_Current\}/g, `missing session for ${formatSessionMonthList(map, currentHSFVisibility)}`);
            } else {
                msg = msg.replace(/\{MissingSessions_Current\}/g, `[No Missing Session for ${reportingMonth}]`);
            }
        }
        if (msg.includes('{NotLiveSessions_Current}')) {
            const nlList = (af.action_flags || []).filter(f => f.type === 'session_not_live' && f.month === reportingMonth);
            if (nlList.length > 0) {
                const map = { [reportingMonth]: new Set(nlList.map(f => f.target)) };
                msg = msg.replace(/\{NotLiveSessions_Current\}/g, `session summary for ${formatSessionMonthList(map, currentHSFVisibility)} marked Completed - Not Live`);
            } else {
                msg = msg.replace(/\{NotLiveSessions_Current\}/g, `[No Not Live Session for ${reportingMonth}]`);
            }
        }

        if (msg.includes('{MissingSessions_Past}')) {
            const map = {};
            (af.action_flags || []).filter(f => f.type === 'session' && f.month !== reportingMonth).forEach(f => {
                if (!map[f.month]) map[f.month] = new Set();
                if (f.target) map[f.month].add(f.target);
            });
            const monthsArr = Object.keys(map).sort(sortMonths);
            if (monthsArr.length > 0) {
                msg = msg.replace(/\{MissingSessions_Past\}/g, `missing session ${monthsArr.length > 1 ? 'summaries' : 'summary'} for ${formatSessionMonthList(map, currentHSFVisibility)}`);
            } else {
                msg = msg.replace(/\{MissingSessions_Past\}/g, '[No Missing Past Sessions]');
            }
        }
        if (msg.includes('{NotLiveSessions_Past}')) {
            const map = {};
            (af.action_flags || []).filter(f => f.type === 'session_not_live' && f.month !== reportingMonth).forEach(f => {
                if (!map[f.month]) map[f.month] = new Set();
                if (f.target) map[f.month].add(f.target);
            });
            const monthsArr = Object.keys(map).sort(sortMonths);
            if (monthsArr.length > 0) {
                msg = msg.replace(/\{NotLiveSessions_Past\}/g, `session ${monthsArr.length > 1 ? 'summaries' : 'summary'} for ${formatSessionMonthList(map, currentHSFVisibility)} marked Completed - Not Live`);
            } else {
                msg = msg.replace(/\{NotLiveSessions_Past\}/g, '[No Not Live Past Sessions]');
            }
        }

        allMonths.forEach(month => {
            const tag = `{Missing_${month}}`;
            if (msg.includes(tag)) {
                const list = (af.action_flags || []).filter(f => f.type === 'session' && f.month === month);
                if (list.length > 0) {
                    const map = { [month]: new Set(list.map(f => f.target)) };
                    msg = msg.replaceAll(tag, `session for ${formatSessionMonthList(map, currentHSFVisibility)}`);
                } else {
                    msg = msg.replaceAll(tag, `[No Missing ${month} Session]`);
                }
            }

            const nlTag = `{NotLive_${month}}`;
            if (msg.includes(nlTag)) {
                const list = (af.action_flags || []).filter(f => f.type === 'session_not_live' && f.month === month);
                if (list.length > 0) {
                    const map = { [month]: new Set(list.map(f => f.target)) };
                    msg = msg.replaceAll(nlTag, `session for ${formatSessionMonthList(map, currentHSFVisibility)} marked Completed - Not Live`);
                } else {
                    msg = msg.replaceAll(nlTag, `[No Not Live ${month} Session]`);
                }
            }
        });

        if (msg.includes('{MissingWebinars_Current}')) {
            const missing = (af.action_flags || []).filter(f => f.type === 'webinar' && String(f.target).toLowerCase().includes(reportingMonth.toLowerCase())).map(f => f.target);
            msg = msg.replace(/\{MissingWebinars_Current\}/g, missing.length > 0 ? `missing ${missing.join(', ')}` : `[No Missing Webinars for ${reportingMonth}]`);
        }
        if (msg.includes('{MissingWebinars_Past}')) {
            const missing = (af.action_flags || []).filter(f => f.type === 'webinar' && !String(f.target).toLowerCase().includes(reportingMonth.toLowerCase())).map(f => f.target);
            msg = msg.replace(/\{MissingWebinars_Past\}/g, missing.length > 0 ? `missing ${missing.join(', ')}` : '[No Missing Past Webinars]');
        }

        uniqueWebinars.forEach(webinar => {
            const tag = `{Missing_${webinar.replace(/\s+/g, '')}}`;
            if (msg.includes(tag)) {
                const isMissing = (af.action_flags || []).some(f => f.type === 'webinar' && f.target === webinar);
                msg = msg.replaceAll(tag, isMissing ? webinar : `[No Missing ${webinar}]`);
            }
        });

        uniqueAFMs.forEach(afm => {
            const tag = `{Missing_${afm.replace(/\s+/g, '')}}`;
            if (msg.includes(tag)) {
                const isMissing = (af.action_flags || []).some(f => f.type === 'afm' && f.target === afm);
                msg = msg.replaceAll(tag, isMissing ? afm : `[No Missing ${afm}]`);
            }
        });

        if (msg.includes('{MissingCss}')) msg = msg.replace(/\{MissingCss\}/g, af.has_missing_css ? 'CSS Profile' : '[Not Missing CSS Profile]');
        if (msg.includes('{MissingFafsa}')) msg = msg.replace(/\{MissingFafsa\}/g, af.has_missing_fafsa ? 'FAFSA' : '[Not Missing FAFSA]');
        if (msg.includes('{MissingCollegeApp}')) msg = msg.replace(/\{MissingCollegeApp\}/g, af.has_missing_college_app ? 'College Application' : '[Not Missing College App]');

        msg = msg.replace(/\{MissingHsfs\}|\{MissingWebinars\}|\{MissingPastWebinars\}/g, '[USE {MissingSummary} INSTEAD]');

        return msg;
    }

    const getRecommendedAction = (af) => {
        if (af.missing_sessions_count > 0) return `Text reminder for missing session [${reportingMonth}]`;
        if (af.missing_webinars_count > 0) return `Email follow-up for missing webinar [${reportingMonth}]`;
        if (af.missing_past_sessions_count > 0 || af.missing_past_webinars_count > 0) return `Check-in regarding past missing requirements`;
        if (af.has_missing_fafsa || af.has_missing_css) return `Urgent follow-up for milestone documentation`;
        if (String(af.qa_status).toLowerCase().includes('not meeting')) return `QA check-in recommended`;
        return 'No action needed';
    };

    const copyGeneral = async (text, key) => {
        try {
            await navigator.clipboard.writeText(text);
            if (key) {
                setJustCopied(key);
                setTimeout(() => setJustCopied(null), 2000);
            }
        } catch (err) {
            console.error("Failed to copy to clipboard:", err);
            alert("Clipboard copy failed. Please try again or copy manually.");
        }
    };

    const copyToClipboardAndMarkContacted = async (text, email) => {
        try {
            await navigator.clipboard.writeText(text);

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
            console.error("Could not update last_contact_date or copy to clipboard", err);
            alert("Copy failed. Please try again.");
        }
    };

    const triggerExportFlow = () => {
        if (selectedCount === 0 || validationResults.failed > 0) {
            alert("Validation failed. Please fix message errors before exporting.");
            return;
        }
        setShowExportModal(true);
    };

    const confirmAndExportCSV = () => {

        const validAFs = filteredData.filter(af => {
            const isMissingStandard = !getReplacedMessage(af, false).includes('[NO MISSING OBLIGATIONS MATCHING FILTERS]');
            const hasNeedsAttention = isMissingStandard || (af.action_flags || []).some(f => f.type === 'session_not_live');
            return hasNeedsAttention;
        });

        const headers = ["Email", "FirstName", "FullName", "Subject", "Message", "CC", "Assigned HAF", "Quality Assessment"];

        const csvEscape = (value) => {
            const str = value == null ? '' : String(value);
            return `"${str.replace(/"/g, '""')}"`;
        };

        const rows = validAFs.map(af => [
            csvEscape(af.email),
            csvEscape(af.preferredName || (af.fullName || '').split(' ')[0] || ''),
            csvEscape(af.fullName),
            csvEscape(subject),
            csvEscape(getReplacedMessage(af, true)),
            csvEscape(cc),
            csvEscape(af.assigned_haf),
            csvEscape(af.qa_status)
        ]);

        const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\r\n");
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `matriculate_outreach_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setShowExportModal(false);
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
                            {(filters.flags || []).length === 0 && (filters.manualSelected || []).length > 0 && <li>Manually Selected: {filters.manualSelected.length} AFs</li>}
                            {filters.assignedHAF?.length === 0 && filters.quality?.length === 0 && filters.flags?.length === 0 && (filters.manualSelected || []).length === 0 && <li>No active filters (All Data)</li>}
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
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '90px', fontWeight: 'bold' }}>Identity:</span>
                                <VariableBtn tag="{FirstName}" label="First Name" />
                                <VariableBtn tag="{FullName}" label="Full Name" />
                                <VariableBtn tag="{HAF}" label="Assigned HAF" />
                                <VariableBtn tag="{QA}" label="QA Status" />
                            </div>

                            <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.5, margin: '2px 0' }}></div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-gold)', width: '90px' }}>Presets:</span>
                                <VariableBtn tag="{MissingSummary}" label="All Missing Obligations Summary" />
                                <VariableBtn tag="{SessionsOnlySummary}" label="Sessions Only Summary" />
                                <VariableBtn tag="{WebinarsOnlySummary}" label="Webinars Only Summary" />
                                <VariableBtn tag="{ActionItemsOnlySummary}" label="Action Items Only Summary" />
                            </div>

                            <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.2, margin: '2px 0' }}></div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                <input
                                    type="checkbox"
                                    id="global_hsf_toggle"
                                    checked={showHSFNames}
                                    onChange={(e) => setShowHSFNames(e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                />
                                <label htmlFor="global_hsf_toggle" style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                    Show student names in parentheses (e.g. "March session (BEAN BAG)")
                                </label>
                            </div>

                            <div style={{ height: '1px', background: 'var(--border-color)', opacity: 0.2, margin: '2px 0' }}></div>

                            <details style={{ cursor: 'pointer', outline: 'none' }}>
                                <summary style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px', opacity: 0.8 }}>▶ Sessions (Granular Overrides)</summary>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', paddingLeft: '16px', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '4px', paddingTop: '8px', paddingBottom: '8px' }}>
                                    <VariableBtn tag="{MissingSessions_Current}" label={`Missing Sessions [${reportingMonth}]`} />
                                    <VariableBtn tag="{MissingSessions_Past}" label="Missing Past Sessions" />
                                    {allMonths.map(month => (
                                        <VariableBtn key={month} tag={`{Missing_${month}}`} label={month} />
                                    ))}
                                </div>
                            </details>

                            <details style={{ cursor: 'pointer', outline: 'none' }}>
                                <summary style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px', opacity: 0.8 }}>▶ Webinars (Granular Overrides)</summary>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', paddingLeft: '16px', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '4px', paddingTop: '8px', paddingBottom: '8px' }}>
                                    <VariableBtn tag="{MissingWebinars_Current}" label={`Missing Webinars [${reportingMonth}]`} />
                                    <VariableBtn tag="{MissingWebinars_Past}" label="Missing Past Webinars" />
                                    {uniqueWebinars.map(webinar => (
                                        <VariableBtn key={webinar} tag={`{Missing_${webinar.replace(/\s+/g, '')}}`} label={webinar} />
                                    ))}
                                </div>
                            </details>

                            <details style={{ cursor: 'pointer', outline: 'none' }}>
                                <summary style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px', opacity: 0.8 }}>▶ Action Items (Granular Overrides)</summary>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', paddingLeft: '16px', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '4px', paddingTop: '8px', paddingBottom: '8px' }}>
                                    <VariableBtn tag="{MissingFafsa}" label="Missing FAFSA" />
                                    <VariableBtn tag="{MissingCss}" label="Missing CSS Profile" />
                                    <VariableBtn tag="{MissingCollegeApp}" label="Missing College App" />
                                    {uniqueAFMs.map(afm => (
                                        <VariableBtn key={afm} tag={`{Missing_${afm.replace(/\s+/g, '')}}`} label={afm} />
                                    ))}
                                </div>
                            </details>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Subject Line</label>
                            <input
                                type="text"
                                style={{
                                    width: '100%', padding: '8px 12px',
                                    background: 'var(--bg-main)', color: 'var(--text-primary)',
                                    border: '1px solid var(--border-color)', borderRadius: '6px',
                                    fontFamily: 'inherit', fontSize: '13px'
                                }}
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="e.g. Missing Requirements Update"
                            />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', margin: 0 }}>CC Addresses (Optional)</label>
                            </div>
                            <input
                                type="text"
                                style={{
                                    width: '100%', padding: '8px 12px',
                                    background: 'var(--bg-main)', color: 'var(--text-primary)',
                                    border: '1px solid var(--border-color)', borderRadius: '6px',
                                    fontFamily: 'inherit', fontSize: '13px'
                                }}
                                value={cc}
                                onChange={e => setCc(e.target.value)}
                                placeholder="e.g. manager1@gmail.com, manager2@gmail.com"
                            />
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                For multiple addresses, separate with commas.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block' }}>Email Body</label>
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
                            const msg = getReplacedMessage(af, false); // loose check
                            const strictMsg = getReplacedMessage(af, true); // actual message
                            const isMissingStandard = !msg.includes('[NO MISSING OBLIGATIONS MATCHING FILTERS]');
                            const hasNeedsAttention = isMissingStandard || (af.action_flags || []).some(f => f.type === 'session_not_live');
                            const msgValidation = validationResults.failures.find(f => f.email === af.email) || null;

                            const failureReasonsText = msgValidation?.reasons?.join('') || '';
                            const unresolvedTemplateTokens = message.match(/\{[^}]+\}/g) || [];
                            const hasUnresolvedTokenNotice =
                                unresolvedTemplateTokens.length > 0 &&
                                unresolvedTemplateTokens.some(token => !failureReasonsText.includes(token) && strictMsg.includes(token));

                            let borderColor = 'var(--border-color)';
                            if (!hasNeedsAttention) borderColor = 'var(--success)';
                            else if (msgValidation) borderColor = 'var(--danger)';
                            else if (isSuccess) borderColor = 'var(--success)';

                            return (
                                <div key={af.email} className="card" style={{
                                    padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                                    opacity: af.last_contact_date && hasNeedsAttention ? 0.6 : 1, transition: 'all 0.3s ease',
                                    borderLeft: `4px solid ${borderColor}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <h4 style={{ margin: 0, color: 'var(--accent-cyan)', fontSize: '15px' }}>{af.fullName}</h4>
                                                <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>{af.assigned_haf || 'Unassigned'}</span>
                                                {af.qa_status && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        background: af.qa_status === 'Exceeding Expectations' || af.qa_status === 'Meeting Expectations' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                        color: af.qa_status === 'Exceeding Expectations' || af.qa_status === 'Meeting Expectations' ? 'var(--success)' : 'var(--danger)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px'
                                                    }}>{af.qa_status}</span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                                {af.mobile && (
                                                    <span
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: justCopied === `phone-${af.email}` ? 'var(--success)' : 'transparent', color: justCopied === `phone-${af.email}` ? '#000' : 'inherit', padding: '1px 4px', borderRadius: '4px' }}
                                                        onClick={() => copyGeneral(af.mobile, `phone-${af.email}`)}
                                                    >
                                                        <Smartphone size={12} /> {af.mobile}
                                                    </span>
                                                )}
                                                {af.email && (
                                                    <span
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: justCopied === `email-${af.email}` ? 'var(--success)' : 'transparent', color: justCopied === `email-${af.email}` ? '#000' : 'inherit', padding: '1px 4px', borderRadius: '4px' }}
                                                        onClick={() => copyGeneral(af.email, `email-${af.email}`)}
                                                    >
                                                        <Mail size={12} /> {af.email}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                                            <input
                                                type="checkbox"
                                                id={`hsf_toggle_${af.email}`}
                                                checked={individualHSFOverrides[af.email] ?? showHSFNames}
                                                onChange={(e) => {
                                                    setIndividualHSFOverrides(prev => ({
                                                        ...prev,
                                                        [af.email]: e.target.checked
                                                    }));
                                                }}
                                                style={{ cursor: 'pointer', transform: 'scale(0.8)' }}
                                            />
                                            <label htmlFor={`hsf_toggle_${af.email}`} style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                Show Names
                                            </label>
                                        </div>
                                    </div>

                                    {
                                        hasNeedsAttention ? (
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

                                                    {/* Not Live Sessions */}
                                                    {(af.not_live_sessions_count > 0 || af.not_live_past_sessions_count > 0 || (af.action_flags || []).some(f => f.type === 'session_not_live')) && (
                                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
                                                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-gold)', width: '120px' }}>Not Live Sessions:</span>
                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                {af.not_live_sessions_count > 0 && <span style={{ background: 'transparent', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Not Live Session [{reportingMonth}]</span>}
                                                                {af.not_live_past_sessions_count > 0 && <span style={{ background: 'transparent', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Not Live Past Sessions</span>}

                                                                {(af.not_live_sessions_count > 0 || af.not_live_past_sessions_count > 0) && (af.action_flags || []).some(f => f.type === 'session_not_live') && (
                                                                    <div style={{ width: '1px', height: '12px', background: 'var(--border-color)', margin: '0 4px', opacity: 0.5 }}></div>
                                                                )}

                                                                {Array.from(new Set((af.action_flags || []).filter(f => f.type === 'session_not_live').map(f => f.month))).sort((a, b) => {
                                                                    const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                                                                    return m.indexOf(a) - m.indexOf(b);
                                                                }).map(month => (
                                                                    <span key={`af_sess_nl_${month}`} style={{ background: 'transparent', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Not Live {month}</span>
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
                                                    {hasNeedsAttention ? strictMsg : <span style={{ color: 'var(--text-muted)' }}>[NO MISSING OBLIGATIONS MATCHING FILTERS]</span>}
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

                                                {hasUnresolvedTokenNotice && (
                                                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderLeft: '2px solid var(--warning)', padding: '8px 12px', fontSize: '11px', display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px' }}>
                                                        <AlertCircle size={14} style={{ marginTop: '2px' }} />
                                                        <div>
                                                            <strong>Notice:</strong><br />
                                                            Unresolved token detected. Ensure you are using supported placeholders like {'{MissingSummary}'}.
                                                        </div>
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <strong>Recommended Action:</strong> {getRecommendedAction(af)}
                                                        {af.last_contact_date && <span style={{ color: 'var(--success)' }}>(Contacted)</span>}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button className="btn" onClick={() => copyGeneral(strictMsg, `btn-msg-${af.email}`)} style={{
                                                            fontSize: '11px', padding: '6px 12px',
                                                            background: justCopied === `btn-msg-${af.email}` ? 'var(--success)' : '',
                                                            color: justCopied === `btn-msg-${af.email}` ? '#fff' : ''
                                                        }} disabled={!!msgValidation}>
                                                            {justCopied === `btn-msg-${af.email}` ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy Message</>}
                                                        </button>
                                                        <button
                                                            className={`btn ${isSuccess ? 'success' : 'btn-primary'}`}
                                                            style={{ fontSize: '11px', padding: '6px 12px' }}
                                                            onClick={() => copyToClipboardAndMarkContacted(strictMsg, af.email)}
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
                                        )
                                    }
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
                        <button className="btn btn-primary" onClick={triggerExportFlow} style={{ justifyContent: 'center' }} disabled={validationResults.failed > 0}>
                            <Download size={16} /> Mail Merge (.csv)
                        </button>
                        <button className="btn" onClick={() => copyGeneral(getBccList())} style={{ justifyContent: 'center' }} disabled={validationResults.failed > 0}>
                            <Copy size={16} /> Copy BCC Field
                        </button>
                        <button className="btn" onClick={() => copyGeneral(message)} style={{ justifyContent: 'center' }}>
                            <Copy size={16} /> Copy Template Body
                        </button>
                        <button className="btn" onClick={() => copyGeneral(getPhoneNumbersList())} style={{ justifyContent: 'center' }}>
                            <Smartphone size={16} /> Copy Phone Numbers
                        </button>
                    </div>
                </div>
            </div >

            {/* Export Verification Modal */}
            {
                showExportModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
                        <div className="card" style={{ padding: '32px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle size={20} color="var(--accent-cyan)" /> Verify Mail Merge Details
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '24px' }}>
                                Please review your global configuration before downloading the CSV. These values will be applied to all {selectedCount} recipients in your export.
                            </p>

                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '16px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SUBJECT LINE</span>
                                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>{subject}</div>
                                </div>

                                {cc.trim() !== "" && (
                                    <div>
                                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>CC ADDRESSES</span>
                                        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{cc}</div>
                                    </div>
                                )}

                                <div>
                                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>EMAIL BODY TEMPLATE</span>
                                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                        {message}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button className="btn" onClick={() => setShowExportModal(false)}>Cancel & Go Back</button>
                                <button className="btn success" onClick={confirmAndExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Download size={16} /> Confirm & Download CSV
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
