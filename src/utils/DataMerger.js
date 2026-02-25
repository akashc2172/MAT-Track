import Papa from 'papaparse';

export async function parseFile(file) {
    const text = await file.text();
    return parseText(text, file.name);
}

export function parseText(text, filename) {
    if (filename.endsWith('.csv')) {
        return new Promise((resolve, reject) => {
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results.data),
                error: (error) => reject(error)
            });
        });
    }

    if (filename.endsWith('.xls') || filename.endsWith('.xlsx')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const table = doc.querySelector('table');

        if (!table) throw new Error(`Could not find HTML table in ${filename}`);

        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) return [];

        const headers = Array.from(rows[0].querySelectorAll('th, td')).map(th => th.textContent.trim());

        const data = rows.slice(1).map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const rowData = {};
            headers.forEach((header, i) => {
                rowData[header] = cells[i] ? cells[i].textContent.trim() : '';
            });
            return rowData;
        });

        return data;
    }

    throw new Error(`Unsupported file format: ${filename}`);
}

const EXCLUDED_EMAILS = [
    'phamkailani@gmail.com',
    'nicole.ershaghi@gmail.com',
    'nicoleershaghi@gmail.com'
];

const getCycleMonthOrdinal = (dateString) => {
    if (!dateString) return 0;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 0;
    const m = d.getMonth() + 1; // 1-12
    const y = d.getFullYear(); // e.g. 2025
    return (y * 12) + m;
};

const getStatusMonthOrdinal = (monthName) => {
    const y2025 = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const y2026 = ['January', 'February'];
    if (y2025.includes(monthName)) return (2025 * 12) + y2025.indexOf(monthName) + 3;
    if (y2026.includes(monthName)) return (2026 * 12) + y2026.indexOf(monthName) + 1;
    return 0; // Unknown month
};

