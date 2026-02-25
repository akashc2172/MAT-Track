import Dexie from 'dexie';

export const db = new Dexie('TrackerMissionControl_v2');

// Declare tables, IDs and indexes
db.version(2).stores({
    afs: 'email, assigned_haf, qa_status, urgency_score, *action_flags, last_file_update, last_contact_date, is_archived',
    hsfs: '++id, linked_af_email, name',
    deliverables: '++id, type, source_file, linked_entity_email, status, month_key',
    identityAliases: '++id, alias, canonical_af_email',
    uploadStats: '++id, timestamp, total_rows_parsed, total_afs_matched, total_hsfs_matched', // Just to keep a history of uploads
    sources: 'id, filename, data' // Persistent raw data for the 5 file slots
});
