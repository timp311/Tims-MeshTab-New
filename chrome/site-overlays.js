(() => {
  'use strict';
  if (globalThis.__meshtabSiteOverlaysLoaded) return;
  globalThis.__meshtabSiteOverlaysLoaded = true;
  // Firefox: alias chrome -> browser (see app.js for the full explanation). No-op in Chrome.
  if (typeof browser !== 'undefined') { globalThis.chrome = browser; }

  const STORAGE_KEY = 'meshtabState';
  const HOST_PREFIX = 'meshtab-site-overlay-host-';
  const liveHosts = new Map();
  const CORNER_SNAP_PX = 72;
  let currentState = null;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function safeColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback; }
  function safeShape(value) { const normalized = value === 'circle' ? 'pill' : value; return ['rectangle','rounded','pill','half-rounded','half-pill','half-oval'].includes(normalized) ? normalized : 'rounded'; }
  function safeFont(value) { return ['system','sans','serif','mono'].includes(value) ? value : 'system'; }
  function safeEdge(value) { return ['top','right','bottom','left'].includes(value) ? value : 'top'; }
  function fontCss(value) {
    if (value === 'serif') return 'Georgia,"Times New Roman",serif';
    if (value === 'mono') return 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace';
    if (value === 'sans') return 'Arial,Helvetica,sans-serif';
    return 'Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  }
  function isHalfShape(shape) { return ['half-rounded','half-pill','half-oval'].includes(shape); }
  function radius(shape, edge='top') {
    if (shape === 'pill') return '999px';
    if (shape === 'rectangle') return '3px';
    if (!isHalfShape(shape)) return '14px';
    const base = shape === 'half-rounded' ? '14px' : (shape === 'half-pill' ? '999px' : '50%');
    if (edge === 'bottom') return `${base} ${base} 0 0`;
    if (edge === 'left') return `0 ${base} ${base} 0`;
    if (edge === 'right') return `${base} 0 0 ${base}`;
    return `0 0 ${base} ${base}`;
  }
  function resetFlushBorder(label) { label.style.borderTopWidth='1px'; label.style.borderRightWidth='1px'; label.style.borderBottomWidth='1px'; label.style.borderLeftWidth='1px'; }
  function applyFlushBorder(label, overlay, touchEdge=overlay.edge) {
    resetFlushBorder(label);
    if (!isHalfShape(overlay.shape)) return;
    if (touchEdge === 'top') label.style.borderTopWidth='0';
    else if (touchEdge === 'right') label.style.borderRightWidth='0';
    else if (touchEdge === 'bottom') label.style.borderBottomWidth='0';
    else label.style.borderLeftWidth='0';
  }
  function cornerAngle(corner) {
    if (corner === 'top-left' || corner === 'bottom-right') return -45;
    if (corner === 'top-right' || corner === 'bottom-left') return 45;
    return 0;
  }
  function rotatedBounds(width, height, degrees) {
    const radians=Math.abs(degrees)*Math.PI/180;
    const cos=Math.abs(Math.cos(radians)), sin=Math.abs(Math.sin(radians));
    return {width:width*cos+height*sin,height:width*sin+height*cos};
  }
  function visualTouchEdge(overlay, corner='') {
    if (corner) return corner.startsWith('bottom') ? 'bottom' : 'top';
    if (overlay.edge === 'left' || overlay.edge === 'right') return 'bottom';
    return overlay.edge;
  }
  function normalizedPageUrl(value){try{const url=new URL(String(value||''));if(!/^https?:$/i.test(url.protocol))return '';return url.href;}catch{return '';}}
  function matchesHost(overlay) {
    if (overlay?.targetMode === 'all-sites') return /^https?:$/i.test(location.protocol);
    const current = String(location.hostname || '').toLowerCase();
    const target = String(overlay?.host || '').toLowerCase();
    if (!current || !target) return false;
    const hostMatches=current===target||(overlay?.includeSubdomains===true&&current.endsWith(`.${target}`));
    if(!hostMatches)return false;
    if(overlay?.pageScope!=='specific')return true;
    try{
      const targetUrl=new URL(normalizedPageUrl(overlay?.pageUrl));
      const currentUrl=new URL(location.href);
      return currentUrl.protocol===targetUrl.protocol&&currentUrl.pathname===targetUrl.pathname&&currentUrl.search===targetUrl.search&&currentUrl.hash===targetUrl.hash;
    }catch{return false;}
  }
  function normalizedOverlay(raw) {
    const type = raw?.type === 'links' ? 'links' : 'label';
    const shape = type === 'links' ? 'rounded' : safeShape(raw?.shape);
    const width = type === 'links' ? 48 : clamp(parseInt(raw?.width, 10) || 180, 80, 520);
    return {
      id: String(raw?.id || ''), type,
      name: String(raw?.name || (type === 'links' ? 'MeshTab Links' : 'Overlay')).slice(0, 80),
      targetMode: raw?.targetMode === 'all-sites' ? 'all-sites' : 'site',
      host: String(raw?.host || '').toLowerCase(), includeSubdomains: raw?.targetMode !== 'all-sites' && raw?.includeSubdomains === true, pageScope: raw?.targetMode !== 'all-sites' && raw?.pageScope === 'specific' ? 'specific' : 'all', pageUrl: raw?.targetMode !== 'all-sites' ? normalizedPageUrl(raw?.pageUrl || '') : '', enabled: raw?.enabled !== false,
      desktopId: type === 'links' ? String(raw?.desktopId || '') : '',
      linkOpenMode: ['same-tab','new-tab','new-window'].includes(raw?.linkOpenMode) ? raw.linkOpenMode : 'same-tab',
      textColor: safeColor(raw?.textColor, '#ffffff'), backgroundColor: safeColor(raw?.backgroundColor, '#6e49ff'),
      iconColor: safeColor(raw?.iconColor, '#7048ff'),
      customIconDataUrl: /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(String(raw?.customIconDataUrl || '')) ? String(raw.customIconDataUrl) : '',
      opacity: clamp(Number.isFinite(Number(raw?.opacity)) ? Math.round(Number(raw.opacity)) : 100, 10, 100),
      fontFamily: safeFont(raw?.fontFamily), fontSize: clamp(parseInt(raw?.fontSize, 10) || 16, 8, 48), width,
      height: type === 'links' ? 48 : clamp(parseInt(raw?.height, 10) || 44, 28, 280),
      shape, cornerDocking: raw?.cornerDocking === true, edge: safeEdge(raw?.edge), offsetRatio: clamp(Number.isFinite(Number(raw?.offsetRatio)) ? Number(raw.offsetRatio) : 0.5, 0, 1)
    };
  }
  function cornerForPosition(edge, ratio) {
    const atStart = ratio <= 0.0001, atEnd = ratio >= 0.9999;
    if (!atStart && !atEnd) return '';
    if (edge === 'top') return atStart ? 'top-left' : 'top-right';
    if (edge === 'bottom') return atStart ? 'bottom-left' : 'bottom-right';
    if (edge === 'left') return atStart ? 'top-left' : 'bottom-left';
    return atStart ? 'top-right' : 'bottom-right';
  }
  function applyEdgePosition(host, overlay) {
    if (!host?.isConnected) return;
    host.style.left=''; host.style.right=''; host.style.top=''; host.style.bottom=''; host.style.transform=''; host.style.transformOrigin='center';
    host.style.width=`${overlay.width}px`; host.style.height=`${overlay.height}px`;
    let width=overlay.width, height=overlay.height;
    const activeLabel=host.shadowRoot?.firstElementChild;
    const corner = overlay.cornerDocking ? cornerForPosition(overlay.edge, overlay.offsetRatio) : '';
    if (overlay.type !== 'links') {
      const touchEdge=visualTouchEdge(overlay,corner);
      activeLabel.style.borderRadius=radius(overlay.shape,touchEdge);
      applyFlushBorder(activeLabel,overlay,touchEdge);
    }
    if (corner) {
      if (overlay.type !== 'links') {
        const measured=Math.ceil(Number(activeLabel?.scrollWidth)||width);
        const viewportCap=Math.max(width,Math.floor(Math.max(320,innerWidth*.82)));
        width=Math.min(viewportCap,Math.max(width,measured+18));
        host.style.width=`${width}px`;
      }
      const angle=cornerAngle(corner);
      const bounds=rotatedBounds(width,height,angle);
      const centerX=corner.includes('left') ? bounds.width/2 : innerWidth-bounds.width/2;
      const centerY=corner.startsWith('top') ? bounds.height/2 : innerHeight-bounds.height/2;
      host.style.left=`${centerX-width/2}px`;
      host.style.top=`${centerY-height/2}px`;
      host.style.transformOrigin='center';
      host.style.transform=`rotate(${angle}deg)`;
      return;
    }
    if (overlay.edge === 'left' || overlay.edge === 'right') {
      const angle=overlay.edge === 'left' ? 90 : -90;
      const bounds=rotatedBounds(width,height,angle);
      const maxY=Math.max(0,innerHeight-bounds.height);
      const centerY=overlay.offsetRatio*maxY+bounds.height/2;
      const centerX=overlay.edge === 'left' ? bounds.width/2 : innerWidth-bounds.width/2;
      host.style.left=`${centerX-width/2}px`;
      host.style.top=`${centerY-height/2}px`;
      host.style.transformOrigin='center';
      host.style.transform=`rotate(${angle}deg)`;
      return;
    }
    const maxX=Math.max(0,innerWidth-width);
    if (overlay.edge === 'top') { host.style.top='0'; host.style.left=`${overlay.offsetRatio*maxX}px`; }
    else { host.style.bottom='0'; host.style.left=`${overlay.offsetRatio*maxX}px`; }
  }
  function nearestEdge(x, y, width, height) {
    const distances = [['left',x],['right',innerWidth-(x+width)],['top',y],['bottom',innerHeight-(y+height)]];
    distances.sort((a,b)=>a[1]-b[1]); return distances[0][0];
  }
  async function persistPosition(overlay, edge, x, y) {
    const rightDistance=innerWidth-(x+overlay.width), bottomDistance=innerHeight-(y+overlay.height);
    const nearLeft=x<=CORNER_SNAP_PX, nearRight=rightDistance<=CORNER_SNAP_PX, nearTop=y<=CORNER_SNAP_PX, nearBottom=bottomDistance<=CORNER_SNAP_PX;
    let ratio=0;
    if (overlay.cornerDocking && nearTop&&nearLeft) {edge='top';ratio=0;}
    else if(overlay.cornerDocking && nearTop&&nearRight){edge='top';ratio=1;}
    else if(overlay.cornerDocking && nearBottom&&nearLeft){edge='bottom';ratio=0;}
    else if(overlay.cornerDocking && nearBottom&&nearRight){edge='bottom';ratio=1;}
    else if(edge==='top'||edge==='bottom'){const span=Math.max(1,innerWidth-overlay.width);ratio=clamp(x/span,0,1);}
    else {const span=Math.max(1,innerHeight-overlay.height);ratio=clamp(y/span,0,1);}
    overlay.edge=edge; overlay.offsetRatio=ratio;
    try { await chrome.runtime.sendMessage({type:'meshtab-site-overlay-position',overlayId:overlay.id,edge,offsetRatio:ratio}); } catch {}
  }
  function makeLogo(overlay) {
    if (overlay?.customIconDataUrl) {
      const img=document.createElement('img'); img.style.cssText='all:initial;box-sizing:border-box;width:27px;height:27px;display:block;object-fit:contain;border-radius:6px;pointer-events:none;';
      img.src=overlay.customIconDataUrl; img.alt=''; return img;
    }
    const color=safeColor(overlay?.iconColor,'#7048ff');
    const logo=document.createElement('span'); logo.style.cssText='all:initial;box-sizing:border-box;width:27px;height:27px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3px;pointer-events:none;';
    for(let i=0;i<4;i+=1){const square=document.createElement('i');square.style.cssText=`all:initial;display:block;box-sizing:border-box;border:3px solid ${color};border-radius:4px;`;logo.append(square);} return logo;
  }
  function closePanel(item) { if(!item?.panel)return; item.panel.hidden=true; item.panel.replaceChildren(); item.panelOpen=false; }
  function positionPanel(item) {
    if(!item?.panelOpen||item.panel.hidden)return;
    const panel=item.panel, rect=item.host.getBoundingClientRect();
    const width=Math.min(330,Math.max(240,innerWidth-24)); panel.style.width=`${width}px`; panel.style.maxHeight=`${Math.max(180,Math.min(440,innerHeight-24))}px`;
    panel.style.left='12px';panel.style.top='12px';
    const pr=panel.getBoundingClientRect();
    let x=rect.left; if(x+pr.width>innerWidth-12)x=rect.right-pr.width; x=clamp(x,12,Math.max(12,innerWidth-pr.width-12));
    let y=rect.bottom+8; if(y+pr.height>innerHeight-12)y=rect.top-pr.height-8; y=clamp(y,12,Math.max(12,innerHeight-pr.height-12));
    panel.style.left=`${x}px`;panel.style.top=`${y}px`;
  }
  async function toggleLinkPanel(item) {
    if(item.panelOpen){closePanel(item);return;}
    item.panelOpen=true; item.panel.hidden=false; item.panel.replaceChildren();
    const loading=document.createElement('div');loading.textContent='Loading MeshTab links…';loading.style.cssText='padding:16px;color:#6d6777;font:600 12px/1.4 system-ui,sans-serif;';item.panel.append(loading);positionPanel(item);
    let data=null; try{data=await chrome.runtime.sendMessage({type:'meshtab-link-overlay-data',overlayId:item.overlay.id});}catch{}
    if(!item.panelOpen)return;
    item.panel.replaceChildren();
    const shell=document.createElement('div');shell.style.cssText='all:initial;box-sizing:border-box;display:flex;flex-direction:column;max-height:inherit;background:#fff;color:#26222d;font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;border:1px solid rgba(64,48,92,.18);border-radius:14px;box-shadow:0 16px 42px rgba(30,22,44,.28);overflow:hidden;';
    const head=document.createElement('div');head.style.cssText='all:initial;box-sizing:border-box;display:flex;align-items:center;gap:9px;padding:10px 11px;border-bottom:1px solid rgba(64,48,92,.12);background:#faf9ff;';head.append(makeLogo(item.overlay));
    const hc=document.createElement('div');hc.style.cssText='all:initial;min-width:0;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';
    const ht=document.createElement('strong');ht.style.cssText='all:initial;font:800 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:#2b2534;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';ht.textContent=data?.overlayName||item.overlay.name;
    const hs=document.createElement('span');hs.style.cssText='all:initial;font:600 9px/1.25 system-ui,-apple-system,"Segoe UI",sans-serif;color:#756e7e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';hs.textContent=data?.desktopTitle||'MeshTab Links';hc.append(ht,hs);head.append(hc);
    const openMeshTab=document.createElement('button');openMeshTab.type='button';openMeshTab.textContent='Open MeshTab';openMeshTab.title='Focus an open MeshTab or open it in a new tab';openMeshTab.style.cssText='all:initial;margin-left:auto;box-sizing:border-box;border:1px solid rgba(112,72,255,.22);border-radius:8px;padding:6px 8px;background:#fff;color:#7048ff;font:800 9px/1 system-ui;cursor:pointer;white-space:nowrap;';openMeshTab.addEventListener('mouseenter',()=>openMeshTab.style.background='#f3efff');openMeshTab.addEventListener('mouseleave',()=>openMeshTab.style.background='#fff');openMeshTab.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();openMeshTab.style.opacity='.65';try{await chrome.runtime.sendMessage({type:'meshtab-link-overlay-open-meshtab'});}catch{}closePanel(item);});head.append(openMeshTab);
    const close=document.createElement('button');close.type='button';close.textContent='×';close.title='Close';close.style.cssText='all:initial;box-sizing:border-box;width:27px;height:27px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#655e6d;font:700 18px/1 system-ui;background:rgba(83,64,116,.07);';close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closePanel(item);});head.append(close);shell.append(head);
    const list=document.createElement('div');list.style.cssText='all:initial;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:10px;overflow:auto;overscroll-behavior:contain;';
    const groups=Array.isArray(data?.groups)?data.groups:[], tasks=Array.isArray(data?.tasks)?data.tasks:[];
    if(!data?.ok||(!groups.length&&!tasks.length)){const empty=document.createElement('div');empty.style.cssText='all:initial;box-sizing:border-box;padding:16px 10px;text-align:center;color:#756e7e;font:600 11px/1.4 system-ui;';empty.textContent=data?.emptyMessage||data?.error||'No links or Tasks are available for this MeshTab Tab.';list.append(empty);} else {
      for(const group of groups){const section=document.createElement('section');section.style.cssText='all:initial;display:flex;flex-direction:column;gap:4px;';const title=document.createElement('div');title.style.cssText='all:initial;font:800 9px/1.3 system-ui;color:#776f80;text-transform:none;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';title.textContent=group.title;section.append(title);for(const link of group.links||[]){const button=document.createElement('button');button.type='button';button.style.cssText='all:initial;box-sizing:border-box;display:block;width:100%;padding:8px 9px;border:1px solid rgba(80,61,111,.11);border-radius:9px;background:#fff;color:#302a39;font:650 11px/1.25 system-ui;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';button.textContent=link.title;button.title=link.url;button.addEventListener('mouseenter',()=>{button.style.background='#f7f4ff';button.style.borderColor='rgba(112,72,255,.26)';});button.addEventListener('mouseleave',()=>{button.style.background='#fff';button.style.borderColor='rgba(80,61,111,.11)';});button.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();button.style.opacity='.65';try{await chrome.runtime.sendMessage({type:'meshtab-link-overlay-open',overlayId:item.overlay.id,url:link.url});}catch{}closePanel(item);});section.append(button);}list.append(section);}
      if(tasks.length){const section=document.createElement('section');section.style.cssText='all:initial;display:flex;flex-direction:column;gap:4px;padding-top:8px;border-top:1px solid rgba(80,61,111,.10);';const title=document.createElement('div');title.style.cssText='all:initial;font:900 9px/1.3 system-ui;color:#7048ff;padding:0 4px 3px;';title.textContent=`Tasks (${tasks.length})`;section.append(title);for(const task of tasks){const button=document.createElement('button');button.type='button';button.style.cssText='all:initial;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;width:100%;padding:8px 9px;border:1px solid rgba(112,72,255,.16);border-radius:9px;background:#faf9ff;color:#302a39;cursor:pointer;';const name=document.createElement('strong');name.style.cssText='all:initial;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:750 11px/1.25 system-ui;color:#302a39;';name.textContent=task.title;const badge=document.createElement('span');badge.style.cssText='all:initial;font:850 8px/1.2 system-ui;color:#7048ff;text-transform:uppercase;';badge.textContent=task.workState==='working'?'WORKING':task.workState==='ongoing'?'ONGOING':'TO DO';const meta=document.createElement('span');meta.style.cssText='all:initial;grid-column:1/-1;font:600 8px/1.2 system-ui;color:#7a7282;';meta.textContent=task.dueDate?`Due ${task.dueDate} · opens in a new MeshTab tab`:'Opens in a new MeshTab tab';button.append(name,badge,meta);button.addEventListener('mouseenter',()=>button.style.background='#f3efff');button.addEventListener('mouseleave',()=>button.style.background='#faf9ff');button.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();button.style.opacity='.65';try{await chrome.runtime.sendMessage({type:'meshtab-link-overlay-open-task',overlayId:item.overlay.id,taskId:task.id});}catch{}closePanel(item);});section.append(button);}list.append(section);}
    }
    shell.append(list);
    const clockFooter=document.createElement('div');clockFooter.style.cssText='all:initial;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid rgba(80,61,111,.12);background:#faf9ff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';
    const clockCopy=document.createElement('div');clockCopy.style.cssText='all:initial;min-width:0;display:flex;flex-direction:column;gap:2px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';
    const clockTitle=document.createElement('strong');clockTitle.style.cssText='all:initial;font:800 10px/1.2 system-ui;color:#302a39;';clockTitle.textContent='Work Clock';
    const clockHint=document.createElement('span');clockHint.style.cssText='all:initial;font:600 8px/1.25 system-ui;color:#7a7282;';clockHint.textContent=data?.workClockPaused?'Paused · break time is not counting':data?.workClockRunning?'Running · Pause/Stop on the floating clock':'Start it here; the clock appears at the bottom';
    clockCopy.append(clockTitle,clockHint);clockFooter.append(clockCopy);
    if(!data?.workClockRunning){const offsetWrap=document.createElement('label');offsetWrap.style.cssText='all:initial;margin-left:auto;box-sizing:border-box;display:flex;align-items:center;gap:4px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';const offsetInput=document.createElement('input');offsetInput.type='number';offsetInput.min='0';offsetInput.max='1440';offsetInput.step='1';offsetInput.value='0';offsetInput.title='Minutes already worked before starting the clock';offsetInput.setAttribute('aria-label','Start offset in minutes');offsetInput.style.cssText='all:initial;box-sizing:border-box;width:48px;height:27px;border:1px solid rgba(112,72,255,.24);border-radius:8px;padding:0 5px;background:#fff;color:#302a39;font:800 9px/1 system-ui;text-align:center;';const offsetUnit=document.createElement('span');offsetUnit.textContent='min';offsetUnit.style.cssText='all:initial;font:750 8px/1 system-ui;color:#7a7282;';offsetWrap.append(offsetInput,offsetUnit);const startClock=document.createElement('button');startClock.type='button';startClock.textContent='Start Clock';startClock.style.cssText='all:initial;box-sizing:border-box;border-radius:9px;padding:7px 10px;background:#7048ff;color:#fff;font:850 9px/1 system-ui;cursor:pointer;white-space:nowrap;';startClock.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();startClock.style.opacity='.65';const offsetMinutes=Math.max(0,Math.min(1440,Math.round(Number(offsetInput.value)||0)));try{await chrome.runtime.sendMessage({type:'meshtab-start-work-clock',offsetMinutes});}catch{}closePanel(item);});clockFooter.append(offsetWrap,startClock);}else if(data?.workClockPaused){const resumeClock=document.createElement('button');resumeClock.type='button';resumeClock.textContent='Resume Clock';resumeClock.style.cssText='all:initial;margin-left:auto;box-sizing:border-box;border-radius:9px;padding:7px 10px;background:#42b883;color:#102b20;font:850 9px/1 system-ui;cursor:pointer;white-space:nowrap;';resumeClock.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();resumeClock.style.opacity='.65';try{await chrome.runtime.sendMessage({type:'meshtab-resume-work-clock'});}catch{}closePanel(item);});clockFooter.append(resumeClock);}
    shell.append(clockFooter);item.panel.append(shell);requestAnimationFrame(()=>positionPanel(item));
  }
  function ensureHost(overlay) {
    const existing=liveHosts.get(overlay.id);if(existing?.host?.isConnected&&existing?.panelHost?.isConnected)return existing;
    const host=document.createElement('div');host.id=`${HOST_PREFIX}${overlay.id}`;host.style.cssText='all:initial;position:fixed;z-index:2147483645;pointer-events:auto;box-sizing:border-box;overflow:visible;';
    const shadow=host.attachShadow({mode:'open'});
    const label=document.createElement('div');label.setAttribute('role',overlay.type==='links'?'button':'note');label.setAttribute('aria-label',overlay.name);label.tabIndex=overlay.type==='links'?0:-1;label.style.cssText='all:initial;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;line-height:1.08;letter-spacing:.01em;user-select:none;touch-action:none;cursor:grab;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:7px;box-shadow:0 8px 24px rgba(20,14,30,.22);border:1px solid rgba(0,0,0,.16);';shadow.append(label);
    const panelHost=document.createElement('div');panelHost.id=`${HOST_PREFIX}panel-${overlay.id}`;panelHost.style.cssText='all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;box-sizing:border-box;';
    const panelShadow=panelHost.attachShadow({mode:'open'});const panel=document.createElement('div');panel.hidden=true;panel.style.cssText='all:initial;position:fixed;z-index:2147483647;box-sizing:border-box;pointer-events:auto;';panelShadow.append(panel);
    const item={host,label,panelHost,panel,overlay,panelOpen:false,justDragged:false};let drag=null;
    label.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();const rect=host.getBoundingClientRect();drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startRect:rect,dx:clamp(event.clientX-rect.left,0,Math.max(1,rect.width)),dy:clamp(event.clientY-rect.top,0,Math.max(1,rect.height)),moved:false,activated:false};label.setPointerCapture?.(event.pointerId);});
    label.addEventListener('pointermove',event=>{if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(!drag.moved&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;if(!drag.moved)return;if(!drag.activated){drag.activated=true;closePanel(item);const transformed=Boolean(item.overlay.cornerDocking&&cornerForPosition(item.overlay.edge,item.overlay.offsetRatio))||item.overlay.edge==='left'||item.overlay.edge==='right';host.style.transform='';host.style.transformOrigin='center';host.style.width=`${item.overlay.width}px`;host.style.height=`${item.overlay.height}px`;if(transformed){drag.dx=item.overlay.width/2;drag.dy=item.overlay.height/2;}else{drag.dx=clamp(drag.startX-drag.startRect.left,0,item.overlay.width);drag.dy=clamp(drag.startY-drag.startRect.top,0,item.overlay.height);}label.style.cursor='grabbing';}const x=clamp(event.clientX-drag.dx,0,Math.max(0,innerWidth-item.overlay.width)),y=clamp(event.clientY-drag.dy,0,Math.max(0,innerHeight-item.overlay.height));host.style.left=`${x}px`;host.style.top=`${y}px`;host.style.right='';host.style.bottom='';host.style.transform='';});
    const finishDrag=async event=>{if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();const moved=drag.moved;drag=null;label.style.cursor='grab';item.justDragged=moved;if(moved){const rect=host.getBoundingClientRect();const edge=nearestEdge(rect.left,rect.top,item.overlay.width,item.overlay.height);await persistPosition(item.overlay,edge,rect.left,rect.top);applyEdgePosition(host,item.overlay);}else if(item.overlay.type==='links'){await toggleLinkPanel(item);}setTimeout(()=>{item.justDragged=false;},0);};
    label.addEventListener('pointerup',finishDrag);label.addEventListener('pointercancel',event=>{if(!drag||drag.pointerId!==event.pointerId)return;drag=null;label.style.cursor='grab';applyEdgePosition(host,item.overlay);});
    label.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
    label.addEventListener('keydown',event=>{if(item.overlay.type==='links'&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();toggleLinkPanel(item);}});
    label.addEventListener('contextmenu',event=>event.stopPropagation());
    (document.documentElement||document.body).append(host,panelHost);liveHosts.set(overlay.id,item);return item;
  }
  function styleHost(item,overlay){const{host,label}=item;item.overlay=overlay;host.style.width=`${overlay.width}px`;host.style.height=`${overlay.height}px`;label.style.width='100%';label.style.height='100%';label.replaceChildren();if(overlay.type==='links'){host.style.opacity=String(clamp(Number.isFinite(Number(overlay.opacity))?Number(overlay.opacity):100,10,100)/100);label.style.color='#7048ff';label.style.background='#ffffff';label.style.fontFamily=fontCss('system');label.style.fontSize='16px';label.style.borderRadius='14px';label.style.border='1px solid rgba(112,72,255,.24)';resetFlushBorder(label);label.style.padding='8px';label.style.cursor='grab';label.append(makeLogo(overlay));label.setAttribute('aria-label',`${overlay.name} · click for MeshTab links and Tasks · drag to reposition`);label.title=`${overlay.name} · click for MeshTab links and Tasks · drag to reposition`;}else{host.style.opacity='';closePanel(item);label.style.color=overlay.textColor;label.style.background=overlay.backgroundColor;label.style.fontFamily=fontCss(overlay.fontFamily);label.style.fontSize=`${overlay.fontSize}px`;label.style.borderRadius=radius(overlay.shape,visualTouchEdge(overlay));label.style.border='1px solid rgba(0,0,0,.16)';applyFlushBorder(label,overlay,visualTouchEdge(overlay));label.style.padding='7px';label.textContent=overlay.name;label.setAttribute('aria-label',`${overlay.name} · drag along browser edges to reposition`);label.title=`${overlay.name} · drag to reposition`;}applyEdgePosition(host,overlay);}
  function removeHost(id){const item=liveHosts.get(id);item?.host?.remove();item?.panelHost?.remove();liveHosts.delete(id);}
  function render(){const enabled=currentState?.settings?.siteOverlaysEnabled===true;const matching=enabled?(Array.isArray(currentState?.siteOverlays)?currentState.siteOverlays:[]).map(normalizedOverlay).filter(o=>o.id&&o.enabled&&matchesHost(o)):[];const wanted=new Set(matching.map(o=>o.id));for(const id of [...liveHosts.keys()])if(!wanted.has(id))removeHost(id);for(const overlay of matching)styleHost(ensureHost(overlay),overlay);}
  function repositionAll(){for(const item of liveHosts.values()){applyEdgePosition(item.host,item.overlay);if(item.panelOpen)positionPanel(item);}}
  chrome.storage.local.get(STORAGE_KEY).then(data=>{currentState=data?.[STORAGE_KEY]||null;render();});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!changes[STORAGE_KEY])return;currentState=changes[STORAGE_KEY].newValue||null;render();});
  addEventListener('resize',repositionAll,{passive:true});
  let lastPageUrl=normalizedPageUrl(location.href);
  setInterval(()=>{const next=normalizedPageUrl(location.href);if(next!==lastPageUrl){lastPageUrl=next;render();}},750);
})();
