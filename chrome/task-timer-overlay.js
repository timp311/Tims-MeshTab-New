(() => {
  'use strict';
  if (globalThis.__meshtabTaskTimerOverlayLoaded) return;
  globalThis.__meshtabTaskTimerOverlayLoaded = true;
  const STORAGE_KEY='meshtabState', HOST_ID='meshtab-task-timer-overlay-host';
  let currentState=null,timer=null,host=null,surface=null,readout=null,taskLabel=null,stopAction=null,drag=null;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function duration(totalSeconds){const seconds=Math.max(0,Math.floor(Number(totalSeconds)||0)),h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;return h?`${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`:`${m}m ${String(s).padStart(2,'0')}s`;}
  function elapsedSeconds(timerState){const startAt=Date.parse(timerState?.runningSince||'');if(!Number.isFinite(startAt))return 0;return Math.max(0,Math.floor((Date.now()-startAt)/1000));}
  function linkedTaskTitle(state,taskId){const task=(Array.isArray(state?.tasks)?state.tasks:[]).find(item=>String(item?.id||'')===String(taskId||''));return task?.title?String(task.title):'';}
  function ensureHost(){
    if(host?.isConnected)return;
    host=document.getElementById(HOST_ID)||document.createElement('div');host.id=HOST_ID;host.style.cssText='all:initial;position:fixed;z-index:2147483647;pointer-events:auto;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    const shadow=host.shadowRoot||host.attachShadow({mode:'open'});shadow.replaceChildren();
    surface=document.createElement('div');surface.style.cssText='all:initial;box-sizing:border-box;display:flex;align-items:center;gap:9px;padding:6px 7px 6px 12px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(110,73,255,.96);color:#fff;box-shadow:0 8px 26px rgba(46,24,110,.32);font:800 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em;white-space:nowrap;backdrop-filter:blur(8px);cursor:grab;user-select:none;touch-action:none;';
    const copy=document.createElement('span');copy.style.cssText='all:initial;display:flex;flex-direction:column;gap:1px;pointer-events:none;';
    readout=document.createElement('span');readout.style.cssText='all:initial;color:#fff;font:800 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;';
    taskLabel=document.createElement('span');taskLabel.style.cssText='all:initial;color:rgba(255,255,255,.86);font:700 9px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    copy.append(readout,taskLabel);
    stopAction=document.createElement('button');stopAction.type='button';stopAction.textContent='Stop';stopAction.title='Stop the Task Timer and log time';stopAction.style.cssText='all:initial;box-sizing:border-box;border-radius:999px;padding:6px 9px;background:#fff;color:#5233c9;font:900 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;';
    stopAction.addEventListener('pointerdown',e=>e.stopPropagation());
    stopAction.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();stopAction.style.opacity='.6';stopAction.textContent='Stopping…';try{await chrome.runtime.sendMessage({type:'meshtab-stop-task-timer'});}catch{}finally{stopAction.style.opacity='1';stopAction.textContent='Stop';}});
    surface.append(copy,stopAction);shadow.append(surface);
    surface.addEventListener('pointerdown',event=>{if(event.target===stopAction)return;event.preventDefault();event.stopPropagation();const rect=host.getBoundingClientRect();host.style.transform='';host.style.right='';host.style.bottom='';host.style.left=`${rect.left}px`;host.style.top=`${rect.top}px`;drag={id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top,startX:event.clientX,startY:event.clientY,moved:false};surface.setPointerCapture?.(event.pointerId);surface.style.cursor='grabbing';});
    surface.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>3)drag.moved=true;if(!drag.moved)return;const maxX=Math.max(0,innerWidth-host.offsetWidth),maxY=Math.max(0,innerHeight-host.offsetHeight);host.style.left=`${clamp(event.clientX-drag.dx,0,maxX)}px`;host.style.top=`${clamp(event.clientY-drag.dy,0,maxY)}px`;});
    const finish=async event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const moved=drag.moved;drag=null;surface.style.cursor='grab';if(moved){const rect=host.getBoundingClientRect(),maxX=Math.max(1,innerWidth-rect.width),maxY=Math.max(1,innerHeight-rect.height),xRatio=clamp(rect.left/maxX,0,1),yRatio=clamp(rect.top/maxY,0,1);currentState.settings ||= {};currentState.settings.taskTimerOverlayPosition='free';currentState.settings.taskTimerOverlayXRatio=xRatio;currentState.settings.taskTimerOverlayYRatio=yRatio;try{await chrome.runtime.sendMessage({type:'meshtab-task-timer-overlay-position',xRatio,yRatio});}catch{}}applyPosition();};
    surface.addEventListener('pointerup',finish);surface.addEventListener('pointercancel',finish);
    (document.documentElement||document.body).append(host);
  }
  function applyPosition(){if(!host||drag)return;host.style.top='';host.style.right='';host.style.bottom='';host.style.left='';host.style.transform='';const settings=currentState?.settings||{},position=['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes(settings.taskTimerOverlayPosition)?settings.taskTimerOverlayPosition:'top-center';if(position==='free'){const maxX=Math.max(0,innerWidth-host.offsetWidth),maxY=Math.max(0,innerHeight-host.offsetHeight),xr=clamp(Number(settings.taskTimerOverlayXRatio)||0,0,1),yr=clamp(Number(settings.taskTimerOverlayYRatio)||0,0,1);host.style.left=`${xr*maxX}px`;host.style.top=`${yr*maxY}px`;return;}const gap='14px';if(position.startsWith('top-'))host.style.top=gap;else host.style.bottom=gap;if(position.endsWith('-left'))host.style.left=gap;else if(position.endsWith('-right'))host.style.right=gap;else{host.style.left='50%';host.style.transform='translateX(-50%)';}}
  function removeHost(){host?.remove();host=null;surface=null;readout=null;taskLabel=null;stopAction=null;drag=null;}
  function render(){
    const settings=currentState?.settings||{},taskTimer=currentState?.taskTimer||{},running=Boolean(taskTimer.taskId&&taskTimer.runningSince);
    if(!settings.taskTimerOverlayEnabled||!running){removeHost();if(timer){clearInterval(timer);timer=null;}return;}
    ensureHost();
    const seconds=elapsedSeconds(taskTimer),title=linkedTaskTitle(currentState,taskTimer.taskId)||'Linked task';
    if(readout)readout.textContent=`⏱ ${duration(seconds)}`;
    if(taskLabel)taskLabel.textContent=title;
    surface?.setAttribute('aria-label',`Task Timer running ${duration(seconds)} for ${title}. Drag to move.`);
    if(surface)surface.title='Click and hold to drag the timer anywhere on the page.';
    applyPosition();
    if(!timer)timer=setInterval(render,1000);
  }
  chrome.storage.local.get(STORAGE_KEY).then(data=>{currentState=data?.[STORAGE_KEY]||null;render();});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!changes[STORAGE_KEY])return;currentState=changes[STORAGE_KEY].newValue||null;render();});
  addEventListener('resize',applyPosition,{passive:true});
})();