export function unifyReports(hafData = [], qaData = [], sessionData = [], afmData = [], webinarData = [], aliasMap = new Map()) {
    const unifiedMap = new Map();

    const isExcluded = (email) => {
        if (!email) return false;
        return EXCLUDED_EMAILS.includes(email.toLowerCase().trim());
    };

    const normalizeName = (name) => name ? name.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim() : '';

    // 1. ROOT NODE: Assignments (The strict roster)
    let baseData = hafData;
    if (!baseData || baseData.length === 0) {
        // Fallback: Infer roster from all available files if missing HAF assignments
        const allEmails = [
            ...qaData.map(r => r['AF Email'] || r['Email']),
            ...sessionData.map(r => r['AF Email']),
            ...afmData.map(r => r['Email']),
            ...webinarData.map(r => r['Email'])
        ];
        const uniqueEmails = new Set(allEmails.filter(Boolean));
        baseData = Array.from(uniqueEmails).map(email => ({ Email: email, 'Assigned HAF': 'Unassigned HAF (No File)' }));
    }

    baseData.forEach(row => {
        const email = row['Email']?.toLowerCase().trim();
        if (!email || isExcluded(email)) return;

        unifiedMap.set(email, {
            email: email,
            fullName: row['Full Name'] || email,
            preferredName: row['Preferred Name'] || '',
            mobile: row['Mobile'] || '',
            assigned_haf: row['Assigned HAF'] || 'Missing Assignment File',
            qa_status: 'Unknown',
            qualityAssessment: 'Unknown',
            role: 'Advising Fellow',
            mentorships: [], // Array of { mentorshipId, hsfName, statuses: {}, milestones: {} }
            webinars: {},
            afms: {}
        });
    });

    const findAF = (email, first, last) => {
        const e = email?.toLowerCase().trim();
        // 1. Exact email match
        if (e && unifiedMap.has(e)) return unifiedMap.get(e);
        // 3. Alias table match by email
        if (e && aliasMap.has(e)) return unifiedMap.get(aliasMap.get(e));

        const firstNorm = normalizeName(first);
        const lastNorm = normalizeName(last);

        if (firstNorm && lastNorm) {
            const fullNorm = `${firstNorm} ${lastNorm}`;
            let possibleMatches = [];
            for (let [key, af] of unifiedMap.entries()) {
                const afFullNorm = normalizeName(af.fullName);
                const afPrefNorm = normalizeName(af.preferredName) + ' ' + normalizeName(af.fullName.split(' ')[1] || '');

                // 2. Normalized exact name match
                if (afFullNorm === fullNorm || afPrefNorm === fullNorm) {
                    possibleMatches.push(af);
                }
                // 3. Alias table match by name
                else if (aliasMap.has(fullNorm) && aliasMap.get(fullNorm) === key) {
                    possibleMatches.push(af);
                }
            }
            if (possibleMatches.length === 1) return possibleMatches[0];
            // If multiple plausible matches, we return null to send to Needs Review
        }
        return null; // Triggers "unmatched" flow for fuzzy/manual merging
    };

    // 2. QUALITY TAGS: Injects QA Rating and Mentorship Base Objects
    qaData.forEach(row => {
        const email = (row['AF Email'] || row['Email'])?.toLowerCase().trim();
        const first = row['AF Preferred Name'] || '';
        const last = row['Last Name'] || '';

        const af = findAF(email, first, last);
        if (!af) return;

        if (row['Quality Assessment']) {
            af.qualityAssessment = row['Quality Assessment'];
            af.qa_status = row['Quality Assessment'];
        }

        const mentorshipId = row['Mentorship Name'];
        if (mentorshipId) {
            let mentorship = af.mentorships.find(m => m.mentorshipId === mentorshipId);
            if (!mentorship) {
                mentorship = {
                    mentorshipId: mentorshipId,
                    hsfName: 'Unknown HSF',
                    statuses: {},
                    milestones: {
                        fafsa: row['3. FAFSA Milestone Status'] || 'Not Started',
                        css: row['4. CSS Profile Milestone Status'] || 'Not Started',
                        collegeApp: row['6. College Application Milestone'] || 'Not Started',
                        applied: row['# Applied'] || 0
                    },
                    notes: row['Long Mentorship Notes'] || ''
                };
                af.mentorships.push(mentorship);
            }
        }
    });

    // 3. SESSION SUMMARIES: Injects HSF names and Monthly Statuses
    sessionData.forEach(row => {
        const email = row['AF Email']?.toLowerCase().trim();
        const af = findAF(email, null, null);
        if (!af) return;

        const mentorshipId = row['Mentorship: Mentorship Name'];
        if (mentorshipId) {
            let mentorship = af.mentorships.find(m => m.mentorshipId === mentorshipId);
            if (!mentorship) {
                mentorship = {
                    mentorshipId: mentorshipId,
                    hsfName: row['HSF'] || 'Unknown HSF',
                    startOrdinal: getCycleMonthOrdinal(row['Start of Current Relationship']),
                    statuses: {},
                    milestones: {}
                };
                af.mentorships.push(mentorship);
            } else {
                mentorship.hsfName = row['HSF'] || mentorship.hsfName;
                if (row['Start of Current Relationship']) {
                    mentorship.startOrdinal = getCycleMonthOrdinal(row['Start of Current Relationship']);
                }
            }

            // Dynamically grab all "Session Status" columns
            Object.keys(row).forEach(key => {
                if (key.includes('Session Status')) {
                    const month = key.replace(' Session Status', '').replace(' Y1', '').trim();
                    mentorship.statuses[month] = row[key];
                } else if (key === 'September Status' || key === 'October Status') {
                    const month = key.replace(' Status', '').trim();
                    mentorship.statuses[month] = row[key];
                }
            });

            if (row['Mentorship Notes']) mentorship.notes = row['Mentorship Notes'];
        }

        if (row['AF Role']) af.role = row['AF Role'];
    });

    // 4. AFM COMPLETION
    afmData.forEach(row => {
        const email = (row['Email'] || row['User Email'])?.toLowerCase().trim();
        const af = findAF(email, null, null);
        if (!af) return;

        const learningName = row['Learning: Learning Name'] || '';
        const status = row['Progress'] || 'Not Started';
        if (learningName) af.afms[learningName] = status;
    });

    // 5. WEBINAR PROGRESS
    webinarData.forEach(row => {
        const email = (row['Email'] || row['User Email'])?.toLowerCase().trim();
        const af = findAF(email, null, null);
        if (!af) return;

        const learningName = row['Learning: Learning Name'] || '';
        const status = row['Progress'] || 'Not Started';
        if (learningName) af.webinars[learningName] = status;
    });

    // 6. CALCULATE NORMALIZED METRICS & URGENCY SCORE
    const unifiedArray = Array.from(unifiedMap.values());

    // Create audit stats
    const auditStats = {
        totalParsed: qaData.length + sessionData.length + afmData.length + webinarData.length,
        totalAfs: unifiedArray.length,
        totalHsfs: 0,
        unmatchedRows: [] // We simulate this for now
    };

    unifiedArray.forEach(af => {
        // Initialize to safe defaults
        af.is_archived = false;
        af.last_file_update = new Date().toISOString();
        if (!af.last_contact_date) af.last_contact_date = null;

        // Apply dynamic metric baseline for February
        const metrics = calculateDynamicMetrics(af, 'February');
        Object.assign(af, metrics);

        af.mentorships.forEach(m => {
            auditStats.totalHsfs += 1;
        });
    });

    return { data: unifiedArray, stats: auditStats };
}

