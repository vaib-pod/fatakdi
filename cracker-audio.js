(() => {
  'use strict';
  const buffers=new WeakMap();
  function loopBuffer(context,config){
    let cache=buffers.get(context);
    if(!cache){cache=new Map();buffers.set(context,cache);}
    const key=[config.src,config.startAt,config.loopEndAt].join('|');
    if(!cache.has(key)){
      const pending=(async()=>{
        const response=await fetch(config.src,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Cracker audio could not load.');
        const clip=await context.decodeAudioData(await response.arrayBuffer());
        const first=Math.round(config.startAt*clip.sampleRate),last=Math.min(clip.length,Math.round(config.loopEndAt*clip.sampleRate));
        const overlap=Math.round(clip.sampleRate*.02),length=last-first-overlap;
        if(length<=overlap)throw new Error('The crackling segment is too short.');
        const loop=context.createBuffer(clip.numberOfChannels,length,clip.sampleRate);
        for(let channel=0;channel<clip.numberOfChannels;channel++){
          const original=clip.getChannelData(channel),output=loop.getChannelData(channel);
          output.set(original.subarray(first,first+length));
          // Blend the final 20ms into the beginning: the join contains only
          // crackling, with no repeated ignition, silence, or abrupt PCM jump.
          for(let i=0;i<overlap;i++){
            const mix=i/(overlap-1);
            output[i]=original[last-overlap+i]*(1-mix)+original[first+i]*mix;
          }
        }
        return loop;
      })().catch(error=>{cache.delete(key);throw error;});
      cache.set(key,pending);
    }
    return cache.get(key);
  }
  window.CrackerLoop=class {
    constructor(config){this.config=config;this.source=null;this.gain=null;this.failed=false;this.pending=false;this.version=0;}
    stop(){
      this.version++;this.pending=false;
      const source=this.source,gain=this.gain;this.source=null;this.gain=null;
      if(!source)return;
      const context=source.context;
      try{
        gain.gain.cancelScheduledValues(context.currentTime);
        gain.gain.setTargetAtTime(0,context.currentTime,.008);
        source.stop(context.currentTime+.025);
        if(context.state!=='running'){source.disconnect();gain.disconnect();}
      }catch{source.disconnect();gain.disconnect();}
    }
    sync(options){
      this.latest=options;
      const {context,time,enabled}=options,remaining=this.config.burnDuration-time;
      if(!enabled||!context||context.state!=='running'||time<0||remaining<=0||this.failed){this.stop();return;}
      if(this.source&&(this.source.context!==context||Math.abs(this.startedTime+context.currentTime-this.startedAt-time)>.18))this.stop();
      if(this.source){this.setVolume(options);return;}
      if(this.pending)return;
      this.pending=true;const version=++this.version;
      loopBuffer(context,this.config).then(buffer=>{
        if(version!==this.version)return;
        this.pending=false;
        const current=this.latest;
        if(!current.enabled||current.context!==context||context.state!=='running'||current.time>=this.config.burnDuration)return;
        const source=context.createBufferSource(),gain=context.createGain();
        source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;
        source.connect(gain).connect(context.destination);this.source=source;this.gain=gain;
        this.startedAt=context.currentTime;this.startedTime=current.time;
        this.setVolume(current,true);
        source.onended=()=>{source.disconnect();gain.disconnect();if(this.source===source){this.source=null;this.gain=null;}};
        source.start(context.currentTime,current.time%buffer.duration);
        source.stop(context.currentTime+this.config.burnDuration-current.time);
      }).catch(()=>{if(version===this.version){this.pending=false;this.failed=true;}});
    }
    setVolume(options,starting=false){
      const context=options.context,now=context.currentTime,remaining=this.config.burnDuration-options.time;
      const volume=Math.max(0,Math.min(1,options.volume)),gain=this.gain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(starting?0:volume*Math.min(1,remaining/.15),now);
      if(starting)gain.linearRampToValueAtTime(volume*Math.min(1,remaining/.15),now+Math.min(.012,remaining));
      if(remaining>.15)gain.setValueAtTime(volume,now+remaining-.15);
      gain.linearRampToValueAtTime(0,now+remaining);
    }
  };
})();
