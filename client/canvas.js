// Canvas logic: drawing, rendering ops, undo/redo handling
(function(){
  const canvas = document.getElementById('canvas');
  const cursorsLayer = document.getElementById('cursors');
  let ctx = canvas.getContext('2d');
  let w=0,h=0;
  function resize(){ w=window.innerWidth; h=window.innerHeight-48; canvas.width=w; canvas.height=h; canvas.style.width=w+'px'; canvas.style.height=h+'px'; redrawAll(); }
  window.addEventListener('resize', resize);

  // state
  const ops = []; // local cache of server ops
  const localStrokes = {}; // opId -> stroke during drawing
  let current = null;
  let tool = 'brush';
  let color = '#000';
  let width = 4;

  // smoothing helper (moving average)
  function smoothPoints(points) {
    if (points.length < 3) return points;
    const out = [points[0]];
    for (let i=1;i<points.length-1;i++){
      const p = {
        x: (points[i-1].x + points[i].x + points[i+1].x)/3,
        y: (points[i-1].y + points[i].y + points[i+1].y)/3
      };
      out.push(p);
    }
    out.push(points[points.length-1]);
    return out;
  }

  // drawing primitives
  function drawStrokeOn(ctx, op) {
    if (op.undone) return;
    ctx.save();
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.lineWidth = op.width;
    if (op.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = op.color;
    }
    const pts = op.points;
    if (!pts || pts.length===0) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++){
      const p = pts[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function redrawAll() {
    if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let op of ops) {
      if (!op.undone) drawStrokeOn(ctx, op);
    }
  }

  // real-time rendering for in-progress stroke
  function renderTemp(op) {
    // simple: draw on top from copy of canvas
    redrawAll();
    drawStrokeOn(ctx, op);
  }

  // setup pointer handling
  let drawing = false;
  let pointsBuffer = [];
  let lastEmit = 0;
  const EMIT_INTERVAL = 40; // ms
  function pointerDown(e){
    drawing = true;
    pointsBuffer = [];
    const p = getPos(e);
    pointsBuffer.push(p);
    const id = 'op_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    current = { id, author: window._socket.id, tool, points:[p], color, width };
    localStrokes[id] = current;
  }
  function pointerMove(e){
    const p = getPos(e);
    if (drawing && current) {
      current.points.push(p);
      // throttle emit and smoothing
      const now = Date.now();
      if (now - lastEmit > EMIT_INTERVAL) {
        // send batch to server as the stroke so far (incremental)
        window._socket.emit('stroke:data', { id: current.id, author: current.author, tool: current.tool, points: current.points.slice(), color: current.color, width: current.width });
        lastEmit = now;
      }
      renderTemp(current);
    }
    // send cursor
    window._socket.emit('cursor', { x: p.x, y: p.y });
  }
  function pointerUp(e){
    if (!drawing) return;
    drawing = false;
    // finalize
    if (current) {
      // finalize smoothing and send final
      current.points = smoothPoints(current.points);
      window._socket.emit('stroke:data', current);
      ops.push(current); // locally append (server will also send to others)
      current = null;
      redrawAll();
    }
  }

  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX, clientY = e.clientY;
    if (e.touches && e.touches[0]) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // attach events
  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('touchstart', (e)=>e.preventDefault(), {passive:false});

  // UI controls
  document.getElementById('color').addEventListener('change', (e)=> color = e.target.value);
  document.getElementById('width').addEventListener('input', (e)=> width = parseInt(e.target.value,10));
  document.getElementById('brush').addEventListener('click', ()=> tool='brush');
  document.getElementById('eraser').addEventListener('click', ()=> tool='eraser');
  document.getElementById('undo').addEventListener('click', ()=> {
    // ask server to undo last op by this user
    // simple heuristic: find last op authored by me that's not undone
    const myLast = [...ops].reverse().find(o => o.author === window._socket.id && !o.undone);
    if (myLast) window._socket.emit('undo', { opId: myLast.id });
  });
  document.getElementById('redo').addEventListener('click', ()=> {
    // ask server to redo last undone op (global)
    window._socket.emit('redo', {});
  });
  document.getElementById('clear').addEventListener('click', ()=> {
    if (confirm('Clear canvas for everyone?')) window._socket.emit('clear', {});
  });

  // socket handlers
  const socket = window._socket;
  socket.on('init', ({ops: serverOps, users, you}) => {
    // load initial ops
    ops.length = 0;
    serverOps.forEach(o=>ops.push(o));
    resize();
    redrawAll();
  });
  socket.on('stroke:remote', (op) => {
    // server relays incremental strokes from others
    // merge by op.id: if exists, replace; else push
    const idx = ops.findIndex(x => x.id === op.id);
    if (idx === -1) ops.push(op);
    else ops[idx] = op;
    drawStrokeOn(ctx, op);
  });
  socket.on('history:rebuild', ({ops: serverOps}) => {
    ops.length = 0;
    serverOps.forEach(o=>ops.push(o));
    redrawAll();
  });

  // cursors
  const cursors = {};
  socket.on('cursor', ({id,x,y})=>{
    let el = cursors[id];
    if (!el) {
      el = document.createElement('div');
      el.className='cursor';
      el.innerHTML = '<div class="dot"></div><div class="name">'+id.slice(0,4)+'</div>';
      cursors[id]=el;
      document.getElementById('cursors').appendChild(el);
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  });
  socket.on('users:update', (users) => {
    const list = document.getElementById('userlist');
    list.innerHTML = Object.values(users).map(u=>('<span style="color:'+u.color+'">'+u.name+'</span>')).join(', ');
  });

  // expose for debugging
  window.CANVAS_APP = { redrawAll, ops, canvas };
})();
