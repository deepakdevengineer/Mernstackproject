import React, { useState, useEffect, useRef } from 'react';

// Use relative URL (proxied to localhost:5000 in dev, routed by Ingress in k8s)
const API_BASE = '/api';

export default function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [authView, setAuthView] = useState('login'); // 'login' | 'register' | 'landing'
  
  // Dashboard state
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState(null); // Selected task for modal
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Task form state
  const [newTitle, setNewTitle] = useState('');
  const [newInput, setNewInput] = useState('');
  const [newOperation, setNewOperation] = useState('uppercase');
  
  // Auth Form inputs
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');

  // Polling ref for cleanup
  const pollingInterval = useRef(null);

  // Authenticate status check
  const isAuthenticated = !!token;

  // On component mount or token change, load tasks
  useEffect(() => {
    if (isAuthenticated) {
      fetchTasks();
    } else {
      setTasks([]);
      stopPolling();
    }
    return () => stopPolling();
  }, [token]);

  // If any task is pending or running, enable auto-polling
  useEffect(() => {
    const activeTasksCount = tasks.filter(t => t.status === 'pending' || t.status === 'running').length;
    if (activeTasksCount > 0) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [tasks]);

  const startPolling = () => {
    if (!pollingInterval.current) {
      pollingInterval.current = setInterval(() => {
        fetchTasks(true); // silent fetch in background
      }, 3000);
    }
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  const fetchTasks = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
        
        // If details modal is open, refresh that task's details
        if (activeTask) {
          const updatedActive = data.find(t => t._id === activeTask._id);
          if (updatedActive) {
            setActiveTask(updatedActive);
          }
        }
      } else if (res.status === 401) {
        handleLogout();
      } else {
        const errData = await res.json();
        if (!isSilent) setError(errData.message || 'Failed to fetch tasks');
      }
    } catch (err) {
      if (!isSilent) setError('Network error. Backend seems offline.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    
    const endpoint = authView === 'login' ? 'login' : 'register';
    const payload = authView === 'login' 
      ? { email: authEmail, password: authPassword }
      : { username: authUsername, email: authEmail, password: authPassword };
      
    try {
      const res = await fetch(`${API_BASE}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        setToken(data.token);
        setUsername(data.username);
        setSuccessMsg(authView === 'login' ? 'Welcome back!' : 'Account registered successfully!');
        
        // Clean inputs
        setAuthEmail('');
        setAuthPassword('');
        setAuthUsername('');
      } else {
        setError(data.message || 'Authentication failed');
      }
    } catch (err) {
      setError('Connection to auth server failed.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken('');
    setUsername('');
    setTasks([]);
    setActiveTask(null);
    setAuthView('landing');
    stopPolling();
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!newTitle.trim() || !newInput.trim()) {
      setError('Please provide both task title and input text.');
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle,
          inputText: newInput,
          operationType: newOperation
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        setTasks(prev => [data, ...prev]);
        setNewTitle('');
        setNewInput('');
        setSuccessMsg('Task submitted to background worker!');
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setError(data.message || 'Failed to create task');
      }
    } catch (err) {
      setError('Could not reach backend API server.');
    }
  };

  // Compute Stats
  const totalTasks = tasks.length;
  const successTasks = tasks.filter(t => t.status === 'success').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'running').length;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <span>⚡</span> TaskProcessor.AI
        </div>
        <div className="user-nav">
          {isAuthenticated ? (
            <>
              <span className="username-display">Hello, <strong>{username}</strong></span>
              <button onClick={handleLogout} className="btn btn-outline">Log Out</button>
            </>
          ) : (
            <>
              {authView === 'landing' ? (
                <>
                  <button onClick={() => setAuthView('login')} className="btn btn-secondary">Log In</button>
                  <button onClick={() => setAuthView('register')} className="btn btn-primary">Sign Up</button>
                </>
              ) : (
                <button onClick={() => setAuthView('landing')} className="btn btn-secondary">Back Home</button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Landing View (Not Logged In) */}
      {!isAuthenticated && authView === 'landing' && (
        <section className="landing-hero animate-fade-in">
          <span className="hero-tag">AI-Powered Worker Queue</span>
          <h1>Asynchronous Text processing platform</h1>
          <p>
            An enterprise-ready MERN platform that processes complex string mutations 
            asynchronously using an optimized Python background worker queue.
          </p>
          <div className="cta-group">
            <button onClick={() => setAuthView('register')} className="btn btn-primary">Get Started Free</button>
            <button onClick={() => setAuthView('login')} className="btn btn-secondary">Access Console</button>
          </div>
          
          <div className="features-grid">
            <div className="feature-card glass-panel-glow">
              <span className="feature-icon">⛓️</span>
              <h3>Redis-backed Queue</h3>
              <p>Reliable and low-latency message streaming between node backend and worker processes.</p>
            </div>
            <div className="feature-card glass-panel-glow">
              <span className="feature-icon">🐍</span>
              <h3>Python Workers</h3>
              <p>High performance task consumer written in Python. Perfect for running compute-heavy workloads.</p>
            </div>
            <div className="feature-card glass-panel-glow">
              <span className="feature-icon">📊</span>
              <h3>Live Monitoring</h3>
              <p>Observe task lifecycle states, terminal outputs, and execution analytics in real time.</p>
            </div>
          </div>
        </section>
      )}

      {/* Login & Register Forms */}
      {!isAuthenticated && authView !== 'landing' && (
        <section className="auth-container">
          <div className="auth-card glass-panel">
            <div className="auth-header-text">
              <h2>{authView === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
              <p>{authView === 'login' ? 'Enter credentials to manage your tasks' : 'Sign up to get access to AI task processing'}</p>
            </div>

            {error && <div className="alert-banner alert-error">⚠️ {error}</div>}
            {successMsg && <div className="alert-banner alert-success">✓ {successMsg}</div>}

            <form onSubmit={handleAuthSubmit}>
              {authView === 'register' && (
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={authUsername} 
                    onChange={e => setAuthUsername(e.target.value)} 
                    placeholder="Enter username" 
                    required 
                  />
                </div>
              )}
              
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)} 
                  placeholder="name@example.com" 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required 
                />
              </div>

              <button type="submit" className="btn btn-primary auth-submit-btn">
                {authView === 'login' ? 'Authenticate' : 'Register Profile'}
              </button>
            </form>

            <div className="auth-footer-text">
              {authView === 'login' ? (
                <>
                  New to platform? 
                  <a href="#" className="auth-link" onClick={(e) => { e.preventDefault(); setAuthView('register'); setError(''); }}>Create account</a>
                </>
              ) : (
                <>
                  Already have an account? 
                  <a href="#" className="auth-link" onClick={(e) => { e.preventDefault(); setAuthView('login'); setError(''); }}>Sign In</a>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Main Authenticated Dashboard */}
      {isAuthenticated && (
        <main className="dashboard-container">
          {error && <div className="alert-banner alert-error">⚠️ {error} <button onClick={() => setError('')} style={{marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer'}}>×</button></div>}
          {successMsg && <div className="alert-banner alert-success">✓ {successMsg}</div>}

          {/* Stats Bar */}
          <section className="stats-row">
            <div className="stat-card glass-panel">
              <div className="stat-info">
                <h3>Total Submissions</h3>
                <div className="stat-number">{totalTasks}</div>
              </div>
              <div className="stat-icon icon-all">📝</div>
            </div>
            
            <div className="stat-card glass-panel">
              <div className="stat-info">
                <h3>Successful</h3>
                <div className="stat-number">{successTasks}</div>
              </div>
              <div className="stat-icon icon-success">✓</div>
            </div>

            <div className="stat-card glass-panel">
              <div className="stat-info">
                <h3>Failed Tasks</h3>
                <div className="stat-number">{failedTasks}</div>
              </div>
              <div className="stat-icon icon-failed">🗙</div>
            </div>

            <div className="stat-card glass-panel">
              <div className="stat-info">
                <h3>Active Queue</h3>
                <div className="stat-number">{pendingTasks}</div>
              </div>
              <div className="stat-icon icon-pending">⏳</div>
            </div>
          </section>

          {/* Dashboard Body Split */}
          <div className="dashboard-grid">
            
            {/* Left: Task Form */}
            <section className="task-creator-panel glass-panel">
              <h2>Launch New AI Task</h2>
              <form onSubmit={handleCreateTask}>
                <div className="form-group">
                  <label className="form-label">Task Title</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newTitle} 
                    onChange={e => setNewTitle(e.target.value)} 
                    placeholder="e.g. Clean customer reviews list" 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Operation Type</label>
                  <select 
                    className="form-select" 
                    value={newOperation} 
                    onChange={e => setNewOperation(e.target.value)}
                  >
                    <option value="uppercase">Convert to Uppercase</option>
                    <option value="lowercase">Convert to Lowercase</option>
                    <option value="reverse">Reverse String</option>
                    <option value="word_count">Compute Word Count</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Input Text Payload</label>
                  <textarea 
                    className="form-textarea" 
                    value={newInput} 
                    onChange={e => setNewInput(e.target.value)} 
                    placeholder="Enter string values here..." 
                    required 
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{width: '100%', marginTop: '1rem'}}>
                  🚀 Dispatch Process Job
                </button>
              </form>
            </section>

            {/* Right: Task Board */}
            <section className="tasks-board-panel glass-panel">
              <div className="board-header">
                <h2>Task Board Console</h2>
                <div className="board-actions">
                  {pendingTasks > 0 && <span className="badge badge-running"><span className="spinner-icon"></span> Worker processing active</span>}
                  <button onClick={() => fetchTasks()} className="btn btn-secondary btn-outline" disabled={loading}>
                    {loading ? 'Refreshing...' : '🔄 Sync Board'}
                  </button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📥</div>
                  <h3>No tasks found</h3>
                  <p>Submit a task from the side panel to start processing data.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Operation</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Runtime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map(task => (
                        <tr key={task._id} onClick={() => setActiveTask(task)}>
                          <td><strong>{task.title}</strong></td>
                          <td style={{fontFamily: 'var(--font-mono)', fontSize: '0.85rem'}}>{task.operationType}</td>
                          <td>
                            <span className={`badge badge-${task.status}`}>
                              {(task.status === 'pending' || task.status === 'running') && <span className="spinner-icon"></span>}
                              {task.status}
                            </span>
                          </td>
                          <td style={{color: 'var(--text-secondary)'}}>
                            {new Date(task.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                          </td>
                          <td style={{fontWeight: '600'}}>
                            {task.status === 'success' || task.status === 'failed' ? `${task.executionTimeMs} ms` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        </main>
      )}

      {/* Task Details Modal */}
      {activeTask && (
        <div className="modal-overlay" onClick={() => setActiveTask(null)}>
          <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-info">
                <h2>{activeTask.title}</h2>
                <div className="meta">
                  ID: {activeTask._id} | Created: {new Date(activeTask.createdAt).toLocaleString()}
                </div>
              </div>
              <button className="close-btn" onClick={() => setActiveTask(null)}>×</button>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <div className="detail-section-title">Execution Status</div>
                <div>
                  <span className={`badge badge-${activeTask.status}`}>
                    {(activeTask.status === 'pending' || activeTask.status === 'running') && <span className="spinner-icon"></span>}
                    {activeTask.status}
                  </span>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Input Text Payload</div>
                <div className="detail-content-box">
                  {activeTask.inputText}
                </div>
              </div>

              {activeTask.status === 'success' && (
                <div className="detail-section">
                  <div className="detail-section-title">Processed Output Result</div>
                  <div className="detail-content-box" style={{borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.03)'}}>
                    {activeTask.result}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <div className="detail-section-title">Execution Terminal Logs</div>
                <div className="terminal-logs">
                  {activeTask.logs && activeTask.logs.map((log, index) => {
                    let logClass = 'log-system';
                    if (log.startsWith('[Worker]')) logClass = 'log-worker';
                    if (log.startsWith('[Error]') || log.startsWith('[System] Failed') || log.includes('failed')) logClass = 'log-error';
                    
                    return (
                      <div key={index} className={`log-entry ${logClass}`}>
                        {log}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Performance Metrics</div>
                <div className="meta-grid">
                  <div className="meta-item">
                    <div className="label">Operation</div>
                    <div className="val" style={{color: 'var(--color-secondary)'}}>{activeTask.operationType}</div>
                  </div>
                  <div className="meta-item">
                    <div className="label">Execution Duration</div>
                    <div className="val">{activeTask.status === 'success' || activeTask.status === 'failed' ? `${activeTask.executionTimeMs} ms` : 'In Queue'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="label">Payload Size</div>
                    <div className="val">{activeTask.inputText.length} chars</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem'}}>
              <button className="btn btn-secondary" onClick={() => setActiveTask(null)}>Close Console</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
