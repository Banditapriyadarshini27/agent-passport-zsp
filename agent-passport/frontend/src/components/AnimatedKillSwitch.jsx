import React, { useState } from 'react';

export function AnimatedKillSwitch({ systemStatus, onTrigger, onReset }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handlePressDown = () => {
    if (!isUnlocked || systemStatus === 'EMERGENCY_SHUTDOWN') return;
    setIsPressed(true);
  };

  const handlePressUp = async () => {
    if (!isPressed) return;
    setIsPressed(false);
    
    // Trigger the master API
    if (onTrigger) {
      await onTrigger();
    }
  };

  const handleUnlockToggle = () => {
    if (systemStatus === 'EMERGENCY_SHUTDOWN') return;
    setIsUnlocked(!isUnlocked);
  };

  const isShutdown = systemStatus === 'EMERGENCY_SHUTDOWN';

  return (
    <div className="flex flex-col items-center justify-center h-full p-2 font-mono-custom">
      <div className="text-center mb-3">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
          Master Revocation Terminal
        </h3>
        <p className="text-[8px] text-slate-500">
          {isShutdown 
            ? 'ALL EPOCH CREDENTIALS REVOKED' 
            : isUnlocked 
              ? 'WARNING: SYSTEM ARMED FOR SHUTDOWN' 
              : 'SAFETY SHIELD ENGAGED'
          }
        </p>
      </div>

      {/* Outer Console Case */}
      <div className="relative w-36 h-40 bg-slate-950/60 border border-slate-800 rounded-lg flex flex-col items-center justify-center p-3 shadow-2xl overflow-hidden">
        {/* Warning Stripes Background */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-black to-amber-500 opacity-40"></div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-500 via-black to-amber-500 opacity-40"></div>

        {/* The physical button container */}
        <div className="relative w-20 h-20 flex items-center justify-center rounded-full bg-slate-900 border border-white/5 shadow-inner">
          
          {/* Radial Glowing Ring behind the button */}
          <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
            isShutdown 
              ? 'bg-rose-500/10 shadow-[0_0_15px_rgba(255,59,105,0.15)] animate-pulse'
              : isUnlocked 
                ? 'bg-amber-500/5 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                : 'bg-transparent'
          }`}></div>

          {/* Glowing mechanical button */}
          <button
            onMouseDown={handlePressDown}
            onMouseUp={handlePressUp}
            onMouseLeave={() => setIsPressed(false)}
            disabled={!isUnlocked || isShutdown}
            className={`
              relative w-16 h-16 rounded-full flex flex-col items-center justify-center font-bold tracking-wider text-[9px]
              transition-all duration-150 border-2 outline-none select-none
              ${isShutdown 
                ? 'bg-rose-950/30 border-rose-500/20 text-rose-500/30 cursor-not-allowed shadow-none'
                : !isUnlocked 
                  ? 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed'
                  : isPressed
                    ? 'bg-rose-700 border-rose-900 text-white scale-95 shadow-[0_0_8px_rgba(244,63,94,0.35)]'
                    : 'bg-rose-600 hover:bg-rose-500 border-rose-850 text-white cursor-pointer shadow-[0_0_18px_rgba(244,63,94,0.5)] animate-pulse'
              }
            `}
            style={{
              transform: isPressed ? 'translateY(2px) scale(0.95)' : 'translateY(0) scale(1)',
              boxShadow: isUnlocked && !isShutdown && !isPressed
                ? '0 4px 0 #991b1b, 0 8px 15px rgba(244,63,94,0.3)' 
                : isPressed 
                  ? '0 1px 0 #991b1b, 0 1px 3px rgba(0,0,0,0.5)'
                  : 'none'
            }}
          >
            <span>{isShutdown ? 'DEAD' : 'KILL'}</span>
            <span className="text-[7px] opacity-75 mt-0.5">{isShutdown ? 'OFFLINE' : 'SWITCH'}</span>
          </button>

          {/* Slidable Safety Cover */}
          <div
            onClick={handleUnlockToggle}
            className={`
              absolute inset-0 rounded-full cursor-pointer flex items-center justify-center
              border border-white/5 backdrop-filter backdrop-blur-sm
              transition-all duration-500 select-none
              ${isUnlocked || isShutdown
                ? 'opacity-0 pointer-events-none scale-150 rotate-90'
                : 'opacity-100 bg-cyan-500/5 border-cyan-400/20 shadow-[inset_0_0_10px_rgba(6,182,212,0.18)] hover:bg-cyan-500/15'
              }
            `}
          >
            <div className="text-center text-[8px] text-cyan-300 font-bold px-2">
              <span className="block text-sm">🔒</span>
              SLIDE
            </div>
          </div>
        </div>

        {/* Lock / Unlock Toggle underneath */}
        {!isShutdown && (
          <button
            onClick={handleUnlockToggle}
            className={`mt-3 px-2 py-0.5 text-[8px] rounded font-bold border transition-colors font-display-custom ${
              isUnlocked 
                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-slate-900'
                : 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/15'
            }`}
          >
            {isUnlocked ? 'CLOSE COVER' : 'RELEASE SHIELD'}
          </button>
        )}
      </div>

      {/* Recovery/Reset Command for demo usability */}
      {isShutdown && (
        <button
          onClick={async () => {
            setIsUnlocked(false);
            if (onReset) await onReset();
          }}
          className="mt-3 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 rounded text-emerald-400 text-[10px] font-bold transition-all duration-300 uppercase tracking-wider cursor-pointer font-display-custom"
        >
          RE-ARM & RESET
        </button>
      )}
    </div>
  );
}
export default AnimatedKillSwitch;
