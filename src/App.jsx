import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Activity, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

function App() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Fetch initial state
    const fetchAgents = async () => {
      const { data, error } = await supabase
        .from('erd_agent_health')
        .select('*')
        .order('agent_id')
      
      if (error) console.error('Error fetching agents:', error)
      else setAgents(data)
      
      setLoading(false)
    }

    fetchAgents()

    // 2. Subscribe to realtime changes
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const getStatusColor = (status) => {
    switch(status) {
      case 'online': return 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
      case 'error': return 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse'
      case 'idle': return 'bg-gray-600'
      case 'retrying': return 'bg-rchie-amber shadow-[0_0_15px_rgba(245,166,35,0.5)]'
      default: return 'bg-gray-600'
    }
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'online': return <Activity className="w-5 h-5 text-emerald-500" />
      case 'error': return <AlertTriangle className="w-5 h-5 text-red-500" />
      case 'idle': return <Clock className="w-5 h-5 text-gray-400" />
      case 'retrying': return <Activity className="w-5 h-5 text-rchie-amber" />
      default: return null
    }
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

        {/* Agent Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rchie-amber"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <div 
                key={agent.id} 
                className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    {/* Status Indicator Dot */}
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(agent.status)}`}></div>
                    <h2 className="text-xl font-semibold tracking-wide">{agent.agent_id}</h2>
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
                    <span className="text-gray-500">Last Heartbeat</span>
                    <span className="text-gray-300 font-mono">
                      {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

export default App