export function calculateDynamicMetrics(af, reportingMonth) {
    let totalSessions = 0, completedSessions = 0;
    let monthSessionsTotal = 0, monthSessionsCompleted = 0;

    let totalWebinars = 0, completedWebinars = 0;
    let monthWebinarsTotal = 0, monthWebinarCompleted = 0;

    let totalAfms = 0, completedAfms = 0;

    // Strict Metric Denominator Rules
    const excludedStatuses = ['n/a', 'not assigned', 'excused'];
    const isExcluded = (status) => excludedStatuses.includes(String(status).toLowerCase().trim());
    const isNotLive = (status) => String(status).toLowerCase().includes('not live');
    const isCompleted = (status) => {
        const s = String(status).toLowerCase().trim();
        // Missing/unsubmitted DO count against denominators by returning false here (not completed)
        return s && !s.includes('missing') && !s.includes('not completed') && !s.includes('not started') && s !== 'no';
    };

    const action_flags = [];

    const missingFafsas = [];
    const missingCsses = [];
    const missingApps = [];
    let missingPastSessionsCount = 0;
    let missingPastWebinarsCount = 0;
    let missingMonthWebinars = 0;
    let missingMonthSessions = 0;

    let notLivePastSessionsCount = 0;
    let notLiveMonthSessions = 0;

    const missingSessionMonths = [];
    const notLiveSessionMonths = [];
    const missingWebinarNames = [];
    const missingAfmNames = [];

    af.mentorships.forEach(m => {
        const hsf = m.hsfName || 'Unknown HSF';
        if (!m.milestones?.fafsa || String(m.milestones.fafsa).toLowerCase().includes('not started') || String(m.milestones.fafsa).toLowerCase().includes('missing')) missingFafsas.push(hsf);
        if (!m.milestones?.css || String(m.milestones.css).toLowerCase().includes('not started') || String(m.milestones.css).toLowerCase().includes('missing')) missingCsses.push(hsf);
        if (!m.milestones?.collegeApp || String(m.milestones.collegeApp).toLowerCase().includes('not started') || String(m.milestones.collegeApp).toLowerCase().includes('missing')) missingApps.push(hsf);

        Object.entries(m.statuses).forEach(([month, status]) => {
            if (isExcluded(status)) return;

            // Only count if this month is ON or AFTER the relationship started
            const statusOrdinal = getStatusMonthOrdinal(month);
            if (m.startOrdinal > 0 && statusOrdinal > 0 && statusOrdinal < m.startOrdinal) {
                return; // Exclude prior months from denominator
            }

            totalSessions += 1;
            const completed = isCompleted(status);
            const notLive = isNotLive(status);
            const isReportingMonth = reportingMonth && month.toLowerCase().includes(reportingMonth.toLowerCase());

            if (notLive) {
                notLiveSessionMonths.push({ hsf: m.hsfName, month: month });
                if (isReportingMonth) {
                    notLiveMonthSessions += 1;
                } else if (statusOrdinal > 0 && statusOrdinal < getStatusMonthOrdinal(reportingMonth)) {
                    notLivePastSessionsCount += 1;
                }
            }

            if (completed) {
                completedSessions += 1;
            } else if (status === '' || String(status).toLowerCase().includes('not completed') || String(status).toLowerCase().includes('not started') || String(status).toLowerCase() === 'no') {
                missingSessionMonths.push({ hsf: m.hsfName, month: month });
                if (isReportingMonth) {
                    missingMonthSessions += 1;
                } else if (statusOrdinal > 0 && statusOrdinal < getStatusMonthOrdinal(reportingMonth)) {
                    missingPastSessionsCount += 1;
                }
            }

            if (isReportingMonth) {
                monthSessionsTotal += 1;
                if (completed) monthSessionsCompleted += 1;
            }
        });
    });

    Object.entries(af.webinars).forEach(([name, status]) => {
        if (isExcluded(status)) return;
        totalWebinars += 1;
        const completed = isCompleted(status);
        const isReportingMonth = reportingMonth && name.toLowerCase().includes(reportingMonth.toLowerCase());

        if (completed) {
            completedWebinars += 1;
        } else if (status === '' || String(status).toLowerCase().includes('not completed') || String(status).toLowerCase().includes('not started') || String(status).toLowerCase() === 'no') {
            missingWebinarNames.push(name.replace(' Webinar', ''));
            if (isReportingMonth) {
                missingMonthWebinars += 1;
            } else {
                missingPastWebinarsCount += 1;
            }
        }

        if (isReportingMonth) {
            monthWebinarsTotal += 1;
            if (completed) monthWebinarCompleted += 1;
        }
    });

    Object.entries(af.afms).forEach(([name, status]) => {
        if (isExcluded(status)) return;
        totalAfms += 1;
        if (isCompleted(status)) {
            completedAfms += 1;
        } else if (status === '' || String(status).toLowerCase().includes('not completed') || String(status).toLowerCase().includes('not started') || String(status).toLowerCase() === 'no') {
            missingAfmNames.push(name.replace(' AFM', ''));
        }
    });

    const lowQa = String(af.qa_status).toLowerCase().includes('not meeting') || String(af.qa_status).toLowerCase().includes('missing') ? 1 : 0;

    // Urgency Score logic
    let urgency_score = (missingMonthSessions * 3) + (missingMonthWebinars * 2) + (lowQa * 5);
    let is_contacted_today = false;

    // Contact Loop Urgency Reduction
    if (af.last_contact_date) {
        const hoursSince = (new Date() - new Date(af.last_contact_date)) / (1000 * 60 * 60);
        if (hoursSince <= 24) {
            urgency_score = 0;
            is_contacted_today = true;
        } else if (hoursSince <= (24 * 7)) {
            urgency_score = Math.max(0, urgency_score - 2);
        }
    }

    // Build structured action_flags
    if (missingSessionMonths.length > 0) {
        missingSessionMonths.forEach(ms => action_flags.push({ category: 'sessions', type: 'session', target: ms.hsf, month: ms.month }));
    }
    if (notLiveSessionMonths.length > 0) {
        notLiveSessionMonths.forEach(ms => action_flags.push({ category: 'sessions', type: 'session_not_live', target: ms.hsf, month: ms.month }));
    }
    if (missingWebinarNames.length > 0) {
        missingWebinarNames.forEach(mw => action_flags.push({ category: 'webinars', type: 'webinar', subType: 'Webinar', target: mw, isFlagged: true }));
    }
    if (missingFafsas.length > 0) {
        action_flags.push({ category: 'action_items', type: 'milestone', target: 'FAFSA', hsfNames: missingFafsas });
    }
    if (missingCsses.length > 0) {
        action_flags.push({ category: 'action_items', type: 'milestone', target: 'CSS Profile', hsfNames: missingCsses });
    }
    if (missingApps.length > 0) {
        action_flags.push({ category: 'action_items', type: 'milestone', target: 'College Application', hsfNames: missingApps });
    }
    if (missingAfmNames.length > 0) {
        missingAfmNames.forEach(ma => action_flags.push({ category: 'afm_other', type: 'afm', subType: 'AFM', target: ma, isFlagged: true }));
    }

    if (lowQa > 0) action_flags.push({ category: 'action_items', type: 'qa', target: 'low_qa', isFlagged: true });

    return {
        current_session_pct: monthSessionsTotal > 0 ? (monthSessionsCompleted / monthSessionsTotal) * 100 : 0,
        current_webinar_pct: monthWebinarsTotal > 0 ? (monthWebinarCompleted / monthWebinarsTotal) * 100 : 0,
        overall_session_pct: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
        overall_webinar_pct: totalWebinars > 0 ? (completedWebinars / totalWebinars) * 100 : 0,
        overall_afm_pct: totalAfms > 0 ? (completedAfms / totalAfms) * 100 : 0,
        urgency_score,
        action_flags,
        is_contacted_today,
        missing_sessions_count: missingMonthSessions,
        missing_past_sessions_count: missingPastSessionsCount,
        not_live_sessions_count: notLiveMonthSessions,
        not_live_past_sessions_count: notLivePastSessionsCount,
        missing_webinars_count: missingMonthWebinars,
        missing_past_webinars_count: missingPastWebinarsCount,
        has_missing_fafsa: missingFafsas.length > 0,
        has_missing_css: missingCsses.length > 0,
        has_missing_college_app: missingApps.length > 0,
        monthSessionsTotal,
        monthWebinarsTotal
    };

    return { data: unifiedArray, stats: auditStats };
}
