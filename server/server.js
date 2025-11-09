const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const rooms = {}; // { roomId: { ops: [], users: {socketId: {name,color}} } }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'client')));

// helper to create color
function pickColor(id) {
  const palette = ['#E11D48','#0EA5A4','#7C3AED','#F59E0B','#10B981','#3B82F6','#EF4444'];
  const n = parseInt(id.slice(-6).replace(/[^0-9]/g,'') || '0') % palette.length;
  return palette[n];
}

io.on('connection', socket => {
  const room = 'main';
  if (!rooms[room]) rooms[room] = { ops: [], users: {} };
  const userColor = pickColor(socket.id);
  rooms[room].users[socket.id] = { name: 'User-'+socket.id.slice(0,4), color: userColor };

  socket.join(room);
  // send init
  socket.emit('init', { ops: rooms[room].ops, users: rooms[room].users, you: {id: socket.id, color: userColor} });
  io.to(room).emit('users:update', rooms[room].users);

  socket.on('stroke:data', (op) => {
    // expect op = {id, author, tool, points, color, width}
    op.timestamp = Date.now();
    op.undone = false;
    rooms[room].ops.push(op);
    socket.to(room).emit('stroke:remote', op);
  });

  socket.on('cursor', (c) => {
    socket.to(room).emit('cursor', {id: socket.id, x: c.x, y: c.y});
  });

  socket.on('undo', ({opId}) => {
    const ops = rooms[room].ops;
    const target = ops.find(o => o.id === opId) || ops.slice().reverse().find(o => !o.undone);
    if (!target) { socket.emit('action:error', {msg: 'Nothing to undo'}); return; }
    target.undone = true;
    io.to(room).emit('history:rebuild', { ops: ops });
  });

  socket.on('redo', ({opId}) => {
    const ops = rooms[room].ops;
    const target = opId ? ops.find(o=>o.id===opId) : ops.find(o => o.undone);
    if (!target) { socket.emit('action:error', {msg: 'Nothing to redo'}); return; }
    target.undone = false;
    io.to(room).emit('history:rebuild', { ops: ops });
  });

  socket.on('clear', () => {
    rooms[room].ops = [];
    io.to(room).emit('history:rebuild', { ops: rooms[room].ops });
  });

  socket.on('disconnect', () => {
    delete rooms[room].users[socket.id];
    io.to(room).emit('users:update', rooms[room].users);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));
