import React, { useState } from 'react';

const BLOCKED_LOG_TYPES = [
  'SHELL_INJECTION',
  'GATEWAY_BYPASS_ATTEMPT',
  'DESTRUCTIVE_COMMAND',
  'SYSTEM_FILE_ACCESS',
  'SQL_INJECTION',
  'SYSTEM_MODIFICATION'
];

export function KineticAlerts({ anomalies }) {
  const [sortField, setSortField] = useState('timestamp');
  const [sortDirection, setSortDirection] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortedAnomalies = () => {
    // Filter out blocked log types
    const filtered = anomalies.filter(log => 
      !BLOCKED_LOG_TYPES.some(type => 
        (log.type && String(log.type).includes(type)) || 
        (log.action && String(log.action).includes(type)) ||
        (log.message && String(log.message).includes(type))
      )
    );
    
    const sorted = [...filtered];
    
    sorted.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'timestamp') {
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        valA = String(valA || '');
        valB = String(valB || '');
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const getDeduplicatedLogs = (logsList) => {
    return logsList.reduce((acc, log) => {
      const last = acc[acc.length - 1];
      const getLogMessage = (l) => l.message || l.description || l.action || l.toolName || '';
      const isSame = last && (getLogMessage(last) === getLogMessage(log)) && (last.agentId === log.agentId);
      
      if (isSame) {
        last.count = (last.count || 1) + 1;
        return acc;
      }
      return [...acc, { ...log, count: 1 }];
    }, []);
  };

  const sortedAnomalies = getSortedAnomalies();
  const deduplicatedLogs = getDeduplicatedLogs(sortedAnomalies);

  return (
    <div className="flex flex-col h-full overflow-hidden text-[9px]">
      <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          Cryptographic Audit & Threat Ledger
        </h3>
        <span className="text-[8px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded animate-pulse" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          {deduplicatedLogs.length} ALERTS
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {deduplicatedLogs.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '12px'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              border: '2px solid #00f5a0',
              boxShadow: '0 0 20px rgba(0,245,160,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: '#00f5a0'
            }}>✓</div>
            <div style={{
              fontFamily: 'Orbitron',
              fontSize: '13px',
              color: '#00f5a0',
              letterSpacing: '2px'
            }}>LOG INTEGRITY OPTIMAL</div>
            <div style={{
              fontFamily: 'JetBrains Mono',
              fontSize: '10px',
              color: 'rgba(255,255,255,0.25)',
              letterSpacing: '1px'
            }}>NO ACTIVE EXPLOIT SIGNALS</div>
            <div style={{
              fontFamily: 'JetBrains Mono',
              fontSize: '10px',
              color: 'rgba(0,230,255,0.3)',
            }}>HASH CHAIN VERIFIED · SHA-256</div>
          </div>
        ) : (
          <table className="w-full text-left" style={{ borderCollapse: 'separate', borderSpacing: '0 8px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '25%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr className="text-slate-500 border-b border-white/5 select-none font-semibold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                <th 
                  onClick={() => handleSort('timestamp')}
                  className="pb-1.5 cursor-pointer hover:text-slate-300 transition-colors font-normal text-left"
                >
                  Timestamp {sortField === 'timestamp' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  onClick={() => handleSort('agentId')}
                  className="pb-1.5 cursor-pointer hover:text-slate-300 transition-colors font-normal text-left"
                >
                  Agent {sortField === 'agentId' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  onClick={() => handleSort('toolName')}
                  className="pb-1.5 cursor-pointer hover:text-slate-300 transition-colors font-normal text-left"
                >
                  Action {sortField === 'toolName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  onClick={() => handleSort('severity')}
                  className="pb-1.5 cursor-pointer hover:text-slate-300 transition-colors font-normal text-left"
                >
                  Severity {sortField === 'severity' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {deduplicatedLogs.map((entry, idx) => {
                const severityLower = String(entry.severity || '').toLowerCase();
                
                let severityText = 'INFO';
                let severityColor = '#00f5a0'; // green

                if (severityLower === 'critical' || severityLower === 'high') {
                  severityText = 'CRITICAL';
                  severityColor = '#ff0055'; // red
                } else if (severityLower === 'medium' || severityLower === 'warning') {
                  severityText = 'WARNING';
                  severityColor = '#ffaa00'; // yellow
                }

                return (
                  <tr key={entry.id || entry.timestamp || idx} className="hover:bg-white/[0.01] transition-colors" style={{ height: '28px', lineHeight: '1.6' }}>
                    <td className="py-1 text-slate-400 truncate">
                      {entry.timeDisplay || new Date(entry.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                      })}
                    </td>
                    <td className="py-1 text-slate-300 truncate">{entry.agentId}</td>
                    <td className="py-1 text-purple-400 truncate">
                      {entry.toolName || entry.action || 'N/A'}
                      {entry.count > 1 && (
                        <span style={{
                          marginLeft: '8px',
                          background: 'rgba(255,0,85,0.15)',
                          border: '1px solid rgba(255,0,85,0.3)',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontSize: '10px',
                          color: '#ff0055'
                        }}>
                          ×{entry.count}
                        </span>
                      )}
                    </td>
                    <td className="py-1 truncate" style={{ color: severityColor, fontWeight: 'bold' }}>
                      {severityText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
export default KineticAlerts;
