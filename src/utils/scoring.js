export function getMentorshipNeedsAttentionItems(af, mentorship, reportingMonth) {
    const items = [];

    (af.action_flags || []).forEach(flagObj => {
        // 1. Sessions
        if (flagObj.category === 'sessions' && flagObj.target === mentorship.hsfName) {
            items.push(flagObj);
        }
        // 2. Action Items (Milestones)
        if (flagObj.category === 'action_items' && flagObj.type === 'milestone') {
            if ((flagObj.hsfNames || []).includes(mentorship.hsfName)) {
                // Return a cloned object specifically for this HSF
                items.push({
                    ...flagObj,
                    singleHsfName: mentorship.hsfName
                });
            }
        }
    });

    return items;
}

export function getMentorshipScore(af, mentorship, reportingMonth) {
    const items = getMentorshipNeedsAttentionItems(af, mentorship, reportingMonth);

    // Each missing session, missing past session, not live session, 
    // and missing milestone (FAFSA, CSS, College App) for that specific student counts as -1.
    return -items.length;
}

export function getMentorshipColorColor(score) {
    if (score <= -5) return 'var(--danger)';
    if (score <= -2) return 'var(--warning)';
    return 'var(--success)';
}
