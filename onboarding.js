(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const root=$('onboarding'),card=$('tour-card'),ring=$('tour-ring');
  const title=$('tour-title'),description=$('tour-description'),next=$('tour-next'),back=$('tour-back');
  const shields=[...root.querySelectorAll('.tour-shield')];
  // Keep the existing completion preference across deployments.
  const seenKey='firecracker-night.guide-seen',progressKey='firecracker-night.guide-step';
  const touch=matchMedia('(pointer:coarse), (max-width:760px)');
  function read(key){
    try{const value=localStorage.getItem(key);if(value!==null)return value;}catch(_){}
    try{return decodeURIComponent(document.cookie.split('; ').find(part=>part.startsWith(key+'='))?.slice(key.length+1)||'');}catch(_){return '';}
  }
  function write(key,value){
    try{if(value)localStorage.setItem(key,value);else localStorage.removeItem(key);}catch(_){}
    // Also cover storage becoming unavailable between visits.
    try{document.cookie=key+'='+encodeURIComponent(value)+'; Max-Age='+(value?'315360000':'0')+'; Path=/; SameSite=Lax';}catch(_){}
  }
  let active=read(seenKey)!=='1',game=null,steps=[],index=0,target=null,frame=0,resumeId='';
  let wasOptionsOpen=false,wasLightDisabled=false;
  const isTouch=()=>touch.matches||game.phone().active;
  const current=()=>steps[index];
  const query=selector=>document.querySelector(selector);
  const visible=element=>!!element&&element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
  function schedule(){if(active&&!frame)frame=requestAnimationFrame(()=>{frame=0;position();});}
  const observer=new ResizeObserver(schedule);
  function observeTarget(element){
    if(target===element)return;
    if(target)observer.unobserve(target);target=element;if(target)observer.observe(target);
  }
  function targetRect(){
    const step=current();let element=typeof step.target==='function'?step.target():query(step.target);
    if(!visible(element))return null;
    observeTarget(element);
    const r=element.getBoundingClientRect();
    if(step.id!=='movement')return r;
    // Focus on the actual figure inside the canvas, including phone letterboxing.
    const scale=Math.min(r.width/1000,r.height/620),player=game.player();
    const x=r.left+(r.width-1000*scale)/2,y=r.top+(r.height-620*scale)/2;
    return {left:x+(player.x-58)*scale,top:y+(player.y-105)*scale,right:x+(player.x+58)*scale,bottom:y+(player.y+25)*scale};
  }
  function place(element,x,y,width,height){
    Object.assign(element.style,{left:x+'px',top:y+'px',width:Math.max(0,width)+'px',height:Math.max(0,height)+'px'});
  }
  function position(){
    if(!active||root.hidden||!game||window.FaceAvatar.isOpen)return;
    const r=targetRect();if(!r)return;
    const viewport=window.visualViewport;
    const vx=viewport?.offsetLeft||0,vy=viewport?.offsetTop||0,w=viewport?.width||innerWidth,h=viewport?.height||innerHeight;
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
    const x=clamp(r.left-7,vx+4,vx+w-4),y=clamp(r.top-7,vy+4,vy+h-4);
    const right=clamp(r.right+7,x+1,vx+w-4),bottom=clamp(r.bottom+7,y+1,vy+h-4);
    place(ring,x,y,right-x,bottom-y);
    place(shields[0],vx,vy,w,y-vy);place(shields[1],vx,bottom,w,vy+h-bottom);
    place(shields[2],vx,y,x-vx,bottom-y);place(shields[3],right,y,vx+w-right,bottom-y);
    const padding=12,gap=16;
    const sideRoom=Math.max(x-vx-gap-padding,vx+w-right-gap-padding);
    const cw=Math.min(340,sideRoom>=230?sideRoom:w-padding*2);
    card.style.width=cw+'px';
    let maxCardHeight=h-padding*2;
    // Measure the full content without expanding a scrolled, capped card.
    // Expanding it temporarily would reset scrollTop and hide its actions again.
    const ch=Math.min(card.scrollHeight+2,maxCardHeight);
    const centerX=clamp((x+right-cw)/2,vx+padding,vx+w-cw-padding);
    const centerY=clamp((y+bottom-ch)/2,vy+padding,vy+h-ch-padding);
    let cx,cy;
    if(x-vx>=cw+gap+padding){cx=x-cw-gap;cy=centerY;}
    else if(vx+w-right>=cw+gap+padding){cx=right+gap;cy=centerY;}
    else if(vy+h-bottom>=ch+gap+padding){cx=centerX;cy=bottom+gap;}
    else if(y-vy>=ch+gap+padding){cx=centerX;cy=y-ch-gap;}
    else{
      // Small portrait screens can need less space than the preferred card size.
      const below=vy+h-bottom-gap-padding,above=y-vy-gap-padding;
      const room=Math.max(below,above);
      if(room>=150){maxCardHeight=room;cx=centerX;cy=below>=above?bottom+gap:vy+padding;}
      else{cx=vx+padding;cy=vy+h-ch-padding;}
    }
    card.style.maxHeight=maxCardHeight+'px';card.style.left=cx+'px';card.style.top=cy+'px';
  }
  function content(){
    const step=current();title.textContent=step.title;
    description.textContent=typeof step.copy==='function'?step.copy():step.copy;
    $('tour-progress').textContent=`Your Diwali night · ${index+1} of ${steps.length}`;
    back.disabled=index===0||(index===1&&steps[0].id==='fullscreen'&&game.phone().active);
    next.textContent=step.id==='fullscreen'?'Enter game':index===steps.length-1?"Let's play":'Next →';
  }
  function reveal(){
    const step=current(),element=typeof step.target==='function'?step.target():query(step.target);
    if(!element)return;
    // Move the real page/drawer instead of duplicating its controls in the tour.
    element.scrollIntoView({block:step.id==='fullscreen'&&innerHeight<500?'start':'center',inline:'nearest',behavior:'instant'});
    position();
  }
  function showStep(nextIndex){
    index=nextIndex;const step=current();
    document.body.classList.toggle('tour-light-preview',step.id==='lighting');
    $('light-button').disabled=step.id==='lighting'||wasLightDisabled;
    if(game.phone().active)game.options(step.area==='settings');
    if(step.id!=='fullscreen'||!resumeId)write(progressKey,step.id);
    root.hidden=false;card.scrollTop=0;content();reveal();title.focus({preventScroll:true});
    // Follow the mobile drawer's short opening transition.
    schedule();setTimeout(()=>{if(active){reveal();schedule();}},230);
  }
  function finish(){
    write(seenKey,'1');write(progressKey,'');active=false;root.hidden=true;
    document.body.classList.remove('tour-light-preview','onboarding-active');$('light-button').disabled=wasLightDisabled;
    observer.disconnect();if(frame)cancelAnimationFrame(frame);frame=0;
    if(game.phone().active)game.options(wasOptionsOpen);
    else $('stage').scrollIntoView({block:'start',behavior:'instant'});
    game.resume();$('game').focus({preventScroll:true});
  }
  async function advance(){
    if(!active)return;
    if(current().id==='fullscreen'){
      await game.enterPhone();
      if(current().id==='fullscreen')phoneChanged();return;
    }
    if(index===steps.length-1)finish();else showStep(index+1);
  }
  function phoneChanged(){
    if(!active||!game)return;
    if(current().id==='fullscreen'&&game.phone().active){
      const saved=steps.findIndex(step=>step.id===resumeId);resumeId='';showStep(saved>0?saved:1);
    }else{content();schedule();}
  }
  function buildSteps(){
    const list=[
      {id:'avatar',area:'settings',target:'.character-options',title:'Choose your avatar',copy:'Select Male for kurta pajama or Female for ghagra choli. Try either highlighted option, then continue.'},
      {id:'outfit',area:'settings',target:'.outfit-settings',title:'Pick your outfit colour',copy:'Choose a colour here, or use the colour picker for your own shade. Your friends will see your outfit in a party too.'},
      {id:'face',area:'settings',target:'.face-options',title:'Make it your face',copy:'Keep the default face, or choose Use my face to take a photo. Review the face cutout before applying it. Camera capture is optional; your original photo stays on your device.'},
      {id:'cracker',area:'settings',target:'.pick[data-type="skyshot"]',title:'Choose a firecracker',copy:()=>isTouch()?'Pick a cracker in Options. More choices are further down this list, with colours and shot counts for supported crackers. Fuljhadi stays in your hand.':'Choose a cracker in this panel. Scroll the list for more, then choose colours and shot counts where available. Fuljhadi stays in your hand.'},
      {id:'party',area:'settings',target:()=>query('#party-lobby').hidden?query('.party-room-code'):query('#party-lobby'),title:'Celebrate with friends',copy:'Enter your name to host a party, then share its room code or invite link. Friends join with their names; up to 8 people share the ground. You can light each other’s unlit crackers. Face cutouts are shared only when you enable Share my face with this room.'},
      {id:'movement',target:'#game',title:'Move around the courtyard',copy:()=>isTouch()?'Turn your phone sideways for the widest view. Slide and hold your finger on the ground to move; release to stop. Options opens your crackers, avatar and party settings.':'Use WASD or the arrow keys to move your character. Walk towards your chosen cracker until its Light it! button appears.'},
      {id:'lighting',target:'#light-button',title:'Light it, then step back',copy:()=>isTouch()?'Tap Light it! when you are close to a cracker. After lighting, move outside the small marked area before the fuse runs out. You can keep moving during the show. Tap Jump once for continuous jumping, or Draw circles to swirl Fuljhadi.':'When nearby, click Light it! or press Space. Move outside the small marked area before the fuse runs out. Keep moving during the show; J toggles continuous jumping and R swirls Fuljhadi.'}
    ];
    if(isTouch()&&!game.phone().active)list.unshift({id:'fullscreen',target:'#phone-play-start',title:'Your courtyard, fullscreen',copy:'Enter the playground and turn your phone sideways for a wide view. We’ll highlight the controls as you go. Complete this short walkthrough once to start playing.'});
    return list;
  }
  next.addEventListener('click',advance);
  back.addEventListener('click',()=>{if(active&&!back.disabled)showStep(index-1);});
  function focusables(){
    const selector='button:not(:disabled),input:not(:disabled),select,a[href],[tabindex="0"]';
    return [...(target?.querySelectorAll(selector)||[]),...(target?.matches(selector)?[target]:[]),...card.querySelectorAll(selector)].filter(visible);
  }
  document.addEventListener('keydown',event=>{
    if(!active||!game||window.FaceAvatar.isOpen)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();return;}
    if(event.key==='Tab'){
      const elements=focusables(),at=elements.indexOf(document.activeElement);
      const n=event.shiftKey?(at<=0?elements.length-1:at-1):(at+1)%elements.length;
      event.preventDefault();event.stopImmediatePropagation();elements[n]?.focus();return;
    }
    if(!card.contains(event.target)&&!target?.contains(event.target)){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('focusin',event=>{
    if(active&&game&&!window.FaceAvatar.isOpen&&!root.hidden&&!card.contains(event.target)&&!target?.contains(event.target))title.focus({preventScroll:true});
  });
  for(const type of ['wheel','touchmove'])document.addEventListener(type,event=>{
    if(active&&game&&!window.FaceAvatar.isOpen&&!card.contains(event.target))event.preventDefault();
  },{passive:false});
  window.addEventListener('scroll',schedule,{capture:true,passive:true});
  window.addEventListener('resize',()=>{if(active&&game){content();schedule();}});
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);
  window.addEventListener('avatar:open',()=>{if(active)root.hidden=true;});
  window.addEventListener('avatar:close',()=>{if(active){root.hidden=false;reveal();schedule();title.focus({preventScroll:true});}});
  window.addEventListener('storage',event=>{if(active&&game&&event.key===seenKey&&event.newValue==='1')finish();});
  window.Onboarding={
    get active(){return active;},
    phoneChanged,
    start(bridge){
      game=bridge;if(!active)return;
      wasOptionsOpen=game.phone().optionsOpen;wasLightDisabled=$('light-button').disabled;
      document.body.classList.add('onboarding-active');
      game.clearMovement();game.stopAudio();steps=buildSteps();
      const saved=steps.findIndex(step=>step.id===read(progressKey));
      if(steps[0].id==='fullscreen'&&saved>0)resumeId=steps[saved].id;
      observer.observe(card);observer.observe(document.documentElement);
      showStep(steps[0].id==='fullscreen'?0:Math.max(0,saved));
    }
  };
})();
