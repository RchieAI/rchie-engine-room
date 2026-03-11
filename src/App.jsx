import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Activity, Clock, AlertTriangle, CheckCircle2, Flame, LayoutDashboard, Server } from 'lucide-react'

function App() {
  const [agents, setAgents] = useState([])
  const [metrics, setMetrics] = useState(null)
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
          console.log('Realtime change received!', payload)
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

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(metricsChannel)
    }
  }, [])

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

  return (
    <div className="min-h-screen bg-rchie-charcoal text-rchie-white p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <header className="mb-12 border-b border-gray-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Engine Room</h1>
            <p className="text-gray-400 mt-2">ARIA Live Orchestration Dashboard</p>
          </div>
          <div className="flex items-center space-x-3 bg-gray-900/50 px-4 py-2 rounded-full border border-gray-800">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"></div>
            <span className="text-sm font-medium text-gray-300">System Nominal</span>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rchie-amber"></div>
          </div>
        ) : (
          <>
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
            <div className="mb-6">
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
          </>
        )}

      </div>
    </div>
  )
}

export default App