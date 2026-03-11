import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Activity, Clock, AlertTriangle, CheckCircle2, Flame, LayoutDashboard, Server, ShieldCheck, XCircle, AlertCircle, Image as ImageIcon, Check, X } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [agents, setAgents] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [watchdogChecks, setWatchdogChecks] = useState([])
  const [pendingImages, setPendingImages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Fetch initial state
    const fetchData = async () => {
      // Fetch agents
      const { data: agentData, error: agentError } = await supabase
        .from('erd_agent_health')
        .select('*')
        .order('agent_id')
      
      if (agentError) console.error('Error fetching agents:', agentError)
      else setAgents(agentData)
      
      // Fetch latest metrics
      const { data: metricData, error: metricError } = await supabase
        .from('erd_daily_metrics')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .single()

      if (metricError && metricError.code !== 'PGRST116') {
        console.error('Error fetching metrics:', metricError)
      } else {
        setMetrics(metricData)
      }

      // Fetch watchdog status
      const { data: watchdogData, error: watchdogError } = await supabase
        .from('erd_watchdog_status')
        .select('*')
        .order('id')
      
      if (watchdogError) console.error('Error fetching watchdog:', watchdogError)
      else setWatchdogChecks(watchdogData)

      // Fetch pending images
      const { data: imageData, error: imageError } = await supabase
        .from('erd_image_triage')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      
      if (imageError) console.error('Error fetching images:', imageError)
      else setPendingImages(imageData)
      
      setLoading(false)
    }

    fetchData()

    // 2. Subscribe to realtime changes for agents
    const channel = supabase
      .channel('erd_agent_health_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erd_agent_health' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setAgents(currentAgents => 
              currentAgents.map(agent => 
                agent.id === payload.new.id ? payload.new : agent
              )
            )
          }
        }
      )
      .subscribe()

    // Subscribe to realtime changes for metrics
    const metricsChannel = supabase
      .channel('erd_daily_metrics_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erd_daily_metrics' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setMetrics(payload.new)
          }
        }
      )
      .subscribe()

    // Subscribe to realtime changes for watchdog
    const watchdogChannel = supabase
      .channel('erd_watchdog_status_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erd_watchdog_status' },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setWatchdogChecks(current => {
              const exists = current.find(c => c.id === payload.new.id);
              if (exists) {
                return current.map(check => check.id === payload.new.id ? payload.new : check);
              } else {
                return [...current, payload.new].sort((a, b) => a.id.localeCompare(b.id));
              }
            })
          }
        }
      )
      .subscribe()

    // Subscribe to realtime changes for pending images
    const imageChannel = supabase
      .channel('erd_image_triage_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erd_image_triage' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
            setPendingImages(current => [payload.new, ...current])
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.status === 'pending') {
              setPendingImages(current => {
                const exists = current.find(i => i.id === payload.new.id)
                return exists 
                  ? current.map(img => img.id === payload.new.id ? payload.new : img)
                  : [payload.new, ...current]
              })
            } else {
              setPendingImages(current => current.filter(img => img.id !== payload.new.id))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(metricsChannel)
      supabase.removeChannel(watchdogChannel)
      supabase.removeChannel(imageChannel)
    }
  }, [])

  const handleImageAction = async (id, action) => {
    try {
      // First update UI optimistically
      setPendingImages(current => current.filter(img => img.id !== id))
      
      // Then update database
      const { error } = await supabase
        .from('erd_image_triage')
        .update({ status: action, updated_at: new Date().toISOString() })
        .eq('id', id)
        
      if (error) {
        console.error('Error updating image status:', error)
        // If it fails, we should technically revert the optimistic update here, 
        // but the realtime listener usually catches it anyway.
      } else {
        // Status updated in DB. The backend cron will sweep it up and publish it.
      }
    } catch (err) {
      console.error(err)
    }
  }

  const getStatusColor = (status) => {
    switch(status) {
      case 'online': return 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
      case 'error': return 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse'
      case 'idle': return 'bg-gray-600'
      case 'sleeping': return 'bg-gray-600'
      case 'running': return 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse'
      case 'retrying': return 'bg-rchie-amber shadow-[0_0_15px_rgba(245,166,35,0.5)]'
      default: return 'bg-gray-600'
    }
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'online': return <Activity className="w-5 h-5 text-emerald-500" />
      case 'error': return <AlertTriangle className="w-5 h-5 text-red-500" />
      case 'idle': return <Clock className="w-5 h-5 text-gray-400" />
      case 'sleeping': return <Clock className="w-5 h-5 text-gray-400" />
      case 'running': return <Activity className="w-5 h-5 text-blue-500" />
      case 'retrying': return <Activity className="w-5 h-5 text-rchie-amber" />
      default: return null
    }
  }

  const formatLabel = (str) => {
    if (!str) return 'Unknown';
    return str.replace(/_/g, ' ');
  }

  // Determine overall watchdog health status
  const watchdogHasFail = watchdogChecks.some(c => c.status === 'fail');
  const watchdogHasWarn = watchdogChecks.some(c => c.status === 'warn');
  const systemStatusColor = watchdogHasFail ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 
                            watchdogHasWarn ? 'bg-rchie-amber shadow-[0_0_10px_rgba(245,166,35,0.6)]' : 
                            'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]';
  const systemStatusText = watchdogHasFail ? 'System Critical' : watchdogHasWarn ? 'System Warning' : 'System Nominal';

  return (
    <div className="min-h-screen bg-rchie-charcoal text-rchie-white font-sans">
      
      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-gray-900/80 sticky top-0 z-50 backdrop-blur-md px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center">
              <span className="w-2 h-2 rounded-full bg-rchie-amber mr-2"></span>
              Engine Room
            </h1>
            <div className="flex space-x-1">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('triage')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center ${activeTab === 'triage' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
              >
                Image Triage
                {pendingImages.length > 0 && (
                  <span className="ml-2 bg-rchie-amber text-rchie-charcoal px-2 py-0.5 rounded-full text-xs font-bold">
                    {pendingImages.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-3 bg-gray-900 px-4 py-2 rounded-full border border-gray-800">
            <div className={`w-2.5 h-2.5 rounded-full ${systemStatusColor}`}></div>
            <span className="text-sm font-medium text-gray-300">{systemStatusText}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rchie-amber"></div>
          </div>
        ) : (
          <>
            {/* --- DASHBOARD TAB --- */}
            {activeTab === 'dashboard' && (
              <div className="animate-in fade-in duration-300">
                {/* System Integrity Watchdog */}
                <div className="mb-14">
                  <div className="flex items-center space-x-3 mb-6">
                    <ShieldCheck className="w-6 h-6 text-blue-400" />
                    <h2 className="text-2xl font-bold tracking-tight">System Integrity Watchdog</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {watchdogChecks.map((check) => (
                      <div key={check.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 flex items-start space-x-4 transition-all hover:border-gray-700">
                        <div className="mt-1">
                          {check.status === 'pass' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                          {check.status === 'warn' && <AlertCircle className="w-6 h-6 text-rchie-amber" />}
                          {check.status === 'fail' && <XCircle className="w-6 h-6 text-red-500" />}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-200">{check.name}</h3>
                          <p className="text-sm text-gray-400 mt-1">{check.message}</p>
                          <p className="text-xs text-gray-600 mt-2 font-mono">
                            {new Date(check.last_checked_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Content Pipeline Metrics */}
                {metrics && (
                  <div className="mb-14">
                    <div className="flex items-center space-x-3 mb-6">
                      <LayoutDashboard className="w-6 h-6 text-rchie-amber" />
                      <h2 className="text-2xl font-bold tracking-tight">Content Pipeline</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700">
                        <p className="text-gray-400 text-sm font-semibold tracking-wider uppercase mb-2">Stories Evaluated</p>
                        <p className="text-4xl font-bold text-rchie-white">{metrics.total_stories_evaluated}</p>
                      </div>
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full -mr-4 -mt-4"></div>
                        <p className="text-gray-400 text-sm font-semibold tracking-wider uppercase mb-2">Stories Published</p>
                        <p className="text-4xl font-bold text-emerald-400">{metrics.total_stories_published}</p>
                      </div>
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-rchie-amber/10 rounded-bl-full -mr-4 -mt-4"></div>
                        <p className="text-gray-400 text-sm font-semibold tracking-wider uppercase mb-2">Avg Spicy Rating</p>
                        <div className="flex items-center space-x-2">
                          <p className="text-4xl font-bold text-rchie-amber">{metrics.avg_spicy_rating}</p>
                          <Flame className="w-8 h-8 text-rchie-amber opacity-80" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700">
                        <p className="text-gray-400 text-sm font-semibold tracking-wider uppercase mb-4">Top Failure Types</p>
                        <div className="space-y-3">
                          {metrics.top_failure_types?.map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-sm group">
                              <span className="text-gray-300 capitalize group-hover:text-white transition-colors">{formatLabel(item.type)}</span>
                              <span className="text-gray-400 bg-gray-800/80 px-2.5 py-1 rounded-md font-mono">{item.count}</span>
                            </div>
                          ))}
                          {(!metrics.top_failure_types || metrics.top_failure_types.length === 0) && (
                             <div className="text-gray-500 text-sm italic">No failure data yet</div>
                          )}
                        </div>
                      </div>
                      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700">
                        <p className="text-gray-400 text-sm font-semibold tracking-wider uppercase mb-4">Top Industries Hit</p>
                        <div className="space-y-3">
                          {metrics.top_sectors?.map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-sm group">
                              <span className="text-gray-300 capitalize group-hover:text-white transition-colors">{formatLabel(item.sector)}</span>
                              <span className="text-gray-400 bg-gray-800/80 px-2.5 py-1 rounded-md font-mono">{item.count}</span>
                            </div>
                          ))}
                          {(!metrics.top_sectors || metrics.top_sectors.length === 0) && (
                             <div className="text-gray-500 text-sm italic">No sector data yet</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Agent Grid */}
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <Server className="w-6 h-6 text-emerald-500" />
                    <h2 className="text-2xl font-bold tracking-tight">Agent Swarm Vitals</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map((agent) => (
                      <div 
                        key={agent.id} 
                        className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(agent.status)}`}></div>
                            <h2 className="text-xl font-semibold tracking-wide capitalize">{agent.agent_id}</h2>
                          </div>
                          {getStatusIcon(agent.status)}
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Current State</p>
                            <p className="text-lg capitalize font-medium text-gray-200">
                              {agent.status}
                            </p>
                          </div>

                          <div className="pt-4 border-t border-gray-800 flex justify-between items-center text-sm">
                            <span className="text-gray-500">Last Ping</span>
                            <span className="text-gray-300 font-mono text-xs">
                              {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : 'Never'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* --- IMAGE TRIAGE TAB --- */}
            {activeTab === 'triage' && (
              <div className="animate-in fade-in duration-300">
                <div className="flex items-center space-x-3 mb-8 border-b border-gray-800 pb-6">
                  <ImageIcon className="w-7 h-7 text-rchie-amber" />
                  <h2 className="text-3xl font-bold tracking-tight">Image Triage</h2>
                </div>

                {pendingImages.length === 0 ? (
                  <div className="bg-gray-900/30 border border-gray-800 border-dashed rounded-2xl p-16 text-center">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500/50 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-300 mb-2">Inbox Zero</h3>
                    <p className="text-gray-500">No images pending approval. The pipeline is clear.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {pendingImages.map((img) => (
                      <div key={img.id} className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden flex flex-col hover:border-gray-700 transition-all">
                        {/* Image Preview Window */}
                        <div className="relative aspect-video bg-gray-950 flex items-center justify-center overflow-hidden border-b border-gray-800">
                          <img 
                            src={`https://drive.google.com/thumbnail?id=${img.drive_file_id}&sz=w800`}
                            alt={img.story_slug}
                            className="w-full h-full object-cover absolute inset-0 opacity-90 hover:opacity-100 transition-opacity"
                            onError={(e) => {
                              // Fallback if thumbnail endpoint fails
                              e.target.onerror = null; 
                              e.target.src = `https://drive.google.com/uc?id=${img.drive_file_id}&export=view`;
                            }}
                          />
                          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-md text-xs font-mono font-bold text-white z-10">
                            {img.story_slug}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="p-5 flex-1 flex flex-col">
                          <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">{img.story_headline}</h3>
                          <p className="text-sm text-gray-400 mb-6 flex-1 italic border-l-2 border-gray-700 pl-3">"{img.image_prompt}"</p>
                          
                          {/* Actions */}
                          <div className="flex space-x-3 pt-4 border-t border-gray-800 mt-auto">
                            <button 
                              onClick={() => handleImageAction(img.id, 'rejected')}
                              className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors"
                            >
                              <X className="w-4 h-4" />
                              <span>Reject</span>
                            </button>
                            <button 
                              onClick={() => handleImageAction(img.id, 'approved')}
                              className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium transition-colors border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                            >
                              <Check className="w-4 h-4" />
                              <span>Approve</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
