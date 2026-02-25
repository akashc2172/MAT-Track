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

function App() {
  const [auditStats, setAuditStats] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [uploads, setUploads] = useState({
    haf: null, qa: null, session: null, afm: null, webinar: null
  });

  // Navigation State
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('databallr_tab') || 'dashboard');

  useEffect(() => { localStorage.setItem('databallr_tab', activeTab); }, [activeTab]);

  // UX Priority: Smart Defaults + Remembered Preferences
  const [reportingMonth, setReportingMonth] = useState(() => localStorage.getItem('databallr_month') || 'February');

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
      // Parse whichever files were uploaded. Missing files return empty arrays natively.
      const hafData = uploads.haf ? await parseFile(uploads.haf) : [];
      const qaData = uploads.qa ? await parseFile(uploads.qa) : [];
      const sessionData = uploads.session ? await parseFile(uploads.session) : [];
      const afmData = uploads.afm ? await parseFile(uploads.afm) : [];
      const webinarData = uploads.webinar ? await parseFile(uploads.webinar) : [];

      // Generate normalized reports
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

  const handleApproveData = async () => {
    try {
      // Clear existing data for strict rewrite during dev
      await db.afs.clear();

      // Store in IndexedDB
      await db.afs.bulkAdd(pendingData);
      console.log("Normalized Data Model successfully committed to Dexie IndexedDB.");

      // Wait a moment for Dexie useLiveQuery to propagate the new data to React state
      // This prevents the Initialization Screen from flashing/catching context due to activeAfs being momentarily empty
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
          <button className="btn" style={{ fontSize: '11px', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => setShowResetModal(true)}>Data Management</button>
        </div>
      </header>

      <main style={{ padding: '20px' }}>
        <FilterBar data={activeAfs} filters={filters} setFilters={setFilters} reportingMonth={reportingMonth} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textAlign: 'center', fontWeight: 'bold' }}>
            Select filters above to choose who you want to contact, then open Outreach Workspace.
          </p>
          <nav style={{ display: 'flex', gap: '2px' }}>
            <button
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`tab-btn ${activeTab === 'outreach' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('outreach')}
            >
              Outreach Workspace
            </button>
          </nav>
        </div>

        {activeTab === 'dashboard' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TopDashboard data={activeAfs} filters={filters} reportingMonth={reportingMonth} />
            <MasterTable data={activeAfs} filters={filters} reportingMonth={reportingMonth} />
          </div>
        ) : (
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

      {/* DB Reset Modal */}
      {showResetModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="card" style={{ padding: '32px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Data Management</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '24px' }}>
              Select which database records you'd like to clear from this browser session.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <button className="btn" onClick={async () => { await db.afs.clear(); setShowResetModal(false); window.location.reload(); }} style={{ justifyContent: 'flex-start', color: 'var(--warning)', borderColor: 'var(--warning)' }}>
                Clear Core Tracking Data (Return to Setup)
              </button>
              <button className="btn" onClick={async () => {
                const allAfs = await db.afs.toArray();
                await Promise.all(allAfs.map(a => db.afs.update(a.email, { last_contact_date: null })));
                alert('Outreach logs cleared successfully.');
                setShowResetModal(false);
              }} style={{ justifyContent: 'flex-start' }}>
                Clear Outreach Logs (Reset 'Contacted' flags)
              </button>
              <button className="btn" onClick={async () => {
                await db.identityAliases.clear();
                alert('Alias mappings cleared successfully.');
                setShowResetModal(false);
              }} style={{ justifyContent: 'flex-start' }}>
                Clear Identity Aliases
              </button>
              <button className="btn btn-primary" onClick={async () => {
                await Promise.all(db.tables.map(table => table.clear()));
                setShowResetModal(false);
                window.location.reload();
              }} style={{ justifyContent: 'flex-start', background: 'var(--danger)', borderColor: 'var(--danger)' }}>
                Nuke All Databases (Factory Reset)
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowResetModal(false)}>Cancel / Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
