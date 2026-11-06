(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const dialog=$('face-dialog'),video=$('face-video'),view=$('camera-view');
  const capture=$('capture-face'),apply=$('apply-face'),retake=$('retake-camera');
  const status=$('camera-status'),placeholder=$('camera-placeholder'),cutout=$('face-cutout');
  const guide=$('camera-guide'),defaultButton=$('default-face'),ownButton=$('own-face');
  const assetRoot=new URL('vendor/mediapipe/',document.currentScript.src);
  const asset=path=>new URL(path,assetRoot).href;
  let avatar=null,draft=null,mode='default',stream=null,operation=0,modelsPromise=null;
  let detector=null,segmenter=null;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const smooth=value=>{value=clamp(value,0,1);return value*value*(3-2*value);};
  const emit=name=>window.dispatchEvent(new CustomEvent('avatar:'+name));
  const makeCanvas=(width,height)=>Object.assign(document.createElement('canvas'),{width,height});

  function stopCamera(){
    if(stream)stream.getTracks().forEach(track=>track.stop());
    stream=null;video.pause();video.srcObject=null;
  }
  function discardDraft(){
    if(draft)draft.image.width=draft.image.height=0;
    draft=null;cutout.removeAttribute('src');
  }
  function setStatus(message,error=false){status.textContent=message;status.dataset.error=String(error);}
  function updateChoice(){
    defaultButton.setAttribute('aria-pressed',String(mode==='default'));
    ownButton.setAttribute('aria-pressed',String(mode==='custom'));
    $('face-saved').hidden=!avatar;
    if(avatar)$('face-thumbnail').src=avatar.image.toDataURL('image/png');
    else $('face-thumbnail').removeAttribute('src');
    $('face-note').textContent=mode==='custom'?'Your face appears when your character faces the camera. Enable party face sharing to show it to room members.':'Take a photo to put your face on either outfit. Sharing your cutout with a party is optional.';
    emit('change');
  }
  function closeDialog(){
    operation++;stopCamera();discardDraft();
    if(dialog.open)dialog.close();
  }
  dialog.addEventListener('close',()=>{
    // A queued close event from a previous session must not stop a newly opened camera.
    if(dialog.open)return;
    operation++;stopCamera();discardDraft();emit('close');
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  $('close-camera').addEventListener('click',closeDialog);
  $('cancel-camera').addEventListener('click',closeDialog);

  function loadScript(){
    if(window.Vision)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=asset('vision_bundle.js');
      script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('The face tools could not load. Please try again.'));};
      document.head.append(script);
    });
  }
  function loadModels(){
    if(!modelsPromise)modelsPromise=(async()=>{
      await loadScript();
      // The portable CPU runtime avoids GPU and cross-origin-isolation requirements.
      const fileset={wasmLoaderPath:asset('wasm/vision_wasm_nosimd_internal.js'),wasmBinaryPath:asset('wasm/vision_wasm_nosimd_internal.wasm')};
      detector=await Vision.FaceDetector.createFromOptions(fileset,{
        baseOptions:{modelAssetPath:asset('models/face_detector.tflite'),delegate:'CPU'},
        runningMode:'IMAGE',minDetectionConfidence:.65
      });
      if(dialog.open&&stream)setStatus('Preparing background removal…');
      segmenter=await Vision.ImageSegmenter.createFromOptions(fileset,{
        baseOptions:{modelAssetPath:asset('models/selfie_multiclass.tflite'),delegate:'CPU'},
        runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false
      });
    })().catch(error=>{
      detector?.close();segmenter?.close();detector=null;segmenter=null;modelsPromise=null;
      throw new Error('The face tools could not load. Please refresh and try again.',{cause:error});
    });
    return modelsPromise;
  }
  function cameraError(error){
    if(error.name==='NotAllowedError'||error.name==='SecurityError')return 'Camera access was not allowed. Enable camera access for this page, then choose Retake.';
    if(error.name==='NotFoundError')return 'No camera was found. Connect a camera and choose Retake, or use the default face.';
    if(error.name==='NotReadableError')return 'The camera is busy. Close other apps using it and choose Retake.';
    return error.message||'The camera could not start. Choose Retake to try again.';
  }
  function showFailure(message){
    stopCamera();video.hidden=true;guide.hidden=true;cutout.hidden=true;
    placeholder.hidden=false;placeholder.textContent='Let’s try that again.';
    view.classList.remove('transparent-grid');capture.hidden=true;apply.hidden=true;retake.hidden=false;
    setStatus(message,true);
  }
  async function openCamera(){
    const token=++operation;stopCamera();discardDraft();
    if(!dialog.open){dialog.showModal();emit('open');}
    video.hidden=true;guide.hidden=true;cutout.hidden=true;placeholder.hidden=false;
    placeholder.textContent='Opening camera…';view.classList.remove('transparent-grid');
    capture.hidden=false;capture.disabled=true;apply.hidden=true;retake.hidden=true;
    setStatus('Your photo is processed on your device.');
    try{
      if(location.protocol==='file:')throw new Error('Open the game through Live Server (localhost) or an HTTPS address to use face capture.');
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Face capture needs localhost or an HTTPS address and a browser with camera support.');
      const cameraTask=(async()=>{
        const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}});
        if(token!==operation||!dialog.open){camera.getTracks().forEach(track=>track.stop());return;}
        stream=camera;video.srcObject=camera;
        video.hidden=false;guide.hidden=false;placeholder.hidden=true;
        setStatus('Preparing the face cutout tools…');
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('No picture arrived from the camera. Choose Retake to try again.')),10000);
          video.play().then(()=>{clearTimeout(timer);resolve();},error=>{clearTimeout(timer);reject(error);});
        });
      })();
      await Promise.all([cameraTask,loadModels()]);
      if(token!==operation||!dialog.open)return;
      if(!video.videoWidth||!video.videoHeight)throw new Error('No picture arrived from the camera. Choose Retake to try again.');
      capture.disabled=false;capture.focus({preventScroll:true});setStatus('Keep your head inside the outline, then take your photo.');
    }catch(error){if(token===operation&&dialog.open){operation++;showFailure(cameraError(error));}}
  }

  function removeBackground(frame){
    const faces=detector.detect(frame).detections;
    if(!faces.length)throw new Error('We couldn’t find your face. Face the camera in good light and take another photo.');
    if(faces.length>1)throw new Error('Keep just one face in the picture, then take another photo.');
    const box=faces[0].boundingBox;
    if(box.width<frame.width*.15||box.height<frame.height*.18)throw new Error('Move a little closer so your face fills the outline, then retake.');
    const left=Math.max(0,Math.floor(box.originX-box.width*.35));
    const top=Math.max(0,Math.floor(box.originY-box.height*.6));
    const right=Math.min(frame.width,Math.ceil(box.originX+box.width*1.35));
    const bottom=Math.min(frame.height,Math.ceil(box.originY+box.height*1.08));
    const scale=Math.min(1,512/Math.max(right-left,bottom-top));
    const head=makeCanvas(Math.round((right-left)*scale),Math.round((bottom-top)*scale));
    const brush=head.getContext('2d',{willReadFrequently:true});
    brush.drawImage(frame,left,top,right-left,bottom-top,0,0,head.width,head.height);
    const local={x:(box.originX-left)*scale,y:(box.originY-top)*scale,width:box.width*scale,height:box.height*scale};
    const result=segmenter.segment(head);
    try{
      const masks=result.confidenceMasks;
      if(!masks||masks.length<6)throw new Error('Background removal could not finish. Please retake your photo.');
      const width=masks[0].width,height=masks[0].height;
      const hair=masks[1].getAsFloat32Array(),skin=masks[2].getAsFloat32Array();
      const face=masks[3].getAsFloat32Array(),accessories=masks[5].getAsFloat32Array();
      const mask=makeCanvas(width,height),maskBrush=mask.getContext('2d'),alpha=maskBrush.createImageData(width,height);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*width+x,px=(x+.5)/width*head.width,py=(y+.5)/height*head.height;
        const nx=(px-local.x)/local.width,ny=(py-local.y)/local.height;
        const nearFace=nx>=-.15&&nx<=1.15&&ny>=-.2&&ny<=1;
        // Body-skin predictions are useful only at the ears, never below the jaw.
        const earSkin=ny>.18&&ny<.72&&(nx<.16||nx>.84)&&nearFace?skin[i]:0;
        const probability=clamp(hair[i]+face[i]+earSkin+(nearFace?accessories[i]:0),0,1);
        // Taper the lower outline to the chin even if the model mistakes shoulders
        // for face skin. Leave more room above the ears for the hair silhouette.
        const halfWidth=ny<.48?.72:.60*Math.sqrt(Math.max(0,1-((ny-.48)/.58)**2));
        const outline=smooth((halfWidth-Math.abs(nx-.5))/.045);
        const chinFade=1-smooth((ny-1.01)/.05);
        alpha.data[i*4+3]=Math.round(smooth((probability-.12)/.7)*outline*chinFade*255);
      }
      keepFaceComponent(alpha.data,width,height,local,head);
      maskBrush.putImageData(alpha,0,0);
      brush.globalCompositeOperation='destination-in';brush.drawImage(mask,0,0,head.width,head.height);brush.globalCompositeOperation='source-over';
      const pixels=brush.getImageData(0,0,head.width,head.height).data;
      let x0=head.width,y0=head.height,x1=0,y1=0,visible=0,hairCount=0;const hairRGB=[0,0,0];
      for(let y=0;y<head.height;y++)for(let x=0;x<head.width;x++){
        const i=(y*head.width+x)*4;
        if(pixels[i+3]>30){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);visible++;}
        const m=Math.min(height-1,Math.floor(y/head.height*height))*width+Math.min(width-1,Math.floor(x/head.width*width));
        if(pixels[i+3]>200&&hair[m]>.8){for(let c=0;c<3;c++)hairRGB[c]+=pixels[i+c];hairCount++;}
      }
      if(visible<local.width*local.height*.15)throw new Error('The face cutout was unclear. Please retake in brighter, even light.');
      x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(head.width-1,x1+2);y1=Math.min(head.height-1,y1+2);
      const image=makeCanvas(x1-x0+1,y1-y0+1);
      image.getContext('2d').drawImage(head,x0,y0,image.width,image.height,0,0,image.width,image.height);
      return {image,faceWidth:local.width,anchorX:local.x+local.width/2-x0,anchorY:local.y+local.height/2-y0,
        hairColor:hairCount>50?'#'+hairRGB.map(value=>Math.round(value/hairCount).toString(16).padStart(2,'0')).join(''):null};
    }finally{result.close();}
  }
  function keepFaceComponent(pixels,width,height,face,head){
    // Keep only the connected cutout containing the face, dropping isolated
    // shoulder/arm patches and stray segmentation fragments.
    const centerX=(face.x+face.width*.5)/head.width*width;
    const centerY=(face.y+face.height*.45)/head.height*height;
    let seed=-1,distance=Infinity;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;
      if(pixels[i*4+3]<128)continue;
      const d=(x-centerX)**2+(y-centerY)**2;
      if(d<distance){seed=i;distance=d;}
    }
    if(seed<0)return;
    const kept=new Uint8Array(width*height),queue=new Int32Array(width*height);
    let read=0,write=1;queue[0]=seed;kept[seed]=1;
    while(read<write){
      const i=queue[read++],x=i%width,y=Math.floor(i/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy;
        if(xx<0||xx>=width||yy<0||yy>=height)continue;
        const next=yy*width+xx;
        if(!kept[next]&&pixels[next*4+3]>8){kept[next]=1;queue[write++]=next;}
      }
    }
    for(let i=0;i<kept.length;i++)if(!kept[i])pixels[i*4+3]=0;
  }
  async function takePhoto(){
    if(capture.disabled||!stream)return;
    const token=++operation;capture.disabled=true;guide.hidden=true;
    const frame=makeCanvas(video.videoWidth,video.videoHeight),brush=frame.getContext('2d');
    // Match the mirrored camera preview in the saved cutout.
    brush.translate(frame.width,0);brush.scale(-1,1);brush.drawImage(video,0,0);
    stopCamera();video.hidden=true;placeholder.hidden=false;placeholder.textContent='Removing the background…';
    setStatus('Finding your face and removing the background…');
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(token!==operation||!dialog.open)return;
      const photo=removeBackground(frame);
      if(token!==operation||!dialog.open){photo.image.width=photo.image.height=0;return;}
      draft=photo;cutout.src=photo.image.toDataURL('image/png');cutout.hidden=false;
      placeholder.hidden=true;view.classList.add('transparent-grid');capture.hidden=true;apply.hidden=false;retake.hidden=false;
      setStatus('Background removed. Use this face or retake your photo.');apply.focus({preventScroll:true});
    }catch(error){if(token===operation&&dialog.open)showFailure(error.message);}
    finally{frame.width=frame.height=0;}
  }
  capture.addEventListener('click',takePhoto);
  retake.addEventListener('click',openCamera);
  $('retake-face').addEventListener('click',openCamera);
  apply.addEventListener('click',()=>{
    if(!draft)return;
    if(avatar)avatar.image.width=avatar.image.height=0;
    avatar=draft;draft=null;mode='custom';updateChoice();closeDialog();
  });
  defaultButton.addEventListener('click',()=>{mode='default';updateChoice();});
  ownButton.addEventListener('click',()=>{if(avatar){mode='custom';updateChoice();}else openCamera();});
  $('remove-face').addEventListener('click',()=>{
    if(avatar)avatar.image.width=avatar.image.height=0;
    avatar=null;mode='default';updateChoice();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&dialog.open)closeDialog();});
  window.addEventListener('pagehide',()=>{operation++;stopCamera();});
  window.FaceAvatar={
    exportCutout(){
      if(mode!=='custom'||!avatar)return null;
      const scale=Math.min(1,128/Math.max(avatar.image.width,avatar.image.height));
      const image=makeCanvas(Math.max(1,Math.round(avatar.image.width*scale)),Math.max(1,Math.round(avatar.image.height*scale)));
      image.getContext('2d').drawImage(avatar.image,0,0,image.width,image.height);
      return {png:image.toDataURL('image/png'),faceWidth:avatar.faceWidth*scale,anchorX:avatar.anchorX*scale,anchorY:avatar.anchorY*scale,hairColor:avatar.hairColor};
    },
    get isOpen(){return dialog.open;},
    get active(){return mode==='custom'&&!!avatar;},
    get hairColor(){return mode==='custom'?avatar?.hairColor:null;},
    draw(context,x,y){
      if(mode!=='custom'||!avatar)return false;
      const scale=Math.min(32/avatar.faceWidth,48/avatar.image.width,52/avatar.image.height);
      context.drawImage(avatar.image,x-avatar.anchorX*scale,y-avatar.anchorY*scale,avatar.image.width*scale,avatar.image.height*scale);
      return true;
    }
  };
})();
