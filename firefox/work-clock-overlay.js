(() => {
  'use strict';
  if (globalThis.__meshtabWorkClockOverlayLoaded) return;
  globalThis.__meshtabWorkClockOverlayLoaded = true;
  // Firefox: alias chrome -> browser (see app.js for the full explanation). No-op in Chrome.
  if (typeof browser !== 'undefined') { globalThis.chrome = browser; }
  const STORAGE_KEY='meshtabState', HOST_ID='meshtab-work-clock-overlay-host';
  let currentState=null,timer=null,host=null,surface=null,readout=null,taskLabel=null,pauseAction=null,stopAction=null,minimizeAction=null,drag=null;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function duration(totalSeconds){const seconds=Math.max(0,Math.floor(Number(totalSeconds)||0)),h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;return h?`${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`:`${m}m ${String(s).padStart(2,'0')}s`;}
  function elapsedSeconds(clock){const startAt=Date.parse(clock?.runningSince||'');if(!Number.isFinite(startAt))return 0;const pausedAt=clock?.pausedAt&&Number.isFinite(Date.parse(clock.pausedAt))?Date.parse(clock.pausedAt):0,endMs=pausedAt||Date.now(),pausedSeconds=Math.max(0,Number(clock?.pausedSeconds)||0);return Math.max(0,Math.floor((endMs-startAt)/1000-pausedSeconds));}
  function linkedTaskTitle(state,taskId){if(!taskId)return'';const task=(Array.isArray(state?.tasks)?state.tasks:[]).find(item=>String(item?.id||'')===String(taskId||''));return task?.title?String(task.title):'';}
  function edgeSide(){const settings=currentState?.settings||{},position=settings.workClockOverlayPosition;if(position==='free')return (Number(settings.workClockOverlayXRatio)??0.5)<0.5?'left':'right';return position&&position.endsWith('-left')?'left':'right';}
  function isMinimized(){return Boolean(currentState?.settings?.workClockOverlayMinimized);}
  async function setMinimized(minimized){currentState.settings ||= {};currentState.settings.workClockOverlayMinimized=minimized;render();try{await chrome.runtime.sendMessage({type:'meshtab-work-clock-overlay-minimized',minimized});}catch{}}
  function ensureHost(){
    if(host?.isConnected)return;
    host=document.getElementById(HOST_ID)||document.createElement('div');host.id=HOST_ID;host.style.cssText='all:initial;position:fixed;z-index:2147483647;pointer-events:auto;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    const shadow=host.shadowRoot||host.attachShadow({mode:'open'});shadow.replaceChildren();
    surface=document.createElement('div');surface.style.cssText='all:initial;box-sizing:border-box;display:flex;align-items:center;gap:7px;padding:5px 6px 5px 11px;border:1px solid rgba(64,51,93,.22);border-radius:999px;background:rgba(30,27,39,.92);color:#fff;box-shadow:0 8px 26px rgba(18,12,28,.24);font:800 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em;white-space:nowrap;backdrop-filter:blur(8px);cursor:grab;user-select:none;touch-action:none;';
    const copy=document.createElement('span');copy.style.cssText='all:initial;display:flex;flex-direction:column;gap:1px;pointer-events:none;';
    readout=document.createElement('span');readout.style.cssText='all:initial;color:#fff;font:800 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;';
    taskLabel=document.createElement('span');taskLabel.style.cssText='all:initial;display:none;color:rgba(255,255,255,.86);font:700 9px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    copy.append(readout,taskLabel);
    pauseAction=document.createElement('button');pauseAction.type='button';pauseAction.style.cssText='all:initial;box-sizing:border-box;border-radius:999px;padding:6px 9px;background:#ffd36b;color:#493710;font:900 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;';
    stopAction=document.createElement('button');stopAction.type='button';stopAction.textContent='Stop';stopAction.title='Stop the timer and log time';stopAction.style.cssText='all:initial;box-sizing:border-box;border-radius:999px;padding:6px 9px;background:#ff8a8a;color:#441919;font:900 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;';
    minimizeAction=document.createElement('button');minimizeAction.type='button';minimizeAction.textContent='–';minimizeAction.title='Minimize';minimizeAction.setAttribute('aria-label','Minimize the Work Clock overlay');minimizeAction.style.cssText='all:initial;box-sizing:border-box;border-radius:999px;padding:6px 8px;background:rgba(255,255,255,.14);color:#fff;font:900 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;';
    for(const button of [pauseAction,stopAction,minimizeAction])button.addEventListener('pointerdown',e=>e.stopPropagation());
    pauseAction.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();pauseAction.style.opacity='.6';try{await chrome.runtime.sendMessage({type:currentState?.workClock?.pausedAt?'meshtab-resume-work-clock':'meshtab-pause-work-clock'});}catch{}finally{pauseAction.style.opacity='1';}});
    stopAction.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();stopAction.style.opacity='.6';try{await chrome.runtime.sendMessage({type:'meshtab-stop-work-clock'});}catch{}finally{stopAction.style.opacity='1';}});
    minimizeAction.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();await setMinimized(true);});
    surface.append(copy,pauseAction,stopAction,minimizeAction);shadow.append(surface);
    surface.addEventListener('pointerdown',event=>{if(event.target===pauseAction||event.target===stopAction||event.target===minimizeAction)return;event.preventDefault();event.stopPropagation();const rect=host.getBoundingClientRect();host.style.transform='';host.style.right='';host.style.bottom='';host.style.left=`${rect.left}px`;host.style.top=`${rect.top}px`;drag={id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top,startX:event.clientX,startY:event.clientY,moved:false};surface.setPointerCapture?.(event.pointerId);surface.style.cursor='grabbing';});
    surface.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>3)drag.moved=true;if(!drag.moved)return;const maxX=Math.max(0,innerWidth-host.offsetWidth),maxY=Math.max(0,innerHeight-host.offsetHeight);host.style.left=`${clamp(event.clientX-drag.dx,0,maxX)}px`;host.style.top=`${clamp(event.clientY-drag.dy,0,maxY)}px`;});
    const finish=async event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const moved=drag.moved;drag=null;surface.style.cursor=isMinimized()?'pointer':'grab';if(moved){const rect=host.getBoundingClientRect(),maxX=Math.max(1,innerWidth-rect.width),maxY=Math.max(1,innerHeight-rect.height),xRatio=clamp(rect.left/maxX,0,1),yRatio=clamp(rect.top/maxY,0,1);currentState.settings ||= {};currentState.settings.workClockOverlayPosition='free';currentState.settings.workClockOverlayXRatio=xRatio;currentState.settings.workClockOverlayYRatio=yRatio;try{await chrome.runtime.sendMessage({type:'meshtab-work-clock-overlay-position',xRatio,yRatio});}catch{}applyPosition();}else if(isMinimized()){await setMinimized(false);}else applyPosition();};
    surface.addEventListener('pointerup',finish);surface.addEventListener('pointercancel',finish);
    (document.documentElement||document.body).append(host);
  }
  function applyPosition(){
    if(!host||drag)return;
    host.style.top='';host.style.right='';host.style.bottom='';host.style.left='';host.style.transform='';
    const settings=currentState?.settings||{},position=['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes(settings.workClockOverlayPosition)?settings.workClockOverlayPosition:'bottom-center';
    if(isMinimized()){
      if(edgeSide()==='left')host.style.left='0px';else host.style.right='0px';
      if(position==='free'){const maxY=Math.max(0,innerHeight-(host.offsetHeight||34)),yr=clamp(Number(settings.workClockOverlayYRatio)||0,0,1);host.style.top=`${yr*maxY}px`;}
      else if(position.startsWith('top-'))host.style.top='14px';
      else host.style.bottom='14px';
      return;
    }
    if(position==='free'){const maxX=Math.max(0,innerWidth-host.offsetWidth),maxY=Math.max(0,innerHeight-host.offsetHeight),xr=clamp(Number(settings.workClockOverlayXRatio)||0,0,1),yr=clamp(Number(settings.workClockOverlayYRatio)||0,0,1);host.style.left=`${xr*maxX}px`;host.style.top=`${yr*maxY}px`;return;}
    const gap='14px';if(position.startsWith('top-'))host.style.top=gap;else host.style.bottom=gap;if(position.endsWith('-left'))host.style.left=gap;else if(position.endsWith('-right'))host.style.right=gap;else{host.style.left='50%';host.style.transform='translateX(-50%)';}
  }
  function removeHost(){host?.remove();host=null;surface=null;readout=null;taskLabel=null;pauseAction=null;stopAction=null;minimizeAction=null;drag=null;}
  function render(){
    const settings=currentState?.settings||{},clock=currentState?.workClock||{},running=Boolean(clock.runningSince),paused=running&&Boolean(clock.pausedAt);
    if(!settings.workClockOverlayEnabled||!running){removeHost();if(timer){clearInterval(timer);timer=null;}return;}
    ensureHost();
    const seconds=elapsedSeconds(clock),title=linkedTaskTitle(currentState,clock.taskId),linked=Boolean(title),minimized=isMinimized();
    if(readout){readout.textContent=minimized?(paused?'⏸':'⏱'):`${paused?'⏸':'⏱'} ${duration(seconds)}`;readout.style.fontSize=minimized?'16px':'12px';}
    if(taskLabel){if(linked&&!minimized){taskLabel.textContent=title;taskLabel.style.display='block';}else{taskLabel.style.display='none';}}
    if(pauseAction){pauseAction.textContent=paused?'Resume':'Pause';pauseAction.style.background=paused?'#42b883':'#ffd36b';pauseAction.style.color=paused?'#102b20':'#493710';pauseAction.title=paused?'Resume':'Pause';pauseAction.style.display=minimized?'none':'';}
    if(stopAction)stopAction.style.display=minimized?'none':'';
    if(minimizeAction)minimizeAction.style.display=minimized?'none':'';
    if(surface){
      surface.style.padding=minimized?'8px 9px':'5px 6px 5px 11px';
      surface.style.gap=minimized?'0':'7px';
      surface.style.borderRadius=minimized?(edgeSide()==='left'?'0 12px 12px 0':'12px 0 0 12px'):'999px';
      surface.style.cursor=minimized?'pointer':'grab';
      if(linked)surface.style.background=paused?'rgba(84,58,196,.9)':'rgba(110,73,255,.96)';else surface.style.background=paused?'rgba(56,50,70,.94)':'rgba(30,27,39,.92)';
    }
    const baseLabel=linked?`Timer for "${title}" ${paused?'paused':'running'} ${duration(seconds)}`:`Work Clock ${paused?'paused':'running'} ${duration(seconds)}`;
    surface?.setAttribute('aria-label',minimized?`${baseLabel}. Minimized - click to expand.`:`${baseLabel}. Drag to move.`);
    surface.title=minimized?'Click to expand the Work Clock overlay.':'Click and hold to drag the timer anywhere on the page.';
    applyPosition();
    if(!timer)timer=setInterval(render,1000);
  }
  chrome.storage.local.get(STORAGE_KEY).then(data=>{currentState=data?.[STORAGE_KEY]||null;render();});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!changes[STORAGE_KEY])return;currentState=changes[STORAGE_KEY].newValue||null;render();});
  addEventListener('resize',applyPosition,{passive:true});
})();
