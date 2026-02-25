import React, { useState, useEffect } from 'react';
import './index.css';
import MergeAuditPanel from './components/MergeAuditPanel.jsx';
import { db } from './utils/db.js';
import { parseText, parseFile, unifyReports, calculateDynamicMetrics } from './utils/DataMerger.js';
import { useLiveQuery } from 'dexie-react-hooks';

// Pulse 2 Components
import MasterTable from './components/MasterTable.jsx';
import FilterBar from './components/FilterBar.jsx';
import OutreachPanel from './components/OutreachPanel.jsx';
import TopDashboard from './components/TopDashboard.jsx';
import MentorshipScoresTab from './components/MentorshipScoresTab.jsx';

function App() {
  const [auditStats, setAuditStats] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [uploads, setUploads] = useState({
    haf: null, qa: null, session: null, afm: null, webinar: null
  });

  const persistedSources = useLiveQuery(() => db.sources.toArray());

  // Navigation State
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('databallr_tab') || 'dashboard');

  useEffect(() => { localStorage.setItem('databallr_tab', activeTab); }, [activeTab]);

  // UX Priority: Smart Defaults + Remembered Preferences
  const [reportingMonth, setReportingMonth] = useState(() => localStorage.getItem('databallr_month') || new Date().toLocaleString('default', { month: 'long' }));

  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('databallr_filters');
    return saved ? JSON.parse(saved) : {
      assignedHAF: [],
      quality: [],
      flags: []
    };
  });

  useEffect(() => { localStorage.setItem('databallr_month', reportingMonth); }, [reportingMonth]);
  useEffect(() => { localStorage.setItem('databallr_filters', JSON.stringify(filters)); }, [filters]);

  // Helper function for tab switching with gating modal logic
  const handleTabSwitch = (tab) => {
    if (tab === 'outreach') {
      const hasFlagsSelected = filters.flags && filters.flags.length > 0;
      if (!hasFlagsSelected) {
        setShowOutreachModal(true);
        return;
      }
    }
    setActiveTab(tab);
  };

  // Live Query from Dexie
  const rawAfs = useLiveQuery(() => db.afs.toArray());

  // Dynamically recalculate "This Month" metrics based on the Reporting Month Selector
  const activeAfs = React.useMemo(() => {
    if (!rawAfs) return null;
    return rawAfs.map(af => {
      const dynamicMetrics = calculateDynamicMetrics(af, reportingMonth);
      return { ...af, ...dynamicMetrics };
    });
  }, [rawAfs, reportingMonth]);

  const handleFileUpload = (e, key) => {
    const file = e.target.files[0];
    if (file) {
      setUploads(prev => ({ ...prev, [key]: file }));
    }
  };

  const processUploads = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const hafData = uploads.haf ? await parseFile(uploads.haf) : [];
      const qaData = uploads.qa ? await parseFile(uploads.qa) : [];
      const sessionData = uploads.session ? await parseFile(uploads.session) : [];
      const afmData = uploads.afm ? await parseFile(uploads.afm) : [];
      const webinarData = uploads.webinar ? await parseFile(uploads.webinar) : [];

      // Save raw data to Sources table for persistent replacement/sync
      const sourcePromises = [];
      if (uploads.haf) sourcePromises.push(db.sources.put({ id: 'haf', filename: uploads.haf.name, data: hafData }));
      if (uploads.qa) sourcePromises.push(db.sources.put({ id: 'qa', filename: uploads.qa.name, data: qaData }));
      if (uploads.session) sourcePromises.push(db.sources.put({ id: 'session', filename: uploads.session.name, data: sessionData }));
      if (uploads.afm) sourcePromises.push(db.sources.put({ id: 'afm', filename: uploads.afm.name, data: afmData }));
      if (uploads.webinar) sourcePromises.push(db.sources.put({ id: 'webinar', filename: uploads.webinar.name, data: webinarData }));
      await Promise.all(sourcePromises);

      const { data, stats } = unifyReports(hafData, qaData, sessionData, afmData, webinarData);
      setPendingData(data);
      setAuditStats(stats);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to process one or more files: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncEngine = async (customSources = null) => {
    setIsLoading(true);
    try {
      const sources = customSources || await db.sources.toArray();
      const sMap = Object.fromEntries(sources.map(s => [s.id, s.data]));

      const { data } = unifyReports(
        sMap.haf || [],
        sMap.qa || [],
        sMap.session || [],
        sMap.afm || [],
        sMap.webinar || []
      );

      await db.afs.clear();
      await db.afs.bulkAdd(data);
      console.log("Engine re-synced from persistent sources.");
    } catch (err) {
      console.error(err);
      alert("Sync failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplaceFile = async (e, key) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const parsedData = await parseFile(file);
      await db.sources.put({ id: key, filename: file.name, data: parsedData });
      await handleSyncEngine();
      alert(`Updated ${key} source with ${file.name}`);
    } catch (err) {
      alert("Failed to replace file: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveData = async () => {
    try {
      await db.afs.clear();
      await db.afs.bulkAdd(pendingData);
      setTimeout(() => {
        setPendingData(null);
        setAuditStats(null);
      }, 400);
    } catch (error) {
      console.error("Failed to commit to IndexedDB: ", error);
      alert("Data commit failed: " + error.message);
    }
  };

  // (Replaced by specific database clearing functions in the modal)

  // The Initialization Screen
  if (!auditStats && (!activeAfs || activeAfs.length === 0)) {
    // Check if any files are loaded to proceed
    const canProceed = Object.values(uploads).some(file => file !== null);

    return (
      <div className="app-container" style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-main)' }}>
        <div className="card" style={{ padding: '40px', maxWidth: '600px', width: '100%' }}>
          <h2 style={{ marginBottom: '8px', textAlign: 'center', color: 'var(--text-primary)' }}>Setup</h2>
          <p className="text-muted" style={{ marginBottom: '32px', textAlign: 'center', fontSize: '13px' }}>
            This site runs entirely in your browser. Uploaded files and edits stay local on your device unless you export them.
          </p>

          {errorMsg && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px', border: '1px solid var(--danger)' }}>{errorMsg}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            {[
              { id: 'haf', label: 'HAF Assignments (.csv)', desc: 'Maps AFs to managers. If missing, all AFs are "Unassigned".' },
              { id: 'qa', label: 'QA Tracker (.xls HTML)', desc: 'Core roster, milestones (FAFSA/CSS), and Quality stats.' },
              { id: 'session', label: 'Session Summaries (.xls HTML)', desc: 'Monthly session progression statuses.' },
              { id: 'webinar', label: 'Webinar Export (.xls HTML)', desc: 'Webinar attendance statuses.' },
              { id: 'afm', label: 'AFM Completion (.xls HTML)', desc: 'Additional learning modules and makeups.' }
            ].map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>{f.label}</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{f.desc}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {uploads[f.id] ? (
                    <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 'bold' }}>✓ Loaded</span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Missing</span>
                  )}
                  <input type="file" onChange={(e) => handleFileUpload(e, f.id)} style={{ width: '90px', fontSize: '11px' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn" onClick={() => setUploads({ haf: null, qa: null, session: null, afm: null, webinar: null })}>Reset</button>
            <button className="btn btn-primary" onClick={processUploads} disabled={isLoading || !canProceed}>
              {isLoading ? 'Merging Data...' : 'Initialize Engine'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // The Audit Screen
  if (auditStats) {
    return (
      <div className="app-container" style={{ padding: '40px' }}>
        <MergeAuditPanel
          stats={auditStats}
          onApprove={handleApproveData}
          onDiscard={() => { setAuditStats(null); setPendingData(null); }}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Global Header & Nav Tabs */}
      <header style={{
        borderBottom: '1px solid var(--border-color)',
        padding: '0 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-main)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 0' }}>
            <div style={{ width: '20px', height: '20px', background: 'var(--accent-gold)', borderRadius: '4px' }}></div>
            <h1 style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '0.5px' }}>Mission Control</h1>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Reporting Month:</span>
            <select
              value={reportingMonth}
              onChange={e => setReportingMonth(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
            >
              {['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May'].map(m => (
                <option key={m} value={m}>{m} 2026</option>
              ))}
            </select>
          </div>
          <button className="btn" style={{ fontSize: '11px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }} onClick={() => setShowDataSourcesModal(true)}>Manage Data Sources</button>
        </div>
      </header>

      <main style={{ padding: '20px' }}>
        <FilterBar data={activeAfs} filters={filters} setFilters={setFilters} reportingMonth={reportingMonth} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', maxWidth: '800px', margin: '0 auto 24px auto' }}>
          <p style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '16px', textAlign: 'center', fontWeight: '500', lineHeight: '1.5' }}>
            Just change the filters above, and hopefully the way I made this, it will automatically adjust the message once you click "Outreach Workspace" and make sense grammatically. Scroll all the way down to the previews (once in Outreach Workspace) for different AFs to see if it makes sense. Also, don't send emails that combine Not Live and Missing session summaries, I couldn't figure out how to write a logical sentence without increasing complexity.
          </p>
          <nav style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', padding: '6px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <button
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`tab-btn ${activeTab === 'scores' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('scores')}
            >
              Mentorship Scores
            </button>
            <button
              className={`tab-btn ${activeTab === 'outreach' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('outreach')}
            >
              Outreach Workspace
            </button>
          </nav>
        </div>

        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TopDashboard data={activeAfs} filters={filters} reportingMonth={reportingMonth} />
            <MasterTable data={activeAfs} filters={filters} reportingMonth={reportingMonth} />
          </div>
        )}

        {activeTab === 'scores' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <MentorshipScoresTab data={activeAfs} filters={filters} reportingMonth={reportingMonth} />
          </div>
        )}

        {activeTab === 'outreach' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <OutreachPanel data={activeAfs} filters={filters} setFilters={setFilters} reportingMonth={reportingMonth} />
          </div>
        )}
      </main>

      {/* Outreach Gating Modal */}
      {showOutreachModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="card" style={{ padding: '32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>No outreach filters selected</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
              You haven’t selected any outreach options yet. Choose one or more filters above (like Missing Sessions or Missing Webinars) to build a targeted outreach list.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn" onClick={() => setShowOutreachModal(false)}>Go back / Cancel</button>
              <button className="btn btn-primary" onClick={() => { setShowOutreachModal(false); setActiveTab('outreach'); }}>Continue anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Data Source Management Modal */}
      {showDataSourcesModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="card" style={{ padding: '32px', maxWidth: '550px', width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Manage Data Sources</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '24px' }}>
              Replace individual data files to update the dashboard, or reset everything to start over.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
              {[
                { id: 'haf', label: 'HAF Assignments' },
                { id: 'qa', label: 'QA Tracker' },
                { id: 'session', label: 'Session Summaries' },
                { id: 'webinar', label: 'Webinar Export' },
                { id: 'afm', label: 'AFM Completion' }
              ].map(slot => {
                const source = persistedSources?.find(s => s.id === slot.id);
                return (
                  <div key={slot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px' }}>{slot.label}</h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: source ? 'var(--success)' : 'var(--text-muted)' }}>
                        {source ? `✓ ${source.filename}` : 'No file uploaded'}
                      </p>
                    </div>
                    <div>
                      <label className="btn" style={{ fontSize: '11px', padding: '6px 12px', cursor: 'pointer', display: 'inline-block' }}>
                        {source ? 'Replace' : 'Upload'}
                        <input type="file" style={{ display: 'none' }} onChange={(e) => handleReplaceFile(e, slot.id)} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="btn"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: '12px' }}
                onClick={async () => {
                  if (confirm("This will wipe ALL data and return you to the Setup screen. Proceed?")) {
                    await Promise.all(db.tables.map(table => table.clear()));
                    window.location.reload();
                  }
                }}
              >
                Reset All & Return to Setup
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn" onClick={() => setShowDataSourcesModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
